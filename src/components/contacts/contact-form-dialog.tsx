'use client';

import { useState } from 'react';
import {
  Building2,
  Briefcase,
  User,
  Store,
  Phone,
  MapPin,
  DollarSign,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ContactKind } from '@/lib/db/types';
import {
  type ContactFormState,
  defaultContactFormState,
} from '@/lib/contacts/form-utils';

const KIND_OPTIONS: {
  value: ContactKind;
  label: string;
  icon: typeof Building2;
  color: string;
}[] = [
  { value: 'TENANT', label: 'مستأجر / محل', icon: Building2, color: 'text-blue-600' },
  { value: 'EMPLOYEE', label: 'موظف', icon: Briefcase, color: 'text-purple-600' },
  { value: 'CUSTOMER', label: 'عميل', icon: User, color: 'text-green-600' },
  { value: 'VENDOR', label: 'مورد', icon: Store, color: 'text-orange-600' },
];

type ContactFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: ContactFormState;
  onFormChange: (data: ContactFormState) => void;
  editingId: string | null;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  /** منع تغيير النوع عند التعديل (مثلاً مستأجر مرتبط بعقد) */
  lockKind?: boolean;
};

export function ContactFormDialog({
  open,
  onOpenChange,
  formData,
  onFormChange,
  editingId,
  onSubmit,
  isPending,
  lockKind = false,
}: ContactFormDialogProps) {
  const [showOptional, setShowOptional] = useState(false);
  const isTenant = formData.kind === 'TENANT';
  const isEmployee = formData.kind === 'EMPLOYEE';
  const showExtraContactFields = !isTenant && !isEmployee;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90dvh] overflow-y-auto sm:max-h-[85vh] w-[calc(100%-1.5rem)] sm:w-full rounded-2xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>{editingId ? 'تعديل' : 'إضافة جديد'}</DialogTitle>
          <p className="text-sm text-ink-mute pt-1">
            {isTenant || isEmployee
              ? 'الاسم إلزامي — الهاتف وباقي الحقول اختيارية'
              : 'يكفي الاسم للحفظ — باقي الحقول اختيارية'}
          </p>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-2">
          {lockKind && editingId ? (
            <div className="rounded-lg border border-border bg-canvas-sunken/50 px-3 py-2 text-sm">
              <span className="text-ink-mute">النوع: </span>
              <span className="font-medium">
                {KIND_OPTIONS.find((k) => k.value === formData.kind)?.label ?? formData.kind}
              </span>
            </div>
          ) : (
            <div>
              <Label>النوع</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {KIND_OPTIONS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    disabled={lockKind}
                    onClick={() => onFormChange({ ...formData, kind: k.value })}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md border text-sm touch-manipulation',
                      formData.kind === k.value
                        ? 'border-sage-500 bg-sage-50 text-sage-700'
                        : 'border-border hover:bg-secondary',
                      lockKind && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <k.icon className={cn('h-4 w-4', k.color)} />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>الاسم *</Label>
            <Input
              value={formData.name}
              onChange={(e) => onFormChange({ ...formData, name: e.target.value })}
              placeholder="اسم المستأجر أو العميل"
              autoFocus
            />
          </div>

          <div>
            <Label className="flex items-center gap-1 text-ink-mute">
              <Phone className="h-3 w-3" /> الهاتف (اختياري)
            </Label>
            <Input
              value={formData.phone}
              onChange={(e) => onFormChange({ ...formData, phone: e.target.value })}
              placeholder="09xxxxxxxx"
              inputMode="tel"
            />
          </div>

          {isTenant && (
            <div className="border rounded-md p-3 space-y-3 bg-blue-50/50">
              <p className="text-sm font-medium text-blue-700 flex items-center gap-1">
                <Building2 className="h-4 w-4" /> بيانات المحل (اختياري)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>رقم المحل</Label>
                  <Input
                    value={formData.shop_number}
                    onChange={(e) =>
                      onFormChange({ ...formData, shop_number: e.target.value })
                    }
                    placeholder="A-101"
                  />
                </div>
                <div>
                  <Label>الطابق</Label>
                  <Input
                    value={formData.floor}
                    onChange={(e) => onFormChange({ ...formData, floor: e.target.value })}
                    placeholder="1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>المساحة (م²)</Label>
                  <Input
                    type="number"
                    value={formData.area_sqm}
                    onChange={(e) =>
                      onFormChange({ ...formData, area_sqm: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> الإيجار الشهري
                  </Label>
                  <Input
                    type="number"
                    value={formData.monthly_rent}
                    onChange={(e) =>
                      onFormChange({ ...formData, monthly_rent: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {isEmployee && (
            <div className="border rounded-md p-3 space-y-3 bg-purple-50/50">
              <p className="text-sm font-medium text-purple-700 flex items-center gap-1">
                <Briefcase className="h-4 w-4" /> بيانات وظيفية (اختياري)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>المسمى الوظيفي</Label>
                  <Input
                    value={formData.job_title}
                    onChange={(e) =>
                      onFormChange({ ...formData, job_title: e.target.value })
                    }
                    placeholder="أمين صندوق"
                  />
                </div>
                <div>
                  <Label>القسم</Label>
                  <Input
                    value={formData.department}
                    onChange={(e) =>
                      onFormChange({ ...formData, department: e.target.value })
                    }
                    placeholder="المالية"
                  />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> الراتب الشهري
                </Label>
                <Input
                  type="number"
                  value={formData.salary}
                  onChange={(e) => onFormChange({ ...formData, salary: e.target.value })}
                />
              </div>
            </div>
          )}

          {showExtraContactFields && (
            <>
              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm text-ink-mute hover:bg-secondary/50"
              >
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  بيانات إضافية (بريد، عنوان، ملاحظات…)
                </span>
                {showOptional ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showOptional && (
                <div className="space-y-3 rounded-md border border-border bg-canvas-sunken/30 p-3">
                  <div>
                    <Label>هاتف إضافي</Label>
                    <Input
                      value={formData.phone2}
                      onChange={(e) =>
                        onFormChange({ ...formData, phone2: e.target.value })
                      }
                      inputMode="tel"
                    />
                  </div>
                  <div>
                    <Label>البريد الإلكتروني</Label>
                    <Input
                      value={formData.email}
                      onChange={(e) =>
                        onFormChange({ ...formData, email: e.target.value })
                      }
                      placeholder="اختياري"
                    />
                  </div>
                  <div>
                    <Label>العنوان</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) =>
                        onFormChange({ ...formData, address: e.target.value })
                      }
                      placeholder="اختياري"
                    />
                  </div>
                  <div>
                    <Label>ملاحظات</Label>
                    <Input
                      value={formData.notes}
                      onChange={(e) =>
                        onFormChange({ ...formData, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              إلغاء
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>{editingId ? 'تحديث' : 'حفظ'}</>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { defaultContactFormState, KIND_OPTIONS };
