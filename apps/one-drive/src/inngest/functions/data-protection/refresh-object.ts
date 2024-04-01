import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { Elba } from '@elba-security/sdk';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { getAllItemPermissions } from '@/connectors/share-point/permissions';
import { getItem } from '@/connectors/share-point/get-item';
import { formatDataProtetionItems } from './sync-items';

export const refreshObject = inngest.createFunction(
  {
    id: 'refresh-data-protection-objects',
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
  { event: 'one-drive/data_protection.refresh_object.requested' },
  async ({ event, step, logger }) => {
    const {
      id: itemId,
      organisationId,
      metadata: { siteId, driveId },
    } = event.data;

    logger.info('Refresh Start');

    const [organisation] = await db
      .select({
        token: organisationsTable.token,
        region: organisationsTable.region,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with itemId=${organisationId}`);
    }

    await step.run('get-item-permissions', async () => {
      const token = await decrypt(organisation.token);

      const elba = new Elba({
        organisationId,
        apiKey: env.ELBA_API_KEY,
        baseUrl: env.ELBA_API_BASE_URL,
        region: organisation.region,
      });

      const [item, { permissions }] = await Promise.all([
        getItem({ token, siteId, driveId, itemId }),
        getAllItemPermissions({
          token,
          siteId,
          driveId,
          itemId,
        }),
      ]);

      if (item === 'notFound' || !permissions.length) {
        await elba.dataProtection.deleteObjects({
          ids: [itemId],
        });
      } else {
        const dataProtectionItem = formatDataProtetionItems({
          itemsWithPermisions: [
            {
              item,
              permissions,
            },
          ],
          siteId,
          driveId,
        });

        if (!dataProtectionItem.length) return;

        await elba.dataProtection.updateObjects({
          objects: dataProtectionItem,
        });
      }
    });

    return {
      status: 'completed',
    };
  }
);
