import { createSupabaseBrowserClient } from './client';

export type ChangePasswordInput = {
  email: string;
  currentPassword: string;
  newPassword: string;
};

/** يتحقق من كلمة المرور الحالية ثم يحدّثها للمستخدم المسجّل. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const supabase = createSupabaseBrowserClient();

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.currentPassword,
  });
  if (verifyError) {
    throw new Error(mapAuthError(verifyError.message, 'current'));
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (updateError) {
    throw new Error(mapAuthError(updateError.message, 'new'));
  }
}

function mapAuthError(message: string, field: 'current' | 'new'): string {
  const m = message.toLowerCase();
  if (/invalid login credentials/i.test(m)) {
    return 'كلمة المرور الحالية غير صحيحة.';
  }
  if (/same password/i.test(m)) {
    return 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.';
  }
  if (/password should be at least/i.test(m) || /at least 6/i.test(m) || /at least 10/i.test(m)) {
    return 'كلمة المرور الجديدة يجب أن تكون 10 أحرف على الأقل.';
  }
  if (/weak password/i.test(m)) {
    return 'كلمة المرور ضعيفة — اختر كلمة أقوى.';
  }
  if (/session/i.test(m) && field === 'new') {
    return 'انتهت الجلسة — سجّل الدخول مجدداً ثم حاول.';
  }
  return field === 'current'
    ? 'تعذّر التحقق من كلمة المرور الحالية.'
    : message || 'تعذّر تحديث كلمة المرور.';
}
