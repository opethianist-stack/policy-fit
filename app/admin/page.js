import index from '../../data/corpus-index.json';
import { Bars, Trend } from './Charts';

export const metadata = { title: 'Policy Fit · 관리자 대시보드' };

// 관리자 대시보드(프로토타입). 사용자 검색 기록은 아직 서버에 남기지 않아 ①~③은 고정된 예시 데이터로 그린다.
// 실제로 쌓으려면: 검색·산출 이벤트를 DB(Vercel Postgres 등)에 남기고 /privacy의 보관 항목을 먼저 고친다.
// ④ 정책문서 색인 현황은 data/corpus-index.json 실제 값이다.
const SAMPLE_TERMS = [
  ['AI 교육', 64], ['디지털 새싹', 41], ['교원 연수', 37], ['마이스터고', 29], ['평생교육', 26],
  ['AI 디지털교과서', 22], ['진로교육', 19], ['늘봄학교', 16], ['고교학점제', 12], ['디지털 튜터', 9],
];
const SAMPLE_WEAK = [
  ['정보통신산업진흥원', 14, '과학기술정보통신부'], ['한국지능정보사회진흥원', 11, '과학기술정보통신부'],
  ['대전광역시교육청', 7, '교육부'], ['한국교육개발원', 5, '국무조정실'], ['계명문화대학 산학협력단', 4, '교육부'],
];
function sampleDaily() {
  // 평일에 많고 주말에 적은 30일치(날짜는 오늘 기준, 값은 고정 패턴)
  const base = [9, 14, 17, 15, 12, 3, 2, 11, 16, 19, 18, 14, 4, 2, 13, 18, 21, 17, 15, 5, 3, 14, 20, 23, 19, 16, 4, 3, 17, 22];
  const today = new Date();
  return base.map((v, i) => {
    const d = new Date(today.getTime() - (base.length - 1 - i) * 86400000);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: v };
  });
}

export default function Admin() {
  const daily = sampleDaily();
  const total = daily.reduce((s, x) => s + x.value, 0);
  const cat = {};
  for (const d of index.docs) cat[d.category] = (cat[d.category] || 0) + 1;
  const cats = Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const ocr = index.pages.filter((p) => p.ocr).length;
  const built = new Date(index.builtAt);
  const builtText = `${built.getFullYear()}-${String(built.getMonth() + 1).padStart(2, '0')}-${String(built.getDate()).padStart(2, '0')} ${String(built.getHours()).padStart(2, '0')}:${String(built.getMinutes()).padStart(2, '0')}`;
  return (
    <main className="page admin">
      <div className="admin-head">
        <h1>관리자 대시보드</h1>
        <p className="admin-note"><span className="tag sample">예시 데이터</span> 사용자 검색 기록은 아직 서버에 저장하지 않아 ①~③은 예시 데이터로 채운 화면입니다. <span className="tag real">실제 값</span> ④ 정책문서 색인 현황은 현재 색인입니다.</p>
      </div>

      <section className="tiles" aria-label="최근 30일 요약(예시)">
        <div className="tile"><span className="k">최근 30일 검색</span><b>{total.toLocaleString('ko-KR')}</b><span className="s">건 · 예시</span></div>
        <div className="tile"><span className="k">이용자</span><b>18</b><span className="s">명 · 예시</span></div>
        <div className="tile"><span className="k">문서 산출</span><b>57</b><span className="s">건 · 예시</span></div>
        <div className="tile"><span className="k">5점 근거 없는 검색</span><b>34%</b><span className="s">색인 보강 신호 · 예시</span></div>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <h2>① 검색 키워드 상위 10 <span className="tag sample">예시</span></h2>
          <p className="sub">최근 30일, 공고 검색·정책 근거 검색에 쓰인 검색어 횟수</p>
          <Bars data={SAMPLE_TERMS.map(([label, value]) => ({ label, value }))} unit="회" />
        </section>
        <section className="panel">
          <h2>② 일별 검색 수 <span className="tag sample">예시</span></h2>
          <p className="sub">최근 30일</p>
          <Trend data={daily} unit="건" />
        </section>
        <section className="panel">
          <h2>③ 근거가 약했던 발주기관 <span className="tag sample">예시</span></h2>
          <p className="sub">5점 근거가 하나도 없던 검색이 많은 발주기관 — 이 기관·주무부처 문서를 정책문서 폴더에 더 넣으면 좋아진다</p>
          <table className="weak">
            <thead><tr><th>발주기관</th><th>주무부처</th><th className="n">검색</th></tr></thead>
            <tbody>{SAMPLE_WEAK.map(([o, n, m]) => <tr key={o}><td>{o}</td><td>{m}</td><td className="n">{n}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="panel">
          <h2>④ 정책문서 색인 현황 <span className="tag real">실제 값</span></h2>
          <p className="sub">색인 문서 {index.docs.length}개 · {index.pages.length.toLocaleString('ko-KR')}쪽(그중 OCR {ocr}쪽) · 갱신 {builtText}</p>
          <Bars data={cats} unit="개" />
        </section>
      </div>
    </main>
  );
}
