'use client';

import Link from 'next/link';
import {
  FileText,
  Mail,
  Receipt,
  FileSpreadsheet,
  ArrowDownToLine,
  Stamp,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { cn } from '@/lib/utils';
import { useCorrespondenceLetters, useReceiptVouchers } from '@/lib/db/document-queries';
import { useDisbursementVouchers } from '@/lib/db/queries';
import { useTenantCharges } from '@/lib/db/mall-queries';

type DocCard = {
  href: string;
  newHref?: string;
  titleAr: string;
  description: string;
  icon: typeof FileText;
  count?: number;
  featured?: boolean;
  tone?: 'default' | 'green';
};

export default function DocumentsHubPage() {
  const { data: letters = [] } = useCorrespondenceLetters();
  const { data: receipts = [] } = useReceiptVouchers();
  const { data: vouchers = [] } = useDisbursementVouchers();
  const { data: charges = [] } = useTenantCharges();

  const officialCount = letters.filter((l) => l.letter_type === 'official').length;
  const routineCount = letters.filter((l) => l.letter_type === 'routine').length;

  const cards: DocCard[] = [
    {
      href: '/documents/correspondence?type=official',
      newHref: '/documents/correspondence/new?type=official',
      titleAr: 'المراسلات الرسمية',
      description: 'خطابات رسمية بختم وتوقيع — PDF احترافي للجهات والمؤسسات',
      icon: Stamp,
      count: officialCount,
      featured: true,
      tone: 'green',
    },
    {
      href: '/documents/correspondence?type=routine',
      newHref: '/documents/correspondence/new?type=routine',
      titleAr: 'المراسلات الاعتيادية',
      description: 'مراسلات داخلية وخارجية غير رسمية',
      icon: Mail,
      count: routineCount,
    },
    {
      href: '/documents/invoices',
      titleAr: 'الفواتير والمطالبات',
      description: 'فواتير إيجار ورسوم المستأجرين — تصدير PDF',
      icon: FileSpreadsheet,
      count: charges.length,
    },
    {
      href: '/documents/receipts',
      newHref: '/documents/receipts/new',
      titleAr: 'إيصالات القبض',
      description: 'إثبات استلام مبالغ نقدية أو تحويل',
      icon: Receipt,
      count: receipts.length,
    },
    {
      href: '/vouchers',
      newHref: '/vouchers/new',
      titleAr: 'إذونات الصرف',
      description: 'إذن صرف معتمد — مرتبط بالخزائن والمحاسبة',
      icon: ArrowDownToLine,
      count: vouchers.length,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="الوثائق والمراسلات"
        title="مركز الوثائق"
        description="إنشاء وإدارة المراسلات والفواتير وإيصالات القبض وإذونات الصرف — تصدير PDF بجودة عالية"
      />

      <AccountingPageBody>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.href}
                className={cn(
                  'group relative overflow-hidden transition-shadow hover:shadow-md',
                  card.featured && 'border-sage-300/60 bg-gradient-to-br from-sage-50/80 to-card',
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl border',
                        card.tone === 'green'
                          ? 'border-sage-200 bg-sage-100 text-sage-800'
                          : 'border-border bg-muted/50 text-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {typeof card.count === 'number' ? (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                        {card.count}
                      </span>
                    ) : null}
                  </div>
                  <CardTitle className="text-base font-bold leading-snug pt-2">
                    {card.titleAr}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {card.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-0">
                  <Button asChild size="sm" className="touch-manipulation">
                    <Link href={card.href}>عرض الكل</Link>
                  </Button>
                  {card.newHref ? (
                    <Button asChild variant="outline" size="sm" className="touch-manipulation">
                      <Link href={card.newHref}>
                        <Plus className="h-3.5 w-3.5 ml-1" />
                        جديد
                      </Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </AccountingPageBody>
    </>
  );
}
