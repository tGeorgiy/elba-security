import { syncDrives } from './data-protection/sync-drives';
import { syncItems } from './data-protection/sync-items';
import { syncStart } from './data-protection/sync-start';
import { refreshToken } from './token/refresh-token';
import { scheduleUsersSyncs } from './users/schedule-users-syncs';
import { syncUsers } from './users/sync-users';

export const inngestFunctions = [
  syncUsers,
  scheduleUsersSyncs,
  refreshToken,
  syncStart,
  syncDrives,
  syncItems,
];
