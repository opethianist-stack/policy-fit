import { inflateRawSync } from 'node:zlib';
import { unzipSync, strFromU8 } from 'fflate';
import CFB from 'cfb';

// 제안요청서 파일(바이트) → 본문 텍스트. 파일은 저장하지 않는다.
// pdf · hwpx · hwp(5.0) · docx · txt. 스캔 PDF와 배포용(암호화) HWP는 본문을 읽을 수 없다.

export class ExtractError extends Error {}

export function kindOf(name, buf) {
  const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const b = buf.subarray(0, 8);
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';            // %PDF
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'hwp';            // OLE 복합 문서
  if (b[0] === 0x50 && b[1] === 0x4B) return ext === 'docx' ? 'docx' : ext === 'hwpx' ? 'hwpx' : 'zip';
  if (['txt', 'md'].includes(ext)) return 'txt';
  return ext || 'unknown';
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');

// XML 문단 단위로 글자를 모은다. 문단(<p>)·표 칸 끝에서 줄을 바꾼다.
function xmlText(xml, { t, breaks }) {
  const out = [];
  const re = new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>|</(?:${breaks})>`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] != null) out.push(decodeXml(m[1].replace(/<[^>]+>/g, '')));
    else out.push('\n');
  }
  return out.join('');
}

function fromHwpx(files) {
  const names = Object.keys(files).filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  if (!names.length) throw new ExtractError('hwpx 본문을 찾지 못했습니다.');
  return names.map((n) => xmlText(strFromU8(files[n]), { t: 'hp:t', breaks: 'hp:p|hp:tc' })).join('\n');
}

function fromDocx(files) {
  const x = files['word/document.xml'];
  if (!x) throw new ExtractError('docx 본문을 찾지 못했습니다.');
  return xmlText(strFromU8(x), { t: 'w:t', breaks: 'w:p|w:tc' });
}

function fromHwp(buf) {
  let cfb;
  try { cfb = CFB.read(buf, { type: 'buffer' }); } catch { throw new ExtractError('hwp 파일을 열지 못했습니다.'); }
  const get = (p) => CFB.find(cfb, p);
  const header = get('FileHeader');
  if (!header) throw new ExtractError('hwp 5.0 형식이 아닙니다.');
  const flags = Buffer.from(header.content).readUInt32LE(36);
  if (flags & 0x04) throw new ExtractError('배포용 hwp 문서라 본문을 읽을 수 없습니다. pdf로 올려 주세요.');
  if (flags & 0x02) throw new ExtractError('암호가 걸린 hwp 문서입니다.');
  const compressed = !!(flags & 0x01);
  const secs = cfb.FullPaths.map((p, i) => ({ p, e: cfb.FileIndex[i] }))
    .filter((x) => /\/BodyText\/Section\d+$/.test(x.p))
    .sort((a, b) => +a.p.match(/(\d+)$/)[1] - +b.p.match(/(\d+)$/)[1]);
  if (!secs.length) throw new ExtractError('hwp 본문을 찾지 못했습니다.');
  const out = [];
  for (const { e } of secs) {
    let data = Buffer.from(e.content);
    if (compressed) data = inflateRawSync(data);
    let i = 0;
    while (i + 4 <= data.length) {
      const h = data.readUInt32LE(i); i += 4;
      const tag = h & 0x3FF; let size = h >>> 20;
      if (size === 0xFFF) { size = data.readUInt32LE(i); i += 4; }
      if (tag === 67) {   // PARA_TEXT
        const rec = data.subarray(i, i + size);
        let s = '';
        for (let j = 0; j + 2 <= rec.length;) {
          const c = rec.readUInt16LE(j);
          if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23, 4, 5, 6, 7, 8, 9, 19, 20].includes(c)) { j += 16; continue; }  // 8 WCHAR 제어 문자
          j += 2;
          if (c === 10 || c === 13) s += '\n'; else if (c >= 32) s += String.fromCharCode(c);
        }
        out.push(s);
      }
      i += size;
    }
  }
  return out.join('\n');
}

async function fromPdf(buf) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.join('\n');
}

export function tidy(t) {
  return String(t)
    .replace(/[-]|[\u{F0000}-\u{FFFFD}]/gu, ' ')   // HWP 글머리 기호 등 사용자 정의 영역 글자
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

export async function extractText(buf, name) {
  const kind = kindOf(name, buf);
  let text;
  if (kind === 'pdf') text = await fromPdf(buf);
  else if (kind === 'hwp') text = fromHwp(buf);
  else if (kind === 'hwpx' || kind === 'docx' || kind === 'zip') {
    let files;
    try { files = unzipSync(new Uint8Array(buf), { filter: (f) => /^Contents\/section\d+\.xml$|^word\/document\.xml$/.test(f.name) }); }
    catch { throw new ExtractError('압축 파일을 열지 못했습니다.'); }
    text = files['word/document.xml'] ? fromDocx(files) : fromHwpx(files);
  } else if (kind === 'txt') text = buf.toString('utf8');
  else throw new ExtractError('pdf · hwp · hwpx · docx 파일만 읽을 수 있습니다.');
  text = tidy(text);
  if (text.replace(/\s/g, '').length < 200) throw new ExtractError(kind === 'pdf' ? '본문 글자가 거의 없습니다. 스캔 PDF일 수 있습니다.' : '본문 글자가 거의 없습니다.');
  return { kind, text };
}
