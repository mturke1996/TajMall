'use client';

import type { ReactElement } from 'react';
import { fetchBrandLogoDataUri } from './fetch-brand-logo-data-uri';
import { PdfLogoProvider } from './pdf-logo-context';

/** يجلب الشعار ثم يلف مستند PDF ليقرأه PdfLogoMark من السياق. */
export async function prepareFluxenPdfTree(element: ReactElement): Promise<ReactElement> {
  const uri = await fetchBrandLogoDataUri();
  return <PdfLogoProvider uri={uri}>{element}</PdfLogoProvider>;
}
