// harvest 장면(harvest.html)에 넣을 실제 값: 색인 문서 수 변화(git 기록의 data/corpus-index.json)와
// 정책문서 폴더에 최근 들어온 파일 이름(서비스 계정 GDRIVE_SA_KEY가 있으면 드라이브에서 읽는다, 없으면 생략).
// 사용: node scripts/video/harvest-data.js <출력.json>
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const FOLDER = '1-VLB42YhmZZIMxoR48J2qeIYgMYMdAK5';

function history() {
  const log = execSync('git log --format="%H %aI" origin/main -- data/corpus-index.json', { encoding: 'utf8' }).trim().split('\n');
  const byDay = {};
  for (const line of log) {
    const [h, at] = line.split(' ');
    let j; try { j = JSON.parse(execSync(`git show ${h}:data/corpus-index.json`, { encoding: 'utf8', maxBuffer: 200e6 })); } catch (e) { continue; }
    const kst = new Date(new Date(at).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
    if (!byDay[kst] || at > byDay[kst].at) byDay[kst] = { at, docs: j.docs.length, pages: j.pages.length };
  }
  return Object.keys(byDay).sort().map((d) => ({ date: d, docs: byDay[d].docs, pages: byDay[d].pages }));
}

async function recentFiles() {
  if (!process.env.GDRIVE_SA_KEY) return [];
  const k = JSON.parse(process.env.GDRIVE_SA_KEY);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), k.private_key).toString('base64url');
  const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + head + '.' + body + '.' + sig }).then((r) => r.json());
  const q = encodeURIComponent(`'${FOLDER}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=files(name,createdTime)`, { headers: { authorization: 'Bearer ' + tok.access_token } }).then((r) => r.json());
  return (r.files || []).sort((a, b) => b.createdTime.localeCompare(a.createdTime)).map((f) => ({ name: f.name, at: f.createdTime.slice(0, 10) }));
}

(async () => {
  const files = await recentFiles();
  const out = { history: history(), recent: files.slice(0, 8), driveCount: files.length };
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(out.history.map((h) => h.date + ' ' + h.docs).join(' · '), '| drive', out.driveCount);
})();
