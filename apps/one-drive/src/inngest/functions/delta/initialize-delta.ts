import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { getDelta } from '@/connectors/delta/get-delta';
import { subscriptionToDrive } from '../subscriptions/subscription-to-drives';

export const initializeDelta = inngest.createFunction(
  {
    id: 'initialize-data-protection-delta',
    concurrency: {
      key: 'event.data.siteId',
      limit: 1,
    },
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
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
    retries: env.MICROSOFT_DATA_PROTECTION_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/data_protection.initialize_delta.requested' },
  async ({ event, step }) => {
    const { organisationId, siteId, driveId, isFirstSync, skipToken } = event.data;

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
        isFirstSync,
        skipToken,
        deltaToken: null,
      });

      return result;
    });

    if (nextSkipToken) {
      await step.sendEvent('sync-next-delta-page', {
        name: 'one-drive/data_protection.initialize_delta.requested',
        data: {
          organisationId,
          siteId,
          driveId,
          isFirstSync,
          skipToken: nextSkipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    const data = await step.invoke('one-drive/drives.subscription.triggered', {
      function: subscriptionToDrive,
      data: {
        organisationId,
        siteId,
        driveId,
        isFirstSync,
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
        set: { subscriptionId: data.id, delta: newDeltaToken!, siteId },
      });

    return {
      status: 'completed',
    };
  }
);
