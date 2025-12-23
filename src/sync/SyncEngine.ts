/**
 * SyncEngine - Main orchestrator for multi-user sync
 * Coordinates change tracking, merging, and background sync
 */

import { ChangeTracker } from './ChangeTracker';
import { ChangeFileManager } from './ChangeFileManager';
import { MergeEngine } from './MergeEngine';
import { FileSystemUtils } from './FileSystemUtils';
import { 
  ChangeOperation, 
  Conflict, 
  ConflictResolution, 
  SyncState, 
  SyncStatus 
} from './types';

export class SyncEngine {
  private db: any;
  private changeTracker: ChangeTracker;
  private changeFileManager: ChangeFileManager;
  private mergeEngine: MergeEngine;
  private syncState: SyncState;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private syncStatusCallbacks: Array<(status: SyncStatus) => void> = [];
  private currentStatus: SyncStatus;

  constructor(db: any) {
    this.db = db;
    this.changeTracker = new ChangeTracker();
    this.changeFileManager = new ChangeFileManager();
    this.mergeEngine = new MergeEngine(db);
    this.syncState = {
      version: 0,
      appliedChanges: [],
      lastSync: new Date().toISOString(),
    };
    this.currentStatus = {
      isSyncing: false,
      pendingChanges: 0,
      otherUsers: [],
    };
  }

  /**
   * Initialize the sync engine with a directory handle and user email
   */
  async initialize(
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string
  ): Promise<void> {
    await this.changeFileManager.initialize(changesFolderHandle, userEmail);
    
    // Load sync state
    this.syncState = await this.changeFileManager.readSyncState();
    
    // Start tracking changes
    this.changeTracker.start();
    
    // Update status
    this.updateStatus({ isSyncing: false });
  }

  /**
   * Check if the sync engine is initialized
   */
  isInitialized(): boolean {
    return this.changeFileManager.isInitialized();
  }

  /**
   * Start background sync (periodic check for changes)
   */
  startBackgroundSync(intervalSeconds: number = 30): void {
    if (this.syncIntervalId) {
      this.stopBackgroundSync();
    }

    this.syncIntervalId = setInterval(async () => {
      await this.pullChanges();
    }, intervalSeconds * 1000);
  }

  /**
   * Stop background sync
   */
  stopBackgroundSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Push local changes to the changes folder
   */
  async pushChanges(): Promise<{ success: boolean; error?: string }> {
    if (!this.changeFileManager.isInitialized()) {
      return { success: false, error: 'Sync engine not initialized' };
    }

    try {
      const operations = this.changeTracker.getOperations();
      
      if (operations.length === 0) {
        return { success: true };
      }

      // Write change file
      await this.changeFileManager.writeChangeSet(operations, this.syncState.version);
      
      // Clear tracked changes
      this.changeTracker.clear();
      
      this.updateStatus({
        pendingChanges: 0,
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull changes from other users and merge them
   */
  async pullChanges(): Promise<{
    success: boolean;
    conflicts?: Conflict[];
    autoMergedCount?: number;
    error?: string;
  }> {
    if (!this.changeFileManager.isInitialized()) {
      return { success: false, error: 'Sync engine not initialized' };
    }

    this.updateStatus({ isSyncing: true });

    try {
      // Get pending changes from other users
      const changeSets = await this.changeFileManager.readOtherUsersChanges(
        this.syncState.appliedChanges
      );

      if (changeSets.length === 0) {
        this.updateStatus({
          isSyncing: false,
          lastSyncTime: new Date(),
        });
        return { success: true, autoMergedCount: 0 };
      }

      // Get active users
      const otherUsers = await this.changeFileManager.getActiveUsers(
        this.syncState.appliedChanges
      );
      
      this.updateStatus({ otherUsers });

      // Merge changes
      const mergeResult = await this.mergeEngine.mergeChanges(changeSets);

      if (mergeResult.conflicts.length > 0) {
        // Has conflicts - return them for user resolution
        this.updateStatus({
          isSyncing: false,
          error: `${mergeResult.conflicts.length} conflict(s) need resolution`,
        });
        return {
          success: false,
          conflicts: mergeResult.conflicts,
          autoMergedCount: mergeResult.appliedOperations.length,
        };
      }

      // No conflicts - mark changes as applied
      const appliedIds = changeSets.map(cs => cs.id);
      this.syncState.appliedChanges.push(...appliedIds);
      this.syncState.lastSync = new Date().toISOString();
      this.syncState.version++;

      // Save sync state
      await this.changeFileManager.writeSyncState(this.syncState);

      // Clean up old files
      await this.changeFileManager.cleanupAppliedChanges(this.syncState.appliedChanges);

      this.updateStatus({
        isSyncing: false,
        lastSyncTime: new Date(),
        error: undefined,
      });

      return {
        success: true,
        autoMergedCount: mergeResult.appliedOperations.length,
      };
    } catch (error: any) {
      this.updateStatus({
        isSyncing: false,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Resolve conflicts and apply resolutions
   */
  async resolveConflicts(
    conflicts: Conflict[],
    resolutions: Map<Conflict, ConflictResolution>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Apply each resolution
      for (const conflict of conflicts) {
        const resolution = resolutions.get(conflict);
        if (resolution) {
          await this.mergeEngine.applyConflictResolution(conflict, resolution);
        }
      }

      // Update sync state
      this.syncState.version++;
      await this.changeFileManager.writeSyncState(this.syncState);

      this.updateStatus({ error: undefined });

      return { success: true };
    } catch (error: any) {
      this.updateStatus({ error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Track a database operation
   */
  trackOperation(operation: ChangeOperation): void {
    switch (operation.type) {
      case 'INSERT':
        if (operation.data) {
          this.changeTracker.trackInsert(operation.table, operation.data);
        }
        break;
      case 'UPDATE':
        if (operation.id !== undefined && operation.field && operation.oldValue !== undefined && operation.newValue !== undefined) {
          this.changeTracker.trackUpdate(
            operation.table,
            operation.id,
            operation.field,
            operation.oldValue,
            operation.newValue
          );
        }
        break;
      case 'DELETE':
        if (operation.id !== undefined) {
          this.changeTracker.trackDelete(operation.table, operation.id, operation.data);
        }
        break;
    }

    this.updateStatus({
      pendingChanges: this.changeTracker.getChangeCount(),
    });
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.currentStatus };
  }

  /**
   * Subscribe to sync status updates
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.syncStatusCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.syncStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.syncStatusCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Update sync status and notify subscribers
   */
  private updateStatus(updates: Partial<SyncStatus>): void {
    this.currentStatus = {
      ...this.currentStatus,
      ...updates,
    };

    // Notify subscribers
    this.syncStatusCallbacks.forEach(callback => {
      callback(this.currentStatus);
    });
  }

  /**
   * Get the change tracker (for debugging or advanced use)
   */
  getChangeTracker(): ChangeTracker {
    return this.changeTracker;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopBackgroundSync();
    this.changeTracker.stop();
    this.syncStatusCallbacks = [];
  }
}
