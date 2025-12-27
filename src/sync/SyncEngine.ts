/**
 * SyncEngine - Main orchestrator for multi-user sync
 * Coordinates change tracking, merging, background sync, and offline queue.
 * 
 * Features:
 * - Background file-change detection (polls for external changes)
 * - Heartbeat/presence for active users
 * - Offline queue persistence via IndexedDB
 * - Retry logic for OneDrive/SharePoint sync latency
 */

import { ChangeTracker } from './ChangeTracker';
import { ChangeFileManager } from './ChangeFileManager';
import { MergeEngine } from './MergeEngine';
import { FileSystemUtils } from './FileSystemUtils';
import { OfflineQueue, getOfflineQueue } from './OfflineQueue';
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
  private offlineQueue: OfflineQueue;
  private syncState: SyncState;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private fileWatchIntervalId: ReturnType<typeof setInterval> | null = null;
  private syncStatusCallbacks: Array<(status: SyncStatus) => void> = [];
  private currentStatus: SyncStatus;
  private userEmail: string = '';
  private changesFolderHandle: FileSystemDirectoryHandle | null = null;
  private dbFileHandle: FileSystemFileHandle | null = null;
  private dbOpenedAt: number = 0;
  private lastKnownDbModified: number = 0;

  constructor(db: any) {
    this.db = db;
    this.changeTracker = new ChangeTracker();
    this.changeFileManager = new ChangeFileManager();
    this.mergeEngine = new MergeEngine(db);
    this.offlineQueue = getOfflineQueue();
    this.syncState = {
      version: 0,
      appliedChanges: [],
      lastSync: new Date().toISOString(),
    };
    this.currentStatus = {
      isSyncing: false,
      pendingChanges: 0,
      offlineQueueCount: 0,
      otherUsers: [],
      activeUsers: [],
      externalChangeDetected: false,
      isOnline: navigator.onLine,
    };

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  private handleOnline = () => {
    this.updateStatus({ isOnline: true });
    // Trigger sync when coming back online
    this.pullChanges();
  };

  private handleOffline = () => {
    this.updateStatus({ isOnline: false });
  };

  /**
   * Initialize the sync engine with a directory handle and user email
   */
  async initialize(
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string,
    dbFileHandle?: FileSystemFileHandle
  ): Promise<void> {
    this.changesFolderHandle = changesFolderHandle;
    this.userEmail = userEmail;
    this.dbFileHandle = dbFileHandle || null;

    // Record when we opened the DB for file-change detection
    if (dbFileHandle) {
      try {
        const file = await dbFileHandle.getFile();
        this.dbOpenedAt = file.lastModified;
        this.lastKnownDbModified = file.lastModified;
      } catch (e) {
        console.warn('Could not get initial DB file timestamp:', e);
      }
    }

    await this.changeFileManager.initialize(changesFolderHandle, userEmail);
    
    // Initialize offline queue
    await this.offlineQueue.initialize(userEmail);
    
    // Check for pending offline changes
    const offlineCount = await this.offlineQueue.getUnsyncedCount();
    this.updateStatus({ offlineQueueCount: offlineCount });
    
    // Load sync state
    this.syncState = await this.changeFileManager.readSyncState();
    
    // Start tracking changes with offline persistence
    this.changeTracker.start(true);
    
    // Write initial heartbeat
    await this.writeHeartbeat();
    
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

    // Background sync polling
    this.syncIntervalId = setInterval(async () => {
      await this.pullChanges();
    }, intervalSeconds * 1000);

    // Heartbeat every 60 seconds
    this.heartbeatIntervalId = setInterval(async () => {
      await this.writeHeartbeat();
      await this.checkActiveUsers();
    }, 60 * 1000);

    // File-change detection every 30 seconds
    if (this.dbFileHandle) {
      this.fileWatchIntervalId = setInterval(async () => {
        await this.checkForExternalChanges();
      }, 30 * 1000);
    }
  }

  /**
   * Stop background sync
   */
  stopBackgroundSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    if (this.fileWatchIntervalId) {
      clearInterval(this.fileWatchIntervalId);
      this.fileWatchIntervalId = null;
    }
  }

  /**
   * Write heartbeat for presence detection
   */
  private async writeHeartbeat(): Promise<void> {
    if (!this.changesFolderHandle || !this.userEmail) return;
    
    try {
      await FileSystemUtils.writeHeartbeat(this.changesFolderHandle, this.userEmail);
    } catch (error) {
      console.warn('Failed to write heartbeat:', error);
    }
  }

  /**
   * Check for active users based on heartbeats
   */
  private async checkActiveUsers(): Promise<void> {
    if (!this.changesFolderHandle) return;

    try {
      const heartbeats = await FileSystemUtils.readHeartbeats(this.changesFolderHandle);
      const activeUsers = heartbeats
        .filter(h => h.user !== this.userEmail)
        .map(h => ({
          user: h.user,
          lastSeen: new Date(h.timestamp),
          stale: h.stale,
        }));
      
      this.updateStatus({ 
        activeUsers,
        otherUsers: activeUsers.filter(u => !u.stale).map(u => u.user),
      });

      // Clean up old heartbeats occasionally
      await FileSystemUtils.cleanupStaleHeartbeats(this.changesFolderHandle);
    } catch (error) {
      console.warn('Failed to check active users:', error);
    }
  }

  /**
   * Check if the database file was modified externally
   */
  private async checkForExternalChanges(): Promise<void> {
    if (!this.dbFileHandle) return;

    try {
      const file = await this.dbFileHandle.getFile();
      const currentModified = file.lastModified;

      if (currentModified > this.lastKnownDbModified) {
        // File was modified externally
        this.updateStatus({ 
          externalChangeDetected: true,
          fileLastModified: currentModified,
        });
      }
    } catch (error) {
      console.warn('Failed to check for external changes:', error);
    }
  }

  /**
   * Acknowledge external changes (called after user reloads)
   */
  acknowledgeExternalChanges(newLastModified?: number): void {
    if (newLastModified) {
      this.lastKnownDbModified = newLastModified;
    }
    this.updateStatus({ externalChangeDetected: false });
  }

  /**
   * Check if the database file has changed since we opened it
   */
  async hasFileChangedSinceOpen(): Promise<{ changed: boolean; lastModified: number }> {
    if (!this.dbFileHandle) {
      return { changed: false, lastModified: 0 };
    }

    try {
      const file = await this.dbFileHandle.getFile();
      return {
        changed: file.lastModified > this.dbOpenedAt,
        lastModified: file.lastModified,
      };
    } catch (error) {
      console.warn('Failed to check file timestamp:', error);
      return { changed: false, lastModified: 0 };
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
      
      // Mark offline queue items as synced
      const offlineChanges = await this.offlineQueue.getUnsyncedChanges();
      if (offlineChanges.length > 0) {
        await this.offlineQueue.markAsSynced(offlineChanges.map(c => c.id));
      }
      
      // Clear tracked changes
      this.changeTracker.clear();
      
      // Update offline queue count
      const offlineCount = await this.offlineQueue.getUnsyncedCount();
      
      this.updateStatus({
        pendingChanges: 0,
        offlineQueueCount: offlineCount,
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

    // Don't sync if offline
    if (!navigator.onLine) {
      return { success: true, autoMergedCount: 0 };
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
   * Manually trigger sync (for "Check for updates" button)
   */
  async manualSync(): Promise<{
    success: boolean;
    conflicts?: Conflict[];
    autoMergedCount?: number;
    error?: string;
  }> {
    await this.writeHeartbeat();
    await this.checkActiveUsers();
    return this.pullChanges();
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
   * Get the offline queue
   */
  getOfflineQueue(): OfflineQueue {
    return this.offlineQueue;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopBackgroundSync();
    this.changeTracker.stop();
    this.syncStatusCallbacks = [];

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }
}
