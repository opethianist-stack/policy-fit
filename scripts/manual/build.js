// 매뉴얼 PDF(public/manual.pdf) 만들기: 표지 + 개요(브랜드·마스코트) + 로그인 + 8단계 + 관리자 대시보드, 한 쪽에 설명 + 화면 캡처, A4 가로.
// 사용: node scripts/manual/build.js <캡처 폴더(jpg/login·1~8·admin.jpg가 있는 곳)> public/manual.pdf
// 화면 설명 문구는 아래 STEPS. 화면이 바뀌면 capture.js로 다시 찍고 이 파일의 문구도 고친다
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const D = process.argv[2], OUT = process.argv[3];
const viaCurl = async (route) => { const u = route.request().url(); try { const body = execFileSync('curl', ['-s', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', u], { maxBuffer: 50e6 }); await route.fulfill({ status: 200, body, headers: { 'content-type': /css2\?/.test(u) ? 'text/css' : 'font/woff2', 'access-control-allow-origin': '*' } }); } catch (e) { await route.abort(); } };
const SUIT = fs.readFileSync(__dirname + '/../../public/fonts/SUIT-Variable.woff2').toString('base64');
const b64 = (f) => fs.readFileSync(__dirname + '/../../' + f).toString('base64');
const MOTIF = 'data:image/png;base64,' + b64('public/KMA Graphic Motif_png/KMA Graphic Motif_color.png');
const img = (i) => 'data:image/jpeg;base64,' + fs.readFileSync(D + '/jpg/' + i + '.jpg').toString('base64');
const STEPS = [
  ['login', '로그인', '로그인', [
    'Google 계정으로 로그인해야 쓸 수 있습니다. 등록된 계정만 들어갈 수 있습니다. 오른쪽의 "Google 계정으로 로그인"을 누릅니다.',
    '한 번 로그인하면 30일 동안 유지됩니다. 오른쪽 위 계정 옆 "로그아웃"으로 나갑니다.',
    '관리자 계정은 상단에 "API 연결 테스트"·"관리자 대시보드" 탭이 더 보입니다.']],
  ['1', '공고 찾기', '홈', [
    '대상(입찰공고·사전규격)과 찾는 방법(키워드·번호)을 고른 뒤 조회합니다. 기본은 키워드 검색입니다.',
    '키워드 검색 기간은 기본이 가장 긴 기간(입찰공고 최근 30일, 사전규격 최근 21일)이고, 기간 지정으로 입찰공고 최대 92일·사전규격 최대 21일까지 정합니다. 산하기관 게시판 공고(한국과학창의재단·정보통신산업진흥원 사업공고, 한국교육학술정보원 공지)도 함께 나옵니다. 게시판 공고는 최근 1년치이고, 기간 지정이면 그 기간 안의 글만 나옵니다.',
    '공고번호가 없는 사업은 "공고번호 없이 제안요청서로 시작"으로 파일과 사업명·발주기관을 넣어 시작합니다.',
    '최근 검색은 입찰공고·사전규격·게시판 공고·제안요청서 파일로 시작한 작업을 20건까지 남기고(번호가 없는 것은 게시판 이름이나 "제안요청서 별도"로 표시), 넘치면 목록 안에서 스크롤합니다. 다시 열면 저장된 작업을 이어서 할 수 있고, "편집"으로 골라 지울 수 있습니다. 목록과 작업은 로그인한 계정에 저장되어 다른 PC·브라우저에서도 그대로 이어집니다.']],
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
    '검색 키워드 상위 10개, 일별 검색 수, 근거가 약했던 발주기관과 위 요약 타일은 화면 구성을 보여 주는 시연용 예시 데이터입니다("예시" 표시).',
    '검색 기록을 모아 이 항목들을 실제 값으로 채우는 기능은 추후 개발 예정입니다.',
    '정책문서 색인 현황은 현재 색인 값입니다. 문서 수·쪽 수·OCR 쪽 수와 분류별 문서 수, 마지막 갱신 시각이 나옵니다.',
    '근거가 약했던 발주기관은 그 기관·주무부처 문서를 정책문서 폴더에 더 넣으라는 신호로 봅니다.']],
];
const LABEL = { login: '시작', admin: '관리' };
const num = (k) => LABEL[k] || k.padStart(2, '0');
const page = (i, [k, t, where, lines]) => `<section class="pg"><div class="top"><span class="n${LABEL[k] ? ' x' : ''}">${num(k)}</span><span class="t">${t}</span><span class="w">${where} 화면</span><span class="c">${i + 1} / ${STEPS.length}</span></div>
<div class="body"><ol>${lines.map((l) => `<li>${l}</li>`).join('')}</ol><div class="shot"><img src="${img(k)}"></div></div></section>`;
const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
// 개요 쪽(브랜드·마스코트). 마스코트는 SVG 경로가 많아 빌드 때 흰 바탕 JPG로 구워 넣는다(__MASCOT__)
const ICON = {
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="11.5" cy="13.5" r="2.5"/><path d="M13.3 15.3L15 17"/>',
  search: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><circle cx="11" cy="13" r="3"/><path d="M13.2 15.2l2.3 2.3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  chart: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 17v-4M12 17V9M16 17v-6"/>',
};
const ico = (k) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const FLOW = [
  ['01', 'doc', '공고 / 사업 질문', '공고와 제안요청서에서 핵심 키워드를 파악합니다.', '시작 · 01'],
  ['02', 'search', '정책 탐색', '발주처·상위기관·주무부처 흐름을 따라 정책 근거를 찾습니다.', '02 · 03 · 04'],
  ['03', 'link', '근거 연결', '사업에 적합한 정책 근거를 선별하고 사업과 연결합니다.', '05'],
  ['04', 'chart', '초안 · 문서 · 장표', '선택한 근거를 바탕으로 제안 초안, 문서, 장표 구도로 연결합니다.', '06 · 07 · 08'],
];
const OVERVIEW = `<section class="pg ov"><div class="top"><span class="n x">개요</span><span class="t">Policy Fit 소개</span><span class="w">브랜드 · 마스코트</span><span class="c">개요</span></div>
<div class="ovb"><div class="ovl"><h2>정책과 사업 사이,<br><em>딱 맞는 근거를 찾다</em></h2>
<p class="lead">Policy Fit은 공고와 제안요청서에서 출발해 관련 정책을 탐색하고, 사업에 필요한 근거를 연결해 제안 논리와 장표 작성까지 돕는 도구입니다.</p>
<ol><li>공고와 제안요청서에서 핵심 키워드를 파악합니다.</li><li>발주처·상위기관·주무부처 흐름을 따라 정책 근거를 찾습니다.</li><li>선택한 근거를 초안, 문서, 장표 구도로 연결합니다.</li></ol>
<div class="tip"><span class="bulb"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg></span><b>좋은 제안은 <em>좋은 근거</em>에서 시작됩니다.</b></div></div>
<div class="ovr"><div class="flow"><div class="fh"><b class="f1">FIND</b><svg class="ar" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="#4A56EA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h17M13 2l6 6-6 6"/></svg><b class="f2">LINK</b><svg class="ar" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="#4A56EA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h17M13 2l6 6-6 6"/></svg><b class="f3">FIT</b></div><div class="fs">공고에서 제안까지, 정책이 이어지는 하나의 흐름</div>
<svg class="wave" viewBox="0 0 520 24" preserveAspectRatio="none"><defs><linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#3552E6"/><stop offset="1" stop-color="#7B5CF0"/></linearGradient></defs><path d="M6 14 C 80 4, 130 22, 190 13 S 300 4, 370 13 S 470 22, 512 8" fill="none" stroke="url(#wg)" stroke-width="2"/><circle cx="6" cy="14" r="3.6" fill="#fff" stroke="#3552E6" stroke-width="2"/><circle cx="190" cy="13" r="3.6" fill="#fff" stroke="#4A56EA" stroke-width="2"/><circle cx="370" cy="13" r="3.6" fill="#fff" stroke="#6158EE" stroke-width="2"/><path d="M500 3l14 5-12 8" fill="none" stroke="#7B5CF0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<div class="cards">${FLOW.map(([n, k, t, d, m]) => `<div class="fc"><span class="fn">${n}</span><span class="fi">${ico(k)}</span><h4>${t}</h4><p>${d}</p><div class="fm"><b>매뉴얼</b> ${m}</div></div>`).join('')}</div></div>
<div class="masc"><img src="__MASCOT__"><div><div class="mh"><span class="pill">마스코트</span><b>폴링이</b><span class="mt">공고와 정책 사이, 딱 맞는 근거를 이어 주는 안내자</span></div>
<div class="eq"><span class="chip"><b>Policy</b><small>정책</small></span><i>+</i><span class="chip"><b>Link</b><small>연결</small></span><i>=</i><span class="res"><b>폴링이</b><small>정책을 이어 주는 아이</small></span></div>
<p><b>Policy(정책)</b>와 <b>Link(연결)</b>를 합친 이름으로, 공고와 정책 사이를 이어 주는 Policy Fit의 역할을 담았습니다. KMA 심벌의 회전하는 날개를 바람의 형태로 옮긴 ‘바람의 정령’이며, 유연함·연결·확장성을 상징합니다.</p></div></div></div></div>
<div class="foot"><span>Policy Fit 사용 매뉴얼</span><span>KMA AI미래교육본부</span></div></section>`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Policy Fit 사용 매뉴얼</title>
<style>@page{size:297mm 210mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@font-face{font-family:'SUIT Variable';src:url(data:font/woff2;base64,${SUIT}) format('woff2');font-weight:100 900}
body{margin:0;font-family:'SUIT Variable','Noto Sans CJK KR',sans-serif;color:#111111}
.pg{width:297mm;height:210mm;padding:12mm 12mm 10mm;break-after:page;display:flex;flex-direction:column;overflow:hidden}
.pg:last-child{break-after:auto}
.cover{background:#fff;border-top:3mm solid #0000A3;padding:17mm 20mm 12mm}
.brand{display:flex;align-items:center;gap:3.2mm}.brand .mk{width:11mm;height:11mm;border-radius:2.6mm;background:#0000A3;display:flex;align-items:center;justify-content:center}
.brand b{font-size:14pt;font-weight:700;letter-spacing:-.01em}
.hero{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hero .motif{position:absolute;width:60mm;left:50%;top:50%;transform:translate(-8mm,-54%);opacity:.28}
.hero h1{position:relative;font-size:30pt;font-weight:800;margin:0 0 4mm;letter-spacing:-.02em}.hero h1 em{font-style:normal;color:#0000A3}
.hero p{position:relative;font-size:12pt;color:#494949;margin:0}
.cover ol{list-style:none;padding:0;margin:0 0 30mm;display:grid;grid-template-columns:repeat(5,1fr);gap:5mm}
.cover li::before{display:none}.cover li{font-size:10pt;color:#494949;background:#fff;border:0.3mm solid #DDDDDD;border-radius:1.2mm;padding:3.6mm 5mm;margin:0}.cover li b{color:#0000A3;margin-right:2.6mm;font-weight:800}
.foot{display:flex;justify-content:space-between;font-size:8pt;color:#9A9A9A}
.top{display:flex;align-items:baseline;gap:4mm;border-bottom:0.4mm solid #DDDDDD;padding-bottom:4mm;margin-bottom:7mm}
.top .n{font-size:22pt;font-weight:800;color:#0000A3;line-height:1}.top .n.x{font-size:15pt}.top .t{font-size:17pt;font-weight:700}
.top .w{font-size:9.5pt;color:#0000A3;background:#EBEBF7;border-radius:0.5mm;padding:1mm 3.5mm}.top .c{margin-left:auto;font-size:9pt;color:#767676}
.body{flex:1;display:grid;grid-template-columns:62mm 1fr;gap:7mm;min-height:0;align-items:center}
ol{margin:0;padding:0;list-style:none;counter-reset:k}
ol li{counter-increment:k;position:relative;padding-left:7mm;font-size:9.6pt;line-height:1.6;color:#494949;margin-bottom:4mm}
ol li::before{content:counter(k);position:absolute;left:0;top:0.6mm;width:4.6mm;height:4.6mm;border-radius:50%;background:#0000A3;color:#fff;font-size:7pt;font-weight:700;display:flex;align-items:center;justify-content:center}
.shot{align-self:center;border:0.3mm solid #DDDDDD;border-radius:1mm;overflow:hidden}
.shot img{display:block;width:100%}
.ov .foot{margin-top:5mm}
.ovb{flex:1;display:grid;grid-template-columns:84mm 1fr;gap:9mm;min-height:0}
.ovl{display:flex;flex-direction:column;justify-content:center;word-break:keep-all}
.ovl h2{font-size:21pt;line-height:1.35;margin:0 0 6mm;letter-spacing:-.02em;font-weight:800}.ovl h2 em{font-style:normal;color:#0000A3}
.ovl .lead{font-size:9.8pt;line-height:1.75;color:#494949;margin:0 0 7mm}
.ovl ol li{font-size:9.6pt;margin-bottom:4.5mm;padding-left:9mm}.ovl ol li::before{width:5.4mm;height:5.4mm;top:0.2mm}
.tip{margin-top:4mm;background:#F1F2F8;border-radius:2.5mm;padding:4.5mm 5mm;display:flex;align-items:center;gap:4mm;font-size:10.5pt}
.tip .bulb{width:8.5mm;height:8.5mm;border-radius:2mm;background:linear-gradient(135deg,#3552E6,#7B5CF0);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.tip em{font-style:normal;color:#0000A3}
.ovr{background:linear-gradient(135deg,#F4F5FB 0%,#EEF0FA 60%,#E9EAFA 100%);border-radius:5mm;padding:7mm 7mm 6mm;display:flex;flex-direction:column;gap:5mm;min-height:0}
.flow{text-align:center;flex:1;display:flex;flex-direction:column}
.fh{font-size:22pt;font-weight:800;letter-spacing:.01em;display:inline-flex;gap:3.5mm;align-items:center;align-self:center}
.fh .f1{color:#2446E8}.fh .f2{color:#4F55EC}.fh .f3{color:#8150F0}
.fs{font-size:8.6pt;color:#494949;margin:1.2mm 0 4mm}
.wave{display:block;width:100%;height:7mm;margin-bottom:0}
.cards{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:3.6mm;text-align:center}
.fc{position:relative;background:#fff;border-radius:3mm;padding:5mm 3.4mm 3mm;min-height:50mm;display:flex;flex-direction:column;align-items:center;word-break:keep-all}
.fc .fn{position:absolute;left:2.6mm;top:2.6mm;font-size:6.8pt;font-weight:800;color:#0000A3;background:#EEF0FA;border-radius:50%;width:6.4mm;height:6.4mm;display:flex;align-items:center;justify-content:center}
.fc .fi{width:11.5mm;height:11.5mm;border-radius:50%;background:linear-gradient(135deg,#3552E6,#7B5CF0);display:flex;align-items:center;justify-content:center;margin-bottom:2.4mm}
.fc h4{font-size:10pt;margin:0 0 2mm;font-weight:800}
.fc p{font-size:8.4pt;line-height:1.6;color:#494949;margin:0 0 2.6mm;text-align:left;flex:1}
.fc .fm{align-self:stretch;border-top:0.3mm dashed #D5D7E6;padding-top:2mm;font-size:7.4pt;color:#494949;text-align:left}.fc .fm b{color:#0000A3}
.masc{flex:none;margin-top:auto;background:#fff;border-radius:3.5mm;padding:5mm 7mm;display:grid;grid-template-columns:40mm 1fr;gap:6mm;align-items:center;min-height:0;word-break:keep-all}
.masc img{width:40mm;display:block}
.mh{display:flex;align-items:center;gap:3mm;margin-bottom:3mm;flex-wrap:wrap}
.mh .pill{font-size:7.6pt;font-weight:700;color:#fff;background:#0000A3;border-radius:5mm;padding:1mm 3.4mm}.mh b{font-size:16pt;font-weight:800;color:#0000A3}.mh .mt{font-size:8.6pt;color:#494949}
.eq{display:flex;align-items:center;gap:2.6mm;margin-bottom:3mm}.eq i{font-style:normal;color:#6A55EE;font-weight:700}
.eq .chip{background:#F1F2F8;border-radius:1.6mm;padding:1.4mm 3.4mm;display:flex;flex-direction:column;align-items:center;line-height:1.2}.eq .chip b{font-size:10pt;color:#0000A3;letter-spacing:.04em}.eq small{font-size:6.4pt;color:#767676}
.eq .res{display:flex;flex-direction:column;line-height:1.25}.eq .res b{font-size:11pt;color:#0000A3}
.masc p{font-size:8.6pt;line-height:1.7;color:#494949;margin:0}.masc p b{color:#0000A3}
</style></head><body>
<section class="pg cover"><div class="brand"><span class="mk">${CHECK}</span><b>Policy Fit</b></div>
<div class="hero"><img class="motif" src="${MOTIF}"><h1><em>Policy Fit</em> 사용 매뉴얼</h1><p>공고 입력부터 사업 이해도 장표 구도 추천까지</p></div>
<ol>${STEPS.map(([k, t]) => `<li><b>${num(k)}</b>${t}</li>`).join('')}</ol>
<div class="foot"><span>KMA AI미래교육본부</span><span>2026</span></div></section>
${OVERVIEW}
${STEPS.map((s, i) => page(i, s)).join('\n')}</body></html>`;
(async () => {
  const b0 = await chromium.launch(); const b = await b0.newContext();
  await b.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, viaCurl);
  const mp = await b.newPage({ viewport: { width: 420, height: 420 } });
  await mp.setContent(`<html><body style="margin:0;background:#fff"><img id="m" src="data:image/svg+xml;base64,${b64('public/mascot.svg')}" style="width:420px;height:420px;display:block"></body></html>`);
  await mp.waitForFunction(() => document.getElementById('m').complete);
  const MASCOT = 'data:image/jpeg;base64,' + (await mp.locator('#m').screenshot({ type: 'jpeg', quality: 82 })).toString('base64'); // 흰 카드 위라 JPG로
  await mp.close();
  const p = await b.newPage(); await p.setContent(html.replace('__MASCOT__', MASCOT), { waitUntil: 'networkidle' });
  await p.evaluate(async () => { await Promise.all(['400', '700', '800'].map((w) => document.fonts.load(w + ' 16px "SUIT Variable"', '가나다'))); await document.fonts.ready; });
  await p.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
  await b0.close();
})();
