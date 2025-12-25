import type { Database } from 'sql.js';

export interface SegmentAdjustmentRow {
  id: number;
  condition_segment: string;
  condition_role_id: number | null;
  target_segment: string;
  target_field: 'start' | 'end';
  baseline: 'condition.start' | 'condition.end' | 'target.start' | 'target.end';
  offset_minutes: number;
  priority: number;
  exclusive_group: string | null;
}

export interface PendingAdjustment {
  targetSegment: string;
  targetField: 'start' | 'end';
  newValue: Date;
}

export function listSegmentAdjustments(db: Database): SegmentAdjustmentRow[] {
  const res = db.exec(`SELECT id, condition_segment, condition_role_id, target_segment, target_field, baseline, offset_minutes, priority, exclusive_group FROM segment_adjustment`);
  const values = res[0]?.values || [];
  return values.map(row => ({
    id: Number(row[0]),
    condition_segment: String(row[1]),
    condition_role_id: row[2] != null ? Number(row[2]) : null,
    target_segment: String(row[3]),
    target_field: row[4] as 'start' | 'end',
    baseline: row[5] as SegmentAdjustmentRow['baseline'],
    offset_minutes: Number(row[6]),
    priority: row[7] != null ? Number(row[7]) : 0,
    exclusive_group: row[8] != null ? String(row[8]) : null
  }));
}
