import { z } from 'zod';
import { logger } from '@elba-security/logger';
import { inngest } from '@/inngest/client';
import type {
  ParsedType,
  SelectFieldsType,
  SubscriptionPayload,
  UpdateItemsData,
  WebhookResponse,
} from './types';

export const parsedSchema = z.object({
  siteId: z.string().min(1),
  driveId: z.string().min(1),
});

export const resoursesSchema = z.object({
  sites: z.literal('siteId'),
  drives: z.literal('driveId'),
});

export const selectFields: SelectFieldsType = {
  sites: 'siteId',
  drives: 'driveId',
};

export const parseResourceString = (resourse: string, getFields: SelectFieldsType) => {
  const dataArray = resourse.split('/');
  const keys = Object.keys(getFields);

  const result = keys.reduce<ParsedType>(
    (acc, el) => {
      const index = dataArray.indexOf(el);

      if (index >= 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- temp
        acc[getFields[el]] = dataArray[index + 1];
      }

      return acc;
    },
    { siteId: '', driveId: '' }
  );

  return parsedSchema.safeParse(result);
};

export const handleWebhook = async (data: WebhookResponse<SubscriptionPayload>) => {
  if (!data.value.length) return;

  await inngest.send(
    data.value.reduce<UpdateItemsData[]>((acc, payload) => {
      const parsed = parseResourceString(payload.resource, selectFields);

      if (!parsed.success) {
        logger.error('parseResourceString Error', { resource: payload.resource, selectFields });
        return acc;
      }

      const { subscriptionId, tenantId } = payload;
      const { siteId, driveId } = parsed.data;

      acc.push({
        id: `update-items-subscription-${subscriptionId}`,
        name: 'one-drive/update-items.triggered',
        data: {
          siteId,
          driveId,
          subscriptionId,
          tenantId,
          skipToken: null,
        },
      });
      return acc;
    }, [])
  );
};
