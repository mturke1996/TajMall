'use client';

import { cn, formatMoney, arabicCount } from '@/lib/utils';
import type { MallOccupancy } from '@/lib/mall-occupancy';

const units = (n: number) => arabicCount(n, ['محل واحد', 'محلين', 'محلات', 'محلاً']);
// always follows "منذ", which takes the genitive dual
const sinceDays = (n: number) => arabicCount(n, ['يوم واحد', 'يومين', 'أيام', 'يوماً']);

function Figure({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-4">
      <p className="text-[12.5px] text-ink-mute">{label}</p>
      <p className="text-[20px] font-semibold tabular-nums text-foreground">{children}</p>
      {hint != null && <p className="text-[12px] tabular-nums text-ink-mute">{hint}</p>}
    </div>
  );
}

/** A flat share bar: the rented part of the units that can be let. */
export function RateBar({ rate, label }: { rate: number; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-sunken"
    >
      <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(Math.max(rate, 0), 100)}%` }} />
    </div>
  );
}

/**
 * The mall's occupancy at a glance: how much is let and for how much, what stands empty and for how
 * long, and the same per floor.
 */
export function OccupancySummary({ occupancy, onShowVacant }: { occupancy: MallOccupancy; onShowVacant?: () => void }) {
  const { totals: t, floors, longVacant } = occupancy;
  if (t.units === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Figure
          label="نسبة الإشغال"
          hint={`مؤجر ${t.rented} من ${units(t.leasable)} قابلة للتأجير`}
        >
          {t.rate.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
        </Figure>
        <Figure
          label="الإيجار الشهري المتعاقد"
          hint={t.rentPerSqm != null ? `متوسط المتر ${formatMoney(t.rentPerSqm, 'LYD')}` : 'عقود سارية'}
        >
          {formatMoney(t.rentRoll, 'LYD')}
        </Figure>
        <Figure
          label="الشاغر"
          hint={t.vacantArea > 0 ? `مساحته ${t.vacantArea.toLocaleString('en-US', { maximumFractionDigits: 2 })} م²` : undefined}
        >
          <span className={cn(t.vacant > 0 && 'text-warning-ink')}>{t.vacant}</span>
          <span className="text-[13px] font-normal text-ink-mute">
            {t.reserved > 0 && ` · محجوز ${t.reserved}`}
            {t.maintenance > 0 && ` · صيانة ${t.maintenance}`}
          </span>
        </Figure>
        <Figure
          label="إيجار الشواغر المحتمل"
          hint={t.vacantPotential != null ? 'تقدير بمتوسط إيجار المتر، لا من عقد' : 'لا تقدير: لا مساحات مسجّلة'}
        >
          {t.vacantPotential != null ? formatMoney(t.vacantPotential, 'LYD') : '—'}
        </Figure>
      </div>

      {floors.length > 0 && (
        <section aria-labelledby="floors-heading" className="flex flex-col gap-2">
          <h2 id="floors-heading" className="px-1 text-[13px] font-medium text-ink-mute">
            حسب الدور
          </h2>

          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="bg-canvas-sunken/60 text-[12px] text-ink-mute">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">الدور</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">المحلات</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">مؤجر</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">شاغر</th>
                  <th scope="col" className="w-48 px-3 py-2.5 text-start font-medium">الإشغال</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">الإيجار الشهري</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {floors.map((f) => (
                  <tr key={f.floor}>
                    <th scope="row" className="px-3 py-2.5 text-start font-medium text-foreground">{f.floor}</th>
                    <td className="px-3 py-2.5 text-end tabular-nums">{f.units}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{f.rented}</td>
                    <td className={cn('px-3 py-2.5 text-end tabular-nums', f.vacant > 0 && 'text-warning-ink')}>{f.vacant}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <RateBar rate={f.rate} label={`إشغال ${f.floor} ${f.rate}%`} />
                        <span className="w-12 shrink-0 text-end tabular-nums text-ink-soft">{f.rate.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{f.rent > 0 ? formatMoney(f.rent, '') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="surface divide-y divide-border overflow-hidden md:hidden">
            {floors.map((f) => (
              <li key={f.floor} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium text-foreground">{f.floor}</span>
                  <span className="text-[13px] tabular-nums text-ink-soft">
                    {f.rate.toLocaleString('en-US', { maximumFractionDigits: 1 })}% · {f.rented} من {f.units - f.maintenance}
                  </span>
                </div>
                <RateBar rate={f.rate} label={`إشغال ${f.floor} ${f.rate}%`} />
                <p className="text-[12px] tabular-nums text-ink-mute">
                  {f.vacant > 0 ? `الشاغر ${f.vacant}` : 'كله مؤجر'}
                  {f.rent > 0 && ` · ${formatMoney(f.rent, 'LYD')} شهرياً`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {longVacant.length > 0 && (
        <section aria-labelledby="long-vacant-heading" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 id="long-vacant-heading" className="text-[13px] font-medium text-ink-mute">
              شاغر منذ ثلاثة أشهر أو أكثر
            </h2>
            {onShowVacant && (
              <button
                type="button"
                onClick={onShowVacant}
                className="rounded-md px-2 py-1 text-[12.5px] text-ink-mute hover:text-foreground"
              >
                كل الشواغر
              </button>
            )}
          </div>
          <ul className="surface divide-y divide-border overflow-hidden">
            {longVacant.slice(0, 5).map((r) => (
              <li key={r.unit.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">محل {r.unit.unit_number}</span>
                  <span className="block text-[12px] text-ink-mute">
                    الدور {r.unit.floor}
                    {r.area > 0 && ` · ${r.area.toLocaleString('en-US', { maximumFractionDigits: 2 })} م²`}
                  </span>
                </span>
                <span className="shrink-0 text-end text-[13px] tabular-nums text-warning-ink">
                  {r.neverLeased ? 'لم يُؤجَّر بعد · أُضيف منذ' : 'شاغر منذ'} {sinceDays(r.vacantDays ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
