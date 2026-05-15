'use client';

import { Building2, Loader2, Phone, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBranches } from '@/lib/db/queries';
import { EmptyState } from '@/components/data/empty-state';

export default function BranchesPage() {
  const { data: branches = [], isLoading, isError } = useBranches();

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="الفروع"
        description="الفروع المسجلة في قاعدة البيانات مع رمز الفرع وحالة المركز الرئيسي."
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" aria-hidden />
          </div>
        ) : isError ? (
          <p className="text-center text-sm text-destructive">تعذّر تحميل بيانات الفروع. تحقق من الاتصال أو الصلاحيات.</p>
        ) : branches.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="لا توجد فروع"
            description="لم يتم العثور على فروع نشطة. تأكد من تشغيل ترحيل قاعدة البيانات الأولية أو أضف فروعاً من لوحة Supabase."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <Card key={b.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-mute">{b.code}</p>
                      <p className="font-semibold text-foreground">{b.name_ar ?? b.name}</p>
                    </div>
                    {b.is_hq ? (
                      <Badge variant="success" className="shrink-0">
                        المركز الرئيسي
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-ink-mute">
                        فرع
                      </Badge>
                    )}
                  </div>
                  {(b.address || b.phone) && (
                    <div className="space-y-1.5 text-sm text-ink-mute">
                      {b.address ? (
                        <p className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>{b.address}</span>
                        </p>
                      ) : null}
                      {b.phone ? (
                        <p className="flex items-center gap-2">
                          <Phone className="h-4 w-4 shrink-0" aria-hidden />
                          <span dir="ltr">{b.phone}</span>
                        </p>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
