import './globals.css';
import Nav from './Nav';
import { currentUser, signOut, AUTH_OFF } from '../auth';

export const metadata = {
  title: 'Policy Fit',
  description: '입찰 공고에서 정책 근거까지, 사업 이해도 초안 도구',
};

export default async function RootLayout({ children }) {
  const user = await currentUser();
  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }
  return (
    <html lang="ko">
      <body>
        <Nav user={user} logout={AUTH_OFF ? null : logout} />
        {children}
      </body>
    </html>
  );
}
