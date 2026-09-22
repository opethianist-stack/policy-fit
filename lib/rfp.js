import rules from '../data/org-rules.json';
import { pageFreq, stripJosa } from './search';

const STOPWORDS = new Set(rules.stopwords);

// 제안요청서 본문 → 정책 근거 검색어. LLM 없음.
//  1) 본문을 어절로 자르고 조사·어미 꼬리를 뗀다
//  2) 입찰·계약·평가 서식 용어는 뺀다
//  3) "사업 목적·추진 배경·과업 내용" 부근에 나온 말은 가중치를 준다
//  4) 정책문서 색인에 실제로 나오는 말만 남긴다(색인에 없는 말은 검색에 쓸모가 없다).
//     색인 대부분에 나오는 흔한 말도 뺀다
//  5) 제안요청서 안 빈도 × 색인 희소성으로 점수를 매겨 상위 몇 개를 고른다

const RFP_STOP = new Set([
  // 교재·인쇄물 제작 실무어(실측: 교재 개발 공고에서 인쇄·표지·불량·차시·학생용이 검색어로 들어감)
  // 표 머리말·서식어(실측: 과기부 산하 공고 제안요청서에서 장소·비고·연번·세부내용·적정성·대장·미정·서면·소개가 검색어로 들어감)
  '장소', '비고', '연번', '세부내용', '적정성', '대장', '미정', '서면', '소개', '일시', '담당', '연락처', '보고회', '결과물', '착수보고', '중간보고', '최종보고', '저장', '요구사항', '부스', '안전사고', '기대효과', '추진배경', '사업목적',
  '인쇄', '표지', '불량', '차시', '학생용', '교사용', '지도서', '납품', '제본', '편집', '검수', '부수', '판형', '용지', '컬러', '교정', '감수', '원고', '발송', '배송', '포장', '파본', '재인쇄', '시안', '인쇄물',
  // 입찰·계약·평가 서식
  '어느', '마감', '사업명', '아동학대', '두고', '참여자', '만족도', '재단', '홈페이지', '물품', '현상', '아이디어', '난이도', '한다', '된다', '등에', '제시', '내외', '사전', '확보', '구성', '활용', '향상', '이해', '실습', '강의', '시설', '숙박', '식사', '간식', '교재', '섭외', '최초로', '사업개요', '수정이', '진행',  '접수', '신청', '선정', '문의', '공고', '공모', '이의신청', '협력기관', '수행기관', '주관기관', '신청기관', '참여기관', '운영기관', '수혜자', '시스템', '사업관리시스템', '프로세스', '분과', '기획', '개발', '기획·개발', '기획·운영', '목적', '배경', '필요성', '개요', '특징', '시사점', '범위', '제안서', '제안요청서', '제안사', '제안업체', '입찰', '입찰자', '낙찰자', '계약', '계약자', '계약상대자', '용역', '과업', '과업지시서', '수행', '수행사', '사업자', '발주기관', '발주처', '평가', '평가위원', '평가항목', '배점', '점수', '기술평가', '가격평가', '협상', '제출', '제출물', '서류', '서식', '별지', '붙임', '첨부', '참고', '기타', '해당', '사항', '내용', '관련', '경우', '이상', '이하', '미만', '초과', '이내', '기간', '일정', '금액', '예산', '부가가치세', '포함', '원칙', '준수', '의무', '책임', '규정', '법률', '시행령', '시행규칙', '조항', '조치', '요청', '요구', '제공', '확인', '작성', '검토', '승인', '협의', '통보', '보고', '보고서', '착수', '중간', '완료', '최종', '산출물', '하자', '보증', '지체상금', '보안', '비밀', '서약서', '개인정보', '저작권', '소유권', '인력', '투입인력', '참여인력', '업체', '기관', '담당자', '공동수급', '하도급', '대표', '페이지', '목차', '구분', '항목', '방법', '방안', '계획', '추진', '운영', '관리', '지원', '사업', '분야', '대상', '기준', '수준', '결과', '위한', '따른', '통한', '대한', '있는', '없는', '있음', '없음', '가능', '필요', '반드시', '모든', '각종', '다음', '아래', '위의', '본', '당해', '해당연도', '년도', '연도',
]);

// 제목 줄 판정. 본문 문장 속 "과업 내용을 변경하는 경우" 같은 말에 걸리지 않도록, 번호를 뗀 줄의 **맨 앞**에서만 본다.
const NUM = /^\s*(?:제\s*\d+\s*[장절]|\d+\s*[.)]|[가-하]\s*[.)]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.)]?|[□■○◦▪●◾◯\-–〈<\[【])?\s*/;
const TOP_NUM = /^\s*(?:제\s*\d+\s*[장절]|\d+\s*[.)]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.)]?)\s*\S/;
const FOCUS_H = /^[(（「]?\s*(?:(?:사업|과업|용역)\s*(?:의\s*)?(?:목적|배경|필요성|개요|내용|범위)|목적\s*및\s*필요성|추진\s*(?:배경|근거|목적)|기대\s*효과|주요\s*(?:과업|내용)|세부\s*과업|(?:사업\s*)?세부\s*내용|제안\s*요청\s*개요|사업의\s*목적|(?:목적|배경|필요성)\s*[)）:：])/;
const BOILER_H = /^[(（]?\s*(?:입찰|참가\s*자격|(?:지원|신청|공모)\s*(?:자격|대상|방법|절차)|자격|계약|평가|제안서|제출|보안|개인정보|선정\s*(?:절차|방법)|이의|문의|청렴|클린|하자|지체|유의\s*사항|일반\s*사항|기타|낙찰|협상|사업자\s*선정|제안\s*요청\s*사항|공동\s*수급)/;
function lineKind(line) {
  const rest = line.replace(NUM, '');
  if (FOCUS_H.test(rest)) return 'focus';
  if (BOILER_H.test(rest)) return 'boiler';
  if (TOP_NUM.test(line) && rest.length <= 30) return 'other';     // 다른 큰 제목: 앞 구역을 끝낸다
  return null;
}
const VERBISH = /(니다|시오|바람|.{2,}한|.{2,}된|.{2,}함|므로|할|될|하게|하지|해야|하면|되면|되고|으며|했|하였|있|없|습니다|합니다|십시오)$/;
const DOCISH = /(보고서|계획서|신청서|서약서|확인서|제안서|증명서|명세서|협약서|동의서)$/;
const ORG_ONLY = /(재단|진흥원|교육청|교육지원청|공단|연구원|정보원|평가원|개발원|협회|협의회|위원회|대학교|산학협력단|정보통신부|교육부)$/;

// 제안요청서 안의 말별 가중 빈도(색인과 무관한 부분). Map 반환
export function rfpCounts(text) {
  const lines = String(text || '').split('\n');
  const tf = new Map();
  let zone = 'other', left = 0;
  for (const line of lines) {
    const k = lineKind(line);
    if (k) { zone = k; left = 60; }
    else if (left > 0 && --left === 0) zone = 'other';
    const w = zone === 'focus' ? 3 : zone === 'boiler' ? 0 : 0.3;   // 목적·배경·과업 구역을 크게, 자격·평가·절차 구역은 세지 않는다
    if (/@|https?:|www\./i.test(line)) continue;                         // 메일·주소 줄
    for (const raw of line.split(/[^가-힣A-Za-z0-9·]+/)) {
      let t = stripJosa(raw.replace(/^·+|·+$/g, ''));
      if (t.length >= 3 && /[의와이]$/.test(t) && !/(주의|어린이)$/.test(t)) t = t.slice(0, -1);   // "학습자의", "직원이" ("기대효과"처럼 '과'로 끝나는 명사가 많아 '과'는 떼지 않는다)
      if (t.length > 3 && t.endsWith('별')) t = t.slice(0, -1);          // "프로세스별" → "프로세스"
      if (VERBISH.test(t)) continue;                                   // "참여할", "운영하게" 같은 서술어
      if (t.length >= 5 && ORG_ONLY.test(t)) continue;                 // 기관 이름은 계보가 맡는다
      if (t.length < 2 || t.length > 12) continue;
      if (/\d/.test(t)) continue;                                      // 숫자가 섞인 말(초5, 1차년도)
      if (/^[a-z]+$/.test(t)) continue;                                // 소문자 영단어(주소 조각)
      if (t.length === 2 && /[을를이가은는]$/.test(t)) continue;         // 한 글자 명사 + 조사(팀을)
      if (DOCISH.test(t)) continue;                                    // 서류 이름(정산보고서, 사업계획서)
      if (/^[A-Za-z]{1,2}$/.test(t)) continue;
      if (!w || RFP_STOP.has(t) || STOPWORDS.has(t)) continue;
      tf.set(t, (tf.get(t) || 0) + w);
    }
  }
  // "시간이", "교육도"처럼 한 글자 조사가 붙은 말은 같은 줄기가 따로 나오면 그쪽으로 합친다
  for (const [t, n] of [...tf.entries()]) {
    const stem = t.slice(0, -1);
    if (t.length < 3 || !/[이가도로만과와의]$/.test(t)) continue;
    if (RFP_STOP.has(stem) || STOPWORDS.has(stem)) tf.delete(t);          // "분야로" — 줄기가 제외어면 버린다
    else if (tf.has(stem)) { tf.set(stem, tf.get(stem) + n); tf.delete(t); }
  }
  return tf;
}

export function termsFromRfp(text, { exclude = [], limit = 6 } = {}) {
  const tf = rfpCounts(text);
  const skip = new Set(exclude.map((x) => x.toLowerCase()));
  const inTitle = (t) => [...skip].some((x) => x.includes(t.toLowerCase()) || (x.length >= 3 && t.toLowerCase().includes(x)));   // "AI동행"이 있으면 "동행"도 뺀다
  const cand = [...tf.entries()].filter(([t, n]) => n >= 2 && !inTitle(t))
    .sort((a, b) => b[1] - a[1]).slice(0, 160).map(([t]) => t);
  const { df, total } = pageFreq(cand);
  const scored = cand
    .filter((t) => df[t] > 0 && df[t] / total < 0.25)
    // 색인에 한두 번만 나오는 말은 우연히 겹친 경우가 많아 깎는다(df 4쪽 미만이면 비례 감점)
    .map((t) => ({ t, score: Math.log(1 + Math.min(tf.get(t), 30)) * Math.log(total / df[t]) * Math.min(1, df[t] / 4) }))
    .sort((a, b) => b.score - a.score);
  // 긴 말에 포함된 짧은 말은 하나만(예: "교원역량" 이 있으면 "역량" 은 뺀다)
  const out = [];
  for (const { t } of scored) {
    if (out.some((o) => o.includes(t) || t.includes(o))) continue;
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// 제안요청서에서 사업명·발주기관을 추정한다(나라장터 밖 사업용 입력칸 미리 채우기). 못 찾으면 빈 값.
// 발주기관은 "발주기관: ○○" 같은 칸이 없는 문서가 많다. 제안요청서의 "주관기관"은 대개 **제안하는 쪽**을
// 가리키므로(예: "주관기관, 컨소시엄 가능") 쓰지 않는다. 순서: ① 발주기관·수요기관 칸(기관 이름처럼 보일 때만)
// ② 공고문 서명줄("한국과학창의재단이사장", "○○교육감") ③ 본문에 가장 많이 나오는 기관 이름.
const ORG_TAIL = '(?:재단|진흥원|교육청|교육지원청|교육원|연수원|공단|공사|연구원|정보원|평가원|개발원|학술정보원|협회|협의회|위원회|대학교|대학|고등학교|중학교|초등학교|학교|산학협력단|센터|부|처|청|원)';
const ORG_RE = new RegExp(`^[가-힣A-Za-z0-9·()]{2,30}${ORG_TAIL}$`);
const SIGN_RE = /^([가-힣]{2,30}?)(?:이사장|원장|교육감|교육장|총장|청장|장관|시장|도지사|구청장|군수|사장|위원장|회장|학교장|센터장|단장)$/;
// 본문 빈도로 찾을 때는 '원·부·처·청' 같은 한 글자 꼬리를 쓰지 않는다("평가위원", "교원"이 걸린다)
const ORG_WORD = /[가-힣]{2,25}(?:재단|진흥원|교육청|교육지원청|교육원|연수원|공단|공사|정보원|평가원|개발원|학술정보원|협회|협의회|위원회|대학교|고등학교|중학교|초등학교|산학협력단|센터|교육부|정보통신부|노동부|안전부|복지부|체육관광부)/g;
const GENERIC_ORG = new Set(['주관기관', '협력기관', '신청기관', '참여기관', '운영기관', '수행기관', '전담기관', '교육기관', '공공기관', '관계기관', '해당기관', '발주기관', '대학', '학교', '재단', '센터', '위원회', '협회', '각급학교', '초중고', '초등학교', '중학교', '고등학교', '대학교']);

export function guessMeta(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 120);
  // 값이 같은 줄에 있는 경우("1. 과 업 명: ○○")를 먼저 찾고, 없으면 표 칸처럼 제목 다음 줄을 값으로 본다
  const valueAfter = (re) => {
    const strip = (l) => l.replace(/^\s*(?:\d+\s*[.)]|[가-하]\s*[.)]|[□○◦▪●\-])\s*/, '');
    const clean = (v) => v.replace(/^[\s:：)\]·\-–]+/, '').trim();
    for (const l of head) { const m = strip(l).match(re); const v = m && clean(m[1] || ''); if (v && v.length >= 2) return v.slice(0, 80); }
    for (let i = 0; i < head.length - 1; i++) { const m = strip(head[i]).match(re); if (m && !clean(m[1] || '') && head[i + 1].length >= 2) return head[i + 1].slice(0, 80); }
    return '';
  };
  let name = valueAfter(/^(?:\(?\s*)?(?:사\s*업\s*명|용\s*역\s*명|과\s*업\s*명)\s*\)?\s*[:：]?\s*(.*)$/);

  if (!name) {   // 공고문 첫머리의 「사업명」
    for (const l of head.slice(0, 10)) { const m = l.match(/[「『]([^」』]{4,80})[」』]/); if (m) { name = m[1].trim(); break; } }
  }

  let org = '';
  const labeled = valueAfter(/^(?:\(?\s*)?(?:발\s*주\s*기\s*관|발\s*주\s*처|수\s*요\s*기\s*관|공\s*고\s*기\s*관)\s*\)?\s*[:：]?\s*(.*)$/);
  if (labeled && ORG_RE.test(labeled.replace(/\s/g, ''))) org = labeled.replace(/\s/g, '');
  if (!org) {
    for (const l of lines) {
      const flat = l.replace(/\s/g, '');
      const m = flat.match(SIGN_RE);
      const o = m && (/학교장$/.test(flat) ? flat.slice(0, -1) : m[1]);   // "○○고등학교장" → "○○고등학교"
      if (o && !GENERIC_ORG.has(o)) { org = o; break; }
    }
  }
  if (!org) {
    const count = new Map();
    for (const w of String(text || '').match(ORG_WORD) || []) {
      if (GENERIC_ORG.has(w) || w.length < 4 || (/위원회$/.test(w) && !/^(국가|대통령|중앙)/.test(w)) || /(지원|운영|상담|콜)센터$/.test(w)) continue;
      count.set(w, (count.get(w) || 0) + 1);
    }
    const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]);
    let top = ranked[0];
    // "평생교육원"보다 그걸 품은 정식 이름("세종특별자치시교육청평생교육원")이 두 번 이상 나오면 그쪽
    const longer = top && ranked.filter(([w, n]) => n >= 2 && w.length > top[0].length && w.endsWith(top[0])).sort((a, b) => b[1] - a[1])[0];
    if (longer) top = longer;
    if (top && top[1] >= 2) org = top[0];
  }
  return { name, org };
}
