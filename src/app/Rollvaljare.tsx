'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROLLER = [
  { namn: 'Registrator', href: '/registrator' },
  { namn: 'Handläggare', href: '/handlaggare' },
] as const;

/** Rollen väljs i sidhuvudet och styr vilken vy som visas. Ingen inloggning (FR8). */
export function Rollvaljare() {
  const sokvag = usePathname();
  return (
    <nav aria-label="Roll" className="roller">
      <span>Roll:</span>
      {ROLLER.map((roll) => (
        <Link
          key={roll.namn}
          href={roll.href}
          aria-current={sokvag.startsWith(roll.href) ? 'page' : undefined}
        >
          {roll.namn}
        </Link>
      ))}
    </nav>
  );
}
