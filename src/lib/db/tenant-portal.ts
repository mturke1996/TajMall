'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/** رمز عشوائي طويل (32 حرفاً hex) — لا يمكن تخمينه، لا يحتاج تسجيل دخول. */
function generatePortalToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function tenantPortalUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base.replace(/\/$/, '')}/portal/${token}`;
}

/** يولّد (أو يعيد) رمز البوابة الذاتية لمستأجر — يُخزَّن مرة واحدة. */
export function useEnsureTenantPortalToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contactId: string; existingToken: string | null }) => {
      if (input.existingToken) return input.existingToken;

      const supabase = createSupabaseBrowserClient();
      const token = generatePortalToken();
      const { error } = await supabase
        .from('contacts')
        .update({ portal_token: token })
        .eq('id', input.contactId);
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      // مطابقة جزئية تشمل كل مفاتيح contacts (بأي kind).
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
