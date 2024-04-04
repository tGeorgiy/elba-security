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
    id: 'delete-data-protection-object-permissions',
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
  { event: 'one-drive/data_protection.delete_object_permissions.requested' },
  async ({ event, step, logger }) => {
    const {
      id: itemId,
      organisationId,
      metadata: { siteId, driveId },
      permissions,
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

    const token = await decrypt(organisation.token);

    const permissionDeletionResults = await Promise.allSettled(
      permissions.map((p) =>
        step.run('delete-item-permission', async () => {
          try {
            await deleteItemPermission({
              token,
              siteId,
              driveId,
              itemId,
              permissionId: p,
            });

            return { status: 204, permissionId: p };
            /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Start of error handling */
          } catch (error: any) {
            if (error.response.status === 404) return { status: 404, permissionId: p };

            throw error;
          }
          /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- End of error handling */
        })
      )
    );

    return permissionDeletionResults.reduce<{
      deletedPermissions: string[];
      notFoundPermissions: string[];
      unexpectedFailedPermissions: string[];
    }>(
      (acc, el, index) => {
        if (el.status === 'fulfilled') {
          if (el.value.status === 204) acc.deletedPermissions.push(el.value.permissionId);
          else if (el.value.status === 404) acc.notFoundPermissions.push(el.value.permissionId);
        }
        if (el.status === 'rejected') {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- can't be undefined
          acc.unexpectedFailedPermissions.push(permissions[index]!);
        }

        return acc;
      },
      { deletedPermissions: [], notFoundPermissions: [], unexpectedFailedPermissions: [] }
    );
  }
);
