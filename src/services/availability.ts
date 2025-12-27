import type { Database } from 'sql.js';
import { getOverride, Availability } from './availabilityOverrides';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function availabilityFor(
  db: Database | null,
  personId: number,
  date: Date
): Availability {
  if (!db) return 'U';
  const override = getOverride(db, personId, ymd(date));
  if (override) return override;
  const dow = date.getDay(); // 0=Sun..6=Sat
  let field: string | null = null;
  switch (dow) {
    case 1: field = 'avail_mon'; break;
    case 2: field = 'avail_tue'; break;
    case 3: field = 'avail_wed'; break;
    case 4: field = 'avail_thu'; break;
    case 5: field = 'avail_fri'; break;
    default: return 'U';
  }
  const res = db.exec(`SELECT ${field} AS avail FROM person_active WHERE id=?`, [personId]);
  const val = res[0]?.values?.[0]?.[0];
  return (val != null ? String(val) : 'U') as Availability;
}

export type { Availability };
