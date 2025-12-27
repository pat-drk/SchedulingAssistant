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
  try {
    // Try to query with logic_operator column
    const res = db.exec(`SELECT id, condition_segment, condition_role_id, target_segment, target_field, baseline, offset_minutes, COALESCE(logic_operator, 'AND') as logic_operator FROM segment_adjustment_active`);
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
  } catch (e) {
    // If logic_operator column doesn't exist yet, query without it
    console.log('Querying segment_adjustment without logic_operator column (pre-migration)');
    const res = db.exec(`SELECT id, condition_segment, condition_role_id, target_segment, target_field, baseline, offset_minutes FROM segment_adjustment_active`);
    const values = res[0]?.values || [];
    return values.map(row => ({
      id: Number(row[0]),
      condition_segment: String(row[1] || ''),
      condition_role_id: row[2] != null ? Number(row[2]) : null,
      target_segment: String(row[3]),
      target_field: row[4] as 'start' | 'end',
      baseline: row[5] as SegmentAdjustmentRow['baseline'],
      offset_minutes: Number(row[6]),
      logic_operator: 'AND' as 'AND' | 'OR' // Default to AND for pre-migration DBs
    }));
  }
}

export function listSegmentAdjustmentConditions(db: Database, adjustmentId: number): SegmentAdjustmentCondition[] {
  try {
    // Use prepared statement for proper parameter binding (db.exec doesn't bind params correctly)
    const stmt = db.prepare(`SELECT id, adjustment_id, condition_segment, condition_role_id FROM segment_adjustment_condition_active WHERE adjustment_id = ?`);
    stmt.bind([adjustmentId]);
    const rows: SegmentAdjustmentCondition[] = [];
    while (stmt.step()) {
      const row = stmt.get();
      rows.push({
        id: Number(row[0]),
        adjustment_id: Number(row[1]),
        condition_segment: String(row[2]),
        condition_role_id: row[3] != null ? Number(row[3]) : null
      });
    }
    stmt.free();
    return rows;
  } catch (e) {
    // Table doesn't exist yet (pre-migration), return empty array
    return [];
  }
}
