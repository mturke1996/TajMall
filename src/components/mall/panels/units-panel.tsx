'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Store,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  AlertTriangle,
  Info,
  Search,
} from 'lucide-react';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { OccupancySummary } from '@/components/mall/occupancy-summary';
import { WriteGuard } from '@/components/auth/write-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useLeaseContracts,
  useMallUnits,
  useCreateMallUnit,
  useUpdateMallUnit,
  useDeleteMallUnit,
} from '@/lib/db/mall-queries';
import type { MallUnitRow } from '@/lib/db/types';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { matchesSearch } from '@/lib/arabic-search';
import { buildMallOccupancy, floorRank, type OccupancyRow, type UnitState } from '@/lib/mall-occupancy';
import { friendlyError } from '@/lib/user-messages';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';

type Filter = 'all' | UnitState;

const STATE_LABEL: Record<UnitState, string> = {
  rented: 'مؤجر',
  vacant: 'شاغر',
  reserved: 'محجوز',
  maintenance: 'تحت الصيانة',
};

const STATE_BADGE: Record<UnitState, string> = {
  rented: 'border-info-line bg-info-soft text-info-ink',
  vacant: 'border-success-line bg-success-soft text-success-ink',
  reserved: 'border-border bg-canvas-sunken text-ink-soft',
  maintenance: 'border-warning-line bg-warning-soft text-warning-ink',
};

const FILTERS: Filter[] = ['all', 'rented', 'vacant', 'reserved', 'maintenance'];
const FILTER_LABEL: Record<Filter, string> = { all: 'الكل', ...STATE_LABEL };

// follows "منذ" or "بعد", which take the genitive dual
const dayCount = (n: number) => arabicCount(n, ['يوم واحد', 'يومين', 'أيام', 'يوماً']);

function byUnit(a: OccupancyRow<MallUnitRow>, b: OccupancyRow<MallUnitRow>) {
  const fa = floorRank(a.unit.floor);
  const fb = floorRank(b.unit.floor);
  if (fa !== fb) return fa < fb ? -1 : 1;
  return (
    a.unit.floor.localeCompare(b.unit.floor, 'ar', { numeric: true }) ||
    a.unit.unit_number.localeCompare(b.unit.unit_number, 'ar', { numeric: true })
  );
}

export function MallUnitsPanel() {
  const { data: units = [], isLoading: unitsLoading, isError: unitsError, error: unitsErr } = useMallUnits();
  const { data: contracts = [], isLoading: contractsLoading, isError: contractsError, error: contractsErr } = useLeaseContracts();
  const createUnit = useCreateMallUnit();
  const updateUnit = useUpdateMallUnit();
  const deleteUnit = useDeleteMallUnit();

  const isLoading = unitsLoading || contractsLoading;
  const isError = unitsError || contractsError;
  const error = unitsErr ?? contractsErr;

  // the day the panel opened: stable across re-renders, and what "vacant for N days" counts from
  const [today] = useState(() => todayISODate());
  const occupancy = useMemo(() => buildMallOccupancy({ units, contracts, today }), [units, contracts, today]);

  const [filter, setFilter] = useState<Filter>('all');
  const [floorFilter, setFloorFilter] = useState('');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => occupancy.rows.slice().sort(byUnit), [occupancy.rows]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, rented: 0, vacant: 0, reserved: 0, maintenance: 0 };
    for (const r of rows) c[r.state] += 1;
    return c;
  }, [rows]);
  const floors = occupancy.floors.map((f) => f.floor);
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === 'all' || r.state === filter) &&
          (!floorFilter || (r.unit.floor.trim() || '—') === floorFilter) &&
          matchesSearch(query, [r.unit.unit_number, r.unit.floor, r.tenantName]),
      ),
    [rows, filter, floorFilter, query],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<MallUnitRow | null>(null);

  // Form State
  const [unitNumber, setUnitNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE'>('AVAILABLE');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenCreate = () => {
    setEditingUnit(null);
    setUnitNumber('');
    setFloor('');
    setArea('');
    setStatus('AVAILABLE');
    setNotes('');
    setIsOpen(true);
  };

  const handleOpenEdit = (unit: MallUnitRow) => {
    setEditingUnit(unit);
    setUnitNumber(unit.unit_number);
    setFloor(unit.floor);
    setArea(unit.area_sqm);
    setStatus(unit.status);
    setNotes(unit.notes || '');
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitNumber || !floor || !area) return;

    setIsSubmitting(true);
    try {
      if (editingUnit) {
        await updateUnit.mutateAsync({
          id: editingUnit.id,
          unit_number: unitNumber,
          floor,
          area_sqm: area,
          status,
          notes: notes || null,
        });
      } else {
        await createUnit.mutateAsync({
          unit_number: unitNumber,
          floor,
          area_sqm: area,
          status,
          notes: notes || null,
        });
      }
      setIsOpen(false);
    } catch (err) {
      // already handled by mutation hook toasts
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirm = useConfirm();

  const handleDelete = async (id: string, unitNumber: string) => {
    const ok = await confirm({
      title: 'حذف المحل',
      description: 'يُحذف المحل من قائمة الوحدات. لا يُحذف محل عليه عقد.',
      details: [{ label: 'رقم المحل', value: <bdi>{unitNumber}</bdi> }],
      confirmLabel: 'احذف المحل',
    });
    if (!ok) return;
    await deleteUnit.mutateAsync(id);
  };

  /** Brings a unit's status flag in line with its leases. */
  const fixFlag = (r: OccupancyRow<MallUnitRow>) => {
    const next = r.flags.includes('occupied_without_contract') ? 'AVAILABLE' : 'OCCUPIED';
    updateUnit.mutate({ id: r.unit.id, status: next });
  };

  const hasFilter = filter !== 'all' || floorFilter !== '' || query.trim() !== '';

  return (
    <div className="space-y-4">
      <MallPanelToolbar>
        <WriteGuard permission="document.create">
          <Button
            onClick={handleOpenCreate}
            className="h-11 gap-2 bg-foreground hover:bg-foreground text-background touch-manipulation md:h-9"
          >
            <Plus className="h-4 w-4" />
            إضافة محل جديد
          </Button>
        </WriteGuard>
      </MallPanelToolbar>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-danger bg-danger-soft rounded-lg p-4">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold">فشل تحميل المحلات</p>
          <p className="text-sm text-danger">{friendlyError(error, 'أعد المحاولة بعد قليل.')}</p>
        </div>
      ) : units.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
          <Store className="h-12 w-12 mb-2 opacity-50 text-muted-foreground" />
          <p className="font-medium text-ink-soft">لا توجد محلات تجارية مسجلة بعد</p>
          <WriteGuard permission="document.create">
            <Button onClick={handleOpenCreate} variant="link" className="text-success-ink font-bold">
              إضافة أول محل
            </Button>
          </WriteGuard>
        </div>
      ) : (
        <>
          <OccupancySummary
            occupancy={occupancy}
            onShowVacant={() => {
              setFilter('vacant');
              setFloorFilter('');
              setQuery('');
            }}
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-border bg-canvas-sunken p-0.5 no-scrollbar"
              role="group"
              aria-label="حالة المحل"
            >
              {FILTERS.filter((f) => f === 'all' || f === filter || counts[f] > 0).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'h-8 shrink-0 rounded-md px-3 text-[13px] font-medium tabular-nums transition-colors',
                    filter === f ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
                  )}
                >
                  {FILTER_LABEL[f]} <span className="text-ink-mute">{counts[f]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {floors.length > 1 && (
                <select
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                  aria-label="الدور"
                  className="h-9 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground"
                >
                  <option value="">كل الأدوار</option>
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      الدور {f}
                    </option>
                  ))}
                </select>
              )}
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="رقم المحل أو اسم المستأجر"
                  aria-label="بحث في المحلات"
                  className="h-9 ps-9"
                />
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-ink-mute">
              لا محلات تطابق هذا الاختيار.
              {hasFilter && (
                <Button
                  variant="link"
                  className="h-auto p-0 text-[13px]"
                  onClick={() => {
                    setFilter('all');
                    setFloorFilter('');
                    setQuery('');
                  }}
                >
                  إظهار كل المحلات
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {shown.map((r) => {
                const unit = r.unit;
                const canDelete = r.contractsCount === 0 && r.state !== 'rented';
                return (
                  <Card key={unit.id} className="relative transition-colors hover:border-foreground/25">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <span className="text-xs text-muted-foreground font-mono">الدور {unit.floor}</span>
                          <CardTitle className="text-lg font-bold text-foreground">محل {unit.unit_number}</CardTitle>
                        </div>
                        <Badge variant="outline" className={cn('font-medium', STATE_BADGE[r.state])}>
                          {STATE_LABEL[r.state]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">المساحة:</span>
                        <span className="font-mono font-bold text-foreground">{unit.area_sqm} م²</span>
                      </div>

                      {(r.state === 'rented' || r.state === 'reserved') && r.contract && (
                        <div className="space-y-1 text-[13px]">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-muted-foreground">المستأجر:</span>
                            {r.tenantId ? (
                              <Link href={`/contacts/${r.tenantId}`} className="min-w-0 truncate font-medium text-foreground hover:underline">
                                {r.tenantName ?? 'مستأجر'}
                              </Link>
                            ) : (
                              <span className="font-medium">{r.tenantName ?? '—'}</span>
                            )}
                          </div>
                          {r.state === 'rented' ? (
                            <>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-muted-foreground">الإيجار:</span>
                                <span className="font-medium tabular-nums">{formatMoney(r.rent, 'LYD')}</span>
                              </div>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-muted-foreground">ينتهي العقد:</span>
                                <span
                                  className={cn(
                                    'tabular-nums',
                                    r.endsInDays != null && r.endsInDays < 0 ? 'font-medium text-danger-ink' : r.endsInDays != null && r.endsInDays <= 60 ? 'text-warning-ink' : 'text-ink-soft',
                                  )}
                                >
                                  {formatDate(r.contract.end_date)}
                                </span>
                              </div>
                              {r.endsInDays != null && r.endsInDays < 0 && (
                                <p className="text-[12px] text-danger-ink">
                                  انتهى منذ {dayCount(-r.endsInDays)} وما زال نشطاً — جدّده أو أنهِه
                                </p>
                              )}
                              {r.endsInDays != null && r.endsInDays >= 0 && r.endsInDays <= 60 && (
                                <p className="text-[12px] text-warning-ink">
                                  {r.endsInDays === 0 ? 'ينتهي اليوم' : `ينتهي بعد ${dayCount(r.endsInDays)}`}
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-muted-foreground">يبدأ العقد:</span>
                              <span className="tabular-nums text-ink-soft">{formatDate(r.contract.start_date)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {r.state === 'vacant' && (
                        <p className={cn('text-[13px]', (r.vacantDays ?? 0) >= 90 ? 'text-warning-ink' : 'text-ink-soft')}>
                          {r.neverLeased
                            ? `لم يُؤجَّر بعد · أُضيف منذ ${dayCount(r.vacantDays ?? 0)}`
                            : `شاغر منذ ${dayCount(r.vacantDays ?? 0)}`}
                        </p>
                      )}

                      {r.flags.length > 0 && (
                        <div className="rounded-md border border-warning-line bg-warning-soft p-2 text-[12px] text-warning-ink">
                          <p>
                            {r.flags.includes('occupied_without_contract')
                              ? 'حالته «مؤجر» ولا يوجد عقد نشط عليه، فلن يظهر عند توثيق عقد جديد.'
                              : 'عليه عقد نشط لكن حالته ليست «مؤجر».'}
                          </p>
                          <WriteGuard permission="document.create">
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1.5 h-8 w-full touch-manipulation"
                              disabled={updateUnit.isPending}
                              onClick={() => fixFlag(r)}
                            >
                              {r.flags.includes('occupied_without_contract') ? 'اجعله متاحاً' : 'اجعله مؤجراً'}
                            </Button>
                          </WriteGuard>
                        </div>
                      )}

                      {unit.notes && (
                        <div className="text-xs text-muted-foreground bg-canvas-sunken p-2 rounded flex gap-1.5 items-start">
                          <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <p className="line-clamp-2">{unit.notes}</p>
                        </div>
                      )}
                      <WriteGuard permission="document.create">
                        <div className="flex justify-end gap-2 pt-2 border-t border-border">
                          <Button aria-label={`تعديل المحل ${unit.unit_number}`}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-ink-soft"
                            onClick={() => handleOpenEdit(unit)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button aria-label={`حذف المحل ${unit.unit_number}`}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-danger hover:text-danger-ink hover:bg-danger-soft"
                              onClick={() => handleDelete(unit.id, unit.unit_number)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </WriteGuard>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingUnit ? 'تعديل بيانات المحل' : 'إضافة محل جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-number">رقم المحل / الوحدة</Label>
              <Input
                id="unit-number"
                placeholder="مثال: Shop-102"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="floor">الدور</Label>
                <Input
                  id="floor"
                  placeholder="مثال: الأرضي، الأول"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">المساحة (متر مربع)</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  placeholder="مثال: 45.5"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">حالة المحل</Label>
              <Select
                value={status}
                onValueChange={(val: any) => setStatus(val)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">متاح للإيجار</SelectItem>
                  <SelectItem value="OCCUPIED">مؤجر (نشط)</SelectItem>
                  <SelectItem value="MAINTENANCE">تحت الصيانة</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[12px] text-ink-mute">
                تصير الحالة «مؤجر» تلقائياً عند توثيق عقد، وتعود «متاح» عند إنهائه. لا تغيّرها يدوياً إلا للصيانة أو لتصحيح خطأ.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات إضافية</Label>
              <Input
                id="notes"
                placeholder="ملاحظات حول التجهيزات أو الكهرباء..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'حفظ البيانات'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
