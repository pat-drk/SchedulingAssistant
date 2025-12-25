import type { Database } from 'sql.js';

export interface SegmentAdjustmentCondition {
  id: number;
  adjustment_id: number;
  condition_segment: string;
  condition_role_id: number | null;
}

export interface SegmentAdjustmentRow {
  id: number;
  condition_segment: string; // Kept for backward compatibility
  condition_role_id: number | null; // Kept for backward compatibility
  target_segment: string;
  target_field: 'start' | 'end';
  baseline: 'condition.start' | 'condition.end' | 'target.start' | 'target.end';
  offset_minutes: number;
  logic_operator: 'AND' | 'OR';
}

export function listSegmentAdjustments(db: Database): SegmentAdjustmentRow[] {
  const res = db.exec(`SELECT id, condition_segment, condition_role_id, target_segment, target_field, baseline, offset_minutes, COALESCE(logic_operator, 'AND') as logic_operator FROM segment_adjustment`);
  const values = res[0]?.values || [];
  return values.map(row => ({
    id: Number(row[0]),
    condition_segment: String(row[1] || ''),
    condition_role_id: row[2] != null ? Number(row[2]) : null,
    target_segment: String(row[3]),
    target_field: row[4] as 'start' | 'end',
    baseline: row[5] as SegmentAdjustmentRow['baseline'],
    offset_minutes: Number(row[6]),
    logic_operator: (row[7] || 'AND') as 'AND' | 'OR'
  }));
}

export function listSegmentAdjustmentConditions(db: Database, adjustmentId: number): SegmentAdjustmentCondition[] {
  const res = db.exec(`SELECT id, adjustment_id, condition_segment, condition_role_id FROM segment_adjustment_condition WHERE adjustment_id = ?`, [adjustmentId]);
  const values = res[0]?.values || [];
  return values.map(row => ({
    id: Number(row[0]),
    adjustment_id: Number(row[1]),
    condition_segment: String(row[2]),
    condition_role_id: row[3] != null ? Number(row[3]) : null
  }));
}
