import { inngest } from '@/inngest/client';
import type { DeleteItemPermissionsSchema } from './route';

export const deleteObjectPermissions = async (data: DeleteItemPermissionsSchema) => {
  await inngest.send({
    name: 'one-drive/data_protection.delete_object_permissions.requested',
    data: {
      id: data.id,
      organisationId: data.organisationId,
      metadata: data.metadata,
      permissions: data.permissions.map((p) => p.id),
    },
  });
};
