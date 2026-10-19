'use client';

/**
 * The bar of presets above a report's options: three ready-made ones, the person's own saved ones (apply
 * with a press, delete with ×), and «حفظ كإعداد», which names and stores the options as they are now.
 */
import { useId, useRef, useState, type FormEvent } from 'react';
import { Bookmark, Check, X } from 'lucide-react';
import { IconTile } from '@/components/dashboard/dashboard-ui';
import { Button } from '@/components/ui/button';
import { PRESET_NAME_MAX, describeOptions, type ReportPreset } from '@/lib/report-options';
import { cn } from '@/lib/utils';
import { ChipButton, FIELD_CLASS } from './option-ui';

export function PresetsBar({
  builtIn,
  saved,
  activeId,
  persisted,
  onApply,
  onDelete,
  onSave,
}: {
  builtIn: ReportPreset[];
  saved: ReportPreset[];
  /** the preset whose options are the current ones, if any */
  activeId: string | null;
  /** false when the browser would not store them (they last for this visit only) */
  persisted: boolean;
  onApply: (preset: ReportPreset) => void;
  onDelete: (preset: ReportPreset) => void;
  /** returns an error message to show, or null when saved */
  onSave: (name: string) => string | null;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = onSave(name);
    if (err) {
      setError(err);
      return;
    }
    setNaming(false);
    setName('');
    setError(null);
    // the form is gone: focus goes back to the button that opened it
    requestAnimationFrame(() => openerRef.current?.focus());
  };
  const cancel = () => {
    setNaming(false);
    setName('');
    setError(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  };

  return (
    <section aria-label="إعدادات جاهزة ومحفوظة" className="rounded-xl border border-border bg-card px-3.5 py-3.5 sm:px-4">
      <div className="flex items-center gap-3">
        <IconTile icon={Bookmark} accent="violet" className="h-9 w-9 rounded-lg" />
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">إعدادات جاهزة</h3>
        {naming ? null : (
          <Button ref={openerRef} type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setNaming(true)}>
            حفظ كإعداد
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="الإعدادات">
        {builtIn.map((p) => (
          <ChipButton key={p.id} selected={activeId === p.id} onClick={() => onApply(p)} title={describeOptions(p.options)}>
            {p.name}
          </ChipButton>
        ))}
        {saved.map((p) => {
          const on = activeId === p.id;
          return (
            <span
              key={p.id}
              className={cn(
                'inline-flex items-center overflow-hidden rounded-full border text-[13px] font-medium',
                on ? 'border-info-ink bg-info-soft text-info-ink' : 'border-border bg-card text-ink-soft',
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                title={describeOptions(p.options)}
                onClick={() => onApply(p)}
                className="inline-flex min-h-11 items-center gap-1.5 ps-3.5 pe-1 hover:bg-canvas-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:min-h-8 sm:ps-3"
              >
                {on ? <Check className="size-3.5" aria-hidden /> : null}
                <span className="max-w-40 truncate">{p.name}</span>
              </button>
              <button
                type="button"
                aria-label={`حذف الإعداد ${p.name}`}
                onClick={() => onDelete(p)}
                className="grid size-11 place-items-center text-ink-mute hover:bg-canvas-sunken hover:text-danger-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:size-8"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          );
        })}
      </div>

      {naming ? (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2" noValidate>
          <label htmlFor={inputId} className="text-[12.5px] font-medium text-ink-soft">
            اسم الإعداد
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1 basis-48">
              <input
                id={inputId}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                maxLength={PRESET_NAME_MAX}
                autoFocus
                autoComplete="off"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                placeholder="مثال: كشف المحاسب الشهري"
                className={cn(FIELD_CLASS, 'w-full rounded-md border border-border bg-card px-3 text-foreground placeholder:text-ink-mute/70 focus-visible:border-ring/60 focus-visible:shadow-focus focus-visible:outline-hidden', error && 'border-danger')}
              />
              {error ? (
                <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-[12.5px] text-danger-ink">
                  {error}
                </p>
              ) : null}
            </div>
            <Button type="submit" className="min-h-11 sm:min-h-9">
              حفظ
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={cancel}>
              إلغاء
            </Button>
          </div>
        </form>
      ) : null}

      {!persisted ? (
        <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-warning-ink">
          المتصفح لا يسمح بالحفظ هنا، فتبقى الإعدادات إلى أن تغلق هذه الصفحة.
        </p>
      ) : null}
    </section>
  );
}
