import { expect, test, describe, vi, beforeEach } from 'vitest';
import { createInngestFunctionMock } from '@elba-security/test-utils';
import { NonRetriableError } from 'inngest';
import * as refreshSubscriptionConnector from '@/connectors/subscription/refresh-subscription';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { encrypt } from '@/common/crypto';
import { db } from '@/database/client';
import { subscriptionRefresh } from './subscription-refresh';

const token = 'test-token';
const organisationId = '45a76301-f1dd-4a77-b12f-9d7d3fca3c90';
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

const setupData = {
  subscriptionId: sharePoint.subscriptionId,
  organisationId: organisation.id,
};

const setup = createInngestFunctionMock(
  subscriptionRefresh,
  'one-drive/subscription.refresh.triggered'
);

describe('subscription-refresh', () => {
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

  test('should abort refreshing when record not found', async () => {
    vi.spyOn(refreshSubscriptionConnector, 'refreshSubscription').mockResolvedValue(undefined);

    const [result] = setup({
      ...setupData,
      organisationId: '15a76301-f1dd-4a77-b12a-9d7d3fca3c92', // fake id
    });

    await expect(result).rejects.toBeInstanceOf(NonRetriableError);

    expect(refreshSubscriptionConnector.refreshSubscription).toBeCalledTimes(0);
  });

  test('should run refreshSubscription when data is valid', async () => {
    vi.spyOn(refreshSubscriptionConnector, 'refreshSubscription').mockResolvedValue(undefined);

    const [result] = setup(setupData);

    await expect(result).resolves.toStrictEqual({ status: 'completed' });

    expect(refreshSubscriptionConnector.refreshSubscription).toBeCalledTimes(1);
    expect(refreshSubscriptionConnector.refreshSubscription).toBeCalledWith(
      organisation.token,
      sharePoint.subscriptionId
    );
  });
});
