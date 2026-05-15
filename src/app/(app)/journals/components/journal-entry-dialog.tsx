'use client';

import { useState, useCallback } from 'react';
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
import { useCategories } from '@/lib/db/queries';
import { useCreateJournalEntry } from '@/lib/db/journal-queries';
import { toast } from 'sonner';

type JournalLine = {
  id: string;
  category_id: string;
  debit: string;
  credit: string;
  description: string;
};

export function JournalEntryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: categories = [] } = useCategories();
  const createEntry = useCreateJournalEntry();

  const [reference, setReference] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { id: '1', category_id: '', debit: '', credit: '', description: '' },
    { id: '2', category_id: '', debit: '', credit: '', description: '' },
  ]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        category_id: '',
        debit: '',
        credit: '',
        description: '',
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
      prev.map((l) => {
        if (l.id !== id) return l;
        
        // Auto-clear opposite field when entering value
        if (field === 'debit' && value) {
          return { ...l, [field]: value, credit: '' };
        }
        if (field === 'credit' && value) {
          return { ...l, [field]: value, debit: '' };
        }
        
        return { ...l, [field]: value };
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

  const isBalanced = totals.debit === totals.credit && totals.debit > 0;
  const difference = totals.debit - totals.credit;

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

    await createEntry.mutateAsync({
      reference: reference || undefined,
      entry_date: entryDate,
      description: description || undefined,
      notes: notes || undefined,
      lines: validLines,
    });

    onClose();
    resetForm();
  };

  const resetForm = () => {
    setReference('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setNotes('');
    setLines([
      { id: '1', category_id: '', debit: '', credit: '', description: '' },
      { id: '2', category_id: '', debit: '', credit: '', description: '' },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            قيد محاسبي جديد
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            أدخل أسطر المدين والدائن والبنود حتى يتساوى المجموع، ثم احفظ القيد.
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
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 text-sm font-medium border-b">
              بنود القيد المزدوجة
            </div>
            <div className="divide-y">
              {lines.map((line, index) => (
                <div key={line.id} className="p-3 grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <Label className="text-xs mb-1 block">البند المحاسبي</Label>
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
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">مدين</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={line.debit}
                      onChange={(e) => updateLine(line.id, 'debit', e.target.value)}
                      placeholder="0.000"
                      className="text-left"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">دائن</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={line.credit}
                      onChange={(e) => updateLine(line.id, 'credit', e.target.value)}
                      placeholder="0.000"
                      className="text-left"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">البيان</Label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                      placeholder="بيان"
                    />
                  </div>
                  <div className="col-span-1 flex items-end justify-center h-full pt-5">
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
            <div className="flex items-center justify-between">
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
              <div className="text-left">
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-ink-mute">إجمالي مدين:</span>{' '}
                    <span className="font-medium">{formatMoney(totals.debit, 'LYD')}</span>
                  </div>
                  <div>
                    <span className="text-ink-mute">إجمالي دائن:</span>{' '}
                    <span className="font-medium">{formatMoney(totals.credit, 'LYD')}</span>
                  </div>
                </div>
                {!isBalanced && difference !== 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    الفرق: {formatMoney(Math.abs(difference), 'LYD')} {' '}
                    {difference > 0 ? '(مدين أكثر)' : '(دائن أكثر)'}
                  </p>
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
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isBalanced || createEntry.isPending}
            className="gap-1.5"
          >
            {createEntry.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="h-4 w-4" />
            )}
            إنشاء القيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
