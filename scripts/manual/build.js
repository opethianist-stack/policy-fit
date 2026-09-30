// 매뉴얼 PDF(public/manual.pdf) 만들기: 표지 + 로그인 + 8단계 + 관리자 대시보드, 한 쪽에 설명 + 화면 캡처, A4 가로.
// 사용: node scripts/manual/build.js <캡처 폴더(jpg/login·1~8·admin.jpg가 있는 곳)> public/manual.pdf
// 화면 설명 문구는 아래 STEPS. 화면이 바뀌면 capture.js로 다시 찍고 이 파일의 문구도 고친다
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const D = process.argv[2], OUT = process.argv[3];
const viaCurl = async (route) => { const u = route.request().url(); try { const body = execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', u], { maxBuffer: 50e6 }); await route.fulfill({ status: 200, body, headers: { 'content-type': /css2\?/.test(u) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } }); } catch (e) { await route.abort(); } };
const SUIT = fs.readFileSync(__dirname + '/../../public/fonts/SUIT-Variable.woff2').toString('base64');
const img = (i) => 'data:image/jpeg;base64,' + fs.readFileSync(D + '/jpg/' + i + '.jpg').toString('base64');
const STEPS = [
  ['login', '로그인', '로그인', [
    'Google 계정으로 로그인해야 쓸 수 있습니다. 등록된 계정만 들어갈 수 있습니다. 오른쪽 상자의 "Google 계정으로 로그인"을 누릅니다.',
    '한 번 로그인하면 30일 동안 유지됩니다. 오른쪽 위 계정 옆 "로그아웃"으로 나갑니다.',
    '관리자 계정은 상단에 "API 연결 테스트"·"관리자 대시보드" 탭이 더 보입니다.']],
  ['1', '공고 찾기', '홈', [
    '대상(입찰공고·사전규격)과 찾는 방법(키워드·번호)을 고른 뒤 조회합니다. 기본은 키워드 검색입니다.',
    '키워드 검색 기간은 기본이 가장 긴 기간(입찰공고 최근 30일, 사전규격 최근 21일)이고, 기간 지정으로 입찰공고 최대 92일·사전규격 최대 21일까지 정합니다. 산하기관 게시판 공고(한국과학창의재단·정보통신산업진흥원 사업공고, 한국교육학술정보원 공지)도 함께 나옵니다. 게시판 공고는 최근 1년치이고, 기간 지정이면 그 기간 안의 글만 나옵니다.',
    '공고번호가 없는 사업은 "공고번호 없이 제안요청서로 시작"으로 파일과 사업명·발주기관을 넣어 시작합니다.',
    '최근 검색은 입찰공고·사전규격·게시판 공고·제안요청서 파일로 시작한 작업을 20건까지 남기고(번호가 없는 것은 게시판 이름이나 "제안요청서 별도"로 표시), 넘치면 목록 안에서 스크롤합니다. 다시 열면 저장된 작업을 이어서 할 수 있고, "편집"으로 골라 지울 수 있습니다.']],
  ['2', '공고와 발주처 계보', '정책 근거 검색', [
    '공고 카드에 공고명·수요기관·예산·마감, 투찰 제한(업종·지역·공동수급), 나라장터 링크와 첨부파일이 나옵니다. 사전규격은 의견등록 마감과 규격서 첨부가 나옵니다.',
    '제안요청서는 첨부에서 자동으로 찾아 읽고, 본문에서 뽑은 검색어를 공고명 검색어와 함께 씁니다. 읽지 못하면 "파일 올리기"로 직접 올립니다.',
    '발주처 계보는 발주처 → 상위기관 → 주무부처로 이어지고, 기관마다 색인된 정책문서 수가 붙습니다. "색인 문서 없음"은 정책문서 폴더에 그 기관 문서를 더 넣으라는 표시입니다.']],
  ['3', '정책 근거 검색', '정책 근거 검색', [
    '검색어는 칩으로 보이며 최대 10개입니다. 흐린 칩은 결과에 한 번도 걸리지 않은 검색어입니다.',
    '칩을 지우거나 직접 입력·"AI 검색어 추천"으로 더하면 "관련 정책 근거 재검색" 버튼이 나옵니다. 검색어를 다 고친 뒤 이 버튼을 눌러야 다시 찾고 관련도를 판정합니다.',
    '범위는 유관기관 문서(발주처·상위기관·주무부처 + 범부처)와 관련 정책문서 전체 중에서 고릅니다.',
    '검색 뒤 관련도 판정이 끝날 때까지 "관련도 판정 중 N초"가 보이고, 끝나면 관련도순으로 10건이 나옵니다.']],
  ['4', '정책 근거 카드', '정책 근거 검색', [
    '카드마다 정책문서명·연도·쪽, 관련도(●5단계)와 판정 이유, 원문 발췌가 나옵니다. 발췌 속 검색어는 형광으로 칠합니다.',
    '회색 상자는 제안요청서 목적·배경 문장과 그 쪽의 정책문서 문장 중 가장 잘 맞는 짝입니다. 두 문장 모두 원문 그대로입니다.',
    '5점은 제안요청서 문장과 강한 짝이 있을 때만 나옵니다. 정렬은 관련도 → 정책문서명 가나다 → 쪽 순입니다.',
    '쓸 근거는 "선택"으로 고르고, 결과 줄의 "전체 선택"으로 한 번에 고를 수 있습니다. "원문 열기"는 원본 파일을 엽니다.']],
  ['5', '정책 근거 선택', '정책 근거 선택', [
    '왼쪽은 선택한 근거의 원문 쪽 전체입니다. 발췌 부분이 강조되고, 앞뒤 쪽으로 넘길 수 있습니다.',
    '원문에서 글자를 드래그한 뒤 "선택한 부분으로 발췌"를 누르면 발췌문과 쪽 번호가 그 부분으로 바뀝니다.',
    '"OCR · 원문 확인" 표시가 있는 쪽은 스캔본을 글자로 읽은 것이라 원본과 대조합니다.',
    '오른쪽 목록에서 근거를 넣고 빼고, "선택한 N건으로 문서 산출"로 넘어갑니다.']],
  ['6', '초안 작성', '문서 산출', [
    '근거는 역할 블록(정책 기조·기술·환경·현장 수요·발주기관 계획)에 들어갑니다. 카드의 역할 칩을 누르면 다른 블록으로 옮겨집니다. "AI 역할 분류"로 한 번에 나눌 수도 있습니다.',
    '블록마다 헤드라인, 카드마다 문서 문장, 맨 아래 수렴점(사업 추진의 필요성)을 씁니다. 비워 두면 발췌문을 따옴표로 그대로 싣습니다.',
    '"AI 초안"은 빈칸만 채우고 색칠해 표시합니다. 원문에 없는 숫자·기관명이 든 문장은 넣지 않고 "검증에서 뺀 항목"으로 알립니다.']],
  ['7', '문서 산출', '문서 산출', [
    '오른쪽 미리보기가 산출 문서와 같습니다: 1. 사업 추진 배경(역할 블록별 헤드라인과 개조식 문장, 괄호 출처) → 2. 추진 배경 종합 표 → 참고. 사업 개요 및 발주처 계보.',
    '산출 직전에 발췌문을 색인 원문과 다시 대조하고, 대조에 실패한 근거는 문서에 넣지 않습니다(출처 미확보 문장 차단).',
    '형식에서 docx를 고르면 파일로 내려받고, pdf를 고르면 인쇄 창이 열립니다. 대상을 "PDF로 저장"으로 고릅니다.']],
  ['8', '장표 구도 추천', '구도 추천', [
    '선택한 근거 구성에 맞는 사업 이해도 장표 구도를 탭으로 보여 줍니다. "추천" 표시가 붙은 구도가 기본입니다.',
    '위 입력칸에서 두 줄 헤드라인을 바로 고치고, "AI 문구 다듬기"로 칸 요약 문구를 채웁니다.',
    '글꼴(Noto Sans KR·Pretendard·나눔고딕 등)과 색을 바꿔 볼 수 있고, "이 구도 PDF로 저장"·"추천 구도 전체 PDF"로 내려받습니다.',
    '제안사 쪽 칸(수행 실적, 대응 방향)은 비워 두고 들어갈 내용만 흐리게 적습니다.']],
  ['admin', '관리자 대시보드', '관리자 대시보드', [
    '관리자 계정에만 보이는 탭입니다.',
    '검색 키워드 상위 10개, 일별 검색 수, 근거가 약했던 발주기관은 사용 기록 저장을 붙이기 전이라 예시 데이터입니다("예시" 표시).',
    '정책문서 색인 현황은 현재 색인 값입니다. 문서 수·쪽 수·OCR 쪽 수와 분류별 문서 수, 마지막 갱신 시각이 나옵니다.',
    '근거가 약했던 발주기관은 그 기관·주무부처 문서를 정책문서 폴더에 더 넣으라는 신호로 봅니다.']],
];
const LABEL = { login: '시작', admin: '관리' };
const num = (k) => LABEL[k] || k.padStart(2, '0');
const page = (i, [k, t, where, lines]) => `<section class="pg"><div class="top"><span class="n${LABEL[k] ? ' x' : ''}">${num(k)}</span><span class="t">${t}</span><span class="w">${where} 화면</span><span class="c">${i + 1} / ${STEPS.length}</span></div>
<div class="body"><ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol><div class="shot"><img src="${img(k)}"></div></div></section>`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Policy Fit 사용 매뉴얼</title>
<style>@page{size:297mm 210mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@font-face{font-family:'SUIT Variable';src:url(data:font/woff2;base64,${SUIT}) format('woff2');font-weight:100 900}
body{margin:0;font-family:'SUIT Variable','Noto Sans CJK KR',sans-serif;color:#111111}
.pg{width:297mm;height:210mm;padding:12mm 12mm 10mm;break-after:page;display:flex;flex-direction:column;overflow:hidden}
.pg:last-child{break-after:auto}
.cover{background:#fff;border-top:3mm solid #0000A3;justify-content:center;padding:0 26mm}
.cover .mk{width:16mm;height:16mm;border-radius:4mm;background:#0000A3;margin-bottom:10mm}
.cover h1{font-size:30pt;margin:0 0 4mm;letter-spacing:-.02em}.cover p{font-size:14pt;color:#494949;margin:0 0 16mm}
.cover ol{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(5,1fr);gap:4mm 5mm;max-width:250mm}
.cover li::before{display:none}.cover li{font-size:10.5pt;color:#494949;background:#fff;border:0.3mm solid #DDDDDD;border-radius:1mm;padding:3mm 4mm}.cover li b{color:#0000A3;margin-right:2mm}
.top{display:flex;align-items:baseline;gap:4mm;border-bottom:0.4mm solid #DDDDDD;padding-bottom:4mm;margin-bottom:7mm}
.top .n{font-size:22pt;font-weight:800;color:#0000A3;line-height:1}.top .n.x{font-size:15pt}.top .t{font-size:17pt;font-weight:700}
.top .w{font-size:9.5pt;color:#0000A3;background:#EBEBF7;border-radius:0.5mm;padding:1mm 3.5mm}.top .c{margin-left:auto;font-size:9pt;color:#767676}
.body{flex:1;display:grid;grid-template-columns:62mm 1fr;gap:7mm;min-height:0;align-items:center}
ol{margin:0;padding:0;list-style:none;counter-reset:k}
ol li{counter-increment:k;position:relative;padding-left:7mm;font-size:9.6pt;line-height:1.6;color:#494949;margin-bottom:4mm}
ol li::before{content:counter(k);position:absolute;left:0;top:0.6mm;width:4.6mm;height:4.6mm;border-radius:50%;background:#0000A3;color:#fff;font-size:7pt;font-weight:700;display:flex;align-items:center;justify-content:center}
.shot{align-self:center;border:0.3mm solid #DDDDDD;border-radius:1mm;overflow:hidden}
.shot img{display:block;width:100%}</style></head><body>
<section class="pg cover"><div class="mk"></div><h1>Policy Fit 사용 매뉴얼</h1><p>공고 입력부터 사업 이해도 장표 구도 추천까지</p>
<ol>${STEPS.map(([k, t]) => `<li><b>${num(k)}</b>${t}</li>`).join('')}</ol></section>
${STEPS.map((s, i) => page(i, s)).join('\n')}</body></html>`;
(async () => {
  const b0 = await chromium.launch(); const b = await b0.newContext();
  await b.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, viaCurl);
  const p = await b.newPage(); await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { await Promise.all(['400', '700', '800'].map((w) => document.fonts.load(w + ' 16px "SUIT Variable"', '가나다'))); await document.fonts.ready; });
  await p.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
  await b0.close();
})();
