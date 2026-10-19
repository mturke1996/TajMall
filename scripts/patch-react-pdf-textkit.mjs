// يصلح خطأً في @react-pdf/textkit 6.3.0 يُسقط حروفاً من النص العربي في ملفات PDF:
// عند تكرار الرابط نفسه (لا، لأ، لإ، لآ) في سطر واحد يُرسم مرة واحدة فقط، فتظهر
// «الفلاتر» هكذا «الفتر» وتسقط «لا» من الجملة. الإصلاح يتعرّف على الرابط بموضعه
// داخل المقطع لا برقم الشكل. يعمل بعد npm install ولا يفشل التثبيت إن تغيّر الملف.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'node_modules/@react-pdf/textkit/lib/textkit.js')
const MARKER = 'getGlyphPositionAtIndex'

const helper = `const getGlyphPositionAtIndex = (runs, index) => {
    for (let i = 0; i < runs.length; i += 1) {
        const run = runs[i];
        if (index >= run.start && index < run.end) {
            return \`\${i}:\${run.stringIndices[index - run.start]}\`;
        }
    }
    return \`\${index}\`;
};
`

const before = `const reorderLine = (line) => {`
const loopOld = `            const glyph = getItemAtIndex(line.runs, 'glyphs', index);
            if (addedGlyphs.has(glyph.id))
                continue;
            updatedGlyphs.push(glyph);
            updatedPositions.push(getItemAtIndex(line.runs, 'positions', index));
            if (glyph.isLigature) {
                addedGlyphs.add(glyph.id);
            }`
const loopNew = `            const glyph = getItemAtIndex(line.runs, 'glyphs', index);
            // a ligature is reached once per character it covers: skip the repeats of THIS glyph (its place in the run), not every glyph with the same id
            const place = getGlyphPositionAtIndex(line.runs, index);
            if (addedGlyphs.has(place))
                continue;
            updatedGlyphs.push(glyph);
            updatedPositions.push(getItemAtIndex(line.runs, 'positions', index));
            if (glyph.isLigature) {
                addedGlyphs.add(place);
            }`

if (!existsSync(file)) {
  console.log('patch-react-pdf-textkit: الحزمة غير مثبتة، تم التخطي')
  process.exit(0)
}
const source = readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('patch-react-pdf-textkit: مطبّق مسبقاً')
  process.exit(0)
}
if (!source.includes(before) || !source.includes(loopOld)) {
  console.warn('patch-react-pdf-textkit: تغيّر ملف textkit فلم يُطبَّق الإصلاح (راجع الإصدار)')
  process.exit(0)
}
writeFileSync(file, source.replace(before, helper + before).replace(loopOld, loopNew))
console.log('patch-react-pdf-textkit: تم تطبيق إصلاح روابط الحروف')
