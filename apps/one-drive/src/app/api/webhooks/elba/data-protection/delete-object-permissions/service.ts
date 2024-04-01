import { inngest } from '@/inngest/client';
import type { DeleteItemPermissionsSchema } from './route';

export const deleteObjectPermissions = async (data: DeleteItemPermissionsSchema) => {
  await inngest.send(
    data.permissions.map((permission) => ({
      name: 'one-drive/data_protection.delete_object_permission.requested',
      data: {
        id: data.id,
        organisationId: data.organisationId,
        metadata: data.metadata,
        permissionId: permission.id,
      },
    }))
  );
};
