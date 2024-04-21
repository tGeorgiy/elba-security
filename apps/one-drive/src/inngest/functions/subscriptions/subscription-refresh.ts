import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { inngest } from '@/inngest/client';
import { env } from '@/env';
import { db } from '@/database/client';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { refreshSubscription } from '@/connectors/subscription/refresh-subscription';

export const subscriptionRefresh = inngest.createFunction(
  {
    id: 'subscribe-refresh',
    cancelOn: [
      {
        event: 'one-drive/app.uninstall.requested',
        match: 'data.organisationId',
      },
      {
        event: 'one-drive/app.install.requested',
        match: 'data.organisationId',
      },
    ],
    retries: env.MICROSOFT_DATA_PROTECTION_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/subscription.refresh.triggered' },
  async ({ event }) => {
    const { subscriptionId, organisationId } = event.data;

    const [record] = await db
      .select({
        token: organisationsTable.token,
      })
      .from(sharePointTable)
      .innerJoin(organisationsTable, eq(sharePointTable.organisationId, organisationsTable.id))
      .where(
        and(
          eq(sharePointTable.organisationId, organisationId),
          eq(sharePointTable.subscriptionId, subscriptionId)
        )
      );

    if (!record) {
      throw new NonRetriableError(
        `Could not retrieve organisation with organisationId=${organisationId} and subscriptionId=${subscriptionId}`
      );
    }

    await refreshSubscription(record.token, subscriptionId);

    return {
      status: 'completed',
    };
  }
);
