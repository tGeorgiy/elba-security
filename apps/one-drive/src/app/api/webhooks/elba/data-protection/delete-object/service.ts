import { inngest } from '@/inngest/client';
import type { DeleteItemSchema } from './route';

export const deleteObject = async (data: DeleteItemSchema) => {
  await inngest.send({
    name: 'one-drive/data_protection.delete_object.requested',
    data,
  });
};
