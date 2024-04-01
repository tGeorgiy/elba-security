import { syncDrives } from './data-protection/sync-drives';
import { syncItems } from './data-protection/sync-items';
import { syncSites } from './data-protection/sync-sites';
import { refreshToken } from './token/refresh-token';
import { scheduleUsersSyncs } from './users/schedule-users-syncs';
import { syncUsers } from './users/sync-users';
import { scheduleDataProtectionSyncJobs } from './data-protection/schedule-sync-sites';
import { refreshObject } from './data-protection/refresh-object';
import { deleteDataProtectionItem } from './data-protection/delete-item';
import { deleteDataProtectionItemPermissions } from './data-protection/delete-item-permission';

export const inngestFunctions = [
  syncUsers,
  scheduleUsersSyncs,
  refreshToken,
  syncSites,
  syncDrives,
  syncItems,
  scheduleDataProtectionSyncJobs,
  refreshObject,
  deleteDataProtectionItem,
  deleteDataProtectionItemPermissions,
];
