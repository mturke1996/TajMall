'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword } from '@/lib/supabase/change-password';
import { toast } from 'sonner';

type Props = {
  email: string;
};

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
        <KeyRound className="h-3.5 w-3.5 text-ink-mute" />
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={10}
          className="min-h-11 pe-10 touch-manipulation"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-mute hover:bg-secondary hover:text-foreground"
          aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm({ email }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currentPassword.trim()) {
      setError('أدخل كلمة المرور الحالية.');
      return;
    }
    if (newPassword.length < 10) {
      setError('كلمة المرور الجديدة يجب أن تكون 10 أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تأكيد كلمة المرور لا يطابق الجديدة.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('كلمة المرور الجديدة يجب أن تختلف عن الحالية.');
      return;
    }

    setSaving(true);
    try {
      await changePassword({ email, currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('تم تغيير كلمة المرور بنجاح');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذّر تغيير كلمة المرور.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasswordInput
        id="current-password"
        label="كلمة المرور الحالية"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        placeholder="••••••••"
      />
      <PasswordInput
        id="new-password"
        label="كلمة المرور الجديدة"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        placeholder="10 أحرف على الأقل"
      />
      <PasswordInput
        id="confirm-password"
        label="تأكيد كلمة المرور الجديدة"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        placeholder="أعد إدخال كلمة المرور"
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button
        type="submit"
        disabled={saving}
        variant="outline"
        className="w-full min-h-11 gap-2 touch-manipulation sm:w-auto"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        تغيير كلمة المرور
      </Button>
      <p className="text-[11px] text-ink-mute">
        لا تتذكر كلمة المرور الحالية؟{' '}
        <a href="/login/forgot-password" className="text-sage-700 underline underline-offset-2">
          استعدها من صفحة الدخول
        </a>{' '}
        (بدون الحاجة للكلمة القديمة).
      </p>
    </form>
  );
}
