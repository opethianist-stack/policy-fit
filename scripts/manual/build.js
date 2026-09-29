// 매뉴얼 PDF(public/manual.pdf) 만들기: 표지 + 단계별 1쪽(설명 + 화면 캡처), A4 가로.
// 사용: node scripts/manual/build.js <캡처 폴더(mjpg/1~8.jpg가 있는 곳)> public/manual.pdf
// 화면 설명 문구는 아래 STEPS. 화면이 바뀌면 capture.js로 다시 찍고 이 파일의 문구도 고친다
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const D = process.argv[2], OUT = process.argv[3];
const viaCurl = async (route) => { const u = route.request().url(); try { const body = execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', u], { maxBuffer: 50e6 }); await route.fulfill({ status: 200, body, headers: { 'content-type': /css2\?/.test(u) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } }); } catch (e) { await route.abort(); } };
const img = (i) => 'data:image/jpeg;base64,' + fs.readFileSync(D + '/mjpg/' + i + '.jpg').toString('base64');
const STEPS = [
  ['공고 찾기', '홈', [
    '대상(입찰공고·사전규격)과 찾는 방법(번호·키워드)을 고른 뒤 조회합니다.',
    '키워드 검색은 최근 7·14·30일 또는 기간 지정(입찰공고 최대 92일, 사전규격 최대 21일)으로 범위를 정합니다. 산하기관 게시판 사업공고도 함께 나옵니다.',
    '공고번호가 없는 사업은 "공고번호 없이 제안요청서로 시작"으로 파일과 사업명·발주기관을 넣어 시작합니다.',
    '최근 검색(최대 20건)에서 다시 열면 저장된 작업을 이어서 할 수 있습니다. "편집"으로 골라 지울 수 있습니다.']],
  ['공고와 발주처 계보', '정책 근거 검색', [
    '공고 카드에 공고명·수요기관·예산·마감, 투찰 제한(업종·지역·공동수급), 첨부파일이 나옵니다.',
    '제안요청서는 첨부에서 자동으로 찾아 읽고, 본문에서 뽑은 검색어를 공고명 검색어와 함께 씁니다. 읽지 못하면 "파일 올리기"로 직접 올립니다.',
    '발주처 계보는 발주처 → 상위기관 → 주무부처로 이어지고, 기관마다 색인된 정책문서 수가 붙습니다. "색인 문서 없음"은 정책문서 폴더에 그 기관 문서를 더 넣으라는 표시입니다.']],
  ['정책 근거 검색', '정책 근거 검색', [
    '검색어는 칩으로 보이며 최대 10개입니다. 칩을 지우면 다시 검색하지 않고 지금 결과에서 그 검색어로만 걸린 근거를 뺍니다. 흐린 칩은 결과에 한 번도 걸리지 않은 검색어입니다.',
    '"AI 검색어 추천"은 색인에 있는 말만 후보로 보여 줍니다. 눌러서 추가하면 다시 검색합니다.',
    '범위는 유관기관 문서(발주처·상위기관·주무부처 + 범부처)와 관련 정책문서 전체 중에서 고릅니다.',
    '검색 뒤 관련도 판정이 끝날 때까지 "관련도 판정 중 N초"가 보이고, 끝나면 관련도순으로 10건이 나옵니다.']],
  ['정책 근거 카드', '정책 근거 검색', [
    '카드마다 정책문서명·연도·쪽, 관련도(●5단계)와 판정 이유, 원문 발췌가 나옵니다. 발췌 속 검색어는 형광으로 칠합니다.',
    '회색 상자는 제안요청서 목적·배경 문장과 그 쪽의 정책문서 문장 중 가장 잘 맞는 짝입니다. 두 문장 모두 원문 그대로입니다.',
    '5점은 제안요청서 문장과 강한 짝이 있을 때만 나옵니다. 정렬은 관련도 → 정책문서명 가나다 → 쪽 순입니다.',
    '쓸 근거는 "선택"으로 고르고, 결과 줄의 "전체 선택"으로 한 번에 고를 수 있습니다. "원문 열기"는 원본 파일을 엽니다.']],
  ['정책 근거 선택', '정책 근거 선택', [
    '왼쪽은 선택한 근거의 원문 쪽 전체입니다. 발췌 부분이 강조되고, 앞뒤 쪽으로 넘길 수 있습니다.',
    '원문에서 글자를 드래그한 뒤 "선택한 부분으로 발췌"를 누르면 발췌문과 쪽 번호가 그 부분으로 바뀝니다.',
    '"OCR · 원문 확인" 표시가 있는 쪽은 스캔본을 글자로 읽은 것이라 원본과 대조합니다.',
    '오른쪽 목록에서 근거를 넣고 빼고, "선택한 N건으로 문서 산출"로 넘어갑니다.']],
  ['초안 작성', '문서 산출', [
    '근거는 역할 블록(정책 기조·기술·환경·현장 수요·발주기관 계획)에 들어갑니다. 카드의 역할 칩을 누르면 다른 블록으로 옮겨집니다. "AI 역할 분류"로 한 번에 나눌 수도 있습니다.',
    '블록마다 헤드라인, 카드마다 문서 문장, 맨 아래 수렴점(사업 추진의 필요성)을 씁니다. 비워 두면 발췌문을 따옴표로 그대로 싣습니다.',
    '"AI 초안"은 빈칸만 채우고 보라색으로 표시합니다. 원문에 없는 숫자·기관명이 든 문장은 넣지 않고 "검증에서 뺀 항목"으로 알립니다.']],
  ['문서 산출', '문서 산출', [
    '오른쪽 미리보기가 산출 문서와 같습니다: 1. 사업 추진 배경(역할 블록별 헤드라인과 개조식 문장, 괄호 출처) → 2. 추진 배경 종합 표 → 참고. 사업 개요 및 발주처 계보.',
    '산출 직전에 발췌문을 색인 원문과 다시 대조하고, 대조에 실패한 근거는 문서에 넣지 않습니다(출처 미확보 문장 차단).',
    '형식에서 docx를 고르면 파일로 내려받고, pdf를 고르면 인쇄 창이 열립니다. 대상을 "PDF로 저장"으로 고릅니다.']],
  ['장표 구도 추천', '구도 추천', [
    '선택한 근거 구성에 맞는 사업 이해도 장표 구도를 탭으로 보여 줍니다. "추천" 표시가 붙은 구도가 기본입니다.',
    '위 입력칸에서 두 줄 헤드라인을 바로 고치고, "AI 문구 다듬기"로 칸 요약 문구를 채웁니다.',
    '글꼴(Noto Sans KR·Pretendard·나눔고딕 등)과 색을 바꿔 볼 수 있고, "이 구도 PDF로 저장"·"추천 구도 전체 PDF"로 내려받습니다.',
    '제안사 쪽 칸(수행 실적, 대응 방향)은 비워 두고 들어갈 내용만 흐리게 적습니다.']],
];
const page = (i, [t, where, lines]) => `<section class="pg"><div class="top"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${t}</span><span class="w">${where} 화면</span><span class="c">${i + 1} / ${STEPS.length}</span></div>
<div class="body"><ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol><div class="shot"><img src="${img(i + 1)}"></div></div></section>`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Policy Fit 사용 매뉴얼</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap">
<style>@page{size:297mm 210mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Noto Sans KR',sans-serif;color:#191F28}
.pg{width:297mm;height:210mm;padding:12mm 12mm 10mm;break-after:page;display:flex;flex-direction:column;overflow:hidden}
.pg:last-child{break-after:auto}
.cover{background:linear-gradient(180deg,#f6f3ff 0%,#efeaff 55%,#fff 100%);justify-content:center;padding:0 26mm}
.cover .mk{width:16mm;height:16mm;border-radius:4mm;background:#7353EA;margin-bottom:10mm}
.cover h1{font-size:30pt;margin:0 0 4mm;letter-spacing:-.02em}.cover p{font-size:14pt;color:#4E5968;margin:0 0 16mm}
.cover ol{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(4,1fr);gap:4mm 6mm;max-width:210mm}
.cover li::before{display:none}.cover li{font-size:10.5pt;color:#343E4B;background:#fff;border:0.3mm solid #E3DCFB;border-radius:3mm;padding:3mm 4mm}.cover li b{color:#7353EA;margin-right:2mm}
.top{display:flex;align-items:baseline;gap:4mm;border-bottom:0.4mm solid #E9EBF0;padding-bottom:4mm;margin-bottom:7mm}
.top .n{font-size:22pt;font-weight:800;color:#7353EA;line-height:1}.top .t{font-size:17pt;font-weight:700}
.top .w{font-size:9.5pt;color:#7353EA;background:#F1EDFE;border-radius:10mm;padding:1mm 3.5mm}.top .c{margin-left:auto;font-size:9pt;color:#8B95A1}
.body{flex:1;display:grid;grid-template-columns:62mm 1fr;gap:7mm;min-height:0;align-items:center}
ol{margin:0;padding:0;list-style:none;counter-reset:k}
ol li{counter-increment:k;position:relative;padding-left:7mm;font-size:9.6pt;line-height:1.6;color:#343E4B;margin-bottom:4mm}
ol li::before{content:counter(k);position:absolute;left:0;top:0.6mm;width:4.6mm;height:4.6mm;border-radius:50%;background:#7353EA;color:#fff;font-size:7pt;font-weight:700;display:flex;align-items:center;justify-content:center}
.shot{align-self:center;border:0.3mm solid #D5D9E0;border-radius:2mm;overflow:hidden;box-shadow:0 1mm 3mm rgba(25,31,40,.08)}
.shot img{display:block;width:100%}</style></head><body>
<section class="pg cover"><div class="mk"></div><h1>Policy Fit 사용 매뉴얼</h1><p>공고 입력부터 사업 이해도 장표 구도 추천까지</p>
<ol>${STEPS.map(([t], i) => `<li><b>${String(i + 1).padStart(2, '0')}</b>${t}</li>`).join('')}</ol></section>
${STEPS.map((s, i) => page(i, s)).join('\n')}</body></html>`;
(async () => {
  const b0 = await chromium.launch(); const b = await b0.newContext();
  await b.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, viaCurl);
  const p = await b.newPage(); await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { await Promise.all(['400', '700', '800'].map((w) => document.fonts.load(w + ' 16px "Noto Sans KR"', '가나다'))); await document.fonts.ready; });
  await p.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
  await b0.close();
})();
