// @ts-nocheck
import { Font } from '@react-pdf/renderer';

/**
 * Register the Arabic-capable display font for @react-pdf/renderer.
 *
 * Cairo handles the Arabic Presentation Forms B (FE70-FEFF) range used by
 * our reshaper in `arabicPDF.ts`. We bundle the TTFs in /public/fonts so
 * they're served from the same origin (no CORS).
 *
 * IMPORTANT: This module must only be imported on the client side.
 * react-pdf font registration touches `Font` (which expects a browser).
 */

let registered = false;

export const PDF_FONT_FAMILY = 'Cairo';

export function registerPdfFonts() {
  if (registered) return;
  if (typeof window === 'undefined') return; // SSR-safe no-op

  const origin = window.location.origin;

  Font.register({
    family: 'Cairo',
    fonts: [
      { src: `${origin}/fonts/Cairo-Regular.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/Cairo-Bold.ttf`, fontWeight: 700 },
    ],
  });

  // Disable @react-pdf's automatic hyphenation — it breaks Arabic shaping.
  Font.registerHyphenationCallback((word: string) => [word]);

  registered = true;
}
