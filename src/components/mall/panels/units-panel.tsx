'use client';

import { useState } from 'react';
import {
  Store,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
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
  useMallUnits,
  useCreateMallUnit,
  useUpdateMallUnit,
  useDeleteMallUnit,
} from '@/lib/db/mall-queries';
import type { MallUnitRow } from '@/lib/db/types';

export function MallUnitsPanel() {
  const { data: units = [], isLoading, isError, error } = useMallUnits();
  const createUnit = useCreateMallUnit();
  const updateUnit = useUpdateMallUnit();
  const deleteUnit = useDeleteMallUnit();

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

  const handleDelete = async (id: string, unitNumber: string) => {
    if (!confirm(`هل أنت متأكد من حذف المحل رقم ${unitNumber}؟`)) return;
    await deleteUnit.mutateAsync(id);
  };

  const getStatusBadge = (s: MallUnitRow['status']) => {
    const configs = {
      AVAILABLE: { label: 'متاح للإيجار', className: 'border-green-200 bg-green-50 text-green-700' },
      OCCUPIED: { label: 'مؤجر', className: 'border-blue-200 bg-blue-50 text-blue-700' },
      MAINTENANCE: { label: 'تحت الصيانة', className: 'border-yellow-200 bg-yellow-50 text-yellow-700' },
    };
    const c = configs[s] || configs.AVAILABLE;
    return (
      <Badge variant="outline" className={`${c.className} font-medium`}>
        {c.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <MallPanelToolbar>
        <Button
          onClick={handleOpenCreate}
          className="h-11 gap-2 bg-sage-700 hover:bg-sage-800 text-white touch-manipulation md:h-9"
        >
          <Plus className="h-4 w-4" />
          إضافة محل جديد
        </Button>
      </MallPanelToolbar>

      {/* Grid of Units */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : isError ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
          <AlertTriangle className="h-8 w-8" />
          <p className="font-semibold">فشل تحميل الوحدات</p>
          <p className="text-sm text-red-500">{(error as any)?.message}</p>
        </div>
      ) : units.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-slate-400">
          <Store className="h-12 w-12 mb-2 opacity-50 text-slate-400" />
          <p className="font-medium text-slate-600">لا توجد محلات تجارية مسجلة بعد</p>
          <Button onClick={handleOpenCreate} variant="link" className="text-emerald-700 font-bold">
            اضغط هنا لإضافة أول محل
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {units.map((unit) => (
            <Card key={unit.id} className="relative hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <span className="text-xs text-slate-400 font-mono">الدور {unit.floor}</span>
                    <CardTitle className="text-lg font-bold text-slate-900">محل {unit.unit_number}</CardTitle>
                  </div>
                  {getStatusBadge(unit.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">المساحة:</span>
                  <span className="font-mono font-bold text-slate-800">{unit.area_sqm} م²</span>
                </div>
                {unit.notes && (
                  <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded flex gap-1.5 items-start">
                    <Info className="h-3.5 w-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
                    <p className="line-clamp-2">{unit.notes}</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:text-slate-700"
                    onClick={() => handleOpenEdit(unit)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  {unit.status !== 'OCCUPIED' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(unit.id, unit.unit_number)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">متاح للإيجار</SelectItem>
                  <SelectItem value="OCCUPIED">مؤجر (نشط)</SelectItem>
                  <SelectItem value="MAINTENANCE">تحت الصيانة</SelectItem>
                </SelectContent>
              </Select>
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
              <Button type="submit" disabled={isSubmitting} className="bg-emerald-700 hover:bg-emerald-800 text-white">
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
