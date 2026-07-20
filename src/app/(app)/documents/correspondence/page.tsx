'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Mail, Stamp, Loader2, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  useCorrespondenceLetters,
  useDeleteCorrespondenceLetter,
} from '@/lib/db/document-queries';
import { correspondenceRowToPdfModel } from '@/lib/correspondence-db';
import { formatDocumentPdfExportNames } from '@/lib/document-pdf-export';
import { usePermission } from '@/lib/supabase/use-permission';

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة',
  issued: 'صادرة',
  archived: 'مؤرشفة',
};

function CorrespondenceListContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type');
  const type =
    typeParam === 'official' || typeParam === 'routine' ? typeParam : undefined;

  const { can } = usePermission();
  const canEdit = can('document.update');
  const canDelete = can('document.delete');
  const { data: letters = [], isLoading, isError } = useCorrespondenceLetters(type);
  const deleteLetter = useDeleteCorrespondenceLetter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteTarget = letters.find((l) => l.id === deleteId);

  const title =
    type === 'official'
      ? 'المراسلات الرسمية'
      : type === 'routine'
        ? 'المراسلات الاعتيادية'
        : 'جميع المراسلات';

  async function confirmDelete() {
    if (!deleteId) return;
    await deleteLetter.mutateAsync(deleteId);
    setDeleteId(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="مركز الوثائق"
        title={title}
        description="إنشاء وتعديل وحذف الخطابات — وتصدير PDF"
        actions={
          <>
            <Button variant="outline" size="sm" asChild className="touch-manipulation">
              <Link href="/documents">العودة للمركز</Link>
            </Button>
            <Button size="sm" asChild className="touch-manipulation bg-sage-700 hover:bg-sage-800">
              <Link href={`/documents/correspondence/new${type ? `?type=${type}` : ''}`}>
                <Plus className="h-4 w-4 ml-1" />
                مراسلة جديدة
              </Link>
            </Button>
          </>
        }
      />

      <AccountingPageBody>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-red-600">
              تعذّر تحميل المراسلات. طبّق هجرة 058 على Supabase.
            </CardContent>
          </Card>
        ) : letters.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
              {type === 'official' ? (
                <Stamp className="h-10 w-10 opacity-40" />
              ) : (
                <Mail className="h-10 w-10 opacity-40" />
              )}
              <p className="text-sm">لا توجد مراسلات بعد</p>
              <Button asChild size="sm">
                <Link href={`/documents/correspondence/new${type ? `?type=${type}` : ''}`}>
                  إنشاء أول مراسلة
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {letters.map((row) => {
              const pdfModel = correspondenceRowToPdfModel(row);
              const kindEn = row.letter_type === 'official' ? 'official-letter' : 'routine-letter';
              const kindAr = row.letter_type === 'official' ? 'مراسلة رسمية' : 'مراسلة اعتيادية';
              const pdfExport = formatDocumentPdfExportNames({
                docKindAr: kindAr,
                docKindEn: kindEn,
                docNumber: row.letter_number,
                docDate: row.letter_date,
                recipientOrParty: row.recipient_name,
              });
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Link
                        href={`/documents/correspondence/${row.id}`}
                        className="font-bold text-sm hover:text-sage-800 hover:underline"
                      >
                        {row.subject}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_AR[row.status] ?? row.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.letter_number} · {row.letter_date} · إلى {row.recipient_name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canEdit ? (
                      <Button variant="outline" size="sm" asChild className="touch-manipulation">
                        <Link href={`/documents/correspondence/${row.id}`}>
                          <Pencil className="h-3.5 w-3.5 ml-1" />
                          تعديل
                        </Link>
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="touch-manipulation text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={deleteLetter.isPending}
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 ml-1" />
                        حذف
                      </Button>
                    ) : null}
                    <TajMallPdfToolbar
                      fileName={pdfExport.fileName}
                      shareTitle={pdfExport.shareTitle}
                      shareText={pdfExport.shareText}
                      render={async () => {
                        const { OfficialLetterPDF } = await import(
                          '@/features/pdf/OfficialLetterPDF'
                        );
                        return (
                          <OfficialLetterPDF
                            letter={{
                              ...pdfModel,
                              documentTitle: pdfExport.documentTitle,
                            }}
                          />
                        );
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AccountingPageBody>

      <Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف المراسلة</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف «{deleteTarget?.subject ?? 'هذه المراسلة'}»؟ لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLetter.isPending}
              onClick={() => void confirmDelete()}
            >
              {deleteLetter.isPending ? 'جاري الحذف…' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CorrespondencePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CorrespondenceListContent />
    </Suspense>
  );
}
