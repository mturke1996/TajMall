/** الرابط الرسمي للمنظومة على الإنتاج — لا تستخدم localhost في روابط البريد. */
export const PRODUCTION_APP_URL = 'https://taj-mall-nu.vercel.app';

function isLocalhostHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/**
 * Origin لروابط المصادقة (استعادة كلمة المرور، دعوات، إلخ).
 * يفضّل NEXT_PUBLIC_APP_URL، ثم origin المتصفح (إن لم يكن localhost)،
 * ثم PRODUCTION_APP_URL — لا يُرجع localhost أبداً في روابط البريد.
 */
export function getAuthRedirectOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    try {
      const host = new URL(fromEnv).hostname;
      if (!isLocalhostHost(host)) return normalizeOrigin(fromEnv);
    } catch {
      if (!fromEnv.includes('localhost') && !fromEnv.includes('127.0.0.1')) {
        return normalizeOrigin(fromEnv);
      }
    }
  }

  if (typeof window !== 'undefined') {
    const origin = normalizeOrigin(window.location.origin);
    try {
      if (!isLocalhostHost(new URL(origin).hostname)) return origin;
    } catch {
      /* fall through */
    }
  }

  return PRODUCTION_APP_URL;
}
