/**
 * ChangeTracker - Intercepts and tracks database operations
 * Stores changes in memory until they are written to a change file.
 * Optionally persists changes to IndexedDB for offline queue support.
 */

import { ChangeOperation, OperationType } from './types';
import { OfflineQueue, getOfflineQueue } from './OfflineQueue';

export class ChangeTracker {
  private operations: ChangeOperation[] = [];
  private isTracking: boolean = true;
  private offlineQueue: OfflineQueue | null = null;
  private persistToIndexedDB: boolean = false;

  /**
   * Start tracking changes
   * @param persistOffline - Whether to persist changes to IndexedDB for offline support
   */
  start(persistOffline: boolean = false): void {
    this.isTracking = true;
    this.operations = [];
    this.persistToIndexedDB = persistOffline;
    
    if (persistOffline) {
      this.offlineQueue = getOfflineQueue();
    }
  }

  /**
   * Stop tracking changes
   */
  stop(): void {
    this.isTracking = false;
  }

  /**
   * Clear all tracked changes (in-memory only)
   */
  clear(): void {
    this.operations = [];
  }

  /**
   * Track an INSERT operation
   */
  trackInsert(table: string, data: Record<string, any>): void {
    if (!this.isTracking) return;
    
    const operation: ChangeOperation = {
      type: 'INSERT',
      table,
      data,
      timestamp: new Date().toISOString(),
    };
    
    this.operations.push(operation);
    
    // Persist to IndexedDB if enabled
    if (this.persistToIndexedDB && this.offlineQueue?.isInitialized()) {
      this.offlineQueue.addChange(table, 'INSERT', data.id, { data }).catch(err => {
        console.error('Failed to persist INSERT to offline queue:', err);
      });
    }
  }

  /**
   * Track an UPDATE operation
   */
  trackUpdate(
    table: string,
    id: number,
    field: string,
    oldValue: any,
    newValue: any
  ): void {
    if (!this.isTracking) return;
    
    const operation: ChangeOperation = {
      type: 'UPDATE',
      table,
      id,
      field,
      oldValue,
      newValue,
      timestamp: new Date().toISOString(),
    };
    
    this.operations.push(operation);
    
    // Persist to IndexedDB if enabled
    if (this.persistToIndexedDB && this.offlineQueue?.isInitialized()) {
      this.offlineQueue.addChange(table, 'UPDATE', id, { 
        field, 
        oldValue, 
        newValue 
      }).catch(err => {
        console.error('Failed to persist UPDATE to offline queue:', err);
      });
    }
  }

  /**
   * Track a DELETE operation
   */
  trackDelete(table: string, id: number, oldData?: Record<string, any>): void {
    if (!this.isTracking) return;
    
    const operation: ChangeOperation = {
      type: 'DELETE',
      table,
      id,
      data: oldData,
      timestamp: new Date().toISOString(),
    };
    
    this.operations.push(operation);
    
    // Persist to IndexedDB if enabled
    if (this.persistToIndexedDB && this.offlineQueue?.isInitialized()) {
      this.offlineQueue.addChange(table, 'DELETE', id, { data: oldData }).catch(err => {
        console.error('Failed to persist DELETE to offline queue:', err);
      });
    }
  }

  /**
   * Get all tracked operations (in-memory)
   */
  getOperations(): ChangeOperation[] {
    return [...this.operations];
  }

  /**
   * Check if there are any tracked changes (in-memory)
   */
  hasChanges(): boolean {
    return this.operations.length > 0;
  }

  /**
   * Get the number of tracked changes (in-memory)
   */
  getChangeCount(): number {
    return this.operations.length;
  }
  
  /**
   * Get the offline queue (for checking persisted changes)
   */
  getOfflineQueue(): OfflineQueue | null {
    return this.offlineQueue;
  }
}

