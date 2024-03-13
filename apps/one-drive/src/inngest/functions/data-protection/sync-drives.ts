import { logger } from '@elba-security/logger';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { getDrives } from '../../../connectors/share-point/drives';

export const syncDrives = inngest.createFunction(
  {
    id: 'one-drive-sync-drives',
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
    },
    concurrency: {
      key: 'event.data.organisationId',
      limit: 5,
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
    retries: env.USERS_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/drives.sync.triggered' },
  async ({ event, step }) => {
    const { token, siteId, isFirstSync, skipToken, ...organisation } = event.data;

    logger.info('Sync Drives');

    const { drives, nextSkipToken } = await step.run('paginate', async () => {
      const result = await getDrives({
        token,
        siteId,
        skipToken,
      });

      return result;
    });

    const promises = drives.map((drive) =>
      step.sendEvent('one-drive-sync-drives', {
        name: 'one-drive/items.sync.triggered',
        data: {
          token,
          siteId,
          driveId: drive.id,
          isFirstSync,
          folderId: null,
          skipToken: null,
          ...organisation,
        },
      })
    );

    await Promise.allSettled(promises);

    if (nextSkipToken) {
      await step.sendEvent('sync-next-drives-page', {
        name: 'one-drive/drives.sync.triggered',
        data: {
          ...event.data,
          skipToken: nextSkipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    return {
      status: 'completed',
    };
  }
);
