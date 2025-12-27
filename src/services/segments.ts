import type { Database } from 'sql.js';

export interface SegmentRow {
  id: number;
  name: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  ordering: number;
}

export type Segment = SegmentRow['name'];

export function listSegments(db: Database): SegmentRow[] {
  const res = db.exec(`SELECT id, name, start_time, end_time, ordering FROM segment_active ORDER BY ordering`);
  const values = res[0]?.values || [];
  return values.map((row) => ({
    id: Number(row[0]),
    name: String(row[1]),
    start_time: String(row[2]),
    end_time: String(row[3]),
    ordering: Number(row[4]),
  }));
}

export function createSegment(db: Database, data: Omit<SegmentRow, 'id'>): number {
  db.run(
    `INSERT INTO segment (name, start_time, end_time, ordering) VALUES (?,?,?,?)`,
    [data.name, data.start_time, data.end_time, data.ordering]
  );
  const res = db.exec(`SELECT last_insert_rowid()`);
  return Number(res[0]?.values?.[0]?.[0] || 0);
}

export function updateSegment(db: Database, id: number, data: Partial<Omit<SegmentRow, 'id'>>): void {
  const fields: string[] = [];
  const params: any[] = [];
  if (data.name !== undefined) { fields.push('name=?'); params.push(data.name); }
  if (data.start_time !== undefined) { fields.push('start_time=?'); params.push(data.start_time); }
  if (data.end_time !== undefined) { fields.push('end_time=?'); params.push(data.end_time); }
  if (data.ordering !== undefined) { fields.push('ordering=?'); params.push(data.ordering); }
  if (!fields.length) return;
  params.push(id);
  db.run(`UPDATE segment SET ${fields.join(', ')} WHERE id=?`, params);
}

export function deleteSegment(db: Database, id: number): void {
  db.run(`DELETE FROM segment WHERE id=?`, [id]);
}

