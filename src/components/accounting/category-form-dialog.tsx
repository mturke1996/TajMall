'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCategory, useUpdateCategory } from '@/lib/db/queries';
import type { CategoryRow } from '@/lib/db/types';
import { Loader2 } from 'lucide-react';

/** kind إرثي (tx_kind): إيراد/مصروف فقط في قوائم التشغيل؛ الأصول/الخصوم/حقوق الملكية خارجها. */
const ACCOUNT_TYPES: { value: CategoryRow['type']; label: string; kind: CategoryRow['kind'] }[] = [
  { value: 'REVENUE', label: 'إيراد', kind: 'REVENUE' },
  { value: 'EXPENSE', label: 'مصروف', kind: 'EXPENSE' },
  { value: 'ASSET', label: 'أصل', kind: 'OPENING' },
  { value: 'LIABILITY', label: 'خصم', kind: 'ADJUSTMENT' },
  { value: 'EQUITY', label: 'حقوق ملكية', kind: 'OPENING' },
];

export function CategoryFormDialog({
  open,
  onOpenChange,
  editRow,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editRow?: CategoryRow | null;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const isEdit = !!editRow;

  const [code, setCode] = useState(editRow?.code ?? '');
  const [nameAr, setNameAr] = useState(editRow?.name_ar ?? '');
  const [nameEn, setNameEn] = useState(editRow?.name ?? '');
  const [type, setType] = useState<CategoryRow['type']>(editRow?.type ?? 'EXPENSE');

  const selectedType = ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[1];
  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nameAr.trim()) return;

    if (isEdit && editRow) {
      await update.mutateAsync({
        id: editRow.id,
        code,
        name: nameEn.trim() || nameAr.trim(),
        name_ar: nameAr.trim(),
        type,
        kind: selectedType.kind,
      });
    } else {
      await create.mutateAsync({
        code,
        name: nameEn.trim() || nameAr.trim(),
        name_ar: nameAr.trim(),
        type,
        kind: selectedType.kind,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل بند محاسبي' : 'بند محاسبي جديد'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat-code">الرمز</Label>
              <Input
                id="cat-code"
                dir="ltr"
                placeholder="EXP-XXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>نوع الحساب</Label>
              <Select value={type} onValueChange={(v) => setType(v as CategoryRow['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-ar">الاسم بالعربية</Label>
            <Input
              id="cat-ar"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-en">الاسم بالإنجليزية (اختياري)</Label>
            <Input
              id="cat-en"
              dir="ltr"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'حفظ التعديلات' : 'إضافة البند'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
