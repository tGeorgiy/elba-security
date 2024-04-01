import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseWebhookEventData } from '@elba-security/sdk';
import { deleteObject } from './service';

const baseSchema = z.object({
  id: z.string(),
  organisationId: z.string(),
  metadata: z.object({
    siteId: z.string(),
    driveId: z.string(),
  }),
});

export type DeleteItemSchema = z.infer<typeof baseSchema>;

export async function POST(request: Request) {
  const data: unknown = await request.json();

  const webhookData = parseWebhookEventData('data_protection.object_deleted', data);

  await deleteObject(baseSchema.parse(webhookData));

  return new NextResponse();
}
