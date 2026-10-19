// يتحقق أن ملف PDF لا يُسقط حروفاً عند تكرار رابط الحروف (لا) في السطر نفسه.
// يشغَّل بعد npm install لأن الإصلاح يُطبَّق من scripts/patch-react-pdf-textkit.mjs.
import React from 'react'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts'
import { Document, Page, Text } from '@react-pdf/renderer'
import { registerPdfFonts, PDF_FONT_FAMILY } from '../src/features/pdf/pdfFonts.ts'

const patched = readFileSync('node_modules/@react-pdf/textkit/lib/textkit.js', 'utf8').includes('getGlyphPositionAtIndex')
if (!patched) {
  console.error('FAIL: إصلاح textkit غير مطبّق — شغّل: node scripts/patch-react-pdf-textkit.mjs')
  process.exit(1)
}
console.log('OK   إصلاح textkit مطبّق')

const probe = spawnSync('pdftotext', ['-v'])
if (probe.error) {
  console.log('SKIP فحص النص المرسوم (pdftotext غير متوفر)')
  process.exit(0)
}

registerPdfFonts()
const LINES = ['الفلاتر الجديدة', 'لا بأس بالفلاتر', 'لا يوجد لا مانع ولا مشكلة']
const doc = React.createElement(
  Document,
  null,
  React.createElement(
    Page,
    { size: 'A4', style: { padding: 40, fontFamily: PDF_FONT_FAMILY, fontSize: 14 } },
    ...LINES.map((t, i) => React.createElement(Text, { key: i, style: { direction: 'rtl', textAlign: 'right', marginBottom: 8 } }, t)),
  ),
)
const blob = await renderPdfBlob(async () => doc)
const dir = mkdtempSync(path.join(tmpdir(), 'pdf-text-'))
const file = path.join(dir, 'probe.pdf')
writeFileSync(file, Buffer.from(await blob.arrayBuffer()))
const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' })
const letters = (s) => [...s.replace(/[^\u0621-\u064A]/g, '')].sort().join('')
// pdftotext يفكّ رابط (لا) إلى حرفين، فنقارن مجموع الحروف لا ترتيبها: إن سقط رابط نقص العدد
const want = letters(LINES.join(' '))
const got = letters(text)
const ok = want === got
console.log(`${ok ? 'OK  ' : 'FAIL'} عدد الحروف المرسومة ${got.length} من ${want.length}`)
process.exit(ok ? 0 : 1)
