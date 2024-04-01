import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { deleteItemPermission } from '@/connectors/share-point/delete-item-permission';

export const deleteDataProtectionItemPermissions = inngest.createFunction(
  {
    id: 'delete-data-protection-object-permission',
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
  { event: 'one-drive/data_protection.delete_object_permission.requested' },
  async ({ event, step, logger }) => {
    const {
      id: itemId,
      organisationId,
      metadata: { siteId, driveId },
      permissionId,
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

      await deleteItemPermission({ token, siteId, driveId, itemId, permissionId });
    });

    return {
      status: 'completed',
    };
  }
);
