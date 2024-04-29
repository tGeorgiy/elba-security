import { expect, test, describe, vi, beforeEach } from 'vitest';
import { createInngestFunctionMock } from '@elba-security/test-utils';
import { NonRetriableError } from 'inngest';
import * as deleteItemPermisionConnector from '@/connectors/share-point/delete-item-permission';
import { organisationsTable } from '@/database/schema';
import { encrypt } from '@/common/crypto';
import { db } from '@/database/client';
import { MicrosoftError } from '@/common/error';
import { deleteDataProtectionItemPermissions } from './delete-item-permission';

const token = 'test-token';

const siteId = 'some-site-id';
const driveId = 'some-drive-id';
const itemId = 'some-item-id';
const notFoundPermissionId = 'not-found-permission-id';

const organisation = {
  id: '45a76301-f1dd-4a77-b12f-9d7d3fca3c90',
  token: await encrypt(token),
  tenantId: 'tenant-id',
  region: 'us',
};

const permissions: string[] = Array.from({ length: 5 }, (_, i) => `some-permission-id-${i}`);

const notFoundPermissionArray = [...permissions, notFoundPermissionId];

const setupData = {
  id: itemId,
  organisationId: organisation.id,
  metadata: {
    siteId,
    driveId,
  },
  permissions,
};

const setup = createInngestFunctionMock(
  deleteDataProtectionItemPermissions,
  'one-drive/data_protection.delete_object_permissions.requested'
);

describe('delete-object', () => {
  beforeEach(async () => {
    await db.insert(organisationsTable).values(organisation);
  });

  test('should abort deletation when organisation is not registered', async () => {
    vi.spyOn(deleteItemPermisionConnector, 'deleteItemPermission').mockResolvedValue();

    const [result, { step }] = setup({
      ...setupData,
      organisationId: '45a76301-f1dd-4a77-b12f-9d7d3fca3c92', // fake id
    });

    await expect(result).rejects.toBeInstanceOf(NonRetriableError);

    expect(step.run).toBeCalledTimes(0);
    expect(deleteItemPermisionConnector.deleteItemPermission).toBeCalledTimes(0);
  });

  test('should delete object when item exists and return deleted permissions', async () => {
    vi.spyOn(deleteItemPermisionConnector, 'deleteItemPermission').mockResolvedValue();

    const [result, { step }] = setup(setupData);

    await expect(result).resolves.toStrictEqual({
      deletedPermissions: permissions,
      notFoundPermissions: [],
    });

    expect(step.run).toBeCalledTimes(permissions.length);
    expect(deleteItemPermisionConnector.deleteItemPermission).toBeCalledTimes(permissions.length);

    for (let i = 0; i < permissions.length; i++) {
      const permissionId = permissions[i];
      expect(deleteItemPermisionConnector.deleteItemPermission).nthCalledWith(i + 1, {
        token,
        itemId,
        siteId,
        driveId,
        permissionId,
      });
    }
  });

  test('should delete object when item exists and return deleted permissions and not found permission', async () => {
    vi.spyOn(deleteItemPermisionConnector, 'deleteItemPermission').mockImplementation(
      ({ permissionId }) => {
        if (permissionId === notFoundPermissionId) {
          return Promise.reject(
            new MicrosoftError('Could not delete item permission', {
              response: new Response(undefined, { status: 404 }),
            })
          );
        }
        return Promise.resolve();
      }
    );

    const [result, { step }] = setup({
      ...setupData,
      permissions: notFoundPermissionArray,
    });

    await expect(result).resolves.toStrictEqual({
      deletedPermissions: permissions,
      notFoundPermissions: [notFoundPermissionId],
    });

    expect(step.run).toBeCalledTimes(notFoundPermissionArray.length);
    expect(deleteItemPermisionConnector.deleteItemPermission).toBeCalledTimes(
      notFoundPermissionArray.length
    );

    for (let i = 0; i < notFoundPermissionArray.length; i++) {
      const permissionId = notFoundPermissionArray[i];
      expect(deleteItemPermisionConnector.deleteItemPermission).nthCalledWith(i + 1, {
        token,
        itemId,
        siteId,
        driveId,
        permissionId,
      });
    }
  });
});
