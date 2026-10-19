/**
 * The kit behind the PDF options dialogs («خيارات تقرير PDF المتقدمة»). A dialog for a new report is
 * assembled from these; see transactions-report-options-dialog.tsx for the revenues / expenses one.
 * The rules (period, filters, status, sorting, grouping, subtotals, page estimate, file name, presets) are
 * pure functions and types in src/lib/report-options.ts, verified by scripts/verify-report-options.mjs.
 */
export { ReportOptionsDialogShell, ReportOutputBar } from './report-options-shell';
export { ReportSummaryPanel, ReportSummaryBar, pagesLabel, type ReportSummaryData } from './report-summary';
export { PeriodPicker } from './period-picker';
export { PresetsBar } from './presets-bar';
export { useReportPresets } from './use-report-presets';
export { useReportOutputs, type ReportOutput } from './use-report-outputs';
export { SearchableMultiSelect } from './searchable-multi-select';
export { AmountFilter, FiltersSection, LayoutSection, ListFilter, MethodsFilter, StatusFilter } from './report-option-sections';
export {
  ChipButton,
  ChoiceChips,
  Field,
  INPUT_CLASS,
  Money,
  OptionDisclosure,
  OptionSection,
  SegmentedControl,
  ToggleRow,
  type Tone,
} from './option-ui';
export { TransactionsReportOptionsDialog, type TransactionsReportOptionsDialogProps } from './transactions-report-options-dialog';
