/**
 * Synced Tables Configuration
 * 
 * These tables have sync tracking columns (sync_id, modified_at, modified_by, deleted_at)
 * and support soft-delete semantics for multi-user merge conflict resolution.
 */

export const SYNCED_TABLES = [
  'person',
  'assignment',
  'training',
  'training_rotation',
  'training_area_override',
  'monthly_default',
  'monthly_default_day',
  'monthly_default_week',
  'monthly_default_note',
  'timeoff',
  'availability_override',
  'needs_baseline',
  'needs_override',
  'competency',
  'person_quality',
  'person_skill',
  'department_event',
] as const;

export type SyncedTable = typeof SYNCED_TABLES[number];

const SYNCED_TABLE_SET = new Set<string>(SYNCED_TABLES);

/**
 * Check if a table has sync tracking columns
 */
export function isSyncedTable(table: string): table is SyncedTable {
  return SYNCED_TABLE_SET.has(table);
}

/**
 * Returns {table}_active view name for UI queries.
 * Active views exclude soft-deleted rows (WHERE deleted_at IS NULL).
 * Use this for all normal user-facing queries.
 */
export function getActiveTable(table: SyncedTable): string {
  return `${table}_active`;
}

/**
 * Returns base table name for admin/history/undelete operations.
 * Base tables include soft-deleted rows with deleted_at populated.
 * Use this for admin features, audit logs, or undelete functionality.
 */
export function getFullTable(table: SyncedTable): string {
  return table;
}

/**
 * Tables that allow "keep all" resolution during merge conflicts.
 * These are additive tables where multiple versions can coexist.
 */
export const ADDITIVE_TABLES: readonly SyncedTable[] = [
  'timeoff',
  'assignment',
  'department_event',
] as const;

/**
 * Check if a table allows "keep all" merge resolution
 */
export function isAdditiveTable(table: string): boolean {
  return (ADDITIVE_TABLES as readonly string[]).includes(table);
}
