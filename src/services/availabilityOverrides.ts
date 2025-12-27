import type { Database } from 'sql.js';

export type Availability = 'U' | 'AM' | 'PM' | 'B';

export function getOverride(db: Database, personId: number, date: string): Availability | null {
  const res = db.exec(
    `SELECT avail FROM availability_override_active WHERE person_id=? AND date=?`,
    [personId, date]
  );
  const val = res[0]?.values?.[0]?.[0];
  return val != null ? (String(val) as Availability) : null;
}

export function setOverride(db: Database, personId: number, date: string, avail: Availability): void {
  db.run(
    `INSERT INTO availability_override (person_id, date, avail) VALUES (?,?,?)
     ON CONFLICT(person_id, date) DO UPDATE SET avail=excluded.avail`,
    [personId, date, avail]
  );
}

export function deleteOverride(db: Database, personId: number, date: string): void {
  db.run(`DELETE FROM availability_override WHERE person_id=? AND date=?`, [personId, date]);
}

