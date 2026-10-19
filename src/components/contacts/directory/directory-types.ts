import type { ActivityState } from '@/components/contacts/use-contacts-directory';
import type { DirectoryRow } from '@/lib/contacts/directory';
import type { ContactRow } from '@/lib/db/types';
import type { Direction } from '@/lib/people/party-stats';

/** What every row of a list shares, so a row is a pure view of its data. */
export type RowContext = {
  activityState: ActivityState;
  /** the twelve month names, oldest first, for the bars */
  monthLabels: string[];
  canVoucher: (direction: Direction) => boolean;
  onVoucher: (row: DirectoryRow) => void;
  mayMutate: boolean;
  onEdit: (contact: ContactRow, opener: HTMLElement | null) => void;
  onDelete: (id: string) => void;
  /** files offered as landlords: their row says why */
  hintIds: ReadonlySet<string>;
};
