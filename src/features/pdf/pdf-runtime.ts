import type { ReactElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { registerPdfFonts } from './pdfFonts';
import { prepareTajMallPdfTree } from './prepare-taj-mall-pdf-tree';

/** Isolated lazy-loaded runtime so the renderer and its font registry share one module instance. */
export async function renderPdfBlobWithRuntime(
  render: () => Promise<ReactElement>,
): Promise<Blob> {
  registerPdfFonts();
  const wrapped = await prepareTajMallPdfTree(await render());
  const instance = pdf();
  instance.updateContainer(wrapped);
  return instance.toBlob();
}
