import Link from 'next/link';

// 아이콘은 24px 격자 선 그림(stroke). 단계 순서 = 화면에서 토큰이 지나가는 순서.
const ICON = {
  notice: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><circle cx="11.5" cy="14" r="2.5" /><path d="M13.3 15.8L15 17.5" /></>,
  lineage: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2h12v2" /></>,
  search: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><circle cx="11.5" cy="13" r="2.5" /><path d="M13.3 14.8L15 16.5" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h10M7 12.5h10M7 16h5" /></>,
  select: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  draft: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14 8l3 3" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5" /></>,
  deck: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8M7 8h4M7 11h10" /></>,
};

const STEPS = [
  ['notice', '공고 입력', '공고번호나 키워드로 입찰공고·사전규격을 불러옵니다'],
  ['lineage', '발주처 계보', '발주처에서 상위기관·주무부처까지 소속을 잇습니다'],
  ['search', '정책 근거 검색', '계보 기관의 정책문서에서 관련 과제를 찾습니다'],
  ['card', '정책 근거 카드', '원문 발췌와 문서명·연도·쪽을 카드로 정리합니다'],
  ['select', '근거 선택', '원문을 대조하며 쓸 근거만 고릅니다'],
  ['draft', '초안 생성', '추진 배경 초안을 쓰고, 출처 없는 문장은 막습니다'],
  ['doc', '문서 산출', '사업 이해도·추진 배경 문서를 내려받습니다'],
  ['deck', '장표 구도', '근거 구성에 맞는 장표 구도를 실제 문구로 보여 줍니다'],
];

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <h1>공고번호 하나로,<br />근거부터 장표 구도까지</h1>
        <Link href="/search" className="cta">
          공고 검색하기
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>

        <ol className="flow" aria-label="작업 순서">
          <span className="flow-track" aria-hidden="true"><i className="flow-fill" /><i className="flow-token"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg></i></span>
          {STEPS.map(([k, t, d], i) => (
            <li className="flow-step" key={k} style={{ '--i': i }}>
              <span className="flow-ico" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICON[k]}</svg>
              </span>
              <b>{t}</b>
              <span className="flow-desc">{d}</span>
            </li>
          ))}
        </ol>
        <div className="flow-caption" aria-hidden="true">
          {STEPS.map(([k, , d], i) => <span key={k} style={{ '--i': i }}>{d}</span>)}
        </div>
      </div>
    </div>
  );
}
