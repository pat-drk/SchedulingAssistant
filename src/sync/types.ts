/**
 * Types for the multi-user sync system with conflict resolution
 */

export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ChangeOperation {
  type: OperationType;
  table: string;
  id?: number;
  field?: string;
  oldValue?: any;
  newValue?: any;
  data?: Record<string, any>;
  timestamp: string;
}

/**
 * Persisted change stored in IndexedDB for offline queue
 */
export interface PersistedChange {
  /** UUID for this change */
  id: string;
  /** Table name (e.g., "person", "assignment", "segment") */
  table: string;
  /** Operation type */
  operation: OperationType;
  /** Primary key of the affected row */
  rowId: string | number;
  /** Field name (for UPDATE operations) */
  field?: string;
  /** Previous value (for UPDATE/DELETE) */
  oldValue?: unknown;
  /** New value (for INSERT/UPDATE) */
  newValue?: unknown;
  /** Full record data (for INSERT/DELETE) */
  data?: Record<string, unknown>;
  /** When the change was made (ms since epoch) */
  timestamp: number;
  /** User who made the change */
  userId: string;
  /** Whether this change has been synced to the changes folder */
  synced: boolean;
}

export interface ChangeSet {
  id: string;
  user: string;
  timestamp: string;
  baseVersion: number;
  operations: ChangeOperation[];
}

export interface SyncState {
  version: number;
  appliedChanges: string[]; // Change file IDs that have been applied
  lastSync: string;
}

export interface Conflict {
  operation: ChangeOperation;
  existingOperation?: ChangeOperation;
  reason: ConflictReason;
}

export type ConflictReason = 
  | 'SAME_FIELD_DIFFERENT_VALUES'
  | 'DELETE_VS_UPDATE'
  | 'DUPLICATE_INSERT'
  | 'VERSION_MISMATCH';

export interface ConflictResolution {
  action: 'KEEP_YOURS' | 'KEEP_THEIRS' | 'KEEP_BOTH' | 'SKIP';
  modifiedOperation?: ChangeOperation;
}

export interface MergeResult {
  success: boolean;
  conflicts: Conflict[];
  appliedOperations: ChangeOperation[];
  skippedOperations: ChangeOperation[];
  error?: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime?: Date;
  pendingChanges: number;
  offlineQueueCount: number;
  otherUsers: string[];
  activeUsers: Array<{ user: string; lastSeen: Date; stale: boolean }>;
  externalChangeDetected: boolean;
  fileLastModified?: number;
  isOnline: boolean;
  error?: string;
}
