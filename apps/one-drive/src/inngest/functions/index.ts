import { syncDrives } from './data-protection/sync-drives';
import { syncItems } from './data-protection/sync-items';
import { syncSites } from './data-protection/sync-sites';
import { refreshToken } from './token/refresh-token';
import { scheduleUsersSyncs } from './users/schedule-users-syncs';
import { syncUsers } from './users/sync-users';
import { scheduleDataProtectionSyncJobs } from './data-protection/schedule-sync-sites';
import { refreshItem } from './data-protection/refresh-item';
import { deleteDataProtectionItemPermissions } from './data-protection/delete-item-permission';
import { initializeDelta } from './delta/initialize-delta';
import { subscriptionToDrive } from './subscriptions/subscription-to-drives';
import { updateItems } from './data-protection/update-items';
import { subscriptionRefresh } from './subscriptions/subscription-refresh';
import { subscriptionRemove } from './subscriptions/subscription-remove';

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
  subscriptionToDrive,
  subscriptionRefresh,
  subscriptionRemove,
  updateItems,
];
