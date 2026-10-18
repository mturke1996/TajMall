/**
 * What people see when something fails. Backend text ("no rows", "function … does not exist", SQLSTATE
 * codes) and setup instructions (migration numbers) mean nothing to an accountant: say what happened
 * and what to do; the technical detail stays available behind «تفاصيل تقنية» and in the console.
 */

/** The database is missing a function or table this screen needs. */
export const NEEDS_DB_UPDATE = 'تحتاج قاعدة البيانات إلى تحديث لتفعيل هذه الميزة — أبلغ مسؤول النظام.';

export const NO_PERMISSION = 'لا تملك صلاحية لهذا الإجراء — اطلب من المدير تعديل دورك.';

const GENERIC = 'حدث خطأ أثناء التحميل. أعد المحاولة، وإن تكرر أبلغ مسؤول النظام.';

type ErrorLike = { message?: unknown; code?: unknown; details?: unknown };

export function technicalDetail(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as ErrorLike;
  return [e.code, e.message, e.details].filter((v) => typeof v === 'string' && v).join(' — ');
}

/** One plain sentence for a failed load or save. */
export function friendlyError(err: unknown, fallback = GENERIC): string {
  const e = (err ?? {}) as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const msg = (typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : '').toLowerCase();
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(code) || /does not exist|could not find the (function|table)/.test(msg)) {
    return NEEDS_DB_UPDATE;
  }
  if (code === '42501' || /permission denied|row-level security/.test(msg)) return NO_PERMISSION;
  if (/jwt|session/.test(msg)) return 'انتهت الجلسة — سجّل الدخول مرة أخرى.';
  if (/failed to fetch|network|timeout/.test(msg)) return 'تعذّر الاتصال بالخادم — تحقق من الإنترنت ثم أعد المحاولة.';
  return fallback;
}
