'use client';

import { usePathname } from 'next/navigation';

export type VoceNav = { href: string; etichetta: string };

/** Evidenzia la voce di menu attiva (globals.css ha gia' `nav.principale a.attiva`). */
export default function NavLega({ voci }: { voci: VoceNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="principale">
      {voci.map((v) => (
        <a key={v.href} href={v.href} className={pathname?.startsWith(v.href) ? 'attiva' : ''}>
          {v.etichetta}
        </a>
      ))}
    </nav>
  );
}
