/**
 * ThreeWayMerge - Git-style 3-way merge for SQLite databases
 * 
 * Uses sync_id, modified_at, and deleted_at columns added by migration 29
 * to detect and resolve conflicts between a base database and working copies.
 * 
 * Merge Logic:
 * 1. Compare each row's sync_id and modified_at between base, A, and B
 * 2. If only one side modified → use that version
 * 3. If both modified same row → CONFLICT (needs user resolution)
 * 4. Soft deletes (deleted_at IS NOT NULL) propagate if not conflicting
 */

import type { Database } from 'sql.js';
import { SYNCED_TABLES, isAdditiveTable } from '../utils/syncedTables';

export interface MergeResult {
  /** Whether the merge completed without conflicts */
  success: boolean;
  /** Number of rows merged automatically */
  autoMergedCount: number;
  /** Number of rows inserted (new in working files) */
  insertedCount: number;
  /** Number of soft deletes propagated */
  deletedCount: number;
  /** Conflicts that need user resolution */
  conflicts: MergeConflict[];
  /** Summary of changes by table */
  changesByTable: Record<string, TableMergeStats>;
}

export interface TableMergeStats {
  inserted: number;
  updated: number;
  deleted: number;
  conflicts: number;
}

export interface MergeConflict {
  /** Unique key for this conflict: ${table}:${syncId} */
  conflictKey: string;
  /** Table name */
  table: string;
  /** The sync_id of the conflicting row */
  syncId: string;
  /** Human-readable description of the row (for display) */
  rowDescription: string;
  /** The base version of the row (before changes) */
  baseRow: Record<string, unknown> | null;
  /** All modifiers (users who changed this row) */
  modifiers: Array<{
    email: string;
    row: Record<string, unknown> | null;
    modifiedAt: string | null;
  }>;
  /** Whether this table allows "keep all" resolution (additive tables like timeoff, assignment) */
  allowMultiple: boolean;
}

/** Resolution choice for a conflict */
export type ConflictResolution = 
  | { type: 'base' }                    // Keep original/base version
  | { type: 'modifier'; index: number } // Keep specific modifier's version
  | { type: 'delete' }                  // Accept deletion
  | { type: 'all' };                    // Keep all versions (for allowMultiple tables)

export interface ConflictResolutionEntry {
  conflictKey: string;
  table: string;
  syncId: string;
  resolution: ConflictResolution;
}

// Re-export SYNCED_TABLES for consumers that imported from here
export { SYNCED_TABLES };

/**
 * Gets all rows from a table as a map keyed by sync_id
 */
function getTableRows(db: Database, table: string): Map<string, Record<string, unknown>> {
  const rows = new Map<string, Record<string, unknown>>();
  try {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      const syncId = row.sync_id as string;
      if (syncId) {
        rows.set(syncId, row);
      }
    }
    stmt.free();
  } catch (e) {
    console.warn(`[ThreeWayMerge] Error reading table ${table}:`, e);
  }
  return rows;
}

/**
 * Gets a human-readable description of a row for conflict display
 */
function getRowDescription(table: string, row: Record<string, unknown>): string {
  switch (table) {
    case 'person':
      return `${row.first_name} ${row.last_name}`;
    case 'assignment':
      return `Assignment on ${row.date}`;
    case 'training':
      return `Training: ${row.name || row.id}`;
    case 'timeoff':
      return `Time off: ${row.start_date} to ${row.end_date}`;
    case 'department_event':
      return `Event: ${row.name || row.date}`;
    case 'competency':
      return `Competency: ${row.name}`;
    case 'monthly_default':
      return `Monthly default: ${row.month}/${row.year}`;
    default:
      return `${table} row ${row.id || row.sync_id}`;
  }
}

/**
 * Checks if a row has been modified (comparing modified_at timestamps)
 */
function isModified(
  baseRow: Record<string, unknown> | undefined,
  workingRow: Record<string, unknown> | undefined
): boolean {
  if (!baseRow && workingRow) return true; // New row
  if (baseRow && !workingRow) return true; // Deleted row
  if (!baseRow || !workingRow) return false;

  const baseModified = baseRow.modified_at as string | null;
  const workingModified = workingRow.modified_at as string | null;

  if (!baseModified && workingModified) return true;
  if (baseModified && !workingModified) return false;
  if (!baseModified && !workingModified) return false;

  return workingModified! > baseModified!;
}

/**
 * Checks if a row is soft-deleted
 */
function isDeleted(row: Record<string, unknown> | undefined): boolean {
  return row?.deleted_at != null;
}

/**
 * Gets all column names for a table
 */
function getTableColumns(db: Database, table: string): string[] {
  const columns: string[] = [];
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  while (stmt.step()) {
    const info = stmt.getAsObject() as { name: string };
    columns.push(info.name);
  }
  stmt.free();
  return columns;
}

/**
 * Inserts or updates a row in the merged database
 */
function upsertRow(db: Database, table: string, row: Record<string, unknown>, columns: string[]): void {
  const filteredColumns = columns.filter(col => row[col] !== undefined);
  const placeholders = filteredColumns.map(() => '?').join(', ');
  const values = filteredColumns.map(col => row[col]);

  // Try UPDATE first, then INSERT if no rows affected
  const updateSet = filteredColumns.map(col => `${col} = ?`).join(', ');
  const updateSql = `UPDATE ${table} SET ${updateSet} WHERE sync_id = ?`;
  db.run(updateSql, [...values, row.sync_id]);

  const changes = db.getRowsModified();
  if (changes === 0) {
    const insertSql = `INSERT INTO ${table} (${filteredColumns.join(', ')}) VALUES (${placeholders})`;
    db.run(insertSql, values);
  }
}

/**
 * Soft-deletes a row by setting deleted_at
 */
function softDeleteRow(db: Database, table: string, syncId: string, modifiedBy: string): void {
  const now = new Date().toISOString();
  db.run(
    `UPDATE ${table} SET deleted_at = ?, modified_at = ?, modified_by = ? WHERE sync_id = ?`,
    [now, now, modifiedBy, syncId]
  );
}

/**
 * Performs a 3-way merge between base database and two working copies
 * 
 * @param baseDb - The base database (source of truth)
 * @param dbA - First working copy (typically current user)
 * @param dbB - Second working copy (other user)
 * @param targetDb - The database to write merged results to
 */
export function performThreeWayMerge(
  baseDb: Database,
  dbA: Database,
  dbB: Database,
  targetDb: Database
): MergeResult {
  const result: MergeResult = {
    success: true,
    autoMergedCount: 0,
    insertedCount: 0,
    deletedCount: 0,
    conflicts: [],
    changesByTable: {},
  };

  for (const table of SYNCED_TABLES) {
    const stats: TableMergeStats = { inserted: 0, updated: 0, deleted: 0, conflicts: 0 };
    result.changesByTable[table] = stats;

    try {
      const columns = getTableColumns(baseDb, table);
      if (!columns.includes('sync_id')) {
        console.warn(`[ThreeWayMerge] Table ${table} missing sync_id, skipping`);
        continue;
      }

      const baseRows = getTableRows(baseDb, table);
      const rowsA = getTableRows(dbA, table);
      const rowsB = getTableRows(dbB, table);

      // Collect all sync_ids from all three databases
      const allSyncIds = new Set([
        ...baseRows.keys(),
        ...rowsA.keys(),
        ...rowsB.keys(),
      ]);

      for (const syncId of allSyncIds) {
        const baseRow = baseRows.get(syncId);
        const rowA = rowsA.get(syncId);
        const rowB = rowsB.get(syncId);

        const modifiedInA = isModified(baseRow, rowA);
        const modifiedInB = isModified(baseRow, rowB);
        const deletedInA = isDeleted(rowA);
        const deletedInB = isDeleted(rowB);

        // Case 1: Neither modified → keep base (or skip if new in neither)
        if (!modifiedInA && !modifiedInB) {
          if (baseRow) {
            upsertRow(targetDb, table, baseRow, columns);
          }
          continue;
        }

        // Case 2: Only A modified
        if (modifiedInA && !modifiedInB) {
          if (rowA) {
            upsertRow(targetDb, table, rowA, columns);
            if (!baseRow) {
              stats.inserted++;
              result.insertedCount++;
            } else if (deletedInA) {
              stats.deleted++;
              result.deletedCount++;
            } else {
              stats.updated++;
              result.autoMergedCount++;
            }
          }
          continue;
        }

        // Case 3: Only B modified
        if (!modifiedInA && modifiedInB) {
          if (rowB) {
            upsertRow(targetDb, table, rowB, columns);
            if (!baseRow) {
              stats.inserted++;
              result.insertedCount++;
            } else if (deletedInB) {
              stats.deleted++;
              result.deletedCount++;
            } else {
              stats.updated++;
              result.autoMergedCount++;
            }
          }
          continue;
        }

        // Case 4: Both modified → CONFLICT
        const conflict: MergeConflict = {
          table,
          syncId,
          rowDescription: getRowDescription(table, rowA || rowB || baseRow || {}),
          baseRow: baseRow || null,
          rowA: rowA || null,
          rowB: rowB || null,
          modifiedByA: (rowA?.modified_by as string) || null,
          modifiedByB: (rowB?.modified_by as string) || null,
          modifiedAtA: (rowA?.modified_at as string) || null,
          modifiedAtB: (rowB?.modified_at as string) || null,
        };

        result.conflicts.push(conflict);
        stats.conflicts++;
        result.success = false;

        // For now, keep base version until user resolves
        if (baseRow) {
          upsertRow(targetDb, table, baseRow, columns);
        }
      }
    } catch (e) {
      console.error(`[ThreeWayMerge] Error merging table ${table}:`, e);
    }
  }

  return result;
}

/**
 * Performs a 2-way merge (base + single working file)
 * This is the simpler case when there's only one working file to merge
 */
export function performTwoWayMerge(
  baseDb: Database,
  workingDb: Database,
  targetDb: Database
): MergeResult {
  const result: MergeResult = {
    success: true,
    autoMergedCount: 0,
    insertedCount: 0,
    deletedCount: 0,
    conflicts: [],
    changesByTable: {},
  };

  for (const table of SYNCED_TABLES) {
    const stats: TableMergeStats = { inserted: 0, updated: 0, deleted: 0, conflicts: 0 };
    result.changesByTable[table] = stats;

    try {
      const columns = getTableColumns(baseDb, table);
      if (!columns.includes('sync_id')) {
        console.warn(`[ThreeWayMerge] Table ${table} missing sync_id, skipping`);
        continue;
      }

      const baseRows = getTableRows(baseDb, table);
      const workingRows = getTableRows(workingDb, table);

      // Collect all sync_ids
      const allSyncIds = new Set([
        ...baseRows.keys(),
        ...workingRows.keys(),
      ]);

      for (const syncId of allSyncIds) {
        const baseRow = baseRows.get(syncId);
        const workingRow = workingRows.get(syncId);

        const modified = isModified(baseRow, workingRow);
        const deleted = isDeleted(workingRow);

        if (!modified) {
          // Keep base version
          if (baseRow) {
            upsertRow(targetDb, table, baseRow, columns);
          }
        } else {
          // Use working version
          if (workingRow) {
            upsertRow(targetDb, table, workingRow, columns);
            if (!baseRow) {
              stats.inserted++;
              result.insertedCount++;
            } else if (deleted) {
              stats.deleted++;
              result.deletedCount++;
            } else {
              stats.updated++;
              result.autoMergedCount++;
            }
          }
        }
      }
    } catch (e) {
      console.error(`[ThreeWayMerge] Error in 2-way merge for table ${table}:`, e);
    }
  }

  return result;
}

/**
 * Performs an n-way merge comparing all working files against the base
 * 
 * Unlike sequential 2-way merges, this compares ALL working files against base
 * simultaneously, detecting conflicts when 2+ files modified the same row.
 * 
 * @param baseDb - The base database (source of truth)
 * @param workingDbs - Array of working databases with their user emails
 * @param targetDb - The database to write merged results to
 */
export function performNWayMerge(
  baseDb: Database,
  workingDbs: { db: Database; email: string }[],
  targetDb: Database
): MergeResult {
  const result: MergeResult = {
    success: true,
    autoMergedCount: 0,
    insertedCount: 0,
    deletedCount: 0,
    conflicts: [],
    changesByTable: {},
  };

  for (const table of SYNCED_TABLES) {
    const stats: TableMergeStats = { inserted: 0, updated: 0, deleted: 0, conflicts: 0 };
    result.changesByTable[table] = stats;

    try {
      const columns = getTableColumns(baseDb, table);
      if (!columns.includes('sync_id')) {
        console.warn(`[NWayMerge] Table ${table} missing sync_id, skipping`);
        continue;
      }

      const baseRows = getTableRows(baseDb, table);
      
      // Get rows from all working databases
      const workingRowMaps: { email: string; rows: Map<string, Record<string, unknown>> }[] = 
        workingDbs.map(({ db, email }) => ({
          email,
          rows: getTableRows(db, table),
        }));

      // Collect all sync_ids from base and all working files
      const allSyncIds = new Set<string>([...baseRows.keys()]);
      for (const { rows } of workingRowMaps) {
        for (const syncId of rows.keys()) {
          allSyncIds.add(syncId);
        }
      }

      for (const syncId of allSyncIds) {
        const baseRow = baseRows.get(syncId);
        
        // Find which working files modified this row
        const modifiers: { email: string; row: Record<string, unknown>; modifiedAt: string | null }[] = [];
        
        for (const { email, rows } of workingRowMaps) {
          const workingRow = rows.get(syncId);
          if (isModified(baseRow, workingRow) && workingRow) {
            modifiers.push({
              email,
              row: workingRow,
              modifiedAt: workingRow.modified_at as string | null,
            });
          }
        }

        // Case 1: No modifications - keep base
        if (modifiers.length === 0) {
          if (baseRow) {
            upsertRow(targetDb, table, baseRow, columns);
          }
          continue;
        }

        // Case 2: Only one working file modified - auto-merge
        if (modifiers.length === 1) {
          const { row } = modifiers[0];
          upsertRow(targetDb, table, row, columns);
          
          if (!baseRow) {
            stats.inserted++;
            result.insertedCount++;
          } else if (isDeleted(row)) {
            stats.deleted++;
            result.deletedCount++;
          } else {
            stats.updated++;
            result.autoMergedCount++;
          }
          continue;
        }

        // Case 3: Multiple working files modified - CONFLICT
        const conflictKey = `${table}:${syncId}`;
        const conflict: MergeConflict = {
          conflictKey,
          table,
          syncId,
          rowDescription: getRowDescription(table, modifiers[0]?.row || baseRow || {}),
          baseRow: baseRow || null,
          modifiers: modifiers.map(m => ({
            email: m.email,
            row: m.row,
            modifiedAt: m.modifiedAt,
          })),
          allowMultiple: isAdditiveTable(table),
        };

        result.conflicts.push(conflict);
        stats.conflicts++;
        result.success = false;

        // Keep base version until user resolves
        if (baseRow) {
          upsertRow(targetDb, table, baseRow, columns);
        }
      }
    } catch (e) {
      console.error(`[NWayMerge] Error merging table ${table}:`, e);
    }
  }

  return result;
}

/**
 * Applies user resolutions to conflicts and writes to target database
 */
export function applyConflictResolutions(
  targetDb: Database,
  conflicts: MergeConflict[],
  resolutions: ConflictResolutionEntry[]
): void {
  const resolutionMap = new Map(resolutions.map(r => [r.conflictKey, r.resolution]));

  for (const conflict of conflicts) {
    const resolution = resolutionMap.get(conflict.conflictKey);

    if (!resolution) {
      console.warn(`[ThreeWayMerge] No resolution for conflict ${conflict.conflictKey}`);
      continue;
    }

    const columns = getTableColumns(targetDb, conflict.table);

    switch (resolution.type) {
      case 'base':
        if (conflict.baseRow) {
          upsertRow(targetDb, conflict.table, conflict.baseRow, columns);
        }
        break;
        
      case 'modifier': {
        const modifier = conflict.modifiers[resolution.index];
        if (modifier?.row) {
          upsertRow(targetDb, conflict.table, modifier.row, columns);
        }
        break;
      }
      
      case 'delete':
        // Accept deletion - delete from target (will become soft-delete via trigger)
        targetDb.run(`DELETE FROM ${conflict.table} WHERE sync_id = ?`, [conflict.syncId]);
        break;
        
      case 'all':
        // Keep all versions with fresh IDs and sync metadata
        // This only makes sense for additive tables (timeoff, assignment, department_event)
        if (!conflict.allowMultiple) {
          console.warn(`[ThreeWayMerge] 'all' resolution used on non-additive table ${conflict.table}`);
        }
        
        for (const modifier of conflict.modifiers) {
          if (!modifier.row) continue;
          
          // Exclude PK and old sync metadata
          const excludeColumns = new Set(['id', 'rowid', 'sync_id', 'modified_at', 'modified_by', 'deleted_at']);
          const dataColumns = columns.filter(c => !excludeColumns.has(c));
          
          // Build INSERT with fresh sync metadata
          const newSyncId = crypto.randomUUID();
          const now = new Date().toISOString().replace('T', ' ').slice(0, 23);
          
          const allColumns = [...dataColumns, 'sync_id', 'modified_at', 'modified_by', 'deleted_at'];
          const values = [
            ...dataColumns.map(c => modifier.row![c]),
            newSyncId,
            now,
            modifier.email,
            null, // deleted_at = NULL
          ];
          
          const placeholders = allColumns.map(() => '?').join(', ');
          targetDb.run(
            `INSERT INTO ${conflict.table} (${allColumns.join(', ')}) VALUES (${placeholders})`,
            values as unknown[]
          );
        }
        break;
    }
  }
}

/**
 * Copies all non-synced tables from source to target
 * (For tables like 'settings' that don't have sync columns)
 */
export function copyNonSyncedTables(sourceDb: Database, targetDb: Database): void {
  const syncedSet = new Set(SYNCED_TABLES as readonly string[]);
  
  // Get all tables
  const tablesResult = sourceDb.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  
  if (!tablesResult.length) return;

  for (const row of tablesResult[0].values) {
    const tableName = row[0] as string;
    if (syncedSet.has(tableName) || tableName === 'meta') continue;

    try {
      // Clear target table
      targetDb.run(`DELETE FROM ${tableName}`);

      // Copy all rows
      const rows = sourceDb.exec(`SELECT * FROM ${tableName}`);
      if (!rows.length || !rows[0].values.length) continue;

      const columns = rows[0].columns;
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const rowData of rows[0].values) {
        targetDb.run(insertSql, rowData as unknown[]);
      }
    } catch (e) {
      console.warn(`[ThreeWayMerge] Error copying table ${tableName}:`, e);
    }
  }
}
