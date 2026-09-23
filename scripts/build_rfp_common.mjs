#!/usr/bin/env node
// 제안요청서 흔한 말 목록(data/rfp-common.json)을 만든다.
//
// 사용:  node scripts/build_rfp_common.mjs <표본 폴더>
//   표본 폴더: 제안요청서·과업지시서 본문 텍스트(.txt, 파일 하나 = 제안요청서 하나). /api/rfp 응답의 text 를 그대로 저장한 것
//
// 여러 공고의 제안요청서에 두루 나오는 말(명단·성과물·현지·행사 …)은 그 공고만의 주제어가 아니다.
// lib/rfp.js 의 termsFromRfp 가 "표본 n건 중 몇 건에 나왔나"로 점수를 깎는다. 제외 목록을 손으로 늘리는 대신 표본으로 정한다.
// 말 자르기는 lib/rfp.js 의 rfpVocab 과 같아야 하므로 esbuild 로 lib/rfp.js 를 묶어서 쓴다(npx 로 받아 실행, 의존성 추가 없음).
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const src = process.argv[2];
if (!src) { console.error('사용: node scripts/build_rfp_common.mjs <표본 폴더>'); process.exit(1); }
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rfpc-'));
const out = path.join(tmp, 'rfp.mjs');
execFileSync('npx', ['--yes', 'esbuild@0.23', path.join(root, 'lib/rfp.js'), '--bundle', '--platform=node', '--format=esm', '--loader:.json=json', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' });
const { rfpVocab } = await import(pathToFileURL(out).href);

const MIN_CHARS = 3000;   // 이보다 짧은 파일은 공고문·양식으로 보고 뺀다
const KEEP = 4;           // 이 건수 이상 나온 말만 싣는다(나머지는 0건으로 취급해도 배율 차이가 작다)
const df = new Map();
let n = 0;
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.txt'))) {
  const text = fs.readFileSync(path.join(src, f), 'utf8');
  if (text.length < MIN_CHARS) continue;
  n++;
  for (const w of rfpVocab(text)) df.set(w, (df.get(w) || 0) + 1);
}
const kept = [...df.entries()].filter(([, c]) => c >= KEEP).sort((a, b) => b[1] - a[1]);
const result = { about: '제안요청서 흔한 말: 표본 제안요청서 n건 중 그 말이 나온 건수(df). scripts/build_rfp_common.mjs 로 다시 만든다', n, df: Object.fromEntries(kept) };
fs.writeFileSync(path.join(root, 'data/rfp-common.json'), JSON.stringify(result));
console.log(`표본 ${n}건 · 말 ${kept.length}개 → data/rfp-common.json`);
