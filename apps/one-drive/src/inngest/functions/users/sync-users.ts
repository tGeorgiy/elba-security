import type { User } from '@elba-security/sdk';
import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { logger } from '@elba-security/logger';
import { db } from '@/database/client';
import { organisationsTable } from '@/database/schema';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import { decrypt } from '@/common/crypto';
import { getUsers } from '@/connectors/users/get-users';
import type { MicrosoftUser } from '@/connectors/users/get-users';
import { getElbaClient } from '@/connectors/elba/client';

const formatElbaUser = (user: MicrosoftUser): User => ({
  id: user.id,
  email: user.mail || undefined,
  displayName: user.displayName || user.userPrincipalName,
  additionalEmails: [],
});

export const syncUsers = inngest.createFunction(
  {
    id: 'one-drive-sync-users',
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
    },
    concurrency: {
      key: 'event.data.organisationId',
      limit: 1,
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
    retries: env.USERS_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/users.sync.triggered' },
  async ({ event, step }) => {
    const { organisationId, syncStartedAt, skipToken } = event.data;

    const [organisation] = await db
      .select({
        token: organisationsTable.token,
        tenantId: organisationsTable.tenantId,
        region: organisationsTable.region,
      })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, organisationId));

    if (!organisation) {
      throw new NonRetriableError(`Could not retrieve organisation with id=${organisationId}`);
    }

    const elba = getElbaClient({ organisationId, region: organisation.region });

    const nextSkipToken = await step.run('paginate', async () => {
      const result = await getUsers({
        token: await decrypt(organisation.token),
        tenantId: organisation.tenantId,
        skipToken,
      });

      if (result.invalidUsers.length > 0) {
        logger.warn('Retrieved users contains invalid data', {
          organisationId,
          tenantId: organisation.tenantId,
          invalidUsers: result.invalidUsers,
        });
      }

      await elba.users.update({
        users: result.validUsers.map(formatElbaUser),
      });

      return result.nextSkipToken;
    });

    if (nextSkipToken) {
      await step.sendEvent('sync-next-users-page', {
        name: 'one-drive/users.sync.triggered',
        data: {
          ...event.data,
          skipToken: nextSkipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    await elba.users.delete({ syncedBefore: new Date(syncStartedAt).toISOString() });

    return {
      status: 'completed',
    };
  }
);
