'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, AlertCircle, Loader2, Calculator, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Card } from '@/components/ui/card';
import { cn, formatMoney } from '@/lib/utils';
import { useCategories, useContacts, useCashboxes } from '@/lib/db/queries';
import { useCreateJournalEntry, useUpdateJournalEntry, useJournalLines } from '@/lib/db/journal-queries';
import { toast } from 'sonner';

type JournalLine = {
  id: string;
  category_id: string;
  debit: string;
  credit: string;
  description: string;
  contact_id?: string;
  cashbox_id?: string;
};

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
  const { data: contacts = [] } = useContacts();
  const { data: cashboxes = [] } = useCashboxes();
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();

  const [reference, setReference] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { id: '1', category_id: '', debit: '', credit: '', description: '', contact_id: '', cashbox_id: '' },
    { id: '2', category_id: '', debit: '', credit: '', description: '', contact_id: '', cashbox_id: '' },
  ]);

  // Fetch lines for edit mode
  const { data: dbLines } = useJournalLines(editingEntry?.id || '');

  // Populate form if editing
  useEffect(() => {
    if (editingEntry) {
      setReference(editingEntry.reference || '');
      setEntryDate(editingEntry.entry_date ? editingEntry.entry_date.split('T')[0] : new Date().toISOString().split('T')[0]);
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
          contact_id: l.contact_id || '',
          cashbox_id: l.cashbox_id || '',
        }))
      );
    }
  }, [dbLines, editingEntry]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        category_id: '',
        debit: '',
        credit: '',
        description: '',
        contact_id: '',
        cashbox_id: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) {
      toast.error('القيود المزدوجة تتطلب سطرين على الأقل');
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof JournalLine, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id !== id ? l : { ...l, [field]: value }))
    );
  };

  const handleBlur = (id: string, field: 'debit' | 'credit') => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (field === 'debit' && Number(l.debit) > 0) {
          return { ...l, credit: '' };
        }
        if (field === 'credit' && Number(l.credit) > 0) {
          return { ...l, debit: '' };
        }
        return l;
      })
    );
  };

  const totals = lines.reduce(
    (acc, line) => ({
      debit: acc.debit + (Number(line.debit) || 0),
      credit: acc.credit + (Number(line.credit) || 0),
    }),
    { debit: 0, credit: 0 }
  );

  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.001 && totals.debit > 0;
  const difference = totals.debit - totals.credit;

  const autoBalance = () => {
    if (difference === 0) return;
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const lastLineIndex = prev.length - 1;
      const lastLine = prev[lastLineIndex];
      const absDiff = Math.abs(difference);
      const isDebitMore = difference > 0;
      
      const updatedLines = [...prev];
      if (isDebitMore) {
        // We need more Credit to balance
        updatedLines[lastLineIndex] = {
          ...lastLine,
          credit: String(Number(lastLine.credit || 0) + absDiff),
          debit: ''
        };
      } else {
        // We need more Debit to balance
        updatedLines[lastLineIndex] = {
          ...lastLine,
          debit: String(Number(lastLine.debit || 0) + absDiff),
          credit: ''
        };
      }
      return updatedLines;
    });
    toast.success('تمت الموازنة التلقائية للقيد');
  };

  const handleSubmit = async () => {
    const hasDoubleEntryOnSingleLine = lines.some(
      (l) => Number(l.debit) > 0 && Number(l.credit) > 0
    );
    if (hasDoubleEntryOnSingleLine) {
      toast.error('لا يمكن للسطر الواحد أن يحتوي على مبلغ مدين ودائن معاً');
      return;
    }

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
        contact_id: l.contact_id || undefined,
        cashbox_id: l.cashbox_id || undefined,
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

  const resetForm = () => {
    setReference('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setNotes('');
    setLines([
      { id: '1', category_id: '', debit: '', credit: '', description: '', contact_id: '', cashbox_id: '' },
      { id: '2', category_id: '', debit: '', credit: '', description: '', contact_id: '', cashbox_id: '' },
    ]);
  };

  const getContactLabel = (c: any) => {
    const kinds: Record<string, string> = {
      TENANT: 'متجر',
      EMPLOYEE: 'موظف',
      VENDOR: 'مورد',
      CUSTOMER: 'عميل',
      OTHER: 'آخر'
    };
    const kindLabel = kinds[c.kind] || 'جهة';
    return `[${kindLabel}] ${c.name} ${c.shop_number ? `(${c.shop_number})` : ''}`;
  };

  const isPending = createEntry.isPending || updateEntry.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {editingEntry ? 'تعديل قيد محاسبي' : 'قيد محاسبي جديد'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {editingEntry 
              ? 'قم بتعديل أسطر المدين والدائن والبنود ثم احفظ التغييرات.' 
              : 'أدخل أسطر المدين والدائن والبنود حتى يتساوى المجموع، ثم احفظ القيد.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>التاريخ *</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>رقم المرجع</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="مثال: قيد افتتاحي"
              />
            </div>
            <div>
              <Label>الوصف العام</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف موجز للقيد"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="border rounded-lg overflow-hidden bg-canvas">
            <div className="bg-muted/50 px-4 py-2 text-sm font-medium border-b hidden sm:block">
              بنود القيد المزدوجة
            </div>
            {/* Table Column Headers - Only visible on desktop */}
            <div className="bg-muted/20 px-4 py-2 text-xs font-semibold text-ink-mute border-b hidden sm:grid sm:grid-cols-12 sm:gap-2">
              <div className="sm:col-span-3">الحساب المحاسبي</div>
              <div className="sm:col-span-2">الجهة/الموظف/المورد</div>
              <div className="sm:col-span-2">الخزينة/المصرف</div>
              <div className="sm:col-span-1 text-left">مدين</div>
              <div className="sm:col-span-1 text-left">دائن</div>
              <div className="sm:col-span-2">البيان</div>
              <div className="sm:col-span-1"></div>
            </div>
            <div className="divide-y">
              {lines.map((line, index) => (
                <div 
                  key={line.id} 
                  className="p-4 flex flex-col gap-3 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-start sm:p-3"
                >
                  <div className="flex-1 sm:col-span-3">
                    <Label className="text-xs mb-1 block sm:hidden">الحساب المحاسبي</Label>
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
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: cat.color || '#ccc' }}
                              />
                              {cat.name_ar}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 sm:col-span-2">
                    <Label className="text-xs mb-1 block sm:hidden">الجهة/المتجر/الموظف</Label>
                    <Select
                      value={line.contact_id || 'none'}
                      onValueChange={(v) => updateLine(line.id, 'contact_id', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="الجهة (اختياري)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون جهة</SelectItem>
                        {contacts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {getContactLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 sm:col-span-2">
                    <Label className="text-xs mb-1 block sm:hidden">الخزينة/المصرف</Label>
                    <Select
                      value={line.cashbox_id || 'none'}
                      onValueChange={(v) => updateLine(line.id, 'cashbox_id', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="الخزينة (اختياري)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون خزينة</SelectItem>
                        {cashboxes.map((cb) => (
                          <SelectItem key={cb.id} value={cb.id}>
                            {cb.name_ar} {cb.code ? `(${cb.code})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <div className="sm:col-span-1">
                      <Label className="text-xs mb-1 block sm:hidden">مدين</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={line.debit}
                        onChange={(e) => updateLine(line.id, 'debit', e.target.value)}
                        onBlur={() => handleBlur(line.id, 'debit')}
                        placeholder="0.000"
                        className="text-left"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Label className="text-xs mb-1 block sm:hidden">دائن</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={line.credit}
                        onChange={(e) => updateLine(line.id, 'credit', e.target.value)}
                        onBlur={() => handleBlur(line.id, 'credit')}
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
                      placeholder="بيان"
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
            </div>
          </div>

          <Button type="button" variant="outline" onClick={addLine} className="w-full gap-1.5">
            <Plus className="h-4 w-4" />
            إضافة بند
          </Button>

          {/* Balance Summary */}
          <Card className={cn(
            'p-4 border-2',
            isBalanced ? 'border-green-200 bg-green-50/50' : 'border-yellow-200 bg-yellow-50/50'
          )}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                )}
                <span className="font-medium">
                  {isBalanced ? 'القيد متوازن' : 'القيد غير متوازن'}
                </span>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm justify-end">
                  <div>
                    <span className="text-ink-mute">إجمالي مدين:</span>{' '}
                    <span className="font-semibold text-green-700">{formatMoney(totals.debit, 'LYD')}</span>
                  </div>
                  <div>
                    <span className="text-ink-mute">إجمالي دائن:</span>{' '}
                    <span className="font-semibold text-red-700">{formatMoney(totals.credit, 'LYD')}</span>
                  </div>
                </div>
                {!isBalanced && difference !== 0 && (
                  <div className="flex flex-col sm:flex-row items-center gap-2 mt-1 select-none">
                    <p className="text-xs text-red-600 font-bold">
                      الفرق: {formatMoney(Math.abs(difference), 'LYD')} {' '}
                      {difference > 0 ? '(مدين أكثر)' : '(دائن أكثر)'}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={autoBalance}
                      className="h-6 px-2 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                    >
                      موازنة تلقائية للقيد
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Notes */}
          <div>
            <Label>ملاحظات</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية على القيد"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isBalanced || isPending}
            className="gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4" />
            )}
            {editingEntry ? 'حفظ التغييرات' : 'إنشاء القيد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
