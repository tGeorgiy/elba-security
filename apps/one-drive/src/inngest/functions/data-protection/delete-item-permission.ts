import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { deleteItemPermission } from '@/connectors/one-drive/share-point/delete-item-permission';
import { env } from '@/common/env';

export const deleteDataProtectionItemPermissions = inngest.createFunction(
  {
    id: 'one-drive-delete-data-protection-object-permissions',
    concurrency: {
      key: 'event.data.organisationId',
      limit: env.MICROSOFT_DATA_PROTECTION_REFRESH_DELETE_CONCURRENCY,
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
  { event: 'one-drive/data_protection.delete_object_permissions.requested' },
  async ({ event, step }) => {
    const {
      id: itemId,
      organisationId,
      metadata: { siteId, driveId },
      permissions,
    } = event.data;

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
      permissions.map((permissionId) =>
        step.run('delete-item-permission', async () => {
          try {
            await deleteItemPermission({
              token,
              siteId,
              driveId,
              itemId,
              permissionId,
            });

            return { status: 204, permissionId };
            /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Start of error handling */
          } catch (error: any) {
            if (error.response.status === 404) return { status: 404, permissionId };

            throw error;
          }
          /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- End of error handling */
        })
      )
    );

    return permissionDeletionResults.reduce<{
      deletedPermissions: string[];
      notFoundPermissions: string[];
    }>(
      (acc, el) => {
        if (el.status === 'fulfilled') {
          if (el.value.status === 204) acc.deletedPermissions.push(el.value.permissionId);
          if (el.value.status === 404) acc.notFoundPermissions.push(el.value.permissionId);
        }

        return acc;
      },
      { deletedPermissions: [], notFoundPermissions: [] }
    );
  }
);
