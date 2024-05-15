import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { WebhookResponse } from '@/app/api/webhooks/microsoft/event-handler/types';
import type { MicrosoftSubscriptionEvent } from './type';
import { handleSubscriptionEvent } from './service';

export const lifecycleEventSchema = z.object({
  subscriptionId: z.string(),
  lifecycleEvent: z.enum(['reauthorizationRequired', 'subscriptionRemoved']),
  tenantId: z.string(),
});

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('validationToken')) {
    return new NextResponse(req.nextUrl.searchParams.get('validationToken'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  const data = (await req.json()) as WebhookResponse<object>;

  const subscriptionsToUpdate = data.value.reduce<MicrosoftSubscriptionEvent[]>(
    (acum, subscription) => {
      const result = lifecycleEventSchema.safeParse(subscription);

      if (result.success) {
        if (result.data.lifecycleEvent === 'reauthorizationRequired') {
          return [...acum, result.data];
        }
      }
      return acum;
    },
    []
  );

  await handleSubscriptionEvent(subscriptionsToUpdate);

  return NextResponse.json({}, { status: 202 });
}
