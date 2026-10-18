# Taj Mall / Fluxen — Design System

A quiet accounting interface: warm neutral surfaces, one primary button style, and colour used only
where it carries meaning (money in, money out, overdue, pending). Everything below is enforced by
`npm run verify:design` (also run in CI).

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

Rules:
- Cards, KPI tiles and icon tiles are **neutral** (`bg-card`, `border-border`, icon tile
  `bg-canvas-sunken text-muted-foreground`). Colour goes on the figure, a badge or a small dot.
- One primary button (`Button` default: `foreground` on `background`). No green or amber "save"
  buttons; destructive actions use `variant="destructive"` or `bg-danger`.
- Charts use `hsl(var(--success))`, `hsl(var(--danger))`, `hsl(var(--info))` and
  `hsl(var(--border))` for the grid, so they follow dark mode.
- No gradients, glass/blur or heavy shadows. Floating layers use `shadow-lift`.

## Typography

- **Cairo** for Arabic and UI text (`font-sans`), Plus Jakarta Sans for Latin fallback.
- `font-mono` marks numbers, references and codes; it renders in the UI font with tabular digits
  (no separate monospace face), so columns align and «د.ل» stays in the same typeface.
- No `tracking-*` letter-spacing and no `uppercase` on Arabic text: spacing breaks joined letters.
- PDFs use Tajawal (react-pdf), see `src/features/pdf`.

## Money

- Always `formatMoney(amount, 'LYD', { compact?, signed? })` → `1,250.5 د.ل`.
  The result is wrapped in a left-to-right isolate so the order number → currency is stable inside
  Arabic sentences, right-aligned cells and both themes; it matches the PDFs.
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
happened and what to do next; no exclamation marks or emoji.
