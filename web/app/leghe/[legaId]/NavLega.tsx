'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type VoceNav = {
  href: string;
  etichetta: string;
  /**
   * Prefisso su cui evidenziare la voce, se diverso da `href`. Serve a "Rose",
   * il cui link salta direttamente alla propria squadra (`rose/Lele`) ma resta
   * la voce attiva su tutta la sezione (`rose/Fonzie` inclusa, quando si
   * guarda la rosa di qualcun altro dalla barra laterale).
   */
  attivoSu?: string;
};

/** Evidenzia la voce di menu attiva (globals.css ha gia' `nav.principale a.attiva`). */
export default function NavLega({ voci }: { voci: VoceNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="principale">
      {voci.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          className={pathname?.startsWith(v.attivoSu ?? v.href) ? 'attiva' : ''}
        >
          {v.etichetta}
        </Link>
      ))}
    </nav>
  );
}
