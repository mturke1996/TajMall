'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Save } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
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
import { useCreateCorrespondenceLetter } from '@/lib/db/document-queries';
import {
  formatDocumentPdfExportNames,
  formatSuggestedDocNumber,
} from '@/lib/document-pdf-export';
import type { CorrespondenceLetterType } from '@/lib/db/types';
import { toast } from 'sonner';

function NewCorrespondenceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType: CorrespondenceLetterType =
    searchParams.get('type') === 'routine' ? 'routine' : 'official';

  const createLetter = useCreateCorrespondenceLetter();
  const [letterType, setLetterType] = useState<CorrespondenceLetterType>(initialType);
  const [number, setNumber] = useState(() =>
    formatSuggestedDocNumber(initialType === 'official' ? 'OFF' : 'RTN', 1),
  );
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientTitle, setRecipientTitle] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'draft' | 'issued'>('draft');

  const previewModel = useMemo(
    () => ({
      number: number || '—',
      letterDate: `${letterDate}T12:00:00.000Z`,
      letterType,
      letterTypeAr: letterType === 'official' ? 'مراسلة رسمية' : 'مراسلة اعتيادية',
      subject: subject || '—',
      recipientName: recipientName || '—',
      recipientTitle: recipientTitle || undefined,
      body: body || '—',
      referenceNumber: referenceNumber || undefined,
      status,
    }),
    [number, letterDate, letterType, subject, recipientName, recipientTitle, body, referenceNumber, status],
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
    if (!number.trim()) {
      toast.error('أدخل رقم المراسلة');
      return;
    }
    if (!subject.trim() || !recipientName.trim() || !body.trim()) {
      toast.error('أكمل الموضوع والمستلم ونص المراسلة');
      return;
    }
    const row = await createLetter.mutateAsync({
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
    router.push(`/documents/correspondence/${row.id}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title="مراسلة جديدة"
        description="معاينة PDF مباشرة قبل الحفظ"
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
            <Button
              size="sm"
              className="bg-sage-700 hover:bg-sage-800 touch-manipulation"
              disabled={createLetter.isPending}
              onClick={() => void handleSave()}
            >
              <Save className="h-4 w-4 ml-1" />
              {createLetter.isPending ? 'جاري الحفظ…' : 'حفظ المراسلة'}
            </Button>
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
              <Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'issued')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="issued">صادرة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="num">رقم المراسلة</Label>
              <Input id="num" value={number} onChange={(e) => setNumber(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                dir="ltr"
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="subject">الموضوع</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">إلى (الاسم)</Label>
              <Input id="to" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">الصفة / الجهة</Label>
              <Input
                id="title"
                value={recipientTitle}
                onChange={(e) => setRecipientTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ref">رقم مرجعي</Label>
              <Input
                id="ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="body">نص المراسلة</Label>
              <Textarea
                id="body"
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="اكتب فقرات المراسلة — كل فقرة في سطر جديد"
                className="min-h-[200px] leading-relaxed"
              />
            </div>
          </div>
        </Card>
      </AccountingPageBody>
    </>
  );
}

export default function NewCorrespondencePage() {
  return (
    <Suspense fallback={null}>
      <NewCorrespondenceContent />
    </Suspense>
  );
}
