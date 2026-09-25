'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: '개요' },
  { href: '/search', label: '공고 검색' },
  { href: '/api-test', label: 'API 연결 테스트' },
];

export default function Nav() {
  const path = usePathname();
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
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`tab ${path === t.href ? 'on' : ''}`}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
