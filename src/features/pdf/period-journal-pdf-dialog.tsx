'use client';

import { JournalReportOptionsDialog, type JournalReportOptionsDialogProps } from './options/journal-report-options-dialog';

type Props = JournalReportOptionsDialogProps;

/**
 * «خيارات تقرير PDF المتقدمة» of the period journal page (/reports/journal-month): the options dialog built
 * from the shared kit in ./options. The props are the ones the page has always passed.
 */
export function PeriodJournalPdfDialog(props: Props) {
  return <JournalReportOptionsDialog {...props} />;
}
