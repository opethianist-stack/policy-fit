// 매뉴얼·개요 배경용 화면 캡처. 합덕제철고 공고(R26BK01732376)로 공고 입력부터 구도 추천까지 진행하며 1440×900으로 찍는다.
// 사용: 로그인을 켠 채(POLICYFIT_AUTH_DISABLED 없이) AUTH_SECRET=<아무 값> ADMIN_EMAILS=user@example.com next start -p 3100 을 띄우고
//       같은 AUTH_SECRET을 넣어 node scripts/manual/capture.js <출력 폴더>  → <출력 폴더>/shots/login·1~8·admin.png
// 로그인 쿠키는 AUTH_SECRET으로 직접 만든다(구글 로그인을 거치지 않음, 화면에 보이는 계정은 MANUAL_EMAIL, 기본 user@example.com)
// AI 관련도 판정·AI 초안을 실제로 부른다(키 필요). 이 클라우드 작업 환경의 헤드리스 브라우저는 외부 글꼴을 직접 못 받아(프록시 인증서) 글꼴 요청을 curl로 넘긴다
// 이어서: png → 가로 1200·품질 66 jpg(<출력 폴더>/jpg/). 1~8.jpg는 public/flow/에도 복사(개요 배경). 그다음 build.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('child_process');
const D = process.argv[2] + '/shots/'; require('fs').mkdirSync(D, { recursive: true });
const viaCurl = async (route) => { const u = route.request().url(); try { const body = execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', u], { maxBuffer: 50e6 }); await route.fulfill({ status: 200, body, headers: { 'content-type': /css2\?|\.css/.test(u) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } }); } catch (e) { await route.abort(); } };
const BASE = 'http://localhost:3100';
(async () => {
  const { encode } = await import('next-auth/jwt');
  const email = process.env.MANUAL_EMAIL || 'user@example.com';
  const value = await encode({ token: { email, name: email.split('@')[0], role: 'admin' }, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token' });
  const b0 = await chromium.launch(); const b = await b0.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await b.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, viaCurl);
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  const shot = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: D + n + '.png' }); console.log('shot', n); };
  // 로그인 화면(쿠키 없이)
  await p.goto(BASE + '/'); await p.waitForTimeout(7500); await shot('login');   // 마스코트가 카드를 한 바퀴 돌고 앉은 뒤(약 6.4초)
  await b.addCookies([{ name: 'authjs.session-token', value, url: BASE }]);
  await p.goto(BASE + '/search'); await p.waitForTimeout(1500);
  const f = p.frame({ url: /prototype\.html/ });
  // 넓은 화면은 120% 배율(zoom)이라 Playwright가 iframe 안 좌표를 잘못 잡는다 → 좌표 없이 클릭 이벤트를 보낸다
  const tap = (sel) => f.locator(sel).first().dispatchEvent('click');
  const scrollTo = (scr, sel, off) => f.evaluate(([scr, sel, off]) => { const s = document.querySelector(scr), el = document.querySelector(sel); s.scrollTop = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - off; }, [scr, sel, off]);
  // 1 공고 찾기: 키워드 목록을 보인 뒤 번호로 연다
  await f.fill('#no-input', '연수'); await tap('button[type=submit]');
  await f.waitForFunction(() => document.querySelector('#find-state').classList.contains('done'), null, { timeout: 60000 }); await shot('1');
  await f.selectOption('#f-mode', 'no'); await f.fill('#no-input', 'R26BK01732376');
  await tap('button[type=submit]');
  await f.waitForFunction(() => /관련도순|키워드순/.test(document.querySelector('#ai-rank-msg').textContent + document.querySelector('#result-count').textContent) && !document.querySelector('.rank-wait'), null, { timeout: 120000 });
  await f.waitForTimeout(1500);
  // 2 발주처 계보(공고 카드·제안요청서·계보)
  await scrollTo('#s-search .scroll', '#notice-card', 10); await shot('2');
  // 3 정책 근거 검색(검색어·결과)
  await scrollTo('#s-search .scroll', '#terms', 14); await shot('3');
  // 4 정책 근거 카드
  await scrollTo('#s-search .scroll', '#result-grid .card:nth-child(3)', 10); await shot('4');
  // 5 근거 선택
  for (let i = 0; i < 5; i++) await tap('#result-grid .pick >> nth=' + i);
  await tap('#to-review'); await f.waitForTimeout(1500);
  await f.evaluate(() => { var i = CARDS.findIndex(function (c) { return c.sel && !c.r.ocr; }); if (i >= 0) pick(i); });
  await f.waitForTimeout(2500); await shot('5');
  // 6 초안 생성
  await f.evaluate(() => go('export')); await f.waitForTimeout(1500);
  await tap('#ai-draft-btn');
  await f.waitForFunction(() => !document.querySelector('#ai-draft-btn').disabled && document.querySelector('#ai-draft-msg').textContent, null, { timeout: 90000 });
  await f.waitForTimeout(1500); console.log('draft:', await f.textContent('#ai-draft-msg')); await shot('6');
  // 7 문서 산출(미리보기 + 형식)
  await f.evaluate(() => { setFmt('pdf'); }); await f.waitForTimeout(400);
  await f.evaluate(() => { const t = document.querySelector('#ex-paper table'); if (t) t.scrollIntoView({ block: 'center' }); });
  await shot('7');
  // 8 장표 구도
  await f.evaluate(() => go('deck')); await f.waitForSelector('#deck-grid .sl', { timeout: 30000 }); await f.waitForTimeout(1200);
  await shot('8');
  // 관리자 대시보드
  await p.goto(BASE + '/admin'); await p.waitForTimeout(1200); await shot('admin');
  await b0.close();
})();
