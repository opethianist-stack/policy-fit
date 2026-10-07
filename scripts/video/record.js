// 발표용 시연 영상 녹화. 합덕제철고 공고(R26BK01732376)로 로그인 → 공고 찾기 → … → 장표 구도까지 실제로 조작하며
// 브라우저 화면을 프레임(jpg)으로 받는다(Chrome 화면 전송 Page.startScreencast, 화면이 바뀔 때마다 한 장).
// 기다리는 구간(제안요청서 읽기·관련도 판정·AI 초안)은 timeline의 speed 표시로 남겨 assemble.py가 빨리 감는다.
// 자막·빨리 감기 표시·처음/끝 화면은 바깥 문서(상단바 쪽)에 덧씌운 HTML이라 프레임에 그대로 찍힌다.
// 사용: 로그인을 켠 채 AUTH_SECRET=<값> … next start -p 3100 → 같은 AUTH_SECRET으로
//       node scripts/video/record.js <출력 폴더>   → <출력 폴더>/frames/*.jpg, timeline.json
//       python3 scripts/video/assemble.py <출력 폴더> <결과.mp4>
// 실제 나라장터 조회·AI 판정을 부른다(DATA_GO_KR_KEY·AI 키 필요).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const OUT = process.argv[2]; const FR = OUT + '/frames/'; fs.mkdirSync(FR, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3100';
const NOTICE = 'R26BK01732376';
// harvest 장면 재료: harvest-data.js 결과(HARVEST_DATA), 실제 화면 캡처 폴더(HARVEST_SHOTS, 있는 것만):
//   sheet.webm(승인 시트 화면 녹화, VP9 — 녹화용 Chromium은 H.264를 못 튼다) 또는 sheet.png, script.png(Apps Script), drive.png(정책문서 폴더), actions.png
const HDATA = process.env.HARVEST_DATA ? JSON.parse(fs.readFileSync(process.env.HARVEST_DATA, 'utf8')) : null;
const SHOT_DIR = process.env.HARVEST_SHOTS || '';
const HSHOT_FILES = {};   // 장면에 넘길 키 → 파일 이름
if (SHOT_DIR) {
  if (fs.existsSync(SHOT_DIR + '/sheet.webm')) HSHOT_FILES.sheetVideo = 'sheet.webm';
  for (const k of ['actions', 'sheet', 'script', 'drive']) for (const ext of ['png', 'jpg', 'jpeg', 'webp']) if (!HSHOT_FILES[k] && fs.existsSync(SHOT_DIR + '/' + k + '.' + ext)) HSHOT_FILES[k] = k + '.' + ext;
}
const MIME = { webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const DOCS = (() => { try { return require('../../data/corpus-index.json').docs.length; } catch (e) { return 0; } })();
const viaCurl = async (route) => { const u = route.request().url(); try { const body = execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', u], { maxBuffer: 50e6 }); await route.fulfill({ status: 200, body, headers: { 'content-type': /css2\?|\.css/.test(u) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } }); } catch (e) { await route.abort(); } };

// 바깥 문서에 붙이는 자막·배지·처음/끝 화면
const OVERLAY = `
#vid-cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:14px;max-width:86vw;
  background:rgba(0,0,46,.9);color:#fff;border-radius:6px;padding:13px 22px;font:600 18px/1.45 var(--font,'SUIT Variable',sans-serif);letter-spacing:-.2px;
  opacity:0;transition:opacity .35s;word-break:keep-all}
#vid-cap.on{opacity:1}
#vid-cap b{flex:0 0 auto;font-size:13px;font-weight:800;background:#fff;color:#0000A3;border-radius:3px;padding:4px 9px;letter-spacing:0}
#vid-ff{position:fixed;right:22px;top:72px;z-index:99999;background:rgba(0,0,46,.85);color:#fff;font:700 13px/1 var(--font,sans-serif);
  border-radius:3px;padding:8px 11px;opacity:0;transition:opacity .2s}
#vid-ff.on{opacity:1}
#vid-card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:linear-gradient(160deg,#2240D8 0%,#1026A8 38%,#0A1784 72%,#060F66 100%);color:#fff;font-family:var(--font,sans-serif);
  opacity:0;transition:opacity .5s;pointer-events:none;text-align:center}
#vid-card.on{opacity:1}
#vid-card .t{font-size:56px;font-weight:800;letter-spacing:-1px}
#vid-card .s{font-size:24px;font-weight:600;opacity:.92;line-height:1.5}
#vid-card .u{font-size:16px;opacity:.7;margin-top:10px}
#vid-card img{width:150px}`;
async function overlay(p) {
  await p.evaluate((css) => {
    if (document.getElementById('vid-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    for (const id of ['vid-cap', 'vid-ff', 'vid-card']) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
  }, OVERLAY);
}

(async () => {
  const { encode } = await import('next-auth/jwt');
  const value = await encode({ token: { email: 'user@example.com', name: 'user' }, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token' });
  const br = await chromium.launch();
  // 1920×1080 그대로(화면 전송은 화면 밀도를 무시하고 CSS 크기로 보내서, 밀도를 올리지 않고 창 크기를 맞춘다). 앱은 120% 배율이 걸린다
  const ctx = await br.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, viaCurl);
  // harvest 장면(scripts/video/harvest.html)은 앱과 같은 출처로 내보내 공고 검색 화면 위에 덧씌운다(아래 앱 상태는 그대로 남는다)
  await ctx.route(BASE + '/__video/harvest.html', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(__dirname + '/harvest.html') }));
  await ctx.route((url) => url.href.startsWith(BASE + '/__video/shots/'), (route) => {
    const name = decodeURIComponent(route.request().url().split('/__video/shots/')[1]);
    if (!Object.values(HSHOT_FILES).includes(name)) return route.abort();
    route.fulfill({ status: 200, contentType: MIME[name.split('.').pop()], body: fs.readFileSync(SHOT_DIR + '/' + name) });
  });
  const HSHOTS = {}; for (const k in HSHOT_FILES) HSHOTS[k] = BASE + '/__video/shots/' + HSHOT_FILES[k];
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message));

  // 화면 전송 시작
  const cdp = await ctx.newCDPSession(p);
  const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = String(n++).padStart(6, '0') + '.jpg';
    fs.writeFileSync(FR + file, Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp, file });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080 });
  const marks = [];
  const now = () => Date.now() / 1000;
  const wait = (ms) => p.waitForTimeout(ms);
  async function speed(s) {
    marks.push({ t: now(), speed: s });
    await p.evaluate((s) => { const b = document.getElementById('vid-ff'); if (!b) return; b.textContent = '▶▶ ' + s + '배속'; b.classList.toggle('on', s > 1); }, s).catch(() => {});
  }
  async function cap(tag, text) {
    await p.evaluate(([tag, text]) => { const c = document.getElementById('vid-cap'); if (!c) return; if (!text) { c.classList.remove('on'); return; } c.innerHTML = (tag ? '<b>' + tag + '</b>' : '') + '<span>' + text + '</span>'; c.classList.add('on');
      clearTimeout(window.__capT); window.__capT = setTimeout(() => c.classList.remove('on'), 5500); }, [tag, text]);   // 5.5초 뒤 사라져 화면을 가리지 않는다
  }
  async function card(html) {
    await p.evaluate((html) => { const c = document.getElementById('vid-card'); if (!html) { c.classList.remove('on'); return; } c.innerHTML = html; c.classList.add('on'); }, html);
  }
  // 페이지를 옮길 때 불러오는 과정(글꼴이 대체 글꼴 → SUIT로 바뀌는 순간 등)은 영상에서 잘라 낸다:
  // 이동 직전에 1000배속 표시(배지 없이)를 남기고, 글꼴·이미지까지 다 그려진 뒤 1배속으로 돌린다. 화면은 바로 넘어간다
  async function settled(fr) {
    await fr.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((ok) => { i.onload = i.onerror = ok; })));
    }).catch(() => {});
  }
  async function nav(url, settle = 300, fontsOnly = false) {
    marks.push({ t: now(), speed: 1000 });
    await p.goto(url); await overlay(p);
    if (fontsOnly) await p.evaluate(() => document.fonts.ready).catch(() => {});   // 로그인: 마스코트가 불러오자마자 날기 시작해 글꼴만 기다린다
    else {
      await p.waitForLoadState('networkidle').catch(() => {});
      for (const fr of p.frames()) await settled(fr);
    }
    await wait(settle);
    marks.push({ t: now(), speed: 1 });
  }

  // 0 처음 화면: 카드를 바로 덮은 뒤에 녹화 시각을 연다(개인정보처리방침 화면이 비치지 않게)
  await p.goto(BASE + '/privacy'); await overlay(p);
  await p.evaluate(() => { document.getElementById('vid-card').style.transition = 'none'; });
  await card('<img src="/brand/kma-logo-w.png" alt=""><div class="t">Policy Fit</div><div class="s">입찰 공고에서 정책 근거까지,<br>사업 이해도를 높이는 초안 완성</div>');
  await settled(p); await wait(700);
  await speed(1);
  await wait(3600);

  // 1 로그인 화면(마스코트가 카드를 한 바퀴 돈다). 처음 화면 → 로그인
  await nav(BASE + '/login', 0, true);
  await cap('', '구글 계정으로 로그인합니다. 최근 검색과 작업은 계정에 저장돼 어느 PC에서나 이어집니다');
  await wait(6600);

  // 2 개요(8단계 흐름)
  await ctx.addCookies([{ name: 'authjs.session-token', value, url: BASE }]);
  await nav(BASE + '/');
  await cap('', '공고 하나로 정책 근거 검색부터 문서·장표까지 8단계를 잇습니다');
  await wait(4500);

  // 3 공고 찾기(키워드)
  await nav(BASE + '/search', 500);
  const f = p.frame({ url: /prototype\.html/ });
  await f.evaluate(() => { const s = document.createElement('style'); s.textContent = '.vid-hl{outline:3px solid #3868F4!important;outline-offset:3px;transition:outline-color .2s}'; document.head.appendChild(s); });
  const hl = (sel, i = 0) => f.evaluate(([sel, i]) => { const el = document.querySelectorAll(sel)[i]; if (!el) return; el.classList.add('vid-hl'); setTimeout(() => el.classList.remove('vid-hl'), 900); }, [sel, i]);
  // 넓은 화면은 120% 배율이라 Playwright가 iframe 안 좌표를 잘못 잡는다 → 테두리로 누를 곳을 보인 뒤 좌표 없이 클릭 이벤트를 보낸다
  const tap = async (sel, ms = 650, i = 0) => { await hl(sel, i); await wait(ms); await f.locator(sel).nth(i).dispatchEvent('click'); };
  const glide = (scr, to, ms = 1200) => f.evaluate(([scr, to, ms]) => new Promise((ok) => {
    const s = document.querySelector(scr); if (!s) return ok();
    let target = to; if (typeof to === 'string') { const el = document.querySelector(to); if (!el) return ok(); target = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop - 12; }
    const a = s.scrollTop, t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; s.scrollTop = a + (target - a) * e; if (k < 1) requestAnimationFrame(step); else ok(); };
    requestAnimationFrame(step);
  }), [scr, to, ms]);

  await cap('① 공고 찾기', '나라장터 입찰공고와 산하기관 게시판 공고를 키워드 하나로 함께 찾습니다');
  await hl('#no-input'); await f.type('#no-input', '연수', { delay: 180 }); await wait(500);
  await tap('button[type=submit]');
  await speed(4);
  await f.waitForFunction(() => document.querySelector('#find-state').classList.contains('done'), null, { timeout: 90000 });
  await speed(1); await wait(1200);
  await glide('#s-home .scroll', '#find-list', 1400); await wait(2200);
  await glide('#s-home .scroll', 0, 900);

  // 4 공고번호로 시작 → 제안요청서·계보
  await cap('② 공고 조회', '공고번호로 시작하면 제안요청서를 자동으로 읽고, 발주처 → 상위기관 → 주무부처 계보를 잇습니다');
  await f.selectOption('#f-mode', 'no'); await f.fill('#no-input', '');
  await hl('#no-input'); await f.type('#no-input', NOTICE, { delay: 110 }); await wait(400);
  await tap('button[type=submit]');
  await f.waitForSelector('#lineage-card .node', { timeout: 60000 });
  await wait(1500);
  await speed(6);
  await f.waitForFunction(() => /관련도순|키워드순/.test(document.querySelector('#ai-rank-msg').textContent + document.querySelector('#result-count').textContent) && !document.querySelector('.rank-wait'), null, { timeout: 150000 });
  await speed(1); await wait(600);
  await glide('#s-search .scroll', '#notice-card', 1000); await wait(3800);

  // 4-1 정책문서 자동 수집(harvest): 공고 검색 화면 위에 장면을 덧씌웠다가 걷어 낸다
  if (HDATA) {
    await cap('③ 정책문서 자동 수집', '근거가 될 정책문서는 부처·공공기관·시도교육청 게시판에서 매주 모아 지식베이스에 쌓습니다');
    // 화면 전체가 넘어가는 전환: 장면이 오른쪽에서 밀려 들어오며 앱 화면을 왼쪽으로 밀고, 끝나면 반대로 빠진다(1초)
    const EASE = '1000ms cubic-bezier(.65,0,.35,1)';
    await p.evaluate(([src, ease]) => { const f = document.createElement('iframe'); f.id = 'vid-scene'; f.src = src;
      f.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;z-index:99990;background:#F4F4F4;transform:translateX(100%);transition:transform ' + ease + ';zoom:' + (1 / parseFloat(getComputedStyle(document.documentElement).zoom || 1));
      document.body.appendChild(f); }, [BASE + '/__video/harvest.html', EASE]);
    const hf = await (await p.waitForSelector('#vid-scene')).contentFrame();
    await hf.waitForFunction(() => typeof init === 'function');
    await hf.evaluate(([d, b, s]) => init(d, b, s), [HDATA, BASE, HSHOTS]);
    await wait(1500);   // 실제 화면 그림·영상을 미리 받아 둔다
    await p.evaluate((ease) => { const a = document.querySelector('iframe.frame'); a.style.transition = 'transform ' + ease; a.style.transform = 'translateX(-35%)';
      document.getElementById('vid-scene').style.transform = 'translateX(0)'; }, EASE);
    await wait(2000);
    const step = async (i, ms) => { await hf.evaluate((i) => go(i), i); await wait(ms); };
    const realView = async (id, ms) => { if (await hf.evaluate((id) => showReal(id, true), id)) { await wait(ms); await hf.evaluate((id) => showReal(id, false), id); await wait(500); } };
    await step(0, 6500);
    await step(1, 6500);
    await step(2, 6000); await realView('r-sheet', 5200);
    await step(3, 6500); await realView('r-script', 4200); await realView('r-drive', 4200);
    await step(4, 7500);
    if (HSHOT_FILES.actions) await step(5, 5000);
    await p.evaluate((ease) => { const f = document.getElementById('vid-scene'), a = document.querySelector('iframe.frame');
      a.style.transition = 'none'; a.style.transform = 'translateX(35%)'; a.getBoundingClientRect();
      a.style.transition = 'transform ' + ease; a.style.transform = 'translateX(0)'; f.style.transform = 'translateX(-100%)';
      setTimeout(() => { f.remove(); a.style.transition = ''; a.style.transform = ''; }, 1100); }, EASE);
    await wait(1500);
  }

  // 5 정책 근거 검색
  await cap('④ 정책 근거 검색', '정책문서 ' + (DOCS ? DOCS + '건' : '색인') + '에서 근거를 찾고, 제안요청서 문장과 대조해 관련도를 매깁니다');
  await glide('#s-search .scroll', '#terms', 1300); await wait(3000);
  await glide('#s-search .scroll', '#result-grid', 1300); await wait(4500);
  const sc = await f.evaluate(() => document.querySelector('#s-search .scroll').scrollTop);
  await glide('#s-search .scroll', sc + 520, 2600); await wait(1800);

  // 6 선택 → 원문 대조
  await cap('⑤ 원문 대조', '쓸 근거만 고르고, 발췌한 문장을 원문 쪽에서 직접 확인합니다');
  await glide('#s-search .scroll', '#result-grid', 900);
  for (let i = 0; i < 5; i++) await tap('#result-grid .pick', 280, i);
  await wait(500); await tap('#to-review', 600); await wait(800);
  await f.evaluate(() => { const i = CARDS.findIndex((c) => c.sel && !c.r.ocr); if (i >= 0) pick(i); });
  await wait(6000);

  // 7 AI 초안
  await cap('⑥ AI 초안', '역할을 나누고 빈 칸을 채웁니다. 원문에 없는 숫자·기관명이 든 문장은 걸러 냅니다');
  await tap('#rv-next', 700); await wait(1200);
  await tap('#ai-roles-btn', 600); await speed(3);
  await f.waitForFunction(() => !document.querySelector('#ai-roles-btn').disabled && document.querySelector('#ai-roles-msg').textContent, null, { timeout: 90000 });
  await speed(1); await wait(800);
  await tap('#ai-draft-btn', 600); await speed(5);
  await f.waitForFunction(() => !document.querySelector('#ai-draft-btn').disabled && document.querySelector('#ai-draft-msg').textContent, null, { timeout: 120000 });
  await speed(1); await wait(4500);

  // 8 문서 산출
  await cap('⑦ 문서 산출', "출처가 붙은 '사업 이해도·추진 배경' 절을 docx·PDF로 받습니다");
  await glide('#s-export .scroll', '#ex-paper', 1600); await wait(1500);
  const sp = await f.evaluate(() => document.querySelector('#s-export .scroll').scrollTop);
  await glide('#s-export .scroll', sp + 700, 3000); await wait(1200);
  await glide('#s-export .scroll', 0, 1000);
  const dl = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await tap('#dl-btn', 700); await dl; await wait(1600);

  // 9 장표 구도
  await cap('⑧ 장표 구도 추천', '고른 근거에 맞는 사업 이해도 장표 구도를 실제 문구로 보여 줍니다');
  await tap('#s-export .actions .btn.outline', 600);
  await f.waitForSelector('#deck-grid .sl', { timeout: 30000 }); await wait(3000);
  await tap('#ai-deck-btn', 600); await speed(4);
  await f.waitForFunction(() => !document.querySelector('#ai-deck-btn').disabled && document.querySelector('#ai-deck-msg').textContent, null, { timeout: 90000 });
  await speed(1); await wait(3000);
  const tabs = await f.locator('.deck-tabs button').count();
  for (const i of [1, 2, 3].filter((i) => i < tabs)) { await tap('.deck-tabs button', 500, i); await wait(3200); }

  // 10 끝 화면
  await cap('', '');
  await card('<img src="/brand/kma-logo-w.png" alt=""><div class="t">Policy Fit</div><div class="s">정책과 사업 사이, 딱 맞는 근거를 찾다</div><div class="u">policy-fit-azure.vercel.app</div>');
  await wait(4200);
  await speed(1);
  await cdp.send('Page.stopScreencast'); await wait(300);
  fs.writeFileSync(OUT + '/timeline.json', JSON.stringify({ frames, marks, end: now() }, null, 1));
  console.log('frames', frames.length, 'marks', marks.length, 'source seconds', (now() - marks[0].t).toFixed(1));
  await br.close();
})();
