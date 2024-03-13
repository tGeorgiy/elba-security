import { logger } from '@elba-security/logger';
import type { DataProtectionObject, DataProtectionObjectPermission } from '@elba-security/sdk';
import { Elba } from '@elba-security/sdk';
import { env } from '@/env';
import { inngest } from '@/inngest/client';
import type { MicrosoftDriveItem } from '../../../connectors/share-point/items';
import { getItems } from '../../../connectors/share-point/items';
import type { MicrosoftDriveItemPermissions } from '../../../connectors/share-point/permissions';
import { getItemPermissions } from '../../../connectors/share-point/permissions';

export type ItemsWithPermisions = {
  item: MicrosoftDriveItem;
  permissions: MicrosoftDriveItemPermissions[];
};

export const parseItems = (
  inputItems: MicrosoftDriveItem[]
): {
  folders: MicrosoftDriveItem[];
  items: MicrosoftDriveItem[];
} => {
  const folders: MicrosoftDriveItem[] = [];
  const items: MicrosoftDriveItem[] = [];

  inputItems.forEach((item) => {
    if (item.folder) {
      folders.push(item);
    } else {
      items.push(item);
    }
  });

  return {
    folders,
    items,
  };
};

export const getCkunkedArray = <T>(array: T[], batchSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    chunks.push(array.slice(i, Number(Number(batchSize))));
  }
  return chunks;
};

export const formatPermissions = (
  permission: MicrosoftDriveItemPermissions
): DataProtectionObjectPermission[] | [] => {
  const invalidPermissions: MicrosoftDriveItemPermissions[] = [];

  if (
    typeof permission.grantedToV2?.user?.displayName === 'string' &&
    typeof permission.grantedToV2.user.id === 'string'
  ) {
    return [
      {
        id: permission.id,
        type: 'user',
        displayName: permission.grantedToV2.user.displayName,
        userId: permission.grantedToV2.user.id,
        email: permission.grantedToV2.user.email,
        metadata: {
          permissionId: permission.id,
          roles: permission.roles,
        },
      },
    ];
  } else if (permission.grantedToIdentitiesV2?.length) {
    const userPermissions = permission.grantedToIdentitiesV2.filter((p) => Boolean(p?.user));

    if (userPermissions.length) {
      const formattedPermissions: DataProtectionObjectPermission[] = [];

      for (const p of userPermissions) {
        if (typeof p?.user?.displayName === 'string' && typeof p.user.id === 'string') {
          formattedPermissions.push({
            id: `${permission.id}${env.ID_SEPARATOR}${p.user.id}`,
            type: 'user',
            displayName: p.user.displayName,
            userId: p.user.id,
            email: p.user.email,
            metadata: {
              permissionId: permission.id,
              roles: permission.roles,
            },
          });
        } else {
          invalidPermissions.push({
            ...permission,
            grantedToIdentitiesV2: [p],
          });
        }
      }

      return formattedPermissions;
    }
  } else {
    invalidPermissions.push(permission);
  }

  logger.warn('Retrieved permissions are invalid, or empty permissions array', invalidPermissions);

  return [];
};

export const parseDataProtetionItems = (
  itemsWithPermisions: ItemsWithPermisions[]
): DataProtectionObject[] => {
  const dataProtection: DataProtectionObject[] = [];

  for (const { item, permissions } of itemsWithPermisions) {
    if (item.createdBy.user.id) {
      const validPermissions: MicrosoftDriveItemPermissions[] = permissions.filter((p) => {
        if (p.link && p.link.scope === 'users') return true;
        else if (p.grantedToV2?.user) return true;
        return false;
      });

      if (validPermissions.length) {
        const dataProtectionItem = {
          id: item.id,
          name: item.name,
          ownerId: item.createdBy.user.id,
          url: item.webUrl,
          permissions: validPermissions.map((p) => formatPermissions(p)).flat(),
        };

        dataProtection.push(dataProtectionItem);
      }
    }
  }

  return dataProtection;
};

export const syncItems = inngest.createFunction(
  {
    id: 'one-drive-sync-items',
    priority: {
      run: 'event.data.isFirstSync ? 600 : 0',
    },
    concurrency: {
      key: 'event.data.organisationId',
      limit: 2,
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
    retries: env.USERS_SYNC_MAX_RETRY,
  },
  { event: 'one-drive/items.sync.triggered' },
  async ({ event, step }) => {
    const { token, siteId, driveId, isFirstSync, folderId, skipToken, ...organisation } =
      event.data;

    logger.info('Sync Items');

    const elba = new Elba({
      organisationId: organisation.organisationId,
      apiKey: env.ELBA_API_KEY,
      baseUrl: env.ELBA_API_BASE_URL,
      region: organisation.organisationRegion,
    });

    const { folders, items, nextSkipToken } = await step.run('paginate', async () => {
      const result = await getItems({
        token,
        siteId,
        driveId,
        folderId,
        skipToken,
      });

      return {
        ...parseItems(result.items),
        nextSkipToken: result.nextSkipToken,
      };
    });

    if (folders.length) {
      const folderPromises = folders.map((folder) =>
        step.sendEvent('one-drive-sync-items', {
          name: 'one-drive/items.sync.triggered',
          data: {
            token,
            siteId,
            driveId,
            isFirstSync,
            folderId: folder.id,
            skipToken: null,
            ...organisation,
          },
        })
      );

      await Promise.allSettled(folderPromises);
    }

    const itemsWithPermisionsResult = await step.run('item-permissions', async () => {
      const itemsWithPermisions: ItemsWithPermisions[] = [];

      const itemsChunks = getCkunkedArray<MicrosoftDriveItem>(
        [...folders, ...items],
        env.MICROSOFT_CHUNK_SIZE
      );

      for (const itemsChunk of itemsChunks) {
        // eslint-disable-next-line no-await-in-loop -- Avoiding hundreds of inngest functions
        const itemPermissionsChunks = await Promise.all(
          itemsChunk.map((item) =>
            getItemPermissions({
              token,
              siteId,
              driveId,
              itemId: item.id,
              skipToken: null,
            })
          )
        );

        for (let i = 0; i < itemPermissionsChunks.length; i++) {
          const item = itemsChunk[i];
          const permissions = itemPermissionsChunks[i];

          if (!item || !permissions) continue;

          itemsWithPermisions.push({
            item,
            permissions: permissions.permissions,
          });
        }
      }

      return itemsWithPermisions;
    });

    const dataProtectionItems = parseDataProtetionItems(
      itemsWithPermisionsResult as unknown as ItemsWithPermisions[]
    );

    if (dataProtectionItems.length) {
      await step.run('elba-permissions-update', async () => {
        if (dataProtectionItems.length)
          await elba.dataProtection.updateObjects({
            objects: dataProtectionItems,
          });
      });
    }

    if (nextSkipToken) {
      logger.info('ITEMS PAGINATION');
      await step.sendEvent('sync-next-drives-page', {
        name: 'one-drive/items.sync.triggered',
        data: {
          ...event.data,
          skipToken: nextSkipToken,
        },
      });

      return {
        status: 'ongoing',
      };
    }

    return {
      status: 'completed',
    };
  }
);
