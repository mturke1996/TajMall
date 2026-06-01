# Design Document: Journal Entries & Mobile Layout Improvements

## Goal Description
Improve the daily journal entries functionality in the TajMall application, making it fully professional, database-connected, and mobile-friendly. Additionally, fix a UI bug where the mobile sidebar navigation is cut off and cannot be scrolled to the end on mobile devices.

Specifically:
1. Enable editing of draft journal entries with database-level validation (ensuring entries are in DRAFT status, balanced, and contain at least 2 lines).
2. Show detail lines directly inline inside the journal entries list upon card expansion, so users don't need to open the details modal to view them.
3. Redesign the journal entry form (dialog) and detail view to be responsive and stacked on mobile viewports.
4. Add safe bottom padding to the mobile sidebar drawer (`MobileNav`) to raise the scrollable content above the persistent `MobileBottomNav`.

## Proposed Changes

### Database Layer
- **File**: [010_update_journal_entry.sql](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/supabase/migrations/010_update_journal_entry.sql) [NEW]
  - Create a Postgres function `update_journal_entry` in a transaction block.
  - The function will:
    - Verify that the entry status is `'DRAFT'`.
    - Verify that `p_lines` is balanced (sum of debits = sum of credits) and has a length >= 2.
    - Update header details: `reference`, `entry_date`, `description`, `notes`.
    - Delete existing lines in `journal_lines` for the given journal ID.
    - Insert the new lines in `journal_lines`.

### Prisma Configuration
- **File**: [schema.prisma](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/prisma/schema.prisma) [MODIFY]
  - Add `url = env("DATABASE_URL")` in the `datasource db` block to enable database CLI commands (like migrate and status) to work correctly with `.env`.

### API & Queries Layer
- **File**: [journal-queries.ts](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/lib/db/journal-queries.ts) [MODIFY]
  - Add `useUpdateJournalEntry` mutation hook.
  - It will call the `update_journal_entry` RPC function.
  - Invalidate relevant query keys (`journal_entries`, `journal_entry`, `journal_lines`, `journal_summary`) on success.

### Frontend Pages & Dialogs
- **File**: [page.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/app/\(app\)/journals/page.tsx) [MODIFY]
  - Integrate inline lines display when an entry card is expanded.
  - Add an "Edit" button for DRAFT entries that opens the `JournalEntryDialog` in editing mode.
  - Pass the draft entry details to `JournalEntryDialog` when editing.
- **File**: [journal-entry-dialog.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/app/\(app\)/journals/components/journal-entry-dialog.tsx) [MODIFY]
  - Accept an optional `entry` prop for editing mode.
  - Load the entry details and its lines when in editing mode.
  - Call `useUpdateJournalEntry` instead of `useCreateJournalEntry` if editing.
  - Apply responsive styling: on mobile (`max-width: sm`), stack each journal line fields vertically (Category Select at full width, Debit and Credit inputs side-by-side, Description input at full width, and Delete button at bottom right). On desktop (`sm:grid`), revert to the horizontal 12-column grid.
- **File**: [journal-detail-dialog.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/app/\(app\)/journals/components/journal-detail-dialog.tsx) [MODIFY]
  - Make the lines layout responsive.
  - On mobile, display lines as individual stacked cards highlighting Debit and Credit amounts instead of horizontal 12-column grid rows.

### Sidebar UI Layout
- **File**: [mobile-nav.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/components/layout/mobile-nav.tsx) [MODIFY]
  - Add bottom padding `pb-[calc(80px+env(safe-area-inset-bottom))]` to the `<nav>` scroll container to ensure the bottom-most navigation links are fully visible above the bottom navigation bar.

## Verification Plan
1. **Database Migrations**: Apply the migration and verify that the `update_journal_entry` RPC function is created in Supabase.
2. **Journal Editing**:
   - Create a draft journal entry.
   - Click "Edit" to modify it, balance it, and save.
   - Verify that updates are committed in Supabase and reflected in the list immediately.
3. **Responsive Forms**:
   - Open the entry form on a simulated mobile device viewport (Chrome/Firefox DevTools).
   - Ensure input fields are stacked nicely and are not squished.
4. **Mobile Navigation Scroll**:
   - Open the mobile navigation menu drawer.
   - Scroll to the bottom and ensure the "Settings" and "Notifications" options are fully accessible.
