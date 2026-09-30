'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 로그인 안 한 화면(로그인·개인정보처리방침)에서는 탭 없이 로고만. API 연결 테스트는 관리자에게만 보인다
const TABS = [
  { href: '/', label: '개요' },
  { href: '/search', label: '공고 검색' },
  { href: '/api-test', label: 'API 연결 테스트', admin: true },
  { href: '/admin', label: '관리자 대시보드', admin: true },
];

// 로그인 화면 상단 띠에 흘러가는 참고 기관 로고. 원본은 public/brand/orgs/(사용자가 올림), 화면용은 public/brand/orgs/web/
// (JPG는 흰 바탕을 투명하게·여백을 잘라 높이 72px PNG로, SVG는 viewBox를 내용에 맞게). logo가 없으면 이름 글자로 나온다
const ORGS = [
  { name: '교육부', logo: '/brand/orgs/web/moe.svg' },
  { name: '과학기술정보통신부', logo: '/brand/orgs/web/msit.png' },
  { name: '고용노동부', logo: '/brand/orgs/web/moel.svg' },
  { name: '국가인공지능전략위원회', logo: '/brand/orgs/web/aikorea.svg' },
  { name: '조달청', logo: '/brand/orgs/web/pps.svg' },
  { name: '한국교육학술정보원', logo: '/brand/orgs/web/keris.svg' },
  { name: '한국과학창의재단', logo: '/brand/orgs/web/kofac.png' },
  { name: '정보통신산업진흥원', logo: '/brand/orgs/web/nipa.png' },
  { name: '한국지능정보사회진흥원', logo: '/brand/orgs/web/nia.png' },
  { name: '정보통신기획평가원', logo: '/brand/orgs/web/iitp.svg' },
  { name: '전문대학혁신지원사업발전협의회', logo: '/brand/orgs/web/ick.png' },
];

function OrgMarquee() {
  const row = (dup) => ORGS.map((o) => (
    <li key={(dup ? 'b' : 'a') + o.name} aria-hidden={dup || undefined}>
      {o.logo ? <img src={o.logo} alt={dup ? '' : o.name} /> : <span>{o.name}</span>}
    </li>
  ));
  return (
    <div className="orgs" aria-label="참고 기관">
      <ul>{row(false)}{row(true)}</ul>
    </div>
  );
}

export default function Nav({ user, logout }) {
  const path = usePathname();
  const admin = user && user.role === 'admin';
  const tabs = user ? TABS.filter((t) => !t.admin || admin) : [];
  return (
    <div className="topbar">
      <Link href="/" className="mark">
        <div className="sq">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <b>Policy Fit</b>
      </Link>
      {path === '/login' ? <OrgMarquee /> : null}
      <nav className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`tab ${path === t.href ? 'on' : ''}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      {user ? (
        <div className="who">
          <span className={`role ${admin ? 'admin' : ''}`}>{admin ? '관리자' : '사용자'}</span>
          <span className="email" title={user.email}>{user.email}</span>
          {logout ? (
            <form action={logout}>
              <button type="submit" className="logout">로그아웃</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
