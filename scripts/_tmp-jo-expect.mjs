import fs from 'node:fs';
import { selectJournalRows, buildJournalData, defaultJournalOptions } from '../src/lib/period-journal-options.ts';
import { defaultPeriod } from '../src/lib/report-options.ts';
const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/qa-pdfoptions/journal';
const tx = JSON.parse(fs.readFileSync(`${OUT}/tx.json`, 'utf8'));
const TODAY = '2026-10-19';
const run = (label, patch) => {
  const o = { ...defaultJournalOptions(TODAY), ...patch, filters: { partyIds: [], cashboxIds: [], methods: [], minAmount: '', maxAmount: '', ...(patch.filters ?? {}) } };
  const sel = selectJournalRows(tx, o, TODAY);
  const d = buildJournalData(sel.rows, null);
  console.log(label.padEnd(40), sel.rows.length, d.grandTotal, 'groups', d.bankGroups.length, 'prior', d.priorPeriodTotal);
};
const months = (y, m) => ({ ...defaultPeriod(TODAY), mode: 'MONTHS', year: y, months: m });
run('rev Jul+Aug cash', { period: months(2026, [7, 8]) });
run('rev Jul+Aug rent-target', { basis: 'RENT_MONTH_TARGET', period: months(2026, [7, 8]) });
run('rev Sep rent-target', { basis: 'RENT_MONTH_TARGET', period: months(2026, [9]) });
run('exp year', { kind: 'EXPENSE', period: months(2026, [1,2,3,4,5,6,7,8,9,10,11,12]) });
run('exp Oct', { kind: 'EXPENSE', period: months(2026, [10]) });
run('rev year cheque', { period: months(2026, [1,2,3,4,5,6,7,8,9,10,11,12]), filters: { methods: ['CHEQUE'] } });
