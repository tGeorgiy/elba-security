import type { MicrosoftDriveItem } from '@/connectors/one-drive/share-point/items';
import type { MicrosoftDriveItemPermissions } from '@/connectors/one-drive/share-point/permissions';

export type ItemsWithPermisions = {
  item: MicrosoftDriveItem;
  permissions: MicrosoftDriveItemPermissions[];
};

export type Folder = {
  id: string | null;
  paginated: boolean;
  permissions: string[] | [];
} | null;

export type ParsedDelta = {
  deleted: string[];
  updated: MicrosoftDriveItem[];
};

export type ItemsWithPermisionsParsed = {
  toDelete: string[];
  toUpdate: ItemsWithPermisions[];
};
