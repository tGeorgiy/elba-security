import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { decrypt } from '@/common/crypto';
import type { Delta } from '@/connectors/delta/get-delta';
import { getDelta } from '@/connectors/delta/get-delta';
import type { MicrosoftDriveItem } from '@/connectors/share-point/items';
import { createElbaClient } from '@/connectors/elba/client';
import { MicrosoftError } from '@/common/error';
import {
  formatDataProtetionItems,
  getCkunkedArray,
  getItemsWithPermisionsFromChunks,
} from './sync-items';

type ParsedDelta = {
  deleted: string[];
  updated: MicrosoftDriveItem[];
};

export const parsedDelta = (delta: Delta[]): ParsedDelta => {
  return delta.reduce<ParsedDelta>(
    (acc, el) => {
      if (el.name === 'root') return acc;
      if (el.deleted?.state === 'deleted') acc.deleted.push(el.id);
      else acc.updated.push(el);

      return acc;
    },
    { deleted: [], updated: [] }
  );
};

export const updateItems = inngest.createFunction(
  {
    id: 'one-drive-update-items',
    concurrency: {
      key: 'event.data.tenantId',
      limit: env.MICROSOFT_DATA_PROTECTION_ITEMS_SYNC_CONCURRENCY,
    },
    retries: env.MICROSOFT_DATA_PROTECTION_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/update-items.triggered' },
  async ({ event, step, logger }) => {
    const { siteId, driveId, subscriptionId, tenantId, skipToken } = event.data;
    let itemIdsWithoutPermissions: string[] = [];

    logger.info('Update Items');

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

    const { deleted, updated } = parsedDelta(delta);

    const elba = createElbaClient(record.organisationId, record.region);

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

        const dataProtectionItems = formatDataProtetionItems({
          itemsWithPermisions,
          siteId,
          driveId,
        });

        if (!dataProtectionItems.length) {
          return itemsWithPermisions.reduce<string[]>((acc, itemWithPermisions) => {
            if (!itemWithPermisions.permissions.length) acc.push(itemWithPermisions.item.id);
            return acc;
          }, []);
        }

        await elba.dataProtection.updateObjects({
          objects: dataProtectionItems,
        });

        return [];
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
      logger.info('ITEMS PAGINATION');

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

// 🚀 ~ app.get ~ data: [
//   {
//     '@odata.type': '#microsoft.graph.driveItem',
//     createdDateTime: '2024-02-18T00:24:15Z',
//     id: '01AWAEAAV6Y2GOVW7725BZO354PWSELRRZ',
//     lastModifiedDateTime: '2024-04-10T06:11:14Z',
//     name: 'root',
//     parentReference: {
//       driveType: 'documentLibrary',
//       driveId: 'b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5'
//     },
//     webUrl: 'https://testcomp633.sharepoint.com/Shared%20Documents',
//     fileSystemInfo: {
//       createdDateTime: '2024-02-18T00:24:15Z',
//       lastModifiedDateTime: '2024-04-10T06:11:14Z'
//     },
//     folder: { childCount: 4 },
//     root: {},
//     size: 270525
//   },
//   {
//     '@odata.type': '#microsoft.graph.driveItem',
//     id: '01AWAEAAVYBYNDE5QWQBBICEDKJLLQG3S2',
//     parentReference: {
//       driveType: 'documentLibrary',
//       driveId: 'b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5',
//       id: '01AWAEAAV6Y2GOVW7725BZO354PWSELRRZ',
//       siteId: '01a63770-aff9-42b8-831d-46b05ff02b5c'
//     },
//     cTag: '"c:{321A0EB8-1676-4280-8110-6A4AD7036E5A},4294967295"',
//     deleted: { state: 'deleted' },
//     file: { hashes: [Object] },
//     fileSystemInfo: {},
//     shared: { scope: 'users' },
//     size: 0
//   }
// ]

// 🚀 ~ app.get ~ data: [
//   {
//     '@odata.type': '#microsoft.graph.driveItem',
//     createdDateTime: '2024-02-18T00:24:15Z',
//     id: '01AWAEAAV6Y2GOVW7725BZO354PWSELRRZ',
//     lastModifiedDateTime: '2024-04-07T23:03:12Z',
//     name: 'root',
//     parentReference: {
//       driveType: 'documentLibrary',
//       driveId: 'b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5'
//     },
//     webUrl: 'https://testcomp633.sharepoint.com/Shared%20Documents',
//     fileSystemInfo: {
//       createdDateTime: '2024-02-18T00:24:15Z',
//       lastModifiedDateTime: '2024-04-07T23:03:12Z'
//     },
//     folder: { childCount: 5 },
//     root: {},
//     size: 270525
//   },
//   {
//     '@odata.type': '#microsoft.graph.driveItem',
//     createdBy: { user: [Object] },
//     createdDateTime: '2024-04-05T07:53:59Z',
//     eTag: '"{321A0EB8-1676-4280-8110-6A4AD7036E5A},15"',
//     id: '01AWAEAAVYBYNDE5QWQBBICEDKJLLQG3S2',
//     lastModifiedBy: { user: [Object] },
//     lastModifiedDateTime: '2024-04-05T10:00:53Z',
//     name: 'ABCDDDDD.jpeg',
//     parentReference: {
//       driveType: 'documentLibrary',
//       driveId: 'b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5',
//       id: '01AWAEAAV6Y2GOVW7725BZO354PWSELRRZ',
//       path: '/drives/b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5/root:',
//       siteId: '01a63770-aff9-42b8-831d-46b05ff02b5c'
//     },
//     webUrl: 'https://testcomp633.sharepoint.com/Shared%20Documents/ABCDDDDD.jpeg',
//     cTag: '"c:{321A0EB8-1676-4280-8110-6A4AD7036E5A},4"',
//     file: { hashes: [Object], mimeType: 'image/jpeg' },
//     fileSystemInfo: {
//       createdDateTime: '2024-04-05T07:53:59Z',
//       lastModifiedDateTime: '2024-04-05T10:00:53Z'
//     },
//     image: { height: 201, width: 204 },
//     photo: { alternateTakenDateTime: '2024-04-05T07:53:59Z' },
//     shared: { scope: 'users' },
//     size: 15436
//   }
// ]
