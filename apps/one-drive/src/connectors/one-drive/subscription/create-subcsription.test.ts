import { http } from 'msw';
import { describe, expect, test, beforeEach } from 'vitest';
import { addDays } from 'date-fns';
import { server } from '@elba-security/test-utils';
import { env } from '@/common/env';
import { MicrosoftError } from '@/common/error';
import { createSubscription, type Subscription } from './create-subcsription';

const validToken = 'token-1234';
const changeType = 'updated';
const resource = `sites/siteId/drives/driveId/root`;

const subscription: Subscription = {
  id: 'subscription-id',
  expirationDateTime: addDays(new Date(), Number(env.SUBSCRIBE_EXPIRATION_DAYS)).toISOString(),
};

describe('subscription connector', () => {
  describe('createSubscription', () => {
    // mock token API endpoint using msw
    beforeEach(() => {
      server.use(
        http.post(`${env.MICROSOFT_API_URL}/subscriptions`, ({ request }) => {
          if (request.headers.get('Authorization') !== `Bearer ${validToken}`) {
            return new Response(undefined, { status: 401 });
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- convenience
          return Response.json({
            ...subscription,
            expirationDateTime: subscription.expirationDateTime,
          });
        })
      );
    });

    test('should return subscriptionId and expirationDateTime', async () => {
      await expect(
        createSubscription({ token: validToken, changeType, resource })
      ).resolves.toStrictEqual(subscription);
    });

    test('should throws when the token is invalid', async () => {
      await expect(
        createSubscription({ token: 'invalid-token', changeType, resource })
      ).rejects.toBeInstanceOf(MicrosoftError);
    });
  });
});
