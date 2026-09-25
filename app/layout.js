import './globals.css';
import Nav from './Nav';

export const metadata = {
  title: 'Policy Fit',
  description: '공고번호 기반 정책 근거 도구',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
