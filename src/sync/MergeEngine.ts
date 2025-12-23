/**
 * MergeEngine - Handles merging changes and detecting conflicts
 * Implements auto-merge rules and conflict detection algorithms
 */

import { 
  ChangeOperation, 
  ChangeSet, 
  Conflict, 
  ConflictReason, 
  ConflictResolution, 
  MergeResult 
} from './types';

export class MergeEngine {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Merge multiple change sets into the database
   * Returns conflicts that need user resolution
   */
  async mergeChanges(changeSets: ChangeSet[]): Promise<MergeResult> {
    const conflicts: Conflict[] = [];
    const appliedOperations: ChangeOperation[] = [];
    const skippedOperations: ChangeOperation[] = [];

    try {
      for (const changeSet of changeSets) {
        for (const operation of changeSet.operations) {
          const conflict = await this.detectConflict(operation);
          
          if (conflict) {
            conflicts.push(conflict);
            skippedOperations.push(operation);
          } else {
            // No conflict - apply the change
            await this.applyOperation(operation);
            appliedOperations.push(operation);
          }
        }
      }

      return {
        success: conflicts.length === 0,
        conflicts,
        appliedOperations,
        skippedOperations,
      };
    } catch (error: any) {
      return {
        success: false,
        conflicts,
        appliedOperations,
        skippedOperations,
        error: error.message,
      };
    }
  }

  /**
   * Detect if an operation conflicts with the current database state
   */
  private async detectConflict(operation: ChangeOperation): Promise<Conflict | null> {
    switch (operation.type) {
      case 'INSERT':
        return this.detectInsertConflict(operation);
      case 'UPDATE':
        return this.detectUpdateConflict(operation);
      case 'DELETE':
        return this.detectDeleteConflict(operation);
      default:
        return null;
    }
  }

  /**
   * Detect conflicts for INSERT operations
   */
  private detectInsertConflict(operation: ChangeOperation): Conflict | null {
    // Check if a similar record already exists (duplicate insert)
    // This is a simplified check - you might want more sophisticated logic
    if (!operation.data) return null;

    try {
      // For assignments, check if same person/date/segment/role exists
      if (operation.table === 'assignment') {
        const { date, person_id, segment, role_id } = operation.data;
        const stmt = this.db.prepare(
          `SELECT COUNT(*) as count FROM assignment WHERE date=? AND person_id=? AND segment=?`
        );
        stmt.bind([date, person_id, segment]);
        stmt.step();
        const result = stmt.getAsObject();
        stmt.free();

        if (result.count > 0) {
          return {
            operation,
            reason: 'DUPLICATE_INSERT',
          };
        }
      }

      // Add similar checks for other tables as needed
    } catch (error) {
      console.error('Error detecting insert conflict:', error);
    }

    return null;
  }

  /**
   * Detect conflicts for UPDATE operations
   */
  private detectUpdateConflict(operation: ChangeOperation): Conflict | null {
    if (!operation.id || !operation.field) return null;

    try {
      // Get current value from database
      const stmt = this.db.prepare(
        `SELECT ${operation.field} FROM ${operation.table} WHERE id=?`
      );
      stmt.bind([operation.id]);
      
      if (!stmt.step()) {
        stmt.free();
        // Record doesn't exist anymore - was it deleted?
        return {
          operation,
          reason: 'DELETE_VS_UPDATE',
        };
      }

      const result = stmt.getAsObject();
      stmt.free();
      const currentValue = result[operation.field];

      // Check if the current value differs from our expected old value
      if (operation.oldValue !== undefined && currentValue !== operation.oldValue) {
        // Someone else changed this field
        if (currentValue !== operation.newValue) {
          // And they changed it to a different value than we want
          return {
            operation,
            existingOperation: {
              type: 'UPDATE',
              table: operation.table,
              id: operation.id,
              field: operation.field,
              oldValue: operation.oldValue,
              newValue: currentValue,
              timestamp: new Date().toISOString(),
            },
            reason: 'SAME_FIELD_DIFFERENT_VALUES',
          };
        }
        // They changed it to the same value we want - no conflict
      }
    } catch (error) {
      console.error('Error detecting update conflict:', error);
    }

    return null;
  }

  /**
   * Detect conflicts for DELETE operations
   */
  private detectDeleteConflict(operation: ChangeOperation): Conflict | null {
    if (!operation.id) return null;

    try {
      // Check if the record still exists
      const stmt = this.db.prepare(
        `SELECT * FROM ${operation.table} WHERE id=?`
      );
      stmt.bind([operation.id]);
      
      if (!stmt.step()) {
        stmt.free();
        // Record already deleted - no conflict
        return null;
      }

      const currentRecord = stmt.getAsObject();
      stmt.free();

      // Check if the record has been modified since we last saw it
      // This is a simplified check - in a real system you'd compare timestamps or checksums
      if (operation.data) {
        // Compare current record with what we expected to delete
        const hasChanges = Object.keys(operation.data).some(
          key => currentRecord[key] !== operation.data![key]
        );

        if (hasChanges) {
          return {
            operation,
            reason: 'DELETE_VS_UPDATE',
          };
        }
      }
    } catch (error) {
      console.error('Error detecting delete conflict:', error);
    }

    return null;
  }

  /**
   * Apply an operation to the database
   */
  private async applyOperation(operation: ChangeOperation): Promise<void> {
    switch (operation.type) {
      case 'INSERT':
        await this.applyInsert(operation);
        break;
      case 'UPDATE':
        await this.applyUpdate(operation);
        break;
      case 'DELETE':
        await this.applyDelete(operation);
        break;
    }
  }

  /**
   * Apply an INSERT operation
   */
  private async applyInsert(operation: ChangeOperation): Promise<void> {
    if (!operation.data) return;

    const fields = Object.keys(operation.data);
    const values = fields.map(f => operation.data![f]);
    const placeholders = fields.map(() => '?').join(',');
    
    const sql = `INSERT INTO ${operation.table} (${fields.join(',')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    stmt.bind(values);
    stmt.step();
    stmt.free();
  }

  /**
   * Apply an UPDATE operation
   */
  private async applyUpdate(operation: ChangeOperation): Promise<void> {
    if (!operation.id || !operation.field || operation.newValue === undefined) return;

    const sql = `UPDATE ${operation.table} SET ${operation.field}=? WHERE id=?`;
    const stmt = this.db.prepare(sql);
    stmt.bind([operation.newValue, operation.id]);
    stmt.step();
    stmt.free();
  }

  /**
   * Apply a DELETE operation
   */
  private async applyDelete(operation: ChangeOperation): Promise<void> {
    if (!operation.id) return;

    const sql = `DELETE FROM ${operation.table} WHERE id=?`;
    const stmt = this.db.prepare(sql);
    stmt.bind([operation.id]);
    stmt.step();
    stmt.free();
  }

  /**
   * Apply a user's conflict resolution
   */
  async applyConflictResolution(
    conflict: Conflict,
    resolution: ConflictResolution
  ): Promise<void> {
    switch (resolution.action) {
      case 'KEEP_YOURS':
        // Apply the operation
        await this.applyOperation(conflict.operation);
        break;
      case 'KEEP_THEIRS':
        // Do nothing - keep the current database state
        break;
      case 'KEEP_BOTH':
        // This depends on the operation type
        if (resolution.modifiedOperation) {
          await this.applyOperation(resolution.modifiedOperation);
        }
        break;
      case 'SKIP':
        // Do nothing
        break;
    }
  }

  /**
   * Check if two operations conflict with each other (before applying to DB)
   */
  static doOperationsConflict(op1: ChangeOperation, op2: ChangeOperation): boolean {
    // Different tables - no conflict
    if (op1.table !== op2.table) return false;

    // Both INSERTs - might conflict if inserting same logical record
    if (op1.type === 'INSERT' && op2.type === 'INSERT') {
      // This would require domain-specific logic to determine "same logical record"
      return false;
    }

    // Operations on different records - no conflict
    if (op1.id !== op2.id) return false;

    // DELETE vs anything - conflict
    if (op1.type === 'DELETE' || op2.type === 'DELETE') return true;

    // Both UPDATEs on same field
    if (op1.type === 'UPDATE' && op2.type === 'UPDATE') {
      if (op1.field === op2.field) {
        // Conflict if setting different values
        return op1.newValue !== op2.newValue;
      }
      // Different fields - no conflict
      return false;
    }

    return false;
  }
}
