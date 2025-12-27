/**
 * TrackedDatabaseContext - React context for tracked database operations
 * 
 * Provides database helpers that automatically track changes for multi-user sync.
 * All INSERT/UPDATE/DELETE operations are captured and can be synced to other users.
 * 
 * Usage:
 *   const { trackedInsert, trackedUpdate, trackedDelete, run, all } = useTrackedDb();
 */

import React, { createContext, useContext, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChangeOperation } from './types';
import { SyncEngine } from './SyncEngine';

// Database operation types
interface DbHelpers {
  /** Execute SQL without tracking (for queries, schema changes, etc.) */
  run: (sql: string, params?: any[]) => void;
  /** Query and return all results */
  all: (sql: string, params?: any[]) => any[];
  /** Tracked INSERT - automatically captured for sync */
  trackedInsert: (table: string, fields: string[], values: any[]) => number | undefined;
  /** Tracked UPDATE - automatically captured for sync */
  trackedUpdate: (table: string, id: number, updates: Record<string, any>) => void;
  /** Tracked DELETE - automatically captured for sync */
  trackedDelete: (table: string, id: number) => void;
  /** Check if database is available */
  isDbReady: boolean;
}

const TrackedDatabaseContext = createContext<DbHelpers | null>(null);

interface TrackedDatabaseProviderProps {
  children: React.ReactNode;
  db: any | null;
  syncEngine: SyncEngine | null;
}

export function TrackedDatabaseProvider({ 
  children, 
  db, 
  syncEngine 
}: TrackedDatabaseProviderProps) {
  // Track the callback for sync engine
  const onOperationRef = useRef<((op: ChangeOperation) => void) | null>(null);

  // Update the callback when syncEngine changes
  useEffect(() => {
    if (syncEngine) {
      onOperationRef.current = (op: ChangeOperation) => {
        syncEngine.trackOperation(op);
      };
    } else {
      onOperationRef.current = null;
    }
  }, [syncEngine]);

  // Basic run helper (no tracking)
  const run = useCallback((sql: string, params: any[] = []) => {
    if (!db) throw new Error("Database not open");
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  }, [db]);

  // Basic all helper (no tracking needed for queries)
  const all = useCallback((sql: string, params: any[] = []) => {
    if (!db) throw new Error("Database not open");
    const stmt = db.prepare(sql);
    const rows: any[] = [];
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }, [db]);

  // Tracked INSERT operation
  const trackedInsert = useCallback((
    table: string,
    fields: string[],
    values: any[]
  ): number | undefined => {
    if (!db) throw new Error("Database not open");

    const placeholders = fields.map(() => '?').join(',');
    const sql = `INSERT INTO ${table} (${fields.join(',')}) VALUES (${placeholders})`;
    
    run(sql, values);
    
    // Get the inserted ID
    const result = all(`SELECT last_insert_rowid() as id`);
    const id = result[0]?.id;

    // Track the operation if sync is enabled
    if (onOperationRef.current && id) {
      const data: Record<string, any> = {};
      fields.forEach((field, index) => {
        data[field] = values[index];
      });
      data.id = id;

      onOperationRef.current({
        type: 'INSERT',
        table,
        data,
        timestamp: new Date().toISOString(),
      });
    }

    return id;
  }, [db, run, all]);

  // Tracked UPDATE operation
  const trackedUpdate = useCallback((
    table: string,
    id: number,
    updates: Record<string, any>
  ): void => {
    if (!db) throw new Error("Database not open");

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

    // Track each field change if sync is enabled
    if (onOperationRef.current) {
      fields.forEach(field => {
        const oldValue = oldRecord[field];
        const newValue = updates[field];
        
        if (oldValue !== newValue) {
          onOperationRef.current!({
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
  }, [db, run, all]);

  // Tracked DELETE operation
  const trackedDelete = useCallback((table: string, id: number): void => {
    if (!db) throw new Error("Database not open");

    // Get the record before deleting (for sync)
    const oldRecord = all(`SELECT * FROM ${table} WHERE id=?`, [id])[0];

    // Perform the delete
    run(`DELETE FROM ${table} WHERE id=?`, [id]);

    // Track the operation if sync is enabled
    if (onOperationRef.current && oldRecord) {
      onOperationRef.current({
        type: 'DELETE',
        table,
        id,
        data: oldRecord,
        timestamp: new Date().toISOString(),
      });
    }
  }, [db, run, all]);

  const value = useMemo<DbHelpers>(() => ({
    run,
    all,
    trackedInsert,
    trackedUpdate,
    trackedDelete,
    isDbReady: !!db,
  }), [run, all, trackedInsert, trackedUpdate, trackedDelete, db]);

  return (
    <TrackedDatabaseContext.Provider value={value}>
      {children}
    </TrackedDatabaseContext.Provider>
  );
}

/**
 * Hook to access tracked database helpers
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { trackedInsert, trackedUpdate, trackedDelete, all } = useTrackedDb();
 *   
 *   const addPerson = () => {
 *     const id = trackedInsert('person', ['first_name', 'last_name'], ['John', 'Doe']);
 *     console.log('Created person with id:', id);
 *   };
 *   
 *   const updatePerson = (id: number) => {
 *     trackedUpdate('person', id, { first_name: 'Jane' });
 *   };
 *   
 *   const deletePerson = (id: number) => {
 *     trackedDelete('person', id);
 *   };
 * }
 * ```
 */
export function useTrackedDb(): DbHelpers {
  const context = useContext(TrackedDatabaseContext);
  if (!context) {
    throw new Error('useTrackedDb must be used within a TrackedDatabaseProvider');
  }
  return context;
}

/**
 * Higher-order component to inject tracked database helpers
 */
export function withTrackedDb<P extends object>(
  Component: React.ComponentType<P & { db: DbHelpers }>
): React.FC<Omit<P, 'db'>> {
  return function WrappedComponent(props: Omit<P, 'db'>) {
    const db = useTrackedDb();
    return <Component {...(props as P)} db={db} />;
  };
}
