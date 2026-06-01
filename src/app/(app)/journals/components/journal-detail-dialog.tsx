'use client';

import { Loader2, CheckCircle2, Clock, RotateCcw, FileText, Calendar, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { useJournalLines, useJournalEntry, type JournalEntryRow } from '@/lib/db/journal-queries';

const STATUS_CONFIG = {
  POSTED: {
    label: 'مرحل',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  DRAFT: {
    label: 'مسودة',
    icon: Clock,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  REVERSED: {
    label: 'معكوس',
    icon: RotateCcw,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

export function JournalDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: JournalEntryRow;
  open: boolean;
  onClose: () => void;
}) {
  const { data: lines = [], isLoading } = useJournalLines(entry.id);
  const status = STATUS_CONFIG[entry.status];
  const StatusIcon = status.icon;

  const isBalanced = Number(entry.total_debit) === Number(entry.total_credit);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            تفاصيل القيد المحاسبي
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            عرض رقم القيد، الحالة، الأسطر، والمبالغ المرحّلة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Header Info */}
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', status.bg)}>
                    <StatusIcon className={cn('h-6 w-6', status.color)} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">قيد رقم {entry.number}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn(status.bg, status.color, status.border)}>
                        {status.label}
                      </Badge>
                      {!isBalanced && (
                        <Badge variant="danger">غير متوازن</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-ink-mute">
                    <Calendar className="h-4 w-4" />
                    <span>التاريخ: {formatDate(entry.entry_date)}</span>
                  </div>
                  {entry.reference && (
                    <div className="flex items-center gap-2 text-ink-mute">
                      <Hash className="h-4 w-4" />
                      <span>المرجع: {entry.reference}</span>
                    </div>
                  )}
                </div>

                {entry.description && (
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-ink-mute">الوصف</Label>
                    <p className="text-sm mt-1">{entry.description}</p>
                  </div>
                )}

                {entry.notes && (
                  <div className="pt-2">
                    <Label className="text-xs text-ink-mute">ملاحظات</Label>
                    <p className="text-sm mt-1 text-ink-mute">{entry.notes}</p>
                  </div>
                )}
              </div>

              <div className="text-left">
                <p className="text-sm text-ink-mute">إجمالي القيد</p>
                <p className="text-2xl font-bold text-sage-700">
                  {formatMoney(Number(entry.total_debit), 'LYD')}
                </p>
              </div>
            </div>
          </Card>

          {/* Lines Table */}
          <Card>
            <div className="px-4 py-3 border-b bg-muted/30">
              <h4 className="font-medium">بنود القيد ({entry.line_count})</h4>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
              </div>
            ) : lines.length === 0 ? (
              <div className="p-8 text-center text-ink-mute">
                لا توجد بنود للعرض
              </div>
            ) : (
              <div className="divide-y">
                {/* Table Header */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-ink-mute bg-muted/20">
                  <div className="col-span-3">البند المحاسبي</div>
                  <div className="col-span-3">الجهة / الخزينة</div>
                  <div className="col-span-2 text-left">مدين</div>
                  <div className="col-span-2 text-left">دائن</div>
                  <div className="col-span-2">البيان</div>
                </div>

                {/* Table Rows */}
                {lines.map((line, index) => (
                  <div
                    key={line.id}
                    className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-12 sm:gap-2 sm:px-4 sm:py-3 sm:items-center hover:bg-secondary/30"
                  >
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        {line.category_name && (
                          <>
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: line.category_color || '#ccc' }}
                            />
                            <div>
                              <p className="font-medium">{line.category_name}</p>
                              <p className="text-xs text-ink-mute">{line.category_code}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="col-span-3 flex flex-col gap-0.5 text-xs">
                      {line.contact_name && (
                        <span className="text-ink-main font-medium flex items-center gap-1">
                          <span>👤</span>
                          <span>{line.contact_name}</span>
                          <span className="text-ink-mute text-[10px]">
                            ({line.contact_kind === 'TENANT' ? 'متجر' : line.contact_kind === 'EMPLOYEE' ? 'موظف' : line.contact_kind === 'VENDOR' ? 'مورد' : 'عميل'})
                          </span>
                        </span>
                      )}
                      {line.cashbox_name_ar && (
                        <span className="text-sage-700 font-medium flex items-center gap-1">
                          <span>🏦</span>
                          <span>{line.cashbox_name_ar}</span>
                        </span>
                      )}
                      {!line.contact_name && !line.cashbox_name_ar && (
                        <span className="text-ink-mute">—</span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 sm:contents">
                      <div className="sm:col-span-2 sm:text-left font-medium">
                        <span className="inline sm:hidden text-xs text-ink-mute font-normal">مدين: </span>
                        <span className="text-green-700 font-semibold">
                          {Number(line.debit) > 0 ? formatMoney(Number(line.debit), 'LYD') : '—'}
                        </span>
                      </div>
                      <div className="sm:col-span-2 sm:text-left font-medium">
                        <span className="inline sm:hidden text-xs text-ink-mute font-normal">دائن: </span>
                        <span className="text-red-700 font-semibold">
                          {Number(line.credit) > 0 ? formatMoney(Number(line.credit), 'LYD') : '—'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="sm:col-span-2 text-ink-mute text-xs sm:text-sm">
                      <span className="inline sm:hidden text-xs text-ink-mute font-normal">البيان: </span>
                      {line.description || '—'}
                    </div>
                  </div>
                ))}

                {/* Totals Row */}
                <div className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-12 sm:gap-2 sm:px-4 sm:py-3 font-bold bg-muted/30 border-t-2">
                  <div className="col-span-3">الإجمالي</div>
                  <div className="hidden sm:block col-span-3"></div>
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <div className="sm:col-span-2 sm:text-left text-green-700">
                      <span className="inline sm:hidden text-xs text-ink-mute font-normal">إجمالي مدين: </span>
                      {formatMoney(Number(entry.total_debit), 'LYD')}
                    </div>
                    <div className="sm:col-span-2 sm:text-left text-red-700">
                      <span className="inline sm:hidden text-xs text-ink-mute font-normal">إجمالي دائن: </span>
                      {formatMoney(Number(entry.total_credit), 'LYD')}
                    </div>
                  </div>
                  <div className="hidden sm:block sm:col-span-2"></div>
                </div>
              </div>
            )}
          </Card>

          {/* Status Timeline */}
          <Card className="p-4">
            <h4 className="font-medium mb-3">سجل القيد</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-mute">تاريخ الإنشاء</span>
                <span>{formatDate(entry.created_at)}</span>
              </div>
              {entry.posted_at && (
                <div className="flex justify-between">
                  <span className="text-ink-mute">تاريخ الترحيل</span>
                  <span className="text-green-600">{formatDate(entry.posted_at)}</span>
                </div>
              )}
              {entry.reversed_at && (
                <div className="flex justify-between">
                  <span className="text-ink-mute">تاريخ العكس</span>
                  <span className="text-red-600">{formatDate(entry.reversed_at)}</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
