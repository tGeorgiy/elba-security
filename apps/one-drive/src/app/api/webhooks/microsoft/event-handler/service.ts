import { z } from 'zod';
import { inngest } from '@/inngest/client';
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

const resoursesSchema = z.object({
  sites: z.literal('siteId'),
  drives: z.literal('driveId'),
});

const parsedSchema = z.object({
  siteId: z.string().min(1),
  driveId: z.string().min(1),
});

type SelectFieldsType = z.infer<typeof resoursesSchema>;
type ParsedType = z.infer<typeof parsedSchema>;

const selectFields: SelectFieldsType = {
  sites: 'siteId',
  drives: 'driveId',
};

const parseResourceString = (resourse: string, getFields: SelectFieldsType): ParsedType => {
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

  return parsedSchema.parse(result);
};

export const handleWebhook = async (data: WebhookResponse<SubscriptionPayload>) => {
  console.log('HANDLE_WEBHOOK');
  await inngest.send(
    data.value.map((payload) => {
      const { siteId, driveId } = parseResourceString(payload.resource, selectFields);

      return {
        id: `update-items-subscription-${payload.subscriptionId}`,
        name: 'one-drive/update-items.triggered',
        data: {
          siteId,
          driveId,
          subscriptionId: payload.subscriptionId,
          tenantId: payload.tenantId,
          skipToken: null,
        },
      };
    })
  );
};
