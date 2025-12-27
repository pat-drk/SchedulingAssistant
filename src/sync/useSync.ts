/**
 * React hook for managing sync state
 * Provides a clean interface to the SyncEngine from React components.
 * 
 * Features:
 * - Background sync with configurable interval
 * - File-change detection
 * - Heartbeat/presence for active users
 * - Offline queue support
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { SyncEngine } from '../sync/SyncEngine';
import { SyncStatus, Conflict, ConflictResolution } from '../sync/types';

export interface UseSyncOptions {
  db: any;
  enabled: boolean;
  backgroundSyncInterval?: number;
}

export interface UseSyncResult {
  syncEngine: SyncEngine | null;
  syncStatus: SyncStatus;
  isInitialized: boolean;
  initializeSync: (
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string,
    dbFileHandle?: FileSystemFileHandle
  ) => Promise<void>;
  pushChanges: () => Promise<{ success: boolean; error?: string }>;
  pullChanges: () => Promise<{
    success: boolean;
    conflicts?: Conflict[];
    autoMergedCount?: number;
    error?: string;
  }>;
  manualSync: () => Promise<{
    success: boolean;
    conflicts?: Conflict[];
    autoMergedCount?: number;
    error?: string;
  }>;
  resolveConflicts: (
    conflicts: Conflict[],
    resolutions: Map<Conflict, ConflictResolution>
  ) => Promise<{ success: boolean; error?: string }>;
  acknowledgeExternalChanges: () => void;
  checkForExternalChanges: () => Promise<{ changed: boolean; lastModified: number }>;
}

const DEFAULT_STATUS: SyncStatus = {
  isSyncing: false,
  pendingChanges: 0,
  offlineQueueCount: 0,
  otherUsers: [],
  activeUsers: [],
  externalChangeDetected: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

export function useSync({ db, enabled, backgroundSyncInterval = 30 }: UseSyncOptions): UseSyncResult {
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_STATUS);
  const [isInitialized, setIsInitialized] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Create sync engine when db becomes available
  useEffect(() => {
    if (db && enabled) {
      const engine = new SyncEngine(db);
      setSyncEngine(engine);
      
      return () => {
        engine.destroy();
      };
    } else {
      setSyncEngine(null);
      setIsInitialized(false);
      setSyncStatus(DEFAULT_STATUS);
    }
  }, [db, enabled]);

  // Subscribe to sync status updates
  useEffect(() => {
    if (syncEngine) {
      unsubscribeRef.current = syncEngine.onStatusChange((status) => {
        setSyncStatus(status);
      });

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      };
    }
  }, [syncEngine]);

  const initializeSync = useCallback(async (
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string,
    dbFileHandle?: FileSystemFileHandle
  ): Promise<void> => {
    if (!syncEngine) {
      throw new Error('Sync engine not available');
    }

    await syncEngine.initialize(changesFolderHandle, userEmail, dbFileHandle);
    setIsInitialized(true);

    // Start background sync
    if (backgroundSyncInterval > 0) {
      syncEngine.startBackgroundSync(backgroundSyncInterval);
    }
  }, [syncEngine, backgroundSyncInterval]);

  const pushChanges = useCallback(async () => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.pushChanges();
  }, [syncEngine]);

  const pullChanges = useCallback(async () => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.pullChanges();
  }, [syncEngine]);

  const manualSync = useCallback(async () => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.manualSync();
  }, [syncEngine]);

  const resolveConflicts = useCallback(async (
    conflicts: Conflict[],
    resolutions: Map<Conflict, ConflictResolution>
  ) => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.resolveConflicts(conflicts, resolutions);
  }, [syncEngine]);

  const acknowledgeExternalChanges = useCallback(() => {
    if (syncEngine) {
      syncEngine.acknowledgeExternalChanges();
    }
  }, [syncEngine]);

  const checkForExternalChanges = useCallback(async () => {
    if (!syncEngine) {
      return { changed: false, lastModified: 0 };
    }
    return await syncEngine.hasFileChangedSinceOpen();
  }, [syncEngine]);

  return {
    syncEngine,
    syncStatus,
    isInitialized,
    initializeSync,
    pushChanges,
    pullChanges,
    manualSync,
    resolveConflicts,
    acknowledgeExternalChanges,
    checkForExternalChanges,
  };
}
