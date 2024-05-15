import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { env } from '@/common/env';
import { inngest } from '@/inngest/client';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { decrypt } from '@/common/crypto';
import type { Delta } from '@/connectors/one-drive/delta/get-delta';
import { getDelta } from '@/connectors/one-drive/delta/get-delta';
import type { MicrosoftDriveItem } from '@/connectors/one-drive/share-point/items';
import { MicrosoftError } from '@/common/error';
import { createElbaClient } from '@/connectors/elba/client';
import type { ItemsWithPermisions } from './sync-items';
import {
  formatDataProtetionItems,
  getCkunkedArray,
  getItemsWithPermisionsFromChunks,
} from './sync-items';

type ParsedDelta = {
  deleted: string[];
  updated: MicrosoftDriveItem[];
};

type ItemsWithPermisionsParsed = {
  toDelete: string[];
  toUpdate: ItemsWithPermisions[];
};

export const parsedDeltaState = (delta: Delta[]): ParsedDelta => {
  return delta.reduce<ParsedDelta>(
    (acc, el) => {
      if (el.deleted?.state === 'deleted') acc.deleted.push(el.id);
      else acc.updated.push(el as MicrosoftDriveItem);

      return acc;
    },
    { deleted: [], updated: [] }
  );
};

export const removeInheritedUpdate = (
  itemsWithPermisions: ItemsWithPermisions[]
): ItemsWithPermisionsParsed => {
  return itemsWithPermisions.reduce<ItemsWithPermisionsParsed>(
    (acc, itemWithPermisions, _, arr) => {
      const parent = arr.find(
        ({ item: { id } }) => id === itemWithPermisions.item.parentReference.id
      );

      if (parent) {
        const parentPermissionIds = parent.permissions.map(({ id }) => id);

        const filteredPermissions = itemWithPermisions.permissions.filter(
          (permission) => !parentPermissionIds.includes(permission.id)
        );

        if (!filteredPermissions.length) {
          acc.toDelete.push(itemWithPermisions.item.id);
        } else {
          acc.toUpdate.push({
            item: itemWithPermisions.item,
            permissions: filteredPermissions,
          });
        }
      }

      return acc;
    },
    { toDelete: [], toUpdate: [] }
  );
};

export const updateItems = inngest.createFunction(
  {
    id: 'one-drive-update-items',
    concurrency: {
      key: 'event.data.tenantId',
      limit: env.MICROSOFT_DATA_PROTECTION_ITEMS_SYNC_CONCURRENCY,
    },
    retries: 5,
  },
  { event: 'one-drive/update-items.triggered' },
  async ({ event, step }) => {
    const { siteId, driveId, subscriptionId, tenantId, skipToken } = event.data;
    let itemIdsWithoutPermissions: string[] = [];

    const [record] = await db
      .select({
        organisationId: organisationsTable.id,
        token: organisationsTable.token,
        region: organisationsTable.region,
        delta: sharePointTable.delta,
      })
      .from(sharePointTable)
      .innerJoin(organisationsTable, eq(sharePointTable.organisationId, organisationsTable.id))
      .where(
        and(
          eq(organisationsTable.tenantId, tenantId),
          eq(sharePointTable.siteId, siteId),
          eq(sharePointTable.driveId, driveId),
          eq(sharePointTable.subscriptionId, subscriptionId)
        )
      );

    if (!record) {
      throw new NonRetriableError(`Could not retrieve organisation with tenantId=${tenantId}`);
    }

    const { delta, nextSkipToken, newDeltaToken } = await step.run('delta paginate', async () => {
      const result = await getDelta({
        token: await decrypt(record.token),
        siteId,
        driveId,
        isFirstSync: false,
        skipToken,
        deltaToken: record.delta,
      });

      return result;
    });

    const { deleted, updated } = parsedDeltaState(delta);

    const elba = createElbaClient({ organisationId: record.organisationId, region: record.region });

    if (updated.length) {
      itemIdsWithoutPermissions = await step.run('update elba items', async () => {
        const itemsChunks = getCkunkedArray<MicrosoftDriveItem>(
          updated,
          env.MICROSOFT_DATA_PROTECTION_ITEM_PERMISSIONS_CHUNK_SIZE
        );

        const itemsWithPermisions = await getItemsWithPermisionsFromChunks({
          itemsChunks,
          token: await decrypt(record.token),
          siteId,
          driveId,
        });

        const { toDelete, toUpdate } = removeInheritedUpdate(itemsWithPermisions);

        const dataProtectionItems = formatDataProtetionItems({
          itemsWithPermisions: toUpdate,
          siteId,
          driveId,
        });

        if (!dataProtectionItems.length) {
          const reduced = itemsWithPermisions.reduce<string[]>((acc, itemWithPermisions) => {
            if (
              !itemWithPermisions.permissions.length &&
              itemWithPermisions.item.name !== 'root' &&
              !toDelete.includes(itemWithPermisions.item.id)
            )
              acc.push(itemWithPermisions.item.id);
            return acc;
          }, []);

          reduced.push(...toDelete);

          return reduced;
        }

        await elba.dataProtection.updateObjects({
          objects: dataProtectionItems,
        });

        return toDelete;
      });
    }

    if ([...deleted, ...itemIdsWithoutPermissions].length) {
      await step.run('remove elba items', async () => {
        await elba.dataProtection.deleteObjects({
          ids: [...deleted, ...itemIdsWithoutPermissions],
        });
      });
    }

    if (nextSkipToken) {
      await step.sendEvent('sync-next-delta-page', {
        name: 'one-drive/update-items.triggered',
        data: {
          ...event.data,
          skipToken: nextSkipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    if (!newDeltaToken) throw new MicrosoftError('Delta token not found!');

    await db
      .update(sharePointTable)
      .set({
        delta: newDeltaToken,
      })
      .where(
        and(
          eq(sharePointTable.organisationId, record.organisationId),
          eq(sharePointTable.siteId, siteId),
          eq(sharePointTable.driveId, driveId),
          eq(sharePointTable.subscriptionId, subscriptionId)
        )
      );

    return {
      status: 'completed',
    };
  }
);
