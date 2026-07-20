'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { OfficialLetterPDF } from '@/features/pdf/OfficialLetterPDF';
import {
  useCorrespondenceLetter,
  useDeleteCorrespondenceLetter,
  useUpdateCorrespondenceLetter,
} from '@/lib/db/document-queries';
import { formatDocumentPdfExportNames } from '@/lib/document-pdf-export';
import type { CorrespondenceLetterType } from '@/lib/db/types';
import { usePermission } from '@/lib/supabase/use-permission';

export default function CorrespondenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { can } = usePermission();
  const canEdit = can('document.update');
  const canDelete = can('document.delete');
  const { data: row, isLoading, isError } = useCorrespondenceLetter(id);
  const updateLetter = useUpdateCorrespondenceLetter();
  const deleteLetter = useDeleteCorrespondenceLetter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [letterType, setLetterType] = useState<CorrespondenceLetterType>('official');
  const [number, setNumber] = useState('');
  const [letterDate, setLetterDate] = useState('');
  const [subject, setSubject] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientTitle, setRecipientTitle] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'draft' | 'issued' | 'archived'>('draft');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!row || hydrated) return;
    setLetterType(row.letter_type);
    setNumber(row.letter_number);
    setLetterDate(row.letter_date);
    setSubject(row.subject);
    setRecipientName(row.recipient_name);
    setRecipientTitle(row.recipient_title ?? '');
    setReferenceNumber(row.reference_number ?? '');
    setBody(row.body);
    setStatus(row.status);
    setHydrated(true);
  }, [row, hydrated]);

  const previewModel = useMemo(
    () => ({
      number: number || '—',
      letterDate: `${letterDate || row?.letter_date}T12:00:00.000Z`,
      letterType,
      letterTypeAr: letterType === 'official' ? 'مراسلة رسمية' : 'مراسلة اعتيادية',
      subject: subject || '—',
      recipientName: recipientName || '—',
      recipientTitle: recipientTitle || undefined,
      body: body || '—',
      referenceNumber: referenceNumber || undefined,
      status,
    }),
    [number, letterDate, letterType, subject, recipientName, recipientTitle, body, referenceNumber, status, row?.letter_date],
  );

  const pdfExport = useMemo(
    () =>
      formatDocumentPdfExportNames({
        docKindAr: previewModel.letterTypeAr,
        docKindEn: letterType === 'official' ? 'official-letter' : 'routine-letter',
        docNumber: number || 'draft',
        docDate: letterDate,
        recipientOrParty: recipientName,
      }),
    [previewModel.letterTypeAr, letterType, number, letterDate, recipientName],
  );

  async function handleSave() {
    if (!id || !canEdit) return;
    await updateLetter.mutateAsync({
      id,
      letter_number: number,
      letter_date: letterDate,
      letter_type: letterType,
      subject,
      recipient_name: recipientName,
      recipient_title: recipientTitle,
      body,
      reference_number: referenceNumber,
      status,
    });
  }

  async function handleDelete() {
    if (!id || !canDelete) return;
    await deleteLetter.mutateAsync(id);
    setConfirmDelete(false);
    router.push(`/documents/correspondence?type=${letterType}`);
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !row) {
    return (
      <AccountingPageBody>
        <Card className="p-8 text-center text-sm text-red-600">
          لم تُعثر على المراسلة أو تعذّر التحميل.
          <Button variant="link" asChild className="block mx-auto mt-2">
            <Link href="/documents/correspondence">العودة للقائمة</Link>
          </Button>
        </Card>
      </AccountingPageBody>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title={subject || 'تفاصيل المراسلة'}
        description={`${row.letter_number} · ${row.letter_date}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/documents/correspondence?type=${letterType}`}>
                <ArrowRight className="h-4 w-4 ml-1" />
                رجوع
              </Link>
            </Button>
            <TajMallPdfToolbar
              fileName={pdfExport.fileName}
              shareTitle={pdfExport.shareTitle}
              shareText={pdfExport.shareText}
              render={async () => (
                <OfficialLetterPDF
                  letter={{ ...previewModel, documentTitle: pdfExport.documentTitle }}
                />
              )}
            />
            {canDelete ? (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={deleteLetter.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 ml-1" />
                حذف
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                size="sm"
                className="bg-sage-700 hover:bg-sage-800"
                disabled={updateLetter.isPending}
                onClick={() => void handleSave()}
              >
                <Save className="h-4 w-4 ml-1" />
                حفظ التعديلات
              </Button>
            ) : null}
          </>
        }
      />

      <AccountingPageBody>
        <Card className="p-4 sm:p-6 space-y-5 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>نوع المراسلة</Label>
              <Select
                value={letterType}
                onValueChange={(v) => setLetterType(v as CorrespondenceLetterType)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">رسمية</SelectItem>
                  <SelectItem value="routine">اعتيادية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as 'draft' | 'issued' | 'archived')}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="issued">صادرة</SelectItem>
                  <SelectItem value="archived">مؤرشفة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="num">رقم المراسلة</Label>
              <Input
                id="num"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                dir="ltr"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                dir="ltr"
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="subject">الموضوع</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">إلى</Label>
              <Input
                id="to"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">الصفة</Label>
              <Input
                id="title"
                value={recipientTitle}
                onChange={(e) => setRecipientTitle(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ref">مرجع</Label>
              <Input
                id="ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                dir="ltr"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="body">النص</Label>
              <Textarea
                id="body"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[220px] leading-relaxed"
                disabled={!canEdit}
              />
            </div>
          </div>
        </Card>
      </AccountingPageBody>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف المراسلة</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف «{subject || row.subject}»؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLetter.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteLetter.isPending ? 'جاري الحذف…' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
