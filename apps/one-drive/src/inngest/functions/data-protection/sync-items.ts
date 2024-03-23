import { logger } from '@elba-security/logger';
import type { DataProtectionObject, DataProtectionObjectPermission } from '@elba-security/sdk';
import { Elba } from '@elba-security/sdk';
import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { decrypt } from '@/common/crypto';
import type { MicrosoftDriveItem } from '../../../connectors/share-point/items';
import { getItems } from '../../../connectors/share-point/items';
import type { MicrosoftDriveItemPermissions } from '../../../connectors/share-point/permissions';
import { getItemPermissions } from '../../../connectors/share-point/permissions';

export type ItemsWithPermisions = {
  item: MicrosoftDriveItem;
  permissions: MicrosoftDriveItemPermissions[];
};

export const parseItems = (
  inputItems: MicrosoftDriveItem[]
): {
  folders: MicrosoftDriveItem[];
  items: MicrosoftDriveItem[];
} => {
  const folders: MicrosoftDriveItem[] = [];
  const items: MicrosoftDriveItem[] = [];

  inputItems.forEach((item) => {
    if (item.folder) {
      folders.push(item);
    } else {
      items.push(item);
    }
  });

  return {
    folders,
    items,
  };
};

export const getCkunkedArray = <T>(array: T[], batchSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    chunks.push(array.slice(i, i + Number(batchSize)));
  }
  return chunks;
};

export const formatPermissions = (
  permission: MicrosoftDriveItemPermissions
): DataProtectionObjectPermission[] | [] => {
  if (permission.grantedToV2?.user) {
    return [
      {
        id: permission.id,
        type: 'user',
        displayName: permission.grantedToV2.user.displayName,
        userId: permission.grantedToV2.user.id,
        email: permission.grantedToV2.user.email,
        metadata: {
          permissionId: permission.id,
          roles: permission.roles,
        },
      },
    ];
  } else if (permission.grantedToIdentitiesV2) {
    const formattedPermissions: DataProtectionObjectPermission[] = [];

    for (const p of permission.grantedToIdentitiesV2) {
      if (p.user) {
        formattedPermissions.push({
          id: `${permission.id}${env.ID_SEPARATOR}${p.user.id}`,
          type: 'user',
          displayName: p.user.displayName,
          userId: p.user.id,
          email: p.user.email,
          metadata: {
            permissionId: permission.id,
            roles: permission.roles,
          },
        });
      }
    }

    return formattedPermissions;
  }
  return [];
};

export const parseDataProtetionItems = (
  itemsWithPermisions: ItemsWithPermisions[]
): DataProtectionObject[] => {
  const dataProtection: DataProtectionObject[] = [];

  for (const { item, permissions } of itemsWithPermisions) {
    if (item.createdBy.user.id) {
      const validPermissions: MicrosoftDriveItemPermissions[] = permissions.filter((p) => {
        if (p.link && p.link.scope === 'users') return true;
        else if (p.grantedToV2?.user) return true;
        return false;
      });

      if (validPermissions.length) {
        const dataProtectionItem = {
          id: item.id,
          name: item.name,
          ownerId: item.createdBy.user.id,
          url: item.webUrl,
          permissions: validPermissions.map((p) => formatPermissions(p)).flat(),
        };

        dataProtection.push(dataProtectionItem);
      }
    }
  }

  return dataProtection;
};

export const syncItems = inngest.createFunction(
  {
    id: 'one-drive-sync-items',
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
    },
    concurrency: {
      key: 'event.data.organisationId',
      limit: env.MICROSOFT_DATA_PROTECTION_ITEMS_SYNC_CONCURRENCY,
    },
    cancelOn: [
      {
        event: 'one-drive/one-drive.elba_app.uninstalled',
        match: 'data.organisationId',
      },
      {
        event: 'one-drive/one-drive.elba_app.installed',
        match: 'data.organisationId',
      },
    ],
    retries: env.MICROSOFT_DATA_PROTECTION_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/items.sync.triggered' },
  async ({ event, step }) => {
    const { siteId, driveId, isFirstSync, folderId, skipToken, organisationId } = event.data;

    logger.info('Sync Items');

    const [organisation] = await db
      .select({
        token: organisationsTable.token,
        region: organisationsTable.region,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with id=${organisationId}`);
    }

    const token = await decrypt(organisation.token);

    const { folders, items, nextSkipToken } = await step.run('paginate', async () => {
      const result = await getItems({
        token,
        siteId,
        driveId,
        folderId,
        skipToken,
      });

      return {
        ...parseItems(result.items),
        nextSkipToken: result.nextSkipToken,
      };
    });

    if (folders.length) {
      const eventsWait = folders.map(async ({ id }) => {
        return step.waitForEvent(`wait-for-folders-complete-${id}`, {
          event: 'one-drive/foder-items.sync.completed',
          timeout: '1d',
          if: `async.data.organisationId == '${organisationId}' && async.data.folderId == '${id}'`,
        });
      });

      await step.sendEvent(
        'items.sync.triggered',
        folders.map(({ id }) => ({
          name: 'one-drive/items.sync.triggered',
          data: {
            siteId,
            driveId,
            isFirstSync,
            folderId: id,
            skipToken: null,
            organisationId,
          },
        }))
      );

      await Promise.all(eventsWait);
    }

    const itemsWithPermisionsResult = await step.run('item-permissions', async () => {
      const itemsWithPermisions: ItemsWithPermisions[] = [];

      const itemsChunks = getCkunkedArray<MicrosoftDriveItem>(
        [...folders, ...items],
        env.MICROSOFT_DATA_PROTECTION_ITEM_PERMISSIONS_CHUNK_SIZE
      );

      for (const itemsChunk of itemsChunks) {
        // eslint-disable-next-line no-await-in-loop -- Avoiding hundreds of inngest functions
        const itemPermissionsChunks = await Promise.all(
          itemsChunk.map((item) =>
            getItemPermissions({
              token,
              siteId,
              driveId,
              itemId: item.id,
              skipToken: null,
            })
          )
        );

        for (let e = 0; e < itemPermissionsChunks.length; e++) {
          const item = itemsChunk[e];
          const permissions = itemPermissionsChunks[e];

          if (!item || !permissions) continue;

          itemsWithPermisions.push({
            item,
            permissions: permissions.permissions,
          });
        }
      }

      return itemsWithPermisions;
    });

    const dataProtectionItems = parseDataProtetionItems(
      itemsWithPermisionsResult as unknown as ItemsWithPermisions[]
    );

    if (dataProtectionItems.length) {
      await step.run('elba-permissions-update', async () => {
        const elba = new Elba({
          organisationId,
          apiKey: env.ELBA_API_KEY,
          baseUrl: env.ELBA_API_BASE_URL,
          region: organisation.region,
        });

        await elba.dataProtection.updateObjects({
          objects: dataProtectionItems,
        });
      });
    }

    if (nextSkipToken) {
      logger.info('ITEMS PAGINATION');

      await step.sendEvent('sync-next-items-page', {
        name: 'one-drive/items.sync.triggered',
        data: {
          ...event.data,
          skipToken: nextSkipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    if (folderId) {
      await step.sendEvent('folders-sync-complete', {
        name: 'one-drive/foder-items.sync.completed',
        data: {
          organisationId,
          folderId,
        },
      });
    } else {
      await step.sendEvent('items-sync-complete', {
        name: 'one-drive/items.sync.completed',
        data: {
          organisationId,
          driveId,
        },
      });
    }

    return {
      status: 'completed',
    };
  }
);
