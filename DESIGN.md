# Taj Mall / Fluxen — Design System

An accounting interface that is calm to read and clear at a glance: warm neutral surfaces, one primary
button style, and colour that tells things apart (money in is green, money out is red, rent is violet,
cash is amber, information is blue) in tinted icon tiles, charts and status chips. Screens that show
money are not grey: the dashboard, rent collection and reports carry colour and charts. The rules below
are enforced by `npm run verify:design` (also run in CI).

## Colour

All colours are CSS variables in `src/app/globals.css` (light and dark) exposed as Tailwind colours by
its `@theme inline` block (Tailwind 4 has no `tailwind.config.ts`). Screen code never uses raw palette classes (`bg-emerald-50`, `text-rose-700`,
`sage-*`): they ignore dark mode.

### Neutrals
| Token | Use |
|---|---|
| `background` / `canvas` | Page canvas |
| `card` / `canvas-raised` | Surfaces (cards, tables, dialogs) |
| `canvas-sunken`, `muted` | Subtle fills: table headers, icon tiles, hover |
| `border` | Every hairline |
| `foreground` / `ink` | Primary text, primary button |
| `ink-soft` | Secondary text |
| `muted-foreground` / `ink-mute` | Labels, hints, metadata |

### Status families
Each family has four steps: `DEFAULT` (strong mark: bars, dots), `soft` (pale fill), `line`
(hairline on a soft fill), `ink` (text on a soft fill or a coloured figure).

| Family | Meaning |
|---|---|
| `success` | Revenue, paid, approved, balanced |
| `danger` | Expense, overdue, unpaid, destructive |
| `warning` | Partial, pending approval, needs attention |
| `info` | Neutral information, transfers |
| `plum` | Rare secondary category (cards / badges only) |

### Vivid accents
`chart-green`, `chart-red`, `chart-amber`, `chart-blue`, `chart-violet`, `chart-teal` are brighter than
the status colours and exist for chart series, donut slices and icon tiles (light and dark values).
An icon tile is the accent at 15% with the accent as the icon colour: `bg-chart-green/15 text-chart-green`
(see `IconTile` in `src/components/dashboard/dashboard-ui.tsx`). Text never uses the accents; figures and
labels use the `*-ink` colours, which keep the contrast on a soft fill.

Rules:
- KPI cards carry an icon tile in the accent of their meaning (collected green, paid red, cash amber,
  rent violet) and a one-line context under the figure in the matching `*-ink` colour. The headline
  result card (net cash) is tinted `bg-success-soft border-success-line` (or danger when negative).
  Groups of figures may be tinted tiles (`bg-info-soft border-info-line text-info-ink`).
- One primary button (`Button` default: `foreground` on `background`). No green or amber "save"
  buttons; destructive actions use `variant="destructive"` or `bg-danger`.
- Charts use the accents (`ACCENT_VAR.green` …) for series and slices, `hsl(var(--border))` for the
  grid, so they follow dark mode. Every chart has an exact-figure list or summary beside it.
- No gradients, glass/blur or heavy shadows. Floating layers use `shadow-lift`.
- No decoration that reads as generated: no entrance or staggered animations on page content, no
  scale/lift/shadow on hover (a border colour change is enough), no white overlays (`bg-white/20`
  breaks dark mode; use `bg-background/20`), no feature checklists, no marketing copy. A short greeting by
  time of day above the page title is fine.

## Typography

- **Cairo** for Arabic and UI text (`font-sans`), Plus Jakarta Sans for Latin fallback.
- `font-mono` marks numbers, references and codes; it renders in the UI font with tabular digits
  (no separate monospace face), so columns align and «د.ل» stays in the same typeface.
- No `tracking-*` letter-spacing and no `uppercase` on Arabic text: spacing breaks joined letters.
- PDFs use Tajawal (react-pdf), see `src/features/pdf`.

## Layout patterns

- **Figures**: a row of KPI cards (2 columns on a phone, 4 on a desktop): label and icon tile on one line,
  the exact figure, one line of context. Sub-groups (rent collection) use tinted tiles.
- **Hubs and settings**: grouped lists (heading + `surface divide-y` rows: title, one-line
  description, chevron), not grids of identical icon cards. Only link to pages that exist.
- **Logs**: one compact line per entry, grouped by day or month with a sticky heading
  (`sticky top-16`, below the top bar); details open in place.
- **Filters**: segmented controls (`rounded-lg border bg-canvas-sunken p-0.5`, active `bg-card`) and
  selects on one line; never rows of year and month tiles.
- **Empty and error states**: neutral, one sentence and at most one action. Errors come from
  `friendlyError()` in `src/lib/user-messages.ts`; technical text only behind «تفاصيل تقنية».

## Money

- Always `formatMoney(amount, 'LYD', { signed? })` → `1,250.5 د.ل`. Screens show exact amounts;
  `compact` (25K) is for chart axes only, never for a figure someone reads.
  Only the number (sign and digits) is wrapped in a left-to-right isolate; the currency stays in the
  line's direction, so in Arabic the number is read first and the currency after it
  («262,150.5 د.ل», number on the right). Wrapping both in one isolate puts the currency first.
- Signs go through `signed: true` (`+1,250 د.ل`, `−309 د.ل`). Never type `+` / `−` next to the call:
  in RTL it lands on the wrong side.
- In new components prefer `<Amount>` from `src/components/payroll/payroll-ui.tsx` (same format,
  tabular digits, optional tone).

## Direction (RTL)

- Use logical utilities: `ms/me`, `ps/pe`, `start/end`, `text-start/text-end`, `border-s/e`.
- Physical `left/right` only for centring (`left-1/2 -translate-x-1/2`) and inside elements that set
  `dir="ltr"` (amounts, phone numbers, codes).
- Arrows that mean "next/back" follow reading direction (`ChevronLeft` = forward in Arabic).

## Components

`Button`, `Badge` (`success | warning | danger | info | plum | neutral | outline`), `DataTable`
(sorting, pagination, totals footer, mobile cards, empty/no-results states), `EmptyState`,
`ConfirmDialog`, `PageHeader`, `StatStrip`, `Amount`. A live gallery with fictional data runs in
development at `/ui-kit` and `/ui-kit/payroll`.

## Copy

Short, specific sentences; buttons are verbs («سجّل التحصيل», «اعتمد الكشف»); errors say what
happened and what to do next; no exclamation marks or emoji. No marketing words («احترافي», «بجودة
عالية») and no setup instructions (migration numbers, Supabase) in text people see: say «أبلغ مسؤول
النظام». Counts take the Arabic noun form via `arabicCount()` (شهر، شهرين، 3 أشهر، 11 شهراً); relative
dates via `formatDateRelative()` already do.
