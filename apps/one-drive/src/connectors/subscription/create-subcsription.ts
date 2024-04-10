import { z } from 'zod';
import { addDays } from 'date-fns';
import { env } from '@/env';
import { MicrosoftError } from '@/common/error';

const siteSchema = z.object({
  id: z.string(),
  expirationDateTime: z.string(),
});

//   response: {
//   '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#subscriptions/$entity',
//   id: 'bee3a858-5247-4710-a2db-28a9b7638abd',
//   resource: 'sites/testcomp633.sharepoint.com,01a63770-aff9-42b8-831d-46b05ff02b5c,166a5d4b-4220-4844-8979-a76ad03d4337/drives/b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5/root',
//   applicationId: '7a0365f9-00ec-40b1-955a-c4fc18e5c250',
//   changeType: 'updated',
//   clientState: null,
//   notificationUrl: 'https://8235-178-20-153-149.ngrok-free.app/microsoft-webhook',
//   notificationQueryOptions: null,
//   lifecycleNotificationUrl: null,
//   expirationDateTime: '2024-04-22T00:00:00Z',
//   creatorId: 'e103b4e0-1cf1-43da-bbaa-15f28cce94c2',
//   includeResourceData: null,
//   latestSupportedTlsVersion: 'v1_2',
//   encryptionCertificate: null,
//   encryptionCertificateId: null,
//   notificationUrlAppId: null
// }

type CreateSubscriptionParams = {
  token: string;
  changeType: string;
  resource: string;
};

export type MicrosoftSite = z.infer<typeof siteSchema>;

export const createSubscription = async ({
  token,
  changeType,
  resource,
}: CreateSubscriptionParams) => {
  const url = new URL(`${env.MICROSOFT_API_URL}/subscriptions`);

  // console.log('SUB CREATE');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      changeType,
      notificationUrl: `${env.WEBHOOK_URL}api/webhooks/microsoft/event-handler`,
      resource,
      expirationDateTime: addDays(new Date(), Number(env.SUBSCRIBE_EXPIRATION_DAYS)).toISOString(),
    }),
  });

  if (!response.ok) {
    throw new MicrosoftError('Could not retrieve create subscription', { response });
  }

  const data = (await response.json()) as MicrosoftSite;

  return siteSchema.parse(data);
};
