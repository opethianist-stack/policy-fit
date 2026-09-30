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
