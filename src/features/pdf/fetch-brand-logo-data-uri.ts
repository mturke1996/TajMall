import { BRAND } from '@/lib/brand';

/** يُحمَّل الشعار كـ data URI لأن @react-pdf/renderer لا يعتمد على جلب HTTP الموثوق للصور في المتصفح. */
export async function fetchBrandLogoDataUri(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const url = `${window.location.origin}${BRAND.logoSrc}`;
    const res = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
