'use client';

import { useState } from 'react';
import { Copy, Link2, Loader2, MessageCircle, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEnsureTenantPortalToken, tenantPortalUrl } from '@/lib/db/tenant-portal';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { toast } from 'sonner';

/**
 * رابط بوابة ذاتية للمستأجر — الرمز يُجلب عبر RPC آمن فقط.
 */
export function TenantPortalLinkCard({
  contactId,
  contactName,
  phone,
}: {
  contactId: string;
  contactName: string;
  phone: string | null;
}) {
  const ensureToken = useEnsureTenantPortalToken();
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const link = token ? tenantPortalUrl(token) : null;

  function handleGenerate() {
    ensureToken.mutate(
      { contactId },
      {
        onSuccess: (t) => setToken(t),
        onError: (e) =>
          toast.error('تعذّر توليد الرابط', {
            description: e instanceof Error ? e.message : undefined,
          }),
      },
    );
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success('تم نسخ الرابط');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendWhatsApp() {
    if (!link || !phone) return;
    const message = `السيد/ة ${contactName}،\n\nهذا رابطك الخاص لمتابعة ذمم الإيجار وسجل السداد لدى تاج مول:\n${link}\n\nالرابط خاص بك فقط — لا تشاركه مع أحد.`;
    const wa = buildWhatsAppLink(phone, message);
    if (wa) window.open(wa, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-sage-700" />
        <h3 className="text-[13px] font-semibold">بوابة المستأجر الذاتية</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-mute">
        رابط خاص يتيح للمستأجر متابعة ذمّته وسجل سداده دون حساب دخول. لا يعرض أي بيانات أخرى في
        النظام. يظهر الرمز فقط بعد توليده من هنا (صلاحية مدير/محاسب).
      </p>

      {!link ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={ensureToken.isPending}
          onClick={handleGenerate}
        >
          {ensureToken.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          عرض / توليد الرابط
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="truncate rounded-md border border-border bg-canvas-sunken px-2.5 py-1.5 font-mono text-[11px] text-ink-mute"
            dir="ltr"
          >
            {link}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              نسخ
            </Button>
            {phone && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-emerald-700 hover:bg-emerald-50"
                onClick={handleSendWhatsApp}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                إرسال واتساب
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
