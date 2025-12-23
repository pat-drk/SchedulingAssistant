/**
 * Database wrapper with change tracking
 * Wraps database operations to automatically track changes for sync
 */

import { ChangeOperation } from '../sync/types';

export type OperationCallback = (operation: ChangeOperation) => void;

/**
 * Create wrapped database helpers that track changes
 */
export function createTrackedDbHelpers(db: any, onOperation?: OperationCallback) {
  /**
   * Run a SQL statement (no tracking needed for simple runs)
   */
  function run(sql: string, params: any[] = []) {
    if (!db) throw new Error("DB not open");
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  }

  /**
   * Run a query and return all results
   */
  function all(sql: string, params: any[] = []) {
    if (!db) throw new Error("DB not open");
    const stmt = db.prepare(sql);
    const rows: any[] = [];
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /**
   * Tracked INSERT operation
   */
  function trackedInsert(
    table: string,
    fields: string[],
    values: any[]
  ): number | undefined {
    const placeholders = fields.map(() => '?').join(',');
    const sql = `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`;
    
    run(sql, values);
    
    // Get the inserted ID
    const result = all(`SELECT last_insert_rowid() as id`);
    const id = result[0]?.id;

    // Track the operation
    if (onOperation && id) {
      const data: Record<string, any> = {};
      fields.forEach((field, index) => {
        data[field] = values[index];
      });
      data.id = id;

      onOperation({
        type: 'INSERT',
        table,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    return id;
  }

  /**
   * Tracked UPDATE operation
   */
  function trackedUpdate(
    table: string,
    id: number,
    updates: Record<string, any>
  ): void {
    // First, get the old values
    const oldRecord = all(`SELECT * FROM ${table} WHERE id=?`, [id])[0];

    if (!oldRecord) {
      throw new Error(`Record not found: ${table} id=${id}`);
    }

    // Perform the update
    const fields = Object.keys(updates);
    const setClause = fields.map(f => `${f}=?`).join(', ');
    const values = [...fields.map(f => updates[f]), id];
    
    run(`UPDATE ${table} SET ${setClause} WHERE id=?`, values);

    // Track each field change
    if (onOperation) {
      fields.forEach(field => {
        const oldValue = oldRecord[field];
        const newValue = updates[field];
        
        if (oldValue !== newValue) {
          onOperation({
            type: 'UPDATE',
            table,
            id,
            field,
            oldValue,
            newValue,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }
  }

  /**
   * Tracked DELETE operation
   */
  function trackedDelete(table: string, id: number): void {
    // Get the record before deleting
    const oldRecord = all(`SELECT * FROM ${table} WHERE id=?`, [id])[0];

    // Perform the delete
    run(`DELETE FROM ${table} WHERE id=?`, [id]);

    // Track the operation
    if (onOperation && oldRecord) {
      onOperation({
        type: 'DELETE',
        table,
        id,
        data: oldRecord,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    run,
    all,
    trackedInsert,
    trackedUpdate,
    trackedDelete,
  };
}
