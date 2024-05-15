import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { getSites } from '@/connectors/one-drive/share-point/sites';
import { createElbaClient } from '@/connectors/elba/client';
import { env } from '@/common/env';

export const syncSites = inngest.createFunction(
  {
    id: 'one-drive-synchronize-data-protection-objects',
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
    },
    concurrency: {
      key: 'event.data.organisationId',
      limit: env.MICROSOFT_DATA_PROTECTION_SYNC_CONCURRENCY,
    },
    cancelOn: [
      {
        event: 'one-drive/app.uninstalled.requested',
        match: 'data.organisationId',
      },
      {
        event: 'one-drive/app.install.requested',
        match: 'data.organisationId',
      },
    ],
    retries: 5,
  },
  { event: 'one-drive/data_protection.sync.requested' },
  async ({ event, step }) => {
    const { organisationId, isFirstSync, skipToken, syncStartedAt } = event.data;

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

    const { sites, nextSkipToken } = await step.run('paginate', async () => {
      const result = await getSites({
        token: await decrypt(organisation.token),
        skipToken,
      });

      return result;
    });

    if (sites.length) {
      const eventsWait = sites.map(({ id }) =>
        step.waitForEvent(`wait-for-drives-complete-${id}`, {
          event: 'one-drive/drives.sync.completed',
          timeout: '1d',
          if: `async.data.organisationId == '${organisationId}' && async.data.siteId == '${id}'`,
        })
      );

      await step.sendEvent(
        'drives-sync-triggered',
        sites.map(({ id }) => ({
          name: 'one-drive/drives.sync.triggered',
          data: {
            siteId: id,
            isFirstSync,
            skipToken: null,
            organisationId,
          },
        }))
      );

      await Promise.all(eventsWait);
    }

    if (nextSkipToken) {
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

    await step.run('elba-permissions-delete', async () => {
      const elba = createElbaClient({ organisationId, region: organisation.region });

      await elba.dataProtection.deleteObjects({
        syncedBefore: new Date(syncStartedAt).toISOString(),
      });
    });

    return {
      status: 'completed',
    };
  }
);
