import { expect, test, describe, vi, beforeEach } from 'vitest';
import { createInngestFunctionMock } from '@elba-security/test-utils';
import { NonRetriableError } from 'inngest';
import * as createSubscriptionConnector from '@/connectors/subscription/create-subcsription';
import { organisationsTable, sharePointTable } from '@/database/schema';
import { encrypt } from '@/common/crypto';
import { db } from '@/database/client';
import { subscriptionToDrive } from './subscription-to-drives';

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
  organisationId: organisation.id,
  siteId,
  driveId,
  isFirstSync: false,
};

const subscription = {
  id: subscriptionId,
  expirationDateTime: sharePoint.subscriptionExpirationDate,
};

const setup = createInngestFunctionMock(
  subscriptionToDrive,
  'one-drive/drives.subscription.triggered'
);

describe('drive-subscribe', () => {
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

  test('should abort subscribing when record not found', async () => {
    vi.spyOn(createSubscriptionConnector, 'createSubscription').mockResolvedValue(subscription);

    const [result] = setup({
      ...setupData,
      organisationId: '15a76301-f1dd-4a77-b12a-9d7d3fca3c92', // fake id
    });

    await expect(result).rejects.toBeInstanceOf(NonRetriableError);

    expect(createSubscriptionConnector.createSubscription).toBeCalledTimes(0);
  });

  test('should run createSubscription when data is valid', async () => {
    const changeType = 'updated';
    const resource = `sites/${siteId}/drives/${driveId}/root`;

    vi.spyOn(createSubscriptionConnector, 'createSubscription').mockResolvedValue(subscription);

    const [result] = setup(setupData);

    await expect(result).resolves.toStrictEqual(subscription);

    expect(createSubscriptionConnector.createSubscription).toBeCalledTimes(1);
    expect(createSubscriptionConnector.createSubscription).toBeCalledWith({
      token,
      changeType,
      resource,
    });
  });
});
