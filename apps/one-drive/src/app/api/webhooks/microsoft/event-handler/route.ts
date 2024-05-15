import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleWebhook } from '@/app/api/webhooks/microsoft/event-handler/service';

export const subscriptionSchema = z.object({
  subscriptionId: z.string(),
  resource: z.string(),
  tenantId: z.string(),
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

  const data: unknown = await req.json();

  await handleWebhook(subscriptionArray.parse(data));

  return NextResponse.json({}, { status: 202 });
}
