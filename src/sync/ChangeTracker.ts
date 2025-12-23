/**
 * ChangeTracker - Intercepts and tracks database operations
 * Stores changes in memory until they are written to a change file
 */

import { ChangeOperation, OperationType } from './types';

export class ChangeTracker {
  private operations: ChangeOperation[] = [];
  private isTracking: boolean = true;

  /**
   * Start tracking changes
   */
  start(): void {
    this.isTracking = true;
    this.operations = [];
  }

  /**
   * Stop tracking changes
   */
  stop(): void {
    this.isTracking = false;
  }

  /**
   * Clear all tracked changes
   */
  clear(): void {
    this.operations = [];
  }

  /**
   * Track an INSERT operation
   */
  trackInsert(table: string, data: Record<string, any>): void {
    if (!this.isTracking) return;
    
    this.operations.push({
      type: 'INSERT',
      table,
      data,
      timestamp: new Date().toISOString(),
    });
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
    
    this.operations.push({
      type: 'UPDATE',
      table,
      id,
      field,
      oldValue,
      newValue,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track a DELETE operation
   */
  trackDelete(table: string, id: number, oldData?: Record<string, any>): void {
    if (!this.isTracking) return;
    
    this.operations.push({
      type: 'DELETE',
      table,
      id,
      data: oldData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all tracked operations
   */
  getOperations(): ChangeOperation[] {
    return [...this.operations];
  }

  /**
   * Check if there are any tracked changes
   */
  hasChanges(): boolean {
    return this.operations.length > 0;
  }

  /**
   * Get the number of tracked changes
   */
  getChangeCount(): number {
    return this.operations.length;
  }
}
