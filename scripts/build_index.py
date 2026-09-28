#!/usr/bin/env python3
"""정책문서 폴더 → data/corpus-index.json

사용:  python3 scripts/build_index.py <정책문서 폴더> [출력 경로]
필요:  pip install pymupdf olefile

파일명 규칙:  번호_분류_기관_문서명[_구분]_연도.확장자
  예) 10-2_공공기관_KERIS_부서별주요사업계획_2026.pdf

- PDF  : 페이지 단위로 텍스트를 뽑는다. 텍스트가 없는 페이지(스캔본, 글자를 윤곽선으로 바꾼 인디자인 PDF)는
         tesseract(kor)가 있으면 300dpi로 그려 OCR 한다. 깨진 줄(자모 조각·한글 비율 낮음)은 버리고,
         한글 OCR_MIN_HANGUL자 미만인 쪽(표지·인포그래픽)은 색인하지 않는다. OCR 쪽이 있는 문서는 ocr=true.
         OCR 결과는 파일 내용 해시로 data/ocr-cache.json 에 저장해 다음 실행 때 다시 돌리지 않는다.
- HWPX : 본문 XML에서 문단을 뽑고, 저장된 줄 배치 정보(vertpos)가 위로 되돌아가는 지점을 쪽 경계로 본다.
- HWP  : 본문 스트림의 문단 레코드를 같은 방식으로 처리한다.
  HWPX/HWP의 쪽 번호는 추정값이라 pageEstimated=true 로 표시한다.
- 같은 번호·문서명의 PDF가 있으면 HWP/HWPX는 색인하지 않는다(쪽 번호가 정확한 쪽을 쓴다).
- 이름이 달라도 본문이 같은 문서(한글 8글자 조각 90% 이상 겹침)는 하나만 색인한다.
  PDF를 남기고, 둘 다 같은 형식이면 번호가 앞선 쪽을 남긴다(검색 결과에 같은 쪽이 두 번 나오지 않게).
"""
import hashlib, json, os, re, shutil, struct, subprocess, sys, tempfile, zipfile, zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
MIN_CHARS = 40  # 이보다 짧은 쪽은 표지·간지로 보고 색인하지 않는다
DUP_SHARE = 0.9  # 본문 조각이 양쪽 모두 이 비율 이상 겹치면 같은 문서로 본다
OCR_DPI = 300
OCR_MIN_HANGUL = 150  # OCR 한 쪽에서 살아남은 한글이 이보다 적으면 표지·인포그래픽으로 보고 버린다
OCR_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'ocr-cache.json')
OCR_VERSION = 3  # 줄 거르기 규칙을 바꾸면 올려서 캐시를 무효화한다
HAS_TESSERACT = shutil.which('tesseract') is not None


def shingles(texts, n=8):
    h = ''.join(re.findall(r'[가-힣]', ''.join(texts)))
    return {h[i:i + n] for i in range(0, max(0, len(h) - n + 1), 2)}


def drop_duplicates(parsed, report):
    """parsed: [(file, meta, got)] → 본문이 같은 문서 중 하나만 남긴다"""
    rank = lambda item: (item[1]['ext'] != 'pdf', item[1]['id'])
    keep, sigs = [], []
    for item in sorted(parsed, key=rank):
        sig = shingles(t for _, t in item[2])
        dup = None
        if len(sig) >= 200:
            for (kf, km, _), ks in zip(keep, sigs):
                common = len(sig & ks)
                if common >= DUP_SHARE * len(sig) and common >= DUP_SHARE * len(ks):
                    dup = km['id']; break
        if dup:
            report.append((item[0], f'건너뜀: 본문이 {dup}번 문서와 같음'))
        else:
            keep.append(item); sigs.append(sig)
    order = {f: i for i, (f, _, _) in enumerate(parsed)}
    return sorted(keep, key=lambda item: order[item[0]])


def clean(t):
    t = t.encode('utf-16-le', 'surrogatepass').decode('utf-16-le', 'ignore')  # HWP의 짝 없는 서로게이트 제거
    t = re.sub(r'[\ue000-\uf8ff]', '', t)  # 한글 전용 사용자 영역 문자(글머리 기호 등) 제거
    # 한글 보충 사용자 영역 글머리: U+F02B1~ 는 문서 안에서 차례로 쓰이는 번호 기호(1·2·3…)라 ❶❷❸…로 바꾸고, 나머지는 지운다
    t = re.sub('[\U000F02B1-\U000F02BA]', lambda m: chr(0x2776 + ord(m.group()) - 0xF02B1), t)
    t = re.sub('[\U000F0000-\U000FFFFD]', '', t)
    t = t.replace(' ', ' ').replace('\r', '\n')
    t = re.sub(r'[ \t　]+', ' ', t)
    t = re.sub(r' *\n *', '\n', t)
    t = re.sub(r'\n{2,}', '\n', t)
    return t.strip()


def parse_name(fn):
    stem, ext = os.path.splitext(fn)
    parts = stem.split('_')
    meta = {'id': parts[0], 'file': fn, 'ext': ext.lower().lstrip('.')}
    year = parts[-1] if re.fullmatch(r'(19|20)\d{2}', parts[-1]) else ''
    body = parts[1:-1] if year else parts[1:]
    meta['year'] = year
    meta['category'] = body[0] if len(body) > 0 else ''
    meta['org'] = body[1] if len(body) > 1 else ''
    meta['title'] = ' '.join(body[2:]) if len(body) > 2 else stem
    return meta


JAMO = re.compile(r'[\u3131-\u318e]')
def ocr_line_ok(line):
    """OCR 줄 거르기: 자모 조각이 섞였거나 한글·숫자 비율이 낮거나 한 글자 토막이 대부분인 줄은 버린다"""
    s = re.sub(r'\s', '', line)
    if len(s) < 4 or len(JAMO.findall(line)) >= 2:
        return False
    good = sum(1 for c in s if '가' <= c <= '힣' or c.isdigit() or c in '.,·ㆍ%()「」『』~-‧')
    if good / len(s) < 0.7:
        return False
    toks = line.split()
    return not (len(toks) >= 4 and sum(1 for t in toks if len(t) == 1) / len(toks) > 0.5)


def column_regions(page):
    """쪽을 읽는 순서대로 나눈 영역(pymupdf Rect) 목록. 두 단 구간은 왼쪽 단 → 오른쪽 단 순으로 나눈다.
    가운데(30~70%)에서 글자가 가장 적게 지나가는 세로줄(단 사이 홈)을 찾고, 그 줄이 비어 있는 가로 구간이
    충분히 길면 두 단으로 본다. 제목·표처럼 홈을 가로지르는 구간은 한 단으로 둔다."""
    import pymupdf
    dpi = 50
    pix = page.get_pixmap(dpi=dpi, alpha=False, colorspace=pymupdf.csGRAY)
    w, h, buf = pix.width, pix.height, pix.samples
    dark = lambda x, y: buf[y * w + x] < 170
    x0, x1 = int(w * 0.3), int(w * 0.7)
    cnt = [sum(1 for y in range(h) if dark(x, y)) for x in range(x0, x1)]
    gx = x0 + min(range(len(cnt)), key=lambda k: cnt[k])
    rows = [not any(dark(x, y) for x in range(max(0, gx - 1), min(w, gx + 2))) for y in range(h)]
    # 홈 양쪽에 글자가 있는 줄만 "두 단 줄"로 센다(여백 줄은 어느 쪽에도 붙일 수 있음)
    side = [any(dark(x, y) for x in range(0, gx - 2)) and any(dark(x, y) for x in range(gx + 3, w)) for y in range(h)]
    segs, y = [], 0
    while y < h:
        two = rows[y]
        z = y
        while z < h and rows[z] == two:
            z += 1
        segs.append([y, z, two and sum(side[y:z]) >= 6])   # 50dpi에서 6줄 ≈ 3mm 이상 양쪽에 글자
        y = z
    merged = []
    for s0, s1, two in segs:
        if merged and merged[-1][2] == two:
            merged[-1][1] = s1
        else:
            merged.append([s0, s1, two])
    r = page.rect
    k = r.width / w
    out = []
    for s0, s1, two in merged:
        top, bot = s0 * k, s1 * k
        if bot - top < 4:
            continue
        if two:
            out.append(pymupdf.Rect(r.x0, top, gx * k, bot)); out.append(pymupdf.Rect(gx * k, top, r.x1, bot))
        else:
            out.append(pymupdf.Rect(r.x0, top, r.x1, bot))
    return out or [r]


def ocr_page(path, i):
    import pymupdf
    doc = pymupdf.open(path)
    page = doc[i - 1]
    env = dict(os.environ, OMP_THREAD_LIMIT='1')  # 쪽마다 따로 돌리므로 한 프로세스는 한 스레드만(안 그러면 서로 막혀 쪽당 2분을 넘겼다)
    parts = []
    with tempfile.TemporaryDirectory() as td:
        for n, clip in enumerate(column_regions(page)):
            pix = page.get_pixmap(dpi=OCR_DPI, alpha=False, colorspace=pymupdf.csGRAY, clip=clip)
            if pix.width < 40 or pix.height < 40:
                continue
            png = os.path.join(td, f'{n}.png')
            pix.save(png)
            # psm 4(한 단 줄 모음): 자동 판 나누기(psm 3)는 장식·배경색이 있는 판면에서 글자가 크게 깨졌다(실측, 경북·전문대교협).
            # 단은 column_regions 가 미리 나눠 준다
            try:
                r = subprocess.run(['tesseract', png, '-', '-l', 'kor', '--psm', '4'], capture_output=True, text=True, timeout=90, env=env)
                parts.append(r.stdout)
            except subprocess.TimeoutExpired:
                pass
    lines = [l.strip() for o in parts for l in o.splitlines() if ocr_line_ok(l)]
    t = clean('\n'.join(lines))
    return t if sum(1 for c in t if '가' <= c <= '힣') >= OCR_MIN_HANGUL else ''


def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fp:
        for chunk in iter(lambda: fp.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


OCR_STORE = None
OCR_USED = set()
OCR_MARK = {}  # 파일 이름 → OCR로 채운 쪽 번호들(쪽마다 ocr 표시)
def ocr_store():
    global OCR_STORE
    if OCR_STORE is None:
        try:
            with open(OCR_CACHE, encoding='utf-8') as fp:
                OCR_STORE = json.load(fp)
        except (OSError, ValueError):
            OCR_STORE = {}
        OCR_STORE.setdefault('version', OCR_VERSION)
        OCR_STORE.setdefault('files', {})
        if OCR_STORE['version'] != OCR_VERSION:
            OCR_STORE = {'version': OCR_VERSION, 'files': {}}
    return OCR_STORE


def pdf_pages(path):
    import pymupdf
    doc = pymupdf.open(path)
    pages, blank = [], []
    for i, p in enumerate(doc, 1):
        t = clean(p.get_text())
        if len(t) < MIN_CHARS:
            blank.append(i)
            continue
        pages.append((i, t))
    ocr = 0
    if blank and HAS_TESSERACT:
        store = ocr_store()
        key = file_hash(path)
        OCR_USED.add(key)
        cached = store['files'].get(key, {})
        todo = [i for i in blank if str(i) not in cached]
        if todo:
            with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
                def safe(n):
                    try:
                        return ocr_page(path, n)
                    except Exception:  # 한 쪽이 실패해도 나머지 쪽과 문서 색인은 계속한다(다음 실행 때 다시 시도하도록 캐시에 넣지 않음)
                        return None
                for i, t in zip(todo, ex.map(safe, todo)):
                    if t is not None:
                        cached[str(i)] = t
        store['files'][key] = {k: cached[k] for k in map(str, blank) if k in cached}
        store['files'][key]['_name'] = os.path.basename(path)
        for i in blank:
            t = cached.get(str(i), '')
            if t:
                pages.append((i, t)); ocr += 1
                OCR_MARK.setdefault(os.path.basename(path), set()).add(i)
        pages.sort()
    return pages, len(doc), (len(blank) - ocr, ocr)


CELL_SEP = '\u2002'  # 표 칸 구분(EN SPACE). 공백으로 취급돼 검색·대조에는 영향이 없고, 화면은 칸 구분선으로 그린다


def para_text(p):
    """문단의 글자를 모은다. 표는 행 하나를 한 줄로, 칸은 CELL_SEP로 잇는다(칸마다 줄이 갈리면 "계속" 같은 일정 칸이 따로 떠서 읽기 어렵다)."""
    out = []

    def cell_text(tc, sep):
        buf = []

        def w(el):
            if el.tag == HP + 't':
                buf.append(''.join(el.itertext())); return
            for ch in el:
                w(ch)
            if el.tag == HP + 'p':
                buf.append(sep)
        w(tc)
        lines = [re.sub(r'[ \t\u2002]+', ' ', x).strip() for x in ''.join(buf).split('\n')]
        return '\n'.join(x for x in lines if x) if sep == '\n' else re.sub(r'\s+', ' ', ''.join(buf)).strip()

    def walk(el):
        if el.tag == HP + 't':
            out.append(''.join(el.itertext()))
            return
        if el.tag == HP + 'tbl':
            out.append('\n')
            for tr in [x for x in el if x.tag == HP + 'tr']:
                tcs = [tc for tc in tr if tc.tag == HP + 'tc']
                cells = [c for c in (cell_text(tc, ' ') for tc in tcs) if c]
                if len(cells) >= 2:
                    out.append(CELL_SEP.join(cells) + '\n')
                elif cells:   # 칸이 하나뿐인 행(글상자처럼 쓰는 표)은 문단 줄을 그대로 둔다
                    out.append('\n'.join(cell_text(tc, '\n') for tc in tcs if cell_text(tc, '\n')) + '\n')
            return
        for ch in el:
            walk(ch)
        if el.tag in (HP + 'p', HP + 'tc'):
            out.append('\n')

    walk(p)
    return ''.join(out)


def hwpx_pages(path):
    z = zipfile.ZipFile(path)
    names = sorted((n for n in z.namelist() if re.fullmatch(r'Contents/section\d+\.xml', n)),
                   key=lambda n: int(re.search(r'\d+', n).group()))
    pages, page, buf = [], 1, []
    for n in names:
        root = ET.fromstring(z.read(n))
        prev = -1
        for p in root.findall(HP + 'p'):  # 최상위 문단만. 표 안 문단은 para_text가 함께 거둔다
            seg = p.find(HP + 'linesegarray')
            first = seg.find(HP + 'lineseg') if seg is not None else None
            v = int(first.get('vertpos', '0')) if first is not None else prev
            if prev >= 0 and v < prev:
                pages.append((page, clean('\n'.join(buf)))); buf = []; page += 1
            txt = para_text(p)
            if txt.strip():
                buf.append(txt)
            if seg is not None:
                vs = [int(s.get('vertpos', '0')) for s in seg.findall(HP + 'lineseg')]
                for a, b in zip(vs, vs[1:]):
                    if b < a:  # 문단이 쪽을 넘어감
                        pages.append((page, clean('\n'.join(buf)))); buf = []; page += 1
                prev = vs[-1] if vs else v
            else:
                prev = v
        if buf:
            pages.append((page, clean('\n'.join(buf)))); buf = []; page += 1
    total = page - 1
    return [(n, t) for n, t in pages if len(t) >= MIN_CHARS], total, 0


def hwp_pages(path):
    import olefile
    ole = olefile.OleFileIO(path)
    header = ole.openstream('FileHeader').read()
    compressed = bool(header[36] & 1)
    secs = sorted((e for e in ole.listdir() if e[0] == 'BodyText'), key=lambda e: int(e[1][7:]))
    pages, page, buf, prev = [], 1, [], -1
    for e in secs:
        data = ole.openstream(e).read()
        if compressed:
            data = zlib.decompress(data, -15)
        i, cur = 0, None
        while i + 4 <= len(data):
            h = struct.unpack_from('<I', data, i)[0]; i += 4
            tag, level, size = h & 0x3FF, (h >> 10) & 0x3FF, h >> 20
            if size == 0xFFF:
                size = struct.unpack_from('<I', data, i)[0]; i += 4
            rec = data[i:i + size]; i += size
            if tag == 67:  # PARA_TEXT
                chars, j = [], 0
                while j + 2 <= len(rec):
                    c = struct.unpack_from('<H', rec, j)[0]
                    if c in (1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23):
                        j += 16; continue  # 확장 제어 문자(8 WCHAR)
                    if c in (4, 5, 6, 7, 8, 9, 19, 20):
                        j += 16; continue
                    j += 2
                    if c in (10, 13): chars.append('\n')
                    elif c >= 32: chars.append(chr(c))
                cur = ''.join(chars)
                if cur.strip():
                    buf.append(cur)
            elif tag == 69 and level == 1:  # PARA_LINE_SEG (최상위 문단)
                vs = [struct.unpack_from('<i', rec, k + 4)[0] for k in range(0, len(rec) - 35, 36)]
                for v in vs:
                    if prev >= 0 and v < prev:
                        last = buf.pop() if buf and cur and buf[-1] == cur and v == vs[0] else None
                        pages.append((page, clean('\n'.join(buf)))); page += 1
                        buf = [last] if last else []
                    prev = v
    if buf:
        pages.append((page, clean('\n'.join(buf)))); page += 1
    return [(n, t) for n, t in pages if len(t) >= MIN_CHARS], page - 1, 0


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data', 'corpus-index.json')
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(('.pdf', '.hwpx', '.hwp')))
    pdf_keys = {os.path.splitext(f)[0] for f in files if f.lower().endswith('.pdf')}
    docs, pages, report, parsed = [], [], [], []
    for f in files:
        meta = parse_name(f)
        stem = os.path.splitext(f)[0]
        if meta['ext'] != 'pdf' and stem in pdf_keys:
            report.append((f, '건너뜀: 같은 이름의 PDF 사용')); continue
        path = os.path.join(src, f)
        try:
            fn = {'pdf': pdf_pages, 'hwpx': hwpx_pages, 'hwp': hwp_pages}[meta['ext']]
            got, total, scanned = fn(path)
        except Exception as ex:  # 한 파일이 깨져도 나머지는 색인한다
            report.append((f, f'실패: {type(ex).__name__}: {ex}')); continue
        blank, ocr = scanned if isinstance(scanned, tuple) else (scanned, 0)
        meta.update({'pages': total, 'indexedPages': len(got), 'pageEstimated': meta['ext'] != 'pdf'})
        if ocr:
            meta.update({'ocr': True, 'ocrPages': ocr})
        parsed.append((f, meta, got))
        note = f'{len(got)}/{total}쪽'
        if ocr: note += f' · OCR {ocr}쪽'
        if blank: note += f' · 글자 없는 쪽 {blank}쪽 제외'
        if not got: note += ' · 텍스트 없음' + ('' if HAS_TESSERACT else '(OCR 도구 없음)')
        report.append((f, note))
    for f, meta, got in drop_duplicates(parsed, report):
        docs.append(meta)
        marks = OCR_MARK.get(f, set())
        for n, t in got:
            pages.append({'doc': meta['id'], 'page': n, 'text': t, **({'ocr': True} if n in marks else {})})
    result = {'builtAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'docs': docs, 'pages': pages}
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fp:
        json.dump(result, fp, ensure_ascii=False, separators=(',', ':'))
    if OCR_STORE is not None:  # 이번에 색인한 파일의 OCR 결과만 남긴다(드라이브에서 지운 파일은 캐시에서도 빠진다)
        OCR_STORE['files'] = {k: v for k, v in OCR_STORE['files'].items() if k in OCR_USED}
        with open(OCR_CACHE, 'w', encoding='utf-8') as fp:
            json.dump(OCR_STORE, fp, ensure_ascii=False, indent=0, sort_keys=True)
    for f, note in report:
        print(f'{note:34s} {f}')
    print(f'\n문서 {len(docs)}건 · {len(pages)}쪽 · {os.path.getsize(out) / 1024:.0f} KB → {out}')


if __name__ == '__main__':
    main()
