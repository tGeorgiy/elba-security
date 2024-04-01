import { expect, test, describe, vi, beforeEach } from 'vitest';
import { createInngestFunctionMock } from '@elba-security/test-utils';
import { NonRetriableError } from 'inngest';
import * as deleteItemPermisionConnector from '@/connectors/share-point/delete-item-permission';
import { organisationsTable } from '@/database/schema';
import { encrypt } from '@/common/crypto';
import { db } from '@/database/client';
import { deleteDataProtectionItemPermissions } from './delete-item-permission';

const token = 'test-token';

const siteId = 'some-site-id';
const driveId = 'some-drive-id';
const itemId = 'some-item-id';
const permissionId = 'some-permission-id';

const organisation = {
  id: '45a76301-f1dd-4a77-b12f-9d7d3fca3c90',
  token: await encrypt(token),
  tenantId: 'tenant-id',
  region: 'us',
};

const setupData = {
  id: itemId,
  organisationId: organisation.id,
  metadata: {
    siteId,
    driveId,
  },
  permissionId,
};

const setup = createInngestFunctionMock(
  deleteDataProtectionItemPermissions,
  'one-drive/data_protection.delete_object_permission.requested'
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

  test('should delete object when item exists', async () => {
    vi.spyOn(deleteItemPermisionConnector, 'deleteItemPermission').mockResolvedValue();

    const [result, { step }] = setup(setupData);

    await expect(result).resolves.toStrictEqual({
      status: 'completed',
    });

    expect(step.run).toBeCalledTimes(1);
    expect(deleteItemPermisionConnector.deleteItemPermission).toBeCalledTimes(1);
    expect(deleteItemPermisionConnector.deleteItemPermission).toBeCalledWith({
      token,
      itemId,
      siteId,
      driveId,
      permissionId,
    });
  });
});
