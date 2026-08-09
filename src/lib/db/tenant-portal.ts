'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PRODUCTION_APP_URL } from '@/lib/app-url';

/** رابط مطلق لبوابة المستأجر (مشاركة/واتساب). */
export function tenantPortalUrl(token: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fromWindow =
    typeof window !== 'undefined' ? window.location.origin : '';
  const base = (fromEnv || fromWindow || PRODUCTION_APP_URL).replace(/\/$/, '');
  return `${base}/portal/${token}`;
}

/**
 * يولّد (أو يعيد) رمز البوابة عبر SECURITY DEFINER RPC —
 * لا يُعرض portal_token في استعلامات contacts العامة.
 */
export function useEnsureTenantPortalToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contactId: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('ensure_tenant_portal_token', {
        p_contact_id: input.contactId,
      });
      if (error) throw error;
      if (!data || typeof data !== 'string') {
        throw new Error('لم يُرجع الخادم رمز بوابة صالحاً');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
