/**
 * Minimal, dependency-free ZIP reader for the cold-backup archives.
 *
 * Why not `tar -xf`: GNU tar (Linux) cannot read ZIP files, and extracting to disk exposes the restore tool
 * to "zip slip" names. This reader keeps every entry in memory, never touches the file system, and checks
 * what a disaster-recovery tool must check: bounds, sizes, CRC-32, duplicate names, encryption, ZIP64.
 *
 * Supports stored (0) and deflate (8) entries, which is all the Rust `zip` writer produces.
 */
import { inflateRawSync } from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE), the checksum ZIP stores per entry. */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipError';
  }
}

/** An entry name that could escape a directory, or that is not a plain relative path. */
function unsafeName(name) {
  return (
    name.length === 0 ||
    name.length > 512 ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    name.split('/').some((part) => part === '..')
  );
}

function findEndOfCentralDirectory(buf) {
  // 22 bytes fixed + up to 65535 bytes of archive comment
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= lowest; i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      const commentLength = buf.readUInt16LE(i + 20);
      if (i + 22 + commentLength === buf.length) return i;
    }
  }
  throw new ZipError('ليس ملف ZIP صالحاً (لم يُعثر على سجل نهاية الدليل المركزي)');
}

/**
 * @param {Buffer} buf the whole archive
 * @param {{ maxEntries?: number, maxTotalBytes?: number }} [limits]
 * @returns {Map<string, Buffer>} entry name -> uncompressed bytes
 */
export function readZip(buf, { maxEntries = 5000, maxTotalBytes = 2 * 1024 ** 3 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('الملف أصغر من أن يكون ZIP');

  const eocd = findEndOfCentralDirectory(buf);
  const total = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new ZipError('ZIP64 غير مدعوم في أداة الاستعادة');
  }
  if (total > maxEntries) throw new ZipError(`عدد عناصر الأرشيف (${total}) يتجاوز الحد ${maxEntries}`);
  if (centralOffset + centralSize > eocd) throw new ZipError('الدليل المركزي خارج حدود الملف (ملف مبتور أو تالف)');

  const entries = new Map();
  let pos = centralOffset;
  let totalBytes = 0;

  for (let n = 0; n < total; n += 1) {
    if (pos + 46 > eocd || buf.readUInt32LE(pos) !== SIG_CENTRAL) {
      throw new ZipError('سجل في الدليل المركزي تالف');
    }
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const size = buf.readUInt32LE(pos + 24);
    const nameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    if (pos + 46 + nameLength + extraLength + commentLength > eocd) throw new ZipError('اسم عنصر خارج الحدود');
    const rawName = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', pos + 46, pos + 46 + nameLength);
    pos += 46 + nameLength + extraLength + commentLength;

    if (rawName.endsWith('/')) continue; // directory entry
    // `tar -a -c -f x.zip -C dir .` (bsdtar, which is also Windows' tar.exe) names entries "./manifest.json":
    // the same file, so the leading "./" is dropped before any check
    const name = rawName.replace(/^(?:\.\/)+/, '');
    if (unsafeName(name)) throw new ZipError(`اسم عنصر غير آمن في الأرشيف: ${JSON.stringify(name)}`);
    if (entries.has(name)) throw new ZipError(`اسم مكرر في الأرشيف: ${name}`);
    if (flags & 0x1) throw new ZipError(`العنصر ${name} مشفّر، والأداة لا تفك التشفير`);
    if (compressedSize === 0xffffffff || size === 0xffffffff) throw new ZipError('ZIP64 غير مدعوم');

    totalBytes += size;
    if (totalBytes > maxTotalBytes) throw new ZipError('الحجم الإجمالي بعد فك الضغط يتجاوز الحد المسموح');

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new ZipError(`ترويسة محلية تالفة للعنصر ${name}`);
    }
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > centralOffset) throw new ZipError(`بيانات العنصر ${name} خارج الحدود (ملف مبتور)`);
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = raw;
    } else if (method === 8) {
      try {
        // the cap stops a tiny "bomb" from expanding past what the directory declared
        data = inflateRawSync(raw, { maxOutputLength: size + 1 });
      } catch (error) {
        throw new ZipError(`تعذّر فك ضغط ${name}: ${error.message}`);
      }
    } else {
      throw new ZipError(`طريقة ضغط غير مدعومة (${method}) للعنصر ${name}`);
    }

    if (data.length !== size) throw new ZipError(`حجم ${name} بعد فك الضغط (${data.length}) لا يطابق المعلن (${size})`);
    if (crc32(data) !== crc) throw new ZipError(`فشل فحص CRC للعنصر ${name}: الملف تالف`);
    entries.set(name, Buffer.from(data));
  }

  return entries;
}
