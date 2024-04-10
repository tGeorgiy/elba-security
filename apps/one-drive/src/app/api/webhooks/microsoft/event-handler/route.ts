import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleWebhook } from '@/app/api/webhooks/microsoft/event-handler/service';
import type { SubscriptionPayload, WebhookResponse } from './types';

// 🚀 ~ app.post ~ microsoft-webhook:
// {
//   value: [
//     {
//       subscriptionId: '8f1787d1-b4ac-474f-b514-ef9cdb9dc76c',
//       clientState: null,
//       resource: 'sites/testcomp633.sharepoint.com,01a63770-aff9-42b8-831d-46b05ff02b5c,166a5d4b-4220-4844-8979-a76ad03d4337/drives/b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5/root',
//       tenantId: 'b783626c-d5f5-40a5-9490-90a947e44e63',
//       resourceData: [Object],
//       subscriptionExpirationDateTime: '2024-04-22T00:00:00+00:00',
//       changeType: 'updated'
//     }
//   ]
// }
// {
//   subscriptionId: '8f1787d1-b4ac-474f-b514-ef9cdb9dc76c',
//   clientState: null,
//   resource: 'sites/testcomp633.sharepoint.com,01a63770-aff9-42b8-831d-46b05ff02b5c,166a5d4b-4220-4844-8979-a76ad03d4337/drives/b!cDemAfmvuEKDHUawX_ArXEtdahYgQkRIiXmnatA9QzdcxBtdSO5qS5--R3lyylw5/root',
//   tenantId: 'b783626c-d5f5-40a5-9490-90a947e44e63',
//   resourceData: { '@odata.type': '#Microsoft.Graph.DriveItem' },
//   subscriptionExpirationDateTime: '2024-04-22T00:00:00+00:00',
//   changeType: 'updated'
// }

export const subscriptionSchema = z.object({
  subscriptionId: z.string(),
  resource: z.string(),
  tenantId: z.string(),
  subscriptionExpirationDateTime: z.string(),
});

const subscriptionArray = z.object({ value: z.array(subscriptionSchema) });

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('validationToken')) {
    return new NextResponse(req.nextUrl.searchParams.get('validationToken'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  const data = (await req.json()) as WebhookResponse<SubscriptionPayload>;

  console.log('🚀 ~ POST ~ data:', data);

  await handleWebhook(subscriptionArray.parse(data));

  return NextResponse.json({}, { status: 202 });
}
