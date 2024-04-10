import { Elba } from '@elba-security/sdk';
import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { decrypt } from '@/common/crypto';
import type { MicrosoftDriveItem } from '@/connectors/share-point/items';
import { getItems } from '@/connectors/share-point/items';
import { getDelta } from '@/connectors/share-point/get-delta';

type ParseDeltaResponseType = {
  deleted: string[];
  updated: string[];
};

const parseDeltaResponse = (delta): ParseDeltaResponseType => {};

export const updateItemPermissions = inngest.createFunction(
  {
    id: 'one-drive-update-items',
    // priority: {
    //   run: 'event.data.isFirstSync ? 600 : 0',
    // },
    concurrency: {
      key: 'event.data.tenantId',
      limit: env.MICROSOFT_DATA_PROTECTION_ITEMS_SYNC_CONCURRENCY,
    },
    // cancelOn: [
    //   {
    //     event: 'one-drive/one-drive.elba_app.uninstalled',
    //     match: 'data.organisationId',
    //   },
    //   {
    //     event: 'one-drive/one-drive.elba_app.installed',
    //     match: 'data.organisationId',
    //   },
    // ],
    retries: env.MICROSOFT_DATA_PROTECTION_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/update-items.triggered' },
  async ({ event, step, logger }) => {
    const { siteId, driveId, subscriptionId, tenantId, skipToken } = event.data;

    logger.info('Update Items');

    // const [organisation] = await db
    //   .select({
    //     id: organisationsTable.id,
    //     token: organisationsTable.token,
    //   })
    //   .from(organisationsTable)
    //   .where(eq(organisationsTable.tenantId, tenantId));

    // if (!organisation) {
    //   throw new NonRetriableError(`Could not retrieve organisation with tenantId=${tenantId}`);
    // }

    const [record] = await db
      .select({
        token: organisationsTable.token,
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

    console.log('🚀 ~ record:', record);

    const { delta, nextSkipToken, newDeltaToken } = await step.run('delta - paginate', async () => {
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

    // const token = await decrypt(organisation.token);

    // const { folders, files, nextSkipToken } = await step.run('paginate', async () => {
    //   const result = await getItems({
    //     token,
    //     siteId,
    //     driveId,
    //     folderId,
    //     skipToken,
    //   });

    //   return {
    //     ...groupItems(result.items),
    //     nextSkipToken: result.nextSkipToken,
    //   };
    // });

    // if (folders.length) {
    //   const eventsWait = folders.map(async ({ id }) => {
    //     return step.waitForEvent(`wait-for-folders-complete-${id}`, {
    //       event: 'one-drive/foder-items.sync.completed',
    //       timeout: '1d',
    //       if: `async.data.organisationId == '${organisationId}' && async.data.folderId == '${id}'`,
    //     });
    //   });

    //   await step.sendEvent(
    //     'items.sync.triggered',
    //     folders.map(({ id }) => ({
    //       name: 'one-drive/items.sync.triggered',
    //       data: {
    //         siteId,
    //         driveId,
    //         isFirstSync,
    //         folderId: id,
    //         skipToken: null,
    //         organisationId,
    //       },
    //     }))
    //   );

    //   await Promise.all(eventsWait);
    // }

    // await step.run('get-permissions-update-elba', async () => {
    //   const itemsChunks = getCkunkedArray<MicrosoftDriveItem>(
    //     [...folders, ...files],
    //     env.MICROSOFT_DATA_PROTECTION_ITEM_PERMISSIONS_CHUNK_SIZE
    //   );

    //   const itemsWithPermisions = await getItemsWithPermisionsFromChunks({
    //     itemsChunks,
    //     token,
    //     siteId,
    //     driveId,
    //   });

    //   const dataProtectionItems = formatDataProtetionItems({
    //     itemsWithPermisions,
    //     siteId,
    //     driveId,
    //   });

    //   if (!dataProtectionItems.length) return;

    //   const elba = new Elba({
    //     organisationId,
    //     apiKey: env.ELBA_API_KEY,
    //     baseUrl: env.ELBA_API_BASE_URL,
    //     region: organisation.region,
    //   });

    //   await elba.dataProtection.updateObjects({
    //     objects: dataProtectionItems,
    //   });
    // });

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

    // if (folderId) {
    //   await step.sendEvent('folders-sync-complete', {
    //     name: 'one-drive/foder-items.sync.completed',
    //     data: {
    //       organisationId,
    //       folderId,
    //     },
    //   });
    // } else {
    //   await step.sendEvent('items-sync-complete', {
    //     name: 'one-drive/items.sync.completed',
    //     data: {
    //       organisationId,
    //       driveId,
    //     },
    //   });
    // }

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
