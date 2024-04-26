import { NextResponse } from 'next/server';
import { parseWebhookEventData } from '@elba-security/sdk';
import { env } from '@/env';
import { startSync } from './service';

export const preferredRegion = env.VERCEL_PREFERRED_REGION;
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const data: unknown = await request.json();

  const { organisationId } = parseWebhookEventData('data_protection.start_sync_requested', data);

  await startSync(organisationId);

  return new NextResponse();
}
