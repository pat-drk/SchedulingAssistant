/**
 * React hook for managing File Lock state
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { LockManager } from './LockManager';

export interface UseSyncResult {
  isReadOnly: boolean;
  lockedBy: string | null;
  hasLock: boolean;
  lockLost: boolean;
  checkLock: (folderHandle: FileSystemDirectoryHandle, email: string) => Promise<boolean>;
  releaseLock: () => Promise<void>;
  forceUnlock: () => Promise<void>;
  verifyLock: () => Promise<boolean>;
  clearLockLost: () => void;
}

// Check lock status every 30 seconds
const LOCK_CHECK_INTERVAL_MS = 30000;

export function useSync(): UseSyncResult {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [hasLock, setHasLock] = useState(false);
  const [lockLost, setLockLost] = useState(false);
  const lockManager = useRef(new LockManager());
  const lockCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Periodic lock verification - detect if lock was stolen
  useEffect(() => {
    if (hasLock && !lockLost) {
      lockCheckInterval.current = setInterval(async () => {
        const stillValid = await lockManager.current.verifyOwnLock();
        if (!stillValid) {
          console.warn('[useSync] Lock lost - another user may have taken over');
          setLockLost(true);
          setHasLock(false);
          setIsReadOnly(true);
        }
      }, LOCK_CHECK_INTERVAL_MS);
      
      return () => {
        if (lockCheckInterval.current) {
          clearInterval(lockCheckInterval.current);
          lockCheckInterval.current = null;
        }
      };
    }
  }, [hasLock, lockLost]);

  // Handle beforeunload - warn user if they have an active lock
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasLock) {
        // Standard way to show browser's "Leave site?" dialog
        e.preventDefault();
        // For older browsers
        e.returnValue = '';
        return '';
      }
    };

    const handleUnload = () => {
      // Attempt to release lock when page unloads
      // Note: This is best-effort - async operations may not complete
      if (hasLock) {
        lockManager.current.releaseLock();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [hasLock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      lockManager.current.releaseLock();
    };
  }, []);

  const checkLock = useCallback(async (folderHandle: FileSystemDirectoryHandle, email: string) => {
    lockManager.current.initialize(folderHandle, email);
    
    // Attempt to acquire
    const result = await lockManager.current.acquireLock();
    
    if (result.success) {
      setIsReadOnly(false);
      setLockedBy(null);
      setHasLock(true);
      return true;
    } else {
      setIsReadOnly(true);
      setLockedBy(result.lockedBy || 'Unknown User');
      setHasLock(false);
      return false;
    }
  }, []);

  const releaseLock = useCallback(async () => {
    await lockManager.current.releaseLock();
    setIsReadOnly(false);
    setLockedBy(null);
    setHasLock(false);
  }, []);

  const forceUnlock = useCallback(async () => {
    await lockManager.current.forceUnlock();
    // After forcing, try to acquire it ourselves
    const result = await lockManager.current.acquireLock();
    if (result.success) {
      setIsReadOnly(false);
      setLockedBy(null);
      setHasLock(true);
      setLockLost(false);
    }
  }, []);

  const verifyLock = useCallback(async () => {
    return await lockManager.current.verifyOwnLock();
  }, []);

  const clearLockLost = useCallback(() => {
    setLockLost(false);
  }, []);

  return {
    isReadOnly,
    lockedBy,
    hasLock,
    lockLost,
    checkLock,
    releaseLock,
    forceUnlock,
    verifyLock,
    clearLockLost
  };
}