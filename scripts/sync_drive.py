#!/usr/bin/env python3
"""구글드라이브 정책문서 폴더 → data/corpus-index.json · data/corpus-links.json

GitHub Actions(.github/workflows/sync-corpus.yml)가 매일 돌린다. 수동으로도 돌릴 수 있다.

  python3 scripts/sync_drive.py                 # 드라이브에서 받아 색인
  python3 scripts/sync_drive.py --local <폴더>  # 드라이브 없이 로컬 폴더로 색인(시험용)

환경변수
  GDRIVE_SA_KEY     서비스 계정 열쇠(JSON 내용 전체). GitHub Secrets 에만 둔다. 파일로 저장하거나 출력하지 않는다
  GDRIVE_FOLDER_ID  정책문서 폴더 ID

- 하위 폴더까지 전부 읽는다. 색인 대상은 pdf · hwpx · hwp (scripts/build_index.py 와 같음)
- 구글 문서 형식(드라이브에서 변환된 파일)은 건너뛰고 보고한다 → 원본 파일로 올려야 한다
- 파일명 규칙(번호_분류_기관_문서명_연도)은 그대로 적용된다. 같은 이름 파일이 두 곳에 있으면 하나만 쓰고 보고한다
- 내용이 바뀌지 않았으면 색인 파일을 다시 쓰지 않는다(builtAt 만 달라지는 커밋을 막는다)
- corpus-links.json 에는 드라이브 파일 링크를 문서 번호별로 넣는다. 화면의 "원문 열기"가 이걸 쓴다(폴더 권한이 있는 사람만 열린다)
"""
import io, json, os, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
INDEX = os.path.join(ROOT, 'data', 'corpus-index.json')
LINKS = os.path.join(ROOT, 'data', 'corpus-links.json')
TARGET = ('.pdf', '.hwpx', '.hwp')
GOOGLE_NATIVE = 'application/vnd.google-apps.'
FOLDER_MIME = 'application/vnd.google-apps.folder'


def drive_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    raw = os.environ.get('GDRIVE_SA_KEY', '').strip()
    if not raw:
        sys.exit('GDRIVE_SA_KEY 가 없습니다. GitHub Secrets 에 서비스 계정 열쇠(JSON 내용)를 등록하세요.')
    creds = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=['https://www.googleapis.com/auth/drive.readonly'])
    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def list_tree(svc, folder_id, path=''):
    """폴더 안의 파일을 하위 폴더까지 모은다."""
    out, token = [], None
    while True:
        res = svc.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields='nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, webViewLink, size)',
            pageSize=1000, pageToken=token, supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        for f in res.get('files', []):
            if f['mimeType'] == FOLDER_MIME:
                out += list_tree(svc, f['id'], path + f['name'] + '/')
            else:
                f['path'] = path + f['name']
                out.append(f)
        token = res.get('nextPageToken')
        if not token:
            return out


def download(svc, file_id, dest):
    from googleapiclient.http import MediaIoBaseDownload
    req = svc.files().get_media(fileId=file_id, supportsAllDrives=True)
    with io.FileIO(dest, 'wb') as fh:
        dl = MediaIoBaseDownload(fh, req, chunksize=8 * 1024 * 1024)
        done = False
        while not done:
            _, done = dl.next_chunk()


def fetch_from_drive(workdir):
    folder = os.environ.get('GDRIVE_FOLDER_ID', '').strip()
    if not folder:
        sys.exit('GDRIVE_FOLDER_ID 가 없습니다.')
    svc = drive_service()
    files = list_tree(svc, folder)
    links, report, seen = {}, [], {}
    for f in sorted(files, key=lambda x: x['path']):
        name = f['name']
        if f['mimeType'].startswith(GOOGLE_NATIVE):
            report.append(('건너뜀: 구글 문서 형식(원본 파일로 올려 주세요)', f['path'])); continue
        if not name.lower().endswith(TARGET):
            report.append(('건너뜀: 색인 대상 아님(pdf·hwpx·hwp)', f['path'])); continue
        if name in seen:
            report.append((f'건너뜀: 같은 이름이 이미 있음({seen[name]})', f['path'])); continue
        seen[name] = f['path']
        download(svc, f['id'], os.path.join(workdir, name))
        links.setdefault(name.split('_')[0], f.get('webViewLink', ''))
    print(f'드라이브 파일 {len(files)}개 중 {len(seen)}개 받음')
    return links, report


def comparable(path):
    try:
        with open(path, encoding='utf-8') as fp:
            d = json.load(fp)
        d.pop('builtAt', None)
        return d
    except FileNotFoundError:
        return None


def main():
    args = sys.argv[1:]
    with tempfile.TemporaryDirectory() as tmp:
        if args[:1] == ['--local']:
            src, links, report = args[1], None, []
        else:
            src = os.path.join(tmp, 'docs'); os.makedirs(src)
            links, report = fetch_from_drive(src)
        out = os.path.join(tmp, 'corpus-index.json')
        subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build_index.py'), src, out], check=True)

        changed = []
        if comparable(out) != comparable(INDEX):
            with open(out, encoding='utf-8') as a, open(INDEX, 'w', encoding='utf-8') as b:
                b.write(a.read())
            changed.append('corpus-index.json')
        if links is not None:
            new_links = json.dumps(links, ensure_ascii=False, indent=1, sort_keys=True) + '\n'
            old = open(LINKS, encoding='utf-8').read() if os.path.exists(LINKS) else ''
            if new_links != old:
                with open(LINKS, 'w', encoding='utf-8') as fp:
                    fp.write(new_links)
                changed.append('corpus-links.json')

    for note, path in report:
        print(f'{note:40s} {path}')
    print('바뀐 파일: ' + (', '.join(changed) if changed else '없음'))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as fp:
            fp.write('### 정책문서 색인 갱신\n\n')
            fp.write('- 바뀐 파일: ' + (', '.join(changed) if changed else '없음') + '\n')
            for note, path in report:
                fp.write(f'- {note} · `{path}`\n')


if __name__ == '__main__':
    main()
