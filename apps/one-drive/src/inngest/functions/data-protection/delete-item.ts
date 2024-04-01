import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { deleteItem } from '@/connectors/share-point/delete-item';

export const deleteDataProtectionItem = inngest.createFunction(
  {
    id: 'delete-data-protection-object',
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
  { event: 'one-drive/data_protection.delete_object.requested' },
  async ({ event, step, logger }) => {
    const {
      id: itemId,
      organisationId,
      metadata: { siteId, driveId },
    } = event.data;

    logger.info('Delete Start');

    const [organisation] = await db
      .select({
        token: organisationsTable.token,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with itemId=${organisationId}`);
    }

    await step.run('delete-item-permissions', async () => {
      const token = await decrypt(organisation.token);

      await deleteItem({ token, siteId, driveId, itemId });
    });

    return {
      status: 'completed',
    };
  }
);
