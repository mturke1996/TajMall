# Journal and Mobile Layout Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify daily journals to be fully responsive, support draft editing via a secure Postgres transaction, show journal lines directly inline when card is expanded, and fix the mobile sidebar navigation scrolling issue.

**Architecture:** We will implement editing as a transaction-based RPC function `update_journal_entry` in PostgreSQL. We'll update the frontend queries and dialogs to support loading existing details and updates. We'll use Tailwind CSS grid/flex utility classes to dynamically format forms and detail tables on mobile viewports, and add bottom safe-area compensation to `MobileNav`.

**Tech Stack:** Next.js (App Router), React, TanStack Query, Tailwind CSS, Supabase, PostgreSQL.

---

### Task 1: Add URL to Prisma Schema

**Files:**
- Modify: [schema.prisma](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/prisma/schema.prisma)

- [ ] **Step 1: Edit `schema.prisma` to reference `DATABASE_URL`**
  Modify lines 11-13 of `prisma/schema.prisma` to include the `url` property:
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```

- [ ] **Step 2: Verify connection with `npx prisma db pull --print`**
  Run: `npx prisma db pull --print` (will verify that Prisma reads `.env` and can connect to the database schema).
  Expected: Prints the database models successfully.

- [ ] **Step 3: Commit**
  ```bash
  git add prisma/schema.prisma
  git commit -m "chore: add DATABASE_URL env reference to prisma datasource"
  ```

---

### Task 2: Create SQL Migration for `update_journal_entry`

**Files:**
- Create: [010_update_journal_entry.sql](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/supabase/migrations/010_update_journal_entry.sql)

- [ ] **Step 1: Write migration SQL script**
  Create `supabase/migrations/010_update_journal_entry.sql` with the following content:
  ```sql
  -- ============================================================
  -- Migration: Update Journal Entry RPC Function
  -- ============================================================

  CREATE OR REPLACE FUNCTION public.update_journal_entry(
    p_journal_id uuid,
    p_reference text DEFAULT NULL,
    p_entry_date date DEFAULT CURRENT_DATE,
    p_description text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_lines jsonb DEFAULT '[]'::jsonb
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  DECLARE
    line jsonb;
    total_debit numeric := 0;
    total_credit numeric := 0;
    v_status journal_status;
  BEGIN
    -- Verify the entry exists and is in DRAFT status
    SELECT status INTO v_status
    FROM public.journal_entries
    WHERE id = p_journal_id;

    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Journal entry not found';
    END IF;

    IF v_status != 'DRAFT' THEN
      RAISE EXCEPTION 'Only draft entries can be updated';
    END IF;

    -- Validate lines array
    IF jsonb_array_length(p_lines) < 2 THEN
      RAISE EXCEPTION 'Journal entry requires at least 2 lines';
    END IF;

    -- Calculate totals
    FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      total_debit := total_debit + COALESCE((line->>'debit')::numeric, 0);
      total_credit := total_credit + COALESCE((line->>'credit')::numeric, 0);
    END LOOP;

    -- Check balance
    IF total_debit != total_credit THEN
      RAISE EXCEPTION 'Journal entry must be balanced: debit % != credit %', total_debit, total_credit;
    END IF;

    IF total_debit = 0 THEN
      RAISE EXCEPTION 'Journal entry must have non-zero amounts';
    END IF;

    -- Update journal entry header
    UPDATE public.journal_entries
    SET
      reference = p_reference,
      entry_date = p_entry_date,
      description = p_description,
      notes = p_notes,
      updated_at = now()
    WHERE id = p_journal_id;

    -- Delete existing lines
    DELETE FROM public.journal_lines
    WHERE journal_id = p_journal_id;

    -- Insert new lines
    FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      IF COALESCE((line->>'debit')::numeric, 0) = 0 AND COALESCE((line->>'credit')::numeric, 0) = 0 THEN
        CONTINUE; -- Skip zero lines
      END IF;

      INSERT INTO public.journal_lines (
        journal_id,
        category_id,
        debit,
        credit,
        description,
        sort_order
      ) VALUES (
        p_journal_id,
        (line->>'category_id')::uuid,
        COALESCE((line->>'debit')::numeric, 0),
        COALESCE((line->>'credit')::numeric, 0),
        line->>'description',
        COALESCE((line->>'sort_order')::int, 0)
      );
    END LOOP;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.update_journal_entry TO authenticated;
  ```

- [ ] **Step 2: Apply the migration to the database**
  Verify table status by applying the migration via prisma/postgres/supabase CLI, or manually using a scratch script that executes it since the direct database url is available.
  Write a scratch script to apply the SQL migration:
  `node scratch/apply-migration.js`
  Expected: Migration executes successfully.

- [ ] **Step 3: Commit**
  ```bash
  git add supabase/migrations/010_update_journal_entry.sql
  git commit -m "db: add update_journal_entry RPC function"
  ```

---

### Task 3: Add `useUpdateJournalEntry` Hook in Frontend

**Files:**
- Modify: [journal-queries.ts](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/lib/db/journal-queries.ts)

- [ ] **Step 1: Write `useUpdateJournalEntry` mutation**
  In `src/lib/db/journal-queries.ts`, add the mutation:
  ```typescript
  export function useUpdateJournalEntry() {
    const qc = useQueryClient();
    
    return useMutation({
      mutationFn: async (input: { id: string } & NewJournalEntryInput) => {
        const supabase = createSupabaseBrowserClient();
        
        const { error } = await supabase.rpc('update_journal_entry', {
          p_journal_id: input.id,
          p_reference: input.reference || null,
          p_entry_date: input.entry_date,
          p_description: input.description || null,
          p_notes: input.notes || null,
          p_lines: input.lines.map((line, index) => ({
            category_id: line.category_id,
            debit: line.debit,
            credit: line.credit,
            description: line.description || null,
            sort_order: index,
          })),
        });
        
        if (error) throw error;
      },
      onSuccess: (_, variables) => {
        qc.invalidateQueries({ queryKey: qk.journalEntries });
        qc.invalidateQueries({ queryKey: qk.journalEntry(variables.id) });
        qc.invalidateQueries({ queryKey: qk.journalLines(variables.id) });
        qc.invalidateQueries({ queryKey: qk.journalSummary });
        toast.success('تم تعديل القيد بنجاح');
      },
      onError: (error: any) => {
        toast.error(error.message || 'فشل تعديل القيد');
      },
    });
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/lib/db/journal-queries.ts
  git commit -m "feat: add useUpdateJournalEntry TanStack Query hook"
  ```

---

### Task 4: Fix Mobile Sidebar Scroll

**Files:**
- Modify: [mobile-nav.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/components/layout/mobile-nav.tsx)

- [ ] **Step 1: Add bottom padding and fix drawer overflow**
  In `src/components/layout/mobile-nav.tsx`, modify the `<nav>` scroll area to include a bottom padding class:
  ```tsx
  // Change:
  // <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
  // To:
  <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3 pb-[calc(88px+env(safe-area-inset-bottom))]">
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/components/layout/mobile-nav.tsx
  git commit -m "fix: add safe bottom padding to mobile navigation scroll area"
  ```

---

### Task 5: Refactor `JournalEntryDialog` for Edit Mode & Mobile Responsiveness

**Files:**
- Modify: [journal-entry-dialog.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/app/\(app\)/journals/components/journal-entry-dialog.tsx)

- [ ] **Step 1: Add `editingEntry` and `useUpdateJournalEntry` integration**
  Modify props and local state initialization in `src/app/(app)/journals/components/journal-entry-dialog.tsx`:
  ```tsx
  import { useCreateJournalEntry, useUpdateJournalEntry, useJournalLines } from '@/lib/db/journal-queries';
  import { useEffect } from 'react';

  export function JournalEntryDialog({
    open,
    onClose,
    editingEntry = null,
  }: {
    open: boolean;
    onClose: () => void;
    editingEntry?: any;
  }) {
    const { data: categories = [] } = useCategories();
    const createEntry = useCreateJournalEntry();
    const updateEntry = useUpdateJournalEntry();

    const [reference, setReference] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<JournalLine[]>([
      { id: '1', category_id: '', debit: '', credit: '', description: '' },
      { id: '2', category_id: '', debit: '', credit: '', description: '' },
    ]);

    // Fetch lines if editing
    const { data: dbLines } = useJournalLines(editingEntry?.id || '');

    useEffect(() => {
      if (editingEntry) {
        setReference(editingEntry.reference || '');
        setEntryDate(editingEntry.entry_date.split('T')[0]);
        setDescription(editingEntry.description || '');
        setNotes(editingEntry.notes || '');
      } else {
        resetForm();
      }
    }, [editingEntry, open]);

    useEffect(() => {
      if (editingEntry && dbLines && dbLines.length > 0) {
        setLines(
          dbLines.map((l) => ({
            id: l.id,
            category_id: l.category_id,
            debit: Number(l.debit) > 0 ? String(Number(l.debit)) : '',
            credit: Number(l.credit) > 0 ? String(Number(l.credit)) : '',
            description: l.description || '',
          }))
        );
      }
    }, [dbLines, editingEntry]);
  ```

- [ ] **Step 2: Update `handleSubmit` for edit mutation**
  Modify submit logic:
  ```tsx
    const handleSubmit = async () => {
      if (!isBalanced) {
        toast.error('القيد غير متوازن - يجب أن يتساوى المدين والدائن');
        return;
      }

      const validLines = lines
        .filter((l) => l.category_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map((l) => ({
          category_id: l.category_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || undefined,
        }));

      if (validLines.length < 2) {
        toast.error('يجب إدخال سطرين على الأقل');
        return;
      }

      if (editingEntry) {
        await updateEntry.mutateAsync({
          id: editingEntry.id,
          reference: reference || undefined,
          entry_date: entryDate,
          description: description || undefined,
          notes: notes || undefined,
          lines: validLines,
        });
      } else {
        await createEntry.mutateAsync({
          reference: reference || undefined,
          entry_date: entryDate,
          description: description || undefined,
          notes: notes || undefined,
          lines: validLines,
        });
      }

      onClose();
      resetForm();
    };
  ```

- [ ] **Step 3: Redesign Line Items to be Mobile Responsive**
  Modify lines render map to replace rigid `grid-cols-12` with responsive flex/grid layouts:
  ```tsx
  {/* Lines Render */}
  {lines.map((line, index) => (
    <div
      key={line.id}
      className="p-4 flex flex-col gap-3 border-b last:border-0 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-start sm:p-3"
    >
      <div className="flex-1 sm:col-span-5">
        <Label className="text-xs mb-1 block sm:hidden">البند المحاسبي</Label>
        <Select
          value={line.category_id}
          onValueChange={(v) => updateLine(line.id, 'category_id', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر البند" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cat.color || '#ccc' }}
                  />
                  {cat.name_ar}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:contents">
        <div>
          <Label className="text-xs mb-1 block sm:hidden">مدين</Label>
          <Input
            type="number"
            step="0.001"
            value={line.debit}
            onChange={(e) => updateLine(line.id, 'debit', e.target.value)}
            placeholder="0.000"
            className="text-left"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block sm:hidden">دائن</Label>
          <Input
            type="number"
            step="0.001"
            value={line.credit}
            onChange={(e) => updateLine(line.id, 'credit', e.target.value)}
            placeholder="0.000"
            className="text-left"
          />
        </div>
      </div>

      <div className="flex-1 sm:col-span-2">
        <Label className="text-xs mb-1 block sm:hidden">البيان</Label>
        <Input
          value={line.description}
          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
          placeholder="بيان البند"
        />
      </div>

      <div className="flex items-center justify-end h-full pt-1 sm:col-span-1 sm:pt-5 sm:justify-center">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => removeLine(line.id)}
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  ))}
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add src/app/\(app\)/journals/components/journal-entry-dialog.tsx
  git commit -m "feat: make JournalEntryDialog line items mobile-responsive and support edit mode"
  ```

---

### Task 6: Refactor `journals/page.tsx` for Inline Line Loading & Editing

**Files:**
- Modify: [page.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/app/\(app\)/journals/page.tsx)

- [ ] **Step 1: Add inline list loading state and editing entry state**
  Inside `JournalsPage` in `src/app/(app)/journals/page.tsx`:
  - Add state `const [editingEntry, setEditingEntry] = useState<JournalEntryRow | null>(null);`
  - Render an inline lines table under `expandedId` instead of just action buttons.
  - Create a child component `JournalCardLines` that calls `useJournalLines(entryId)` and renders them inline inside the card.

- [ ] **Step 2: Implement the `JournalCardLines` sub-component**
  Add `JournalCardLines` directly inside `journals/page.tsx` or at the bottom:
  ```tsx
  function JournalCardLines({ entryId }: { entryId: string }) {
    const { data: lines = [], isLoading } = useJournalLines(entryId);

    if (isLoading) {
      return (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-sage-600" />
        </div>
      );
    }

    if (lines.length === 0) {
      return <div className="text-center text-xs text-ink-mute py-2">لا توجد بنود لهذا القيد</div>;
    }

    return (
      <div className="mt-3 border rounded-lg overflow-hidden bg-background">
        <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-1.5 text-xs font-semibold text-ink-mute bg-muted/30 border-b">
          <div className="col-span-5">البند المحاسبي</div>
          <div className="col-span-2 text-left">مدين</div>
          <div className="col-span-2 text-left">دائن</div>
          <div className="col-span-3">البيان</div>
        </div>
        <div className="divide-y text-xs">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-col gap-1 p-3 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center sm:px-3 sm:py-2">
              <div className="col-span-5 flex items-center gap-1.5">
                {line.category && (
                  <>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: line.category.color || '#ccc' }}
                    />
                    <div>
                      <span className="font-medium text-ink-main">{line.category.name_ar}</span>
                      <span className="text-[10px] text-ink-mute ms-1">({line.category.code})</span>
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <div className="sm:col-span-2 sm:text-left">
                  <span className="inline sm:hidden text-ink-mute font-normal">مدين: </span>
                  <span className="font-semibold text-green-700">
                    {Number(line.debit) > 0 ? formatMoney(Number(line.debit), 'LYD') : '—'}
                  </span>
                </div>
                <div className="sm:col-span-2 sm:text-left">
                  <span className="inline sm:hidden text-ink-mute font-normal">دائن: </span>
                  <span className="font-semibold text-red-700">
                    {Number(line.credit) > 0 ? formatMoney(Number(line.credit), 'LYD') : '—'}
                  </span>
                </div>
              </div>
              <div className="sm:col-span-3 text-ink-mute mt-0.5 sm:mt-0">
                {line.description || '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Modify expanded section in `journals/page.tsx`**
  Modify card expansion layout to show:
  1. `JournalCardLines` list.
  2. Action buttons ("ترحيل", "تعديل", "التفاصيل", "حذف").
  ```tsx
  {/* Expanded Details */}
  {isExpanded && (
    <div className="border-t px-4 py-4 bg-canvas-sunken/20">
      <JournalCardLines entryId={entry.id} />
      
      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
        {entry.status === 'DRAFT' && (
          <>
            <Button
              size="sm"
              onClick={() => handlePost(entry.id)}
              disabled={!isBalanced || postEntry.isPending}
              className="gap-1.5"
            >
              {postEntry.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              ترحيل
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingEntry(entry)}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4" />
              تعديل
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(entry.id)}
              disabled={deleteEntry.isPending}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
            >
              {deleteEntry.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              حذف
            </Button>
          </>
        )}
        {/* Render for POSTED / REVERSED statuses */}
        ...
      </div>
    </div>
  )}
  ```

- [ ] **Step 4: Connect Editing dialog**
  Pass `editingEntry` and handle close:
  ```tsx
  <JournalEntryDialog
    open={isCreateOpen || !!editingEntry}
    onClose={() => {
      setIsCreateOpen(false);
      setEditingEntry(null);
    }}
    editingEntry={editingEntry}
  />
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add src/app/\(app\)/journals/page.tsx
  git commit -m "feat: show journal lines directly inline when expanded and add draft editing button"
  ```

---

### Task 7: Refactor `JournalDetailDialog` Lines for Mobile Responsiveness

**Files:**
- Modify: [journal-detail-dialog.tsx](file:///c:/Users/mohtu/OneDrive/Desktop/SAAS-Fluxen/src/app/\(app\)/journals/components/journal-detail-dialog.tsx)

- [ ] **Step 1: Change grid layout to be responsive**
  In `src/app/(app)/journals/components/journal-detail-dialog.tsx`, refactor table header and rows:
  ```tsx
  {/* Table Header - hide on mobile */}
  <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-ink-mute bg-muted/20">
    <div className="col-span-5">البند المحاسبي</div>
    <div className="col-span-2 text-left">مدين</div>
    <div className="col-span-2 text-left">دائن</div>
    <div className="col-span-3">البيان</div>
  </div>

  {/* Table Rows - responsive flex layout */}
  {lines.map((line) => (
    <div
      key={line.id}
      className="flex flex-col gap-1.5 px-4 py-3 text-sm border-b sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center hover:bg-secondary/30"
    >
      <div className="col-span-5">
        <div className="flex items-center gap-2">
          {line.category && (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: line.category.color || '#ccc' }}
              />
              <div>
                <p className="font-medium">{line.category.name_ar}</p>
                <p className="text-xs text-ink-mute">{line.category.code}</p>
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <div className="sm:col-span-2 sm:text-left font-medium">
          <span className="inline sm:hidden text-ink-mute font-normal text-xs">مدين: </span>
          <span className="text-green-700">
            {Number(line.debit) > 0 ? formatMoney(Number(line.debit), 'LYD') : '-'}
          </span>
        </div>
        <div className="sm:col-span-2 sm:text-left font-medium">
          <span className="inline sm:hidden text-ink-mute font-normal text-xs">دائن: </span>
          <span className="text-red-700">
            {Number(line.credit) > 0 ? formatMoney(Number(line.credit), 'LYD') : '-'}
          </span>
        </div>
      </div>
      
      <div className="col-span-3 text-ink-mute text-xs sm:text-sm">
        <span className="inline sm:hidden text-ink-mute font-normal text-xs">البيان: </span>
        {line.description || '-'}
      </div>
    </div>
  ))}
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/app/\(app\)/journals/components/journal-detail-dialog.tsx
  git commit -m "fix: make JournalDetailDialog table lines responsive on mobile"
  ```
