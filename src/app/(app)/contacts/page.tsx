'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { 
  Plus, 
  Search, 
  Loader2, 
  Building2, 
  Briefcase, 
  User, 
  Store,
  Edit2, 
  Trash2, 
  X,
  Check,
  Phone,
  MapPin,
  Calendar,
  DollarSign
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact, qk } from '@/lib/db/queries';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import { useSearchParams } from 'next/navigation';

const KIND_OPTIONS: { value: ContactKind; label: string; icon: typeof Building2; color: string }[] = [
  { value: 'TENANT', label: 'مستأجر / محل', icon: Building2, color: 'text-blue-600' },
  { value: 'EMPLOYEE', label: 'موظف', icon: Briefcase, color: 'text-purple-600' },
  { value: 'CUSTOMER', label: 'عميل', icon: User, color: 'text-green-600' },
  { value: 'VENDOR', label: 'مورد', icon: Store, color: 'text-orange-600' },
];

export default function ContactsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-40 items-center justify-center gap-2 text-[13px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
        جارٍ التحميل…
      </div>
    }>
      <ContactsContent />
    </Suspense>
  );
}

function ContactsContent() {
  const { data: contacts = [], isLoading } = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ContactKind | 'ALL'>('ALL');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const highlightId = searchParams.get('id');

  useEffect(() => {
    if (highlightId && contacts.length > 0) {
      const match = contacts.find((c) => c.id === highlightId);
      if (match) {
        setSearchQuery(match.name);
        setKindFilter(match.kind);
      }
    }
  }, [highlightId, contacts]);

  // Form state
  const [formData, setFormData] = useState<Partial<ContactRow>>({
    kind: 'CUSTOMER',
    name: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    shop_number: '',
    floor: '',
    area_sqm: '',
    monthly_rent: '',
    job_title: '',
    department: '',
    salary: '',
    notes: '',
  });

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (kindFilter !== 'ALL' && c.kind !== kindFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.shop_number?.toLowerCase().includes(q) ||
        c.job_title?.toLowerCase().includes(q)
      );
    });
  }, [contacts, kindFilter, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: contacts.length,
      tenants: contacts.filter(c => c.kind === 'TENANT').length,
      employees: contacts.filter(c => c.kind === 'EMPLOYEE').length,
      customers: contacts.filter(c => c.kind === 'CUSTOMER').length,
    };
  }, [contacts]);

  function resetForm() {
    setFormData({
      kind: 'CUSTOMER',
      name: '',
      phone: '',
      phone2: '',
      email: '',
      address: '',
      shop_number: '',
      floor: '',
      area_sqm: '',
      monthly_rent: '',
      job_title: '',
      department: '',
      salary: '',
      notes: '',
    });
    setEditingId(null);
  }

  function startEdit(contact: ContactRow) {
    setEditingId(contact.id);
    setFormData({
      kind: contact.kind,
      name: contact.name,
      phone: contact.phone || '',
      phone2: contact.phone2 || '',
      email: contact.email || '',
      address: contact.address || '',
      shop_number: contact.shop_number || '',
      floor: contact.floor || '',
      area_sqm: contact.area_sqm || '',
      monthly_rent: contact.monthly_rent || '',
      job_title: contact.job_title || '',
      department: contact.department || '',
      salary: contact.salary || '',
      notes: contact.notes || '',
    });
    setIsAddOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error('أدخل الاسم');
      return;
    }

    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        code: null,
        name_en: null,
        id_number: null,
        tax_number: null,
        contract_start: null,
        contract_end: null,
        hire_date: null,
        is_active: true,
      } as any;

      if (editingId) {
        await updateContact.mutateAsync({ id: editingId, ...payload });
        toast.success('تم التحديث');
      } else {
        await createContact.mutateAsync(payload);
        toast.success('تم الإضافة');
      }
      setIsAddOpen(false);
      resetForm();
    } catch {
      toast.error('فشل الحفظ');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذا السجل؟')) return;
    try {
      await deleteContact.mutateAsync(id);
      toast.success('تم الحذف');
    } catch {
      toast.error('فشل الحذف');
    }
  }

  const isTenant = formData.kind === 'TENANT';
  const isEmployee = formData.kind === 'EMPLOYEE';

  return (
    <>
      <PageHeader
        eyebrow="الدليل"
        title="العملاء والمستأجرين والموظفين"
        description="إدارة جهات التعامل والمستأجرين والموظفين"
        actions={
          <Button size="sm" onClick={() => { resetForm(); setIsAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            إضافة
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <User className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-ink-mute">الإجمالي</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-ink-mute">المستأجرين</p>
              <p className="text-xl font-bold">{stats.tenants}</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-ink-mute">الموظفين</p>
              <p className="text-xl font-bold">{stats.employees}</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-ink-mute">العملاء</p>
              <p className="text-xl font-bold">{stats.customers}</p>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <Input
              placeholder="البحث بالاسم، الهاتف، رقم المحل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setKindFilter('ALL')}
              className={cn(
                'px-3 py-2 text-sm rounded-md whitespace-nowrap',
                kindFilter === 'ALL' ? 'bg-sage-700 text-white' : 'bg-canvas-sunken'
              )}
            >
              الكل
            </button>
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKindFilter(k.value)}
                className={cn(
                  'px-3 py-2 text-sm rounded-md whitespace-nowrap flex items-center gap-1.5',
                  kindFilter === k.value ? 'bg-sage-700 text-white' : 'bg-canvas-sunken'
                )}
              >
                <k.icon className="h-4 w-4" />
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <Card className="p-8 text-center">
            <User className="mx-auto h-8 w-8 text-ink-mute" />
            <p className="mt-2 text-ink-mute">لا يوجد سجلات</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredContacts.map((contact) => {
              const kindInfo = KIND_OPTIONS.find(k => k.value === contact.kind);
              const Icon = kindInfo?.icon || User;
              return (
                <Card key={contact.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-lg flex items-center justify-center',
                        contact.kind === 'TENANT' ? 'bg-blue-100' :
                        contact.kind === 'EMPLOYEE' ? 'bg-purple-100' :
                        contact.kind === 'VENDOR' ? 'bg-orange-100' : 'bg-green-100'
                      )}>
                        <Icon className={cn('h-5 w-5', kindInfo?.color)} />
                      </div>
                      <div>
                        <h3 className="font-medium">{contact.name}</h3>
                        <p className="text-xs text-ink-mute">{kindInfo?.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(contact)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => handleDelete(contact.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
                    {contact.phone && (
                      <p className="flex items-center gap-1.5 text-ink-mute">
                        <Phone className="h-3.5 w-3.5" />
                        {contact.phone}
                      </p>
                    )}
                    {contact.shop_number && (
                      <p className="flex items-center gap-1.5 text-ink-mute">
                        <Building2 className="h-3.5 w-3.5" />
                        محل {contact.shop_number} {contact.floor && `· الطابق ${contact.floor}`}
                      </p>
                    )}
                    {contact.job_title && (
                      <p className="flex items-center gap-1.5 text-ink-mute">
                        <Briefcase className="h-3.5 w-3.5" />
                        {contact.job_title} {contact.department && `· ${contact.department}`}
                      </p>
                    )}
                    {contact.monthly_rent && (
                      <p className="flex items-center gap-1.5 text-ink-mute">
                        <DollarSign className="h-3.5 w-3.5" />
                        إيجار شهري: {contact.monthly_rent} د.ل
                      </p>
                    )}
                    {contact.salary && (
                      <p className="flex items-center gap-1.5 text-ink-mute">
                        <DollarSign className="h-3.5 w-3.5" />
                        راتب: {contact.salary} د.ل
                      </p>
                    )}
                    {contact.address && (
                      <p className="flex items-center gap-1.5 text-ink-mute">
                        <MapPin className="h-3.5 w-3.5" />
                        {contact.address}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'تعديل' : 'إضافة جديد'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* النوع */}
            <div>
              <Label>النوع</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {KIND_OPTIONS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, kind: k.value })}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md border text-sm',
                      formData.kind === k.value 
                        ? 'border-sage-500 bg-sage-50 text-sage-700' 
                        : 'border-border hover:bg-secondary'
                    )}
                  >
                    <k.icon className={cn('h-4 w-4', k.color)} />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            {/* الاسم */}
            <div>
              <Label>الاسم *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="الاسم الكامل"
              />
            </div>

            {/* بيانات التواصل */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> الهاتف
                </Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="09xxxxxxxx"
                />
              </div>
              <div>
                <Label>هاتف 2</Label>
                <Input
                  value={formData.phone2}
                  onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            {/* بيانات المستأجر */}
            {isTenant && (
              <div className="border rounded-md p-3 space-y-3 bg-blue-50/50">
                <p className="text-sm font-medium text-blue-700 flex items-center gap-1">
                  <Building2 className="h-4 w-4" /> بيانات المحل
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>رقم المحل</Label>
                    <Input
                      value={formData.shop_number}
                      onChange={(e) => setFormData({ ...formData, shop_number: e.target.value })}
                      placeholder="A-101"
                    />
                  </div>
                  <div>
                    <Label>الطابق</Label>
                    <Input
                      value={formData.floor}
                      onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, area_sqm: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> الإيجار الشهري
                    </Label>
                    <Input
                      type="number"
                      value={formData.monthly_rent}
                      onChange={(e) => setFormData({ ...formData, monthly_rent: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* بيانات الموظف */}
            {isEmployee && (
              <div className="border rounded-md p-3 space-y-3 bg-purple-50/50">
                <p className="text-sm font-medium text-purple-700 flex items-center gap-1">
                  <Briefcase className="h-4 w-4" /> بيانات وظيفية
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>المسمى الوظيفي</Label>
                    <Input
                      value={formData.job_title}
                      onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                      placeholder="أمين صندوق"
                    />
                  </div>
                  <div>
                    <Label>القسم</Label>
                    <Input
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* العنوان والملاحظات */}
            <div>
              <Label className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> العنوان
              </Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div>
              <Label>ملاحظات</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsAddOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" className="flex-1" disabled={createContact.isPending || updateContact.isPending}>
                {createContact.isPending || updateContact.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>{editingId ? 'تحديث' : 'حفظ'}</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
