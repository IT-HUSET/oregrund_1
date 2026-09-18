import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Rollvaljare } from './Rollvaljare.tsx';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI-kvalitetskontrollant i diariet',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <header className="sidhuvud">
          <strong>AI-kvalitetskontrollant i diariet</strong>
          <Rollvaljare />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
