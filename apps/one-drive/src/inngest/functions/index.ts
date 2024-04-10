import { syncDrives } from './data-protection/sync-drives';
import { syncItems } from './data-protection/sync-items';
import { syncSites } from './data-protection/sync-sites';
import { refreshToken } from './token/refresh-token';
import { scheduleUsersSyncs } from './users/schedule-users-syncs';
import { syncUsers } from './users/sync-users';
import { scheduleDataProtectionSyncJobs } from './data-protection/schedule-sync-sites';
import { refreshItem } from './data-protection/refresh-item';
import { deleteDataProtectionItemPermissions } from './data-protection/delete-item-permission';
import { initializeDelta } from './data-protection/initialize-delta';
import { subscribeToDrive } from './subscriptions/create-drive-subscriprion';
import { updateItemPermissions } from './data-protection/update-items';

export const inngestFunctions = [
  syncUsers,
  scheduleUsersSyncs,
  refreshToken,
  syncSites,
  syncDrives,
  syncItems,
  scheduleDataProtectionSyncJobs,
  refreshItem,
  deleteDataProtectionItemPermissions,
  initializeDelta,
  subscribeToDrive,
  updateItemPermissions,
];
