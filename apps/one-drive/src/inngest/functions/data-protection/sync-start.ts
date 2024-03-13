import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { logger } from '@elba-security/logger';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { getSites } from '../../../connectors/share-point/sites';

export const syncStart = inngest.createFunction(
  {
    id: 'synchronize-data-protection-objects',
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
    },
    concurrency: {
      key: 'event.data.organisationId',
      limit: 1,
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
  { event: 'one-drive/data_protection.sync.requested' },
  async ({ event, step }) => {
    const { organisationId, isFirstSync, skipToken, syncStartedAt } = event.data;

    logger.info('Sync Start');

    const [organisation] = await db
      .select({
        id: organisationsTable.id,
        token: organisationsTable.token,
        tenantId: organisationsTable.tenantId,
        region: organisationsTable.region,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with id=${organisationId}`);
    }

    const token = await decrypt(organisation.token);

    const { sites, nextSkipToken } = await step.run('paginate', async () => {
      const result = await getSites({
        token,
        skipToken,
      });

      return result;
    });

    logger.info('SITE SYNC DRIVES');
    const promises = sites.map((site) =>
      step.sendEvent('drives-sync-triggered', {
        name: 'one-drive/drives.sync.triggered',
        data: {
          token,
          siteId: site.id,
          isFirstSync,
          skipToken: null,
          organisationId: organisation.id,
          organisationRegion: organisation.region,
        },
      })
    );

    await Promise.allSettled(promises);

    if (nextSkipToken) {
      logger.info('SITE PAGINATE');
      await step.sendEvent('sync-next-sites-page', {
        name: 'one-drive/data_protection.sync.requested',
        data: {
          organisationId,
          isFirstSync,
          syncStartedAt,
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
