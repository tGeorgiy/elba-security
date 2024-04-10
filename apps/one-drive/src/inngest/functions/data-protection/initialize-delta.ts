import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { getDelta } from '../../../connectors/share-point/get-delta';
import { subscribeToDrive } from '../subscriptions/create-drive-subscriprion';

export const initializeDelta = inngest.createFunction(
  {
    id: 'initialize-data-protection-delta',
    concurrency: {
      key: 'event.data.organisationId',
      limit: 10,
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
  { event: 'one-drive/data_protection.initialize_delta.requested' },
  async ({ event, step, logger }) => {
    const { organisationId, siteId, driveId, skipToken } = event.data;

    logger.info('Delta Start');

    const [organisation] = await db
      .select({
        token: organisationsTable.token,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with itemId=${organisationId}`);
    }

    const { nextSkipToken, newDeltaToken } = await step.run('paginate', async () => {
      const result = await getDelta({
        token: await decrypt(organisation.token),
        siteId,
        driveId,
        isFirstSync: true,
        skipToken,
        deltaToken: null,
      });

      return result;
    });

    if (nextSkipToken) {
      logger.info('SITE PAGINATE');
      await step.sendEvent('sync-next-delta-page', {
        name: 'one-drive/data_protection.initialize_delta.requested',
        data: {
          organisationId,
          siteId,
          driveId,
          skipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    const data = await step.invoke('one-drive/drives.subscription.triggered', {
      function: subscribeToDrive,
      data: {
        organisationId,
        siteId,
        driveId,
      },
    });

    await db
      .insert(sharePointTable)
      .values({
        organisationId,
        siteId,
        driveId,
        subscriptionId: data.id,
        subscriptionExpirationDate: data.expirationDateTime,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- cant be null
        delta: newDeltaToken!,
      })
      .onConflictDoUpdate({
        target: [sharePointTable.organisationId, sharePointTable.driveId],
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- cant be null
        set: { subscriptionId: data.id, delta: newDeltaToken! },
      });

    return {
      status: 'completed',
    };
  }
);
