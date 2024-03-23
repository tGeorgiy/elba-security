import { syncDrives } from './data-protection/sync-drives';
import { syncItems } from './data-protection/sync-items';
import { syncSites } from './data-protection/sync-sites';
import { refreshToken } from './token/refresh-token';
import { scheduleUsersSyncs } from './users/schedule-users-syncs';
import { syncUsers } from './users/sync-users';

export const inngestFunctions = [
  syncUsers,
  scheduleUsersSyncs,
  refreshToken,
  syncSites,
  syncDrives,
  syncItems,
];
