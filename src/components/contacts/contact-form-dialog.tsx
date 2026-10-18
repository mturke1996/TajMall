'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  Building,
  Zap,
  Droplets,
  Package,
  Wrench,
  Briefcase,
  User,
  Store,
  Phone,
  MapPin,
  DollarSign,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Layers,
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
import {
  CONTACT_ROLES,
  type ContactBusinessRole,
} from '@/lib/contacts/contact-roles';

export const ROLE_OPTIONS: Array<{
  value: ContactBusinessRole;
  label: string;
  badge: string;
  icon: typeof Building2;
  color: string;
  bg: string;
  border: string;
}> = [
  {
    value: 'TENANT',
    label: 'مستأجر محل بالمول',
    badge: 'مستأجر محل',
    icon: Building2,
    color: 'text-success-ink',
    bg: 'bg-success-soft',
    border: 'border-success-line',
  },
  {
    value: 'LANDLORD',
    label: 'مؤجر للمول (المول مستأجر منه)',
    badge: 'مؤجر للمول',
    icon: Building,
    color: 'text-warning-ink',
    bg: 'bg-warning-soft',
    border: 'border-warning-line',
  },
  {
    value: 'SUPPLIER_ELECTRICITY',
    label: 'مورّد كهرباء وطاقة / محروقات',
    badge: 'توريد كهرباء',
    icon: Zap,
    color: 'text-warning-ink',
    bg: 'bg-warning-soft',
    border: 'border-warning-line',
  },
  {
    value: 'SUPPLIER_WATER',
    label: 'مورّد مياه وصرف صحي',
    badge: 'توريد مياه',
    icon: Droplets,
    color: 'text-info-ink',
    bg: 'bg-info-soft',
    border: 'border-info-line',
  },
  {
    value: 'SUPPLIER_GOODS',
    label: 'مورّد بضاعة ومواد تشغيل',
    badge: 'توريد بضاعة',
    icon: Package,
    color: 'text-info-ink',
    bg: 'bg-info-soft',
    border: 'border-info-line',
  },
  {
    value: 'SERVICE_PROVIDER',
    label: 'مقدّم خدمات ومقاولات وصيانة',
    badge: 'خدمات ومقاولات',
    icon: Wrench,
    color: 'text-info-ink',
    bg: 'bg-info-soft',
    border: 'border-info-line',
  },
  {
    value: 'EMPLOYEE',
    label: 'موظف / كادر إداري',
    badge: 'موظف',
    icon: Briefcase,
    color: 'text-plum-ink',
    bg: 'bg-plum-soft',
    border: 'border-plum-line',
  },
  {
    value: 'CUSTOMER',
    label: 'عميل عام / مستفيد',
    badge: 'عميل عام',
    icon: User,
    color: 'text-success-ink',
    bg: 'bg-success-soft',
    border: 'border-success-line',
  },
];

export const KIND_OPTIONS = ROLE_OPTIONS.map((r) => ({
  value: r.value as unknown as ContactKind,
  label: r.label,
  icon: r.icon,
  color: r.color,
}));

type ContactFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: ContactFormState;
  onFormChange: (data: ContactFormState) => void;
  editingId: string | null;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  /** منع تغيير النوع عند التعديل */
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
  const role = formData.businessRole || 'CUSTOMER';

  useEffect(() => {
    if (open) setShowOptional(Boolean(editingId));
  }, [editingId, open]);

  const isTenant = role === 'TENANT';
  const isLandlord = role === 'LANDLORD';
  const isElectricity = role === 'SUPPLIER_ELECTRICITY';
  const isWater = role === 'SUPPLIER_WATER';
  const isGoods = role === 'SUPPLIER_GOODS';
  const isService = role === 'SERVICE_PROVIDER';
  const isEmployee = role === 'EMPLOYEE';

  const handleRoleChange = (newRole: ContactBusinessRole) => {
    const isT = newRole === 'TENANT';
    const isE = newRole === 'EMPLOYEE';
    const isL = newRole === 'LANDLORD';
    const newKind: ContactKind = isT ? 'TENANT' : isE ? 'EMPLOYEE' : isL ? 'VENDOR' : newRole === 'CUSTOMER' ? 'CUSTOMER' : 'VENDOR';

    onFormChange({
      ...formData,
      kind: newKind,
      businessRole: newRole,
      job_title: isL ? (formData.job_title || 'مؤجر للمول') : formData.job_title,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl max-h-[90dvh] overflow-y-auto sm:max-h-[85vh] w-[calc(100%-1.5rem)] sm:w-full rounded-2xl p-0 overflow-hidden"
        dir="rtl"
      >
        <div className="border-b border-border bg-canvas-sunken/60 px-5 py-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">
              {editingId ? 'تعديل بيانات جهة الاتصال' : 'إضافة جهة اتصال جديدة'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-0.5">
              حدد نوع ودور جهة التعامل بدقة لتهيئة البروفايل المحاسبي المتخصص
            </p>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {/* 1. Business Role Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-bold text-foreground">
                نوع ودور جهة التعامل *
              </Label>
              {editingId && (
                <span className="text-[11px] font-semibold text-success-ink bg-success-soft px-2 py-0.5 rounded-full border border-success-line">
                  قابلة للتغيير والتحويل
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-0.5">
              {ROLE_OPTIONS.map((r) => {
                const isSelected = role === r.value;
                const Icon = r.icon;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => handleRoleChange(r.value)}
                    className={cn(
                      'flex items-center gap-2.5 p-2.5 rounded-lg border text-start transition-all cursor-pointer',
                      isSelected
                        ? cn('border-2 font-bold ring-1 ring-primary/20', r.border, r.bg, r.color)
                        : 'border-border bg-card hover:bg-muted/40 text-muted-foreground'
                    )}
                  >
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', r.bg)}>
                      <Icon className={cn('h-4 w-4', r.color)} />
                    </div>
                    <span className="text-xs leading-tight line-clamp-1">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>


          {/* 2. Basic Info (Name & Phone) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="text-xs font-semibold block mb-1">
                {isLandlord ? 'اسم المؤجر / مالك العقار *' : isTenant ? 'اسم المستأجر / النشاط *' : isElectricity || isWater || isGoods ? 'اسم المورد / الشركة *' : 'الاسم *'}
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => onFormChange({ ...formData, name: e.target.value })}
                placeholder={isLandlord ? 'مثال: شركة العقارات / فلان الفلاني' : 'الاسم الكامل'}
                className="h-9 text-xs"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-semibold block mb-1">الهاتف الرئيسي</Label>
              <Input
                value={formData.phone}
                onChange={(e) => onFormChange({ ...formData, phone: e.target.value })}
                placeholder="09xxxxxxxx"
                inputMode="tel"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* 3A. Specialized Card: LANDLORD (مؤجر للمول) */}
          {isLandlord && (
            <div className="rounded-xl border border-warning-line bg-warning-soft/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-warning-ink">
                <Building className="h-4 w-4 stroke-2" />
                <span className="text-xs font-bold">بيانات عقد الإيجار للمؤجر المستحق</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-warning-ink block mb-1">
                    قيمة الإيجار الشهري المستحق للمؤجر (د.ل) *
                  </Label>
                  <Input
                    type="number"
                    value={formData.monthly_rent}
                    onChange={(e) => onFormChange({ ...formData, monthly_rent: e.target.value })}
                    placeholder="مثال: 5000"
                    className="h-9 text-xs bg-card font-mono font-bold text-warning-ink"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-warning-ink block mb-1">
                    اسم العقار / الموقع المستأجر للمول
                  </Label>
                  <Input
                    value={formData.shop_number}
                    onChange={(e) => onFormChange({ ...formData, shop_number: e.target.value })}
                    placeholder="مثال: أرضية المولدات / مواقف السيارات"
                    className="h-9 text-xs bg-card"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-warning-ink block mb-1">
                    تاريخ بداية عقد الإيجار
                  </Label>
                  <Input
                    type="date"
                    value={formData.contract_start}
                    onChange={(e) => onFormChange({ ...formData, contract_start: e.target.value })}
                    className="h-9 text-xs bg-card font-mono"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-warning-ink block mb-1">
                    تاريخ نهاية عقد الإيجار
                  </Label>
                  <Input
                    type="date"
                    value={formData.contract_end}
                    onChange={(e) => onFormChange({ ...formData, contract_end: e.target.value })}
                    className="h-9 text-xs bg-card font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3B. Specialized Card: TENANT (مستأجر محل بالمول) */}
          {isTenant && (
            <div className="rounded-xl border border-success-line bg-success-soft/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-success-ink">
                <Building2 className="h-4 w-4 stroke-2" />
                <span className="text-xs font-bold">بيانات المحل المستأجر بالمول</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-success-ink block mb-1">
                    رقم المحل
                  </Label>
                  <Input
                    value={formData.shop_number}
                    onChange={(e) => onFormChange({ ...formData, shop_number: e.target.value })}
                    placeholder="مثال: 12"
                    className="h-9 text-xs bg-card font-mono"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-success-ink block mb-1">
                    الطابق
                  </Label>
                  <Input
                    value={formData.floor}
                    onChange={(e) => onFormChange({ ...formData, floor: e.target.value })}
                    placeholder="الأرضي / الأول"
                    className="h-9 text-xs bg-card"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-success-ink block mb-1">
                    المساحة (م²)
                  </Label>
                  <Input
                    value={formData.area_sqm}
                    onChange={(e) => onFormChange({ ...formData, area_sqm: e.target.value })}
                    placeholder="مثال: 45"
                    className="h-9 text-xs bg-card font-mono"
                  />
                </div>

                <div className="col-span-2 sm:col-span-3">
                  <Label className="text-[11px] font-semibold text-success-ink block mb-1">
                    قيمة الإيجار الشهري (د.ل)
                  </Label>
                  <Input
                    type="number"
                    value={formData.monthly_rent}
                    onChange={(e) => onFormChange({ ...formData, monthly_rent: e.target.value })}
                    placeholder="مثال: 3500"
                    className="h-9 text-xs bg-card font-mono font-bold text-success-ink"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3C. Specialized Card: UTILITIES & SUPPLIERS (كهرباء ومياه وبضاعة ومقاولات) */}
          {(isElectricity || isWater || isGoods || isService) && (
            <div className="rounded-xl border border-border bg-canvas p-4 space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold">بيانات التوريد والاشتراك</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold block mb-1">
                    {isElectricity || isWater ? 'رقم العداد / الوحدة / المعرف' : 'كود التوريد / العقد'}
                  </Label>
                  <Input
                    value={formData.shop_number}
                    onChange={(e) => onFormChange({ ...formData, shop_number: e.target.value })}
                    placeholder={isElectricity ? 'مثال: عداد رقم 104' : 'المعرف'}
                    className="h-9 text-xs bg-card"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold block mb-1">
                    التصنيف / نوع التوريد
                  </Label>
                  <Input
                    value={formData.department}
                    onChange={(e) => onFormChange({ ...formData, department: e.target.value })}
                    placeholder={isElectricity ? 'ديزل مولدات / شبكة عامة' : isWater ? 'صهاريج / شبكة' : 'نوع المواد'}
                    className="h-9 text-xs bg-card"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3D. Specialized Card: EMPLOYEE (موظف) */}
          {isEmployee && (
            <div className="rounded-xl border border-plum-line bg-plum-soft/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-plum-ink">
                <Briefcase className="h-4 w-4 stroke-2" />
                <span className="text-xs font-bold">بيانات الموظف والمرتب</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-plum-ink block mb-1">
                    المسمى الوظيفي
                  </Label>
                  <Input
                    value={formData.job_title}
                    onChange={(e) => onFormChange({ ...formData, job_title: e.target.value })}
                    placeholder="محاسب / فني"
                    className="h-9 text-xs bg-card"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-plum-ink block mb-1">
                    القسم
                  </Label>
                  <Input
                    value={formData.department}
                    onChange={(e) => onFormChange({ ...formData, department: e.target.value })}
                    placeholder="الإدارة المالية"
                    className="h-9 text-xs bg-card"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-plum-ink block mb-1">
                    المرتب الشهري (د.ل)
                  </Label>
                  <Input
                    type="number"
                    value={formData.salary}
                    onChange={(e) => onFormChange({ ...formData, salary: e.target.value })}
                    placeholder="2500"
                    className="h-9 text-xs bg-card font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Optional Fields Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              className="flex min-h-11 items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground py-1"
            >
              {showOptional ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showOptional ? 'إخفاء بيانات الملف الإضافية' : 'بيانات الملف والتواصل الإضافية'}
            </button>

            {showOptional && (
              <div className="space-y-3 pt-2 border-t border-border/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-medium block mb-1">الاسم باللغة الإنجليزية</Label>
                    <Input
                      value={formData.name_en}
                      onChange={(e) => onFormChange({ ...formData, name_en: e.target.value })}
                      autoComplete="organization"
                      className="h-11 text-sm bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium block mb-1">رقم الهوية / السجل</Label>
                    <Input
                      value={formData.id_number}
                      onChange={(e) => onFormChange({ ...formData, id_number: e.target.value })}
                      autoComplete="off"
                      className="h-11 text-sm bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium block mb-1">الرقم الضريبي</Label>
                    <Input
                      value={formData.tax_number}
                      onChange={(e) => onFormChange({ ...formData, tax_number: e.target.value })}
                      autoComplete="off"
                      className="h-11 text-sm bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium block mb-1">تاريخ بدء التعامل / التعيين</Label>
                    <Input
                      type="date"
                      value={formData.hire_date}
                      onChange={(e) => onFormChange({ ...formData, hire_date: e.target.value })}
                      className="h-11 text-sm bg-card"
                    />
                  </div>
                </div>

                <label className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-card px-3 text-sm">
                  <span className="font-medium">الجهة نشطة ويمكن التعامل معها</span>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => onFormChange({ ...formData, is_active: e.target.checked })}
                    className="h-5 w-5 accent-success"
                    aria-label="الجهة نشطة ويمكن التعامل معها"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-medium block mb-1">الهاتف الإضافي</Label>
                    <Input
                      value={formData.phone2}
                      onChange={(e) => onFormChange({ ...formData, phone2: e.target.value })}
                      placeholder="هاتف بديل"
                      className="h-9 text-xs bg-card"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium block mb-1">البريد الإلكتروني</Label>
                    <Input
                      value={formData.email}
                      onChange={(e) => onFormChange({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                      className="h-9 text-xs bg-card"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] font-medium block mb-1">العنوان أو الموقع</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => onFormChange({ ...formData, address: e.target.value })}
                    placeholder="العنوان التفصيلي"
                    className="h-9 text-xs bg-card"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-medium block mb-1">ملاحظات خاصة</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => onFormChange({ ...formData, notes: e.target.value })}
                    placeholder="أي ملاحظات أو بنود خاصة بالاتفاق"
                    className="h-9 text-xs bg-card"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dialog Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !formData.name.trim()}
              className="text-xs font-bold gap-1.5 min-w-24"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? 'حفظ التعديلات' : 'إضافة الجهة'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
