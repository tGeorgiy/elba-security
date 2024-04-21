import { expect, test, describe, vi, beforeEach } from 'vitest';
import { createInngestFunctionMock, spyOnElba } from '@elba-security/test-utils';
import { NonRetriableError } from 'inngest';
import { and, eq } from 'drizzle-orm';
import * as deltaConnector from '@/connectors/delta/get-delta';
import * as permissionsConnector from '@/connectors/share-point/permissions';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { encrypt } from '@/common/crypto';
import { db } from '@/database/client';
import type { Delta } from '@/connectors/delta/get-delta';
import { env } from '@/env';
import type { MicrosoftDriveItemPermissions } from '@/connectors/share-point/permissions';
import { MicrosoftError } from '@/common/error';
import { parsedDelta, updateItems } from './update-items';
import type { ItemsWithPermisions } from './sync-items';
import { formatDataProtetionItems } from './sync-items';

const updatedCount = 5;
const deletedCount = 2;

const token = 'test-token';
const organisationId = '45a76301-f1dd-4a77-b12f-9d7d3fca3c92';
const siteId = 'some-site-id';
const driveId = 'some-drive-id';
const subscriptionId = 'some-subscription-id';
const tenantId = 'some-tenant-id';
const deltaToken = 'some-delta-token';

const organisation = {
  id: organisationId,
  token: await encrypt(token),
  tenantId,
  region: 'us',
};

const sharePoint = {
  organisationId,
  siteId,
  driveId,
  subscriptionId,
  subscriptionExpirationDate: '2024-04-25 00:00:00.000000',
  delta: deltaToken,
};

// updated
const items: Delta[] = Array.from({ length: updatedCount }, (_, i) => ({
  id: `item-id-${i}`,
  name: `$name-${i}`,
  webUrl: `http://webUrl-${i}.somedomain.net`,
  createdBy: {
    user: {
      email: `user-email-${i}@someemail.com`,
      id: `user-id-${i}`,
      displayName: `user-displayName-${i}`,
    },
  },
}));

//add deleted
items.push(
  ...Array.from({ length: deletedCount }, (_, i) => ({
    id: `item-id-${i}`,
    name: `$name-${i}`,
    webUrl: `http://webUrl-${i}.somedomain.net`,
    createdBy: {
      user: {
        email: `user-email-${i}@someemail.com`,
        id: `user-id-${i}`,
        displayName: `user-displayName-${i}`,
      },
    },
    deleted: { state: 'deleted' },
  }))
);

const permissions: MicrosoftDriveItemPermissions[] = Array.from(
  { length: (updatedCount + deletedCount) * 2 },
  (_, i) => ({
    id: `permission-id-${i}`,
    roles: ['write'],
    link: { scope: 'users' },
    grantedToV2: {
      user: {
        displayName: `some-display-name-${i}`,
        id: `some-user-id-${i}`,
        email: `some-user-email-${i}`,
      },
    },
    grantedToIdentitiesV2: [
      {
        user: {
          displayName: `some-display-name-${i}`,
          id: `some-user-id-${i}`,
          email: `some-user-email-${i}`,
        },
      },
    ],
  })
);

const setupData = {
  siteId,
  driveId,
  subscriptionId,
  tenantId,
  skipToken: null,
};

const setup = createInngestFunctionMock(updateItems, 'one-drive/update-items.triggered');

describe('update-item-and-permissions', () => {
  beforeEach(async () => {
    await db.insert(organisationsTable).values(organisation);
    await db
      .insert(sharePointTable)
      .values(sharePoint)
      .onConflictDoUpdate({
        target: [sharePointTable.organisationId, sharePointTable.driveId],

        set: { subscriptionId: sharePoint.subscriptionId, delta: sharePoint.delta },
      });
  });

  test('should abort sync when there is no data in db', async () => {
    const elba = spyOnElba();

    vi.spyOn(deltaConnector, 'getDelta').mockResolvedValue({
      delta: [],
      nextSkipToken: null,
      newDeltaToken: null,
    });

    const [result, { step }] = setup({
      ...setupData,
      tenantId: 'fake-tenant-id', // fake id
    });

    await expect(result).rejects.toBeInstanceOf(NonRetriableError);

    expect(deltaConnector.getDelta).toBeCalledTimes(0);

    expect(elba).toBeCalledTimes(0);

    expect(step.sendEvent).toBeCalledTimes(0);
  });

  test('should run elba udate and elba delete when there is updated and deleted items', async () => {
    const skipToken = null;
    const elba = spyOnElba();

    vi.spyOn(deltaConnector, 'getDelta').mockResolvedValue({
      delta: items,
      nextSkipToken: skipToken,
      newDeltaToken: deltaToken,
    });
    vi.spyOn(permissionsConnector, 'getAllItemPermissions').mockResolvedValue({
      permissions,
      nextSkipToken: skipToken,
    });

    const [result, { step }] = setup(setupData);

    await expect(result).resolves.toStrictEqual({ status: 'completed' });

    expect(deltaConnector.getDelta).toBeCalledTimes(1);
    expect(deltaConnector.getDelta).toBeCalledWith({
      token,
      siteId,
      driveId,
      isFirstSync: false,
      skipToken,
      deltaToken,
    });

    const { deleted, updated } = parsedDelta(items);

    expect(elba).toBeCalledTimes(1);
    expect(elba).toBeCalledWith({
      organisationId: organisation.id,
      region: organisation.region,
      apiKey: env.ELBA_API_KEY,
      baseUrl: env.ELBA_API_BASE_URL,
    });

    const elbaInstance = elba.mock.results[0]?.value;

    const updateItemsWithPermisionsResult = updated.map((item) => ({
      item,
      permissions: permissions.map((permission) =>
        permissionsConnector.validateAndParsePermission(
          permission as unknown as MicrosoftDriveItemPermissions
        )
      ),
    }));

    const updateDataProtectionItems = formatDataProtetionItems({
      itemsWithPermisions: updateItemsWithPermisionsResult as unknown as ItemsWithPermisions[],
      siteId,
      driveId,
    });

    expect(elbaInstance?.dataProtection.updateObjects).toBeCalledTimes(1);
    expect(elbaInstance?.dataProtection.updateObjects).toBeCalledWith({
      objects: updateDataProtectionItems,
    });

    expect(elbaInstance?.dataProtection.deleteObjects).toBeCalledTimes(1);
    expect(elbaInstance?.dataProtection.deleteObjects).toBeCalledWith({
      ids: deleted,
    });

    expect(step.run).toBeCalledTimes(3);
  });

  test('should update delta token in db', async () => {
    const skipToken = null;
    const newDeltaToken = 'new-delta-token';

    vi.spyOn(deltaConnector, 'getDelta').mockResolvedValue({
      delta: items,
      nextSkipToken: skipToken,
      newDeltaToken,
    });

    const [result, { step }] = setup(setupData);

    await expect(result).resolves.toStrictEqual({ status: 'completed' });

    expect(step.run).toBeCalledTimes(3);

    const [record] = await db
      .select({
        delta: sharePointTable.delta,
      })
      .from(sharePointTable)
      .innerJoin(organisationsTable, eq(sharePointTable.organisationId, organisationsTable.id))
      .where(
        and(
          eq(organisationsTable.tenantId, tenantId),
          eq(sharePointTable.siteId, siteId),
          eq(sharePointTable.driveId, driveId),
          eq(sharePointTable.subscriptionId, subscriptionId)
        )
      );

    expect(record).toBeDefined();
    expect(record?.delta).toBe(newDeltaToken);
  });

  test('should throw MicrosoftError when there is no next page and no Delta token', async () => {
    vi.spyOn(deltaConnector, 'getDelta').mockResolvedValue({
      delta: items,
      nextSkipToken: null,
      newDeltaToken: null,
    });

    const [result] = setup(setupData);

    await expect(result).rejects.toBeInstanceOf(MicrosoftError);
  });

  test('should continue the sync when there is a next page', async () => {
    const nextSkipToken = 'some-token';

    vi.spyOn(deltaConnector, 'getDelta').mockResolvedValue({
      delta: items,
      nextSkipToken,
      newDeltaToken: null,
    });

    const [result, { step }] = setup(setupData);

    await expect(result).resolves.toStrictEqual({ status: 'ongoing' });

    expect(step.run).toBeCalledTimes(3);

    expect(step.sendEvent).toBeCalledTimes(1);
    expect(step.sendEvent).toBeCalledWith('sync-next-delta-page', {
      name: 'one-drive/update-items.triggered',
      data: {
        siteId,
        driveId,
        subscriptionId,
        tenantId,
        skipToken: nextSkipToken,
      },
    });
  });
});
