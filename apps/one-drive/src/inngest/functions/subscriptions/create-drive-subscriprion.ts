import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { createSubscription } from '@/connectors/subscription/create-subcsription';
import { decrypt } from '@/common/crypto';

export const subscribeToDrive = inngest.createFunction(
  {
    id: 'subscribe-to-drive',
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
    retries: env.MICROSOFT_DATA_PROTECTION_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/drives.subscription.triggered' },
  async ({ event, step }) => {
    console.log('SUB INNGEST');

    const { organisationId, siteId, driveId } = event.data;

    const [organisation] = await db
      .select({
        token: organisationsTable.token,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with id=${organisationId}`);
    }

    const result = await step.run('create-subscription', async () => {
      const changeType = 'updated';
      const resource = `sites/${siteId}/drives/${driveId}/root`;

      return createSubscription({
        token: await decrypt(organisation.token),
        changeType,
        resource,
      });
    });

    return result;
  }
);
