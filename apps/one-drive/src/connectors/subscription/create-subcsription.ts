import { z } from 'zod';
import { addDays } from 'date-fns';
import { env } from '@/env';
import { MicrosoftError } from '@/common/error';

const subscriptionSchema = z.object({
  id: z.string(),
  expirationDateTime: z.string(),
});

type CreateSubscriptionParams = {
  token: string;
  changeType: string;
  resource: string;
};

export type Subscription = z.infer<typeof subscriptionSchema>;

export const createSubscription = async ({
  token,
  changeType,
  resource,
}: CreateSubscriptionParams) => {
  const url = new URL(`${env.MICROSOFT_API_URL}/subscriptions`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      changeType,
      notificationUrl: `${env.WEBHOOK_URL}/api/webhooks/microsoft/event-handler`,
      lifecycleNotificationUrl: `${env.WEBHOOK_URL}/api/webhooks/microsoft/lifecycle-notifications`,
      resource,
      expirationDateTime: addDays(new Date(), Number(env.SUBSCRIBE_EXPIRATION_DAYS)).toISOString(),
    }),
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not retrieve create subscription', { response });
  }

  const data = (await response.json()) as Subscription;

  return subscriptionSchema.parse(data);
};
