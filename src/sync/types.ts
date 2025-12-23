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
  otherUsers: string[];
  error?: string;
}
