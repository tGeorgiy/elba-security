import { EventSchemas, Inngest } from 'inngest';
import { sentryMiddleware } from '@elba-security/inngest';
import { logger } from '@elba-security/logger';
import { rateLimitMiddleware } from './middlewares/rate-limit-middleware';
import { unauthorizedMiddleware } from './middlewares/unauthorized-middleware';

export const inngest = new Inngest({
  id: 'one-drive',
  schemas: new EventSchemas().fromRecord<{
    'one-drive/users.sync.triggered': {
      data: {
        organisationId: string;
        isFirstSync: boolean;
        syncStartedAt: number;
        skipToken: string | null;
      };
    };
    'one-drive/app.install.requested': {
      data: {
        organisationId: string;
      };
    };
    'one-drive/app.uninstalled.requested': {
      data: {
        organisationId: string;
      };
    };
    'one-drive/token.refresh.requested': {
      data: {
        organisationId: string;
        expiresAt: number;
      };
    };
    'one-drive/data_protection.sync.requested': {
      data: {
        organisationId: string;
        syncStartedAt: number;
        isFirstSync: boolean;
        skipToken: string | null;
      };
    };
    'one-drive/drives.sync.triggered': {
      data: {
        siteId: string;
        organisationId: string;
        isFirstSync: boolean;
        skipToken: string | null;
      };
    };
    'one-drive/items.sync.triggered': {
      data: {
        siteId: string;
        driveId: string;
        organisationId: string;
        isFirstSync: boolean;
        folder: {
          id: string | null;
          paginated: boolean;
          permissions: string[] | [];
        } | null;
        skipToken: string | null;
      };
    };
    'one-drive/drives.sync.completed': {
      data: {
        organisationId: string;
        siteId: string;
      };
    };
    'one-drive/items.sync.completed': {
      data: {
        organisationId: string;
        driveId: string;
      };
    };
    'one-drive/foder-items.sync.completed': {
      data: {
        organisationId: string;
        folderId: string;
      };
    };
    'one-drive/data_protection.refresh_object.requested': {
      data: {
        id: string;
        organisationId: string;
        metadata: {
          siteId: string;
          driveId: string;
        };
      };
    };
    'one-drive/data_protection.delete_object_permissions.requested': {
      data: {
        id: string;
        organisationId: string;
        metadata: {
          siteId: string;
          driveId: string;
        };
        permissions: string[];
      };
    };
    'one-drive/drives.subscription.triggered': {
      data: {
        organisationId: string;
        siteId: string;
        driveId: string;
        isFirstSync: boolean;
      };
    };
    'one-drive/subscription.refresh.triggered': {
      data: {
        subscriptionId: string;
        organisationId: string;
      };
    };
    'one-drive/subscription.remove.triggered': {
      data: {
        subscriptionId: string;
        organisationId: string;
      };
    };
    'one-drive/subscription.remove.completed': {
      data: {
        subscriptionId: string;
        organisationId: string;
      };
    };
    'one-drive/data_protection.initialize_delta.requested': {
      data: {
        organisationId: string;
        siteId: string;
        driveId: string;
        isFirstSync: boolean;
        skipToken: string | null;
      };
    };
    'one-drive/update-items.triggered': {
      data: {
        siteId: string;
        driveId: string;
        subscriptionId: string;
        tenantId: string;
        skipToken: string | null;
      };
    };
  }>(),
  middleware: [rateLimitMiddleware, unauthorizedMiddleware, sentryMiddleware],
  logger,
});
