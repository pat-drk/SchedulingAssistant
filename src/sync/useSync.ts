/**
 * React hook for managing File Lock state
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { LockManager } from './LockManager';

export interface UseSyncResult {
  isReadOnly: boolean;
  lockedBy: string | null;
  hasLock: boolean;
  checkLock: (folderHandle: FileSystemDirectoryHandle, email: string) => Promise<boolean>;
  releaseLock: () => Promise<void>;
  forceUnlock: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [hasLock, setHasLock] = useState(false);
  const lockManager = useRef(new LockManager());

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
    }
  }, []);

  return {
    isReadOnly,
    lockedBy,
    hasLock,
    checkLock,
    releaseLock,
    forceUnlock
  };
}