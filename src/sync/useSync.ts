/**
 * React hook for managing sync state
 * Provides a clean interface to the SyncEngine from React components
 */

import { useEffect, useRef, useState } from 'react';
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
    signalServerUrl?: string
  ) => Promise<void>;
  pushChanges: () => Promise<{ success: boolean; error?: string }>;
  pullChanges: () => Promise<{
    success: boolean;
    conflicts?: Conflict[];
    autoMergedCount?: number;
    error?: string;
  }>;
  resolveConflicts: (
    conflicts: Conflict[],
    resolutions: Map<Conflict, ConflictResolution>
  ) => Promise<{ success: boolean; error?: string }>;
}

export function useSync({ db, enabled, backgroundSyncInterval = 30 }: UseSyncOptions): UseSyncResult {
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingChanges: 0,
    otherUsers: [],
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize/Destroy SyncEngine when db changes
  useEffect(() => {
    if (db && enabled) {
      const engine = new SyncEngine(db);
      setSyncEngine(engine);
      setIsInitialized(false); // Reset init state for new engine

      return () => {
        engine.destroy();
        setSyncEngine(null);
        setIsInitialized(false);
      };
    } else {
      setSyncEngine(null);
      setIsInitialized(false);
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

  const initializeSync = async (
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string,
    signalServerUrl?: string
  ): Promise<void> => {
    if (!syncEngine) {
      throw new Error('Sync engine not available');
    }

    await syncEngine.initialize(changesFolderHandle, userEmail, signalServerUrl);
    setIsInitialized(true);

    // Start background sync
    if (backgroundSyncInterval > 0) {
      syncEngine.startBackgroundSync(backgroundSyncInterval);
    }
  };

  const pushChanges = async () => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.pushChanges();
  };

  const pullChanges = async () => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.pullChanges();
  };

  const resolveConflicts = async (
    conflicts: Conflict[],
    resolutions: Map<Conflict, ConflictResolution>
  ) => {
    if (!syncEngine) {
      return { success: false, error: 'Sync engine not available' };
    }
    return await syncEngine.resolveConflicts(conflicts, resolutions);
  };

  return {
    syncEngine,
    syncStatus,
    isInitialized,
    initializeSync,
    pushChanges,
    pullChanges,
    resolveConflicts,
  };
}
