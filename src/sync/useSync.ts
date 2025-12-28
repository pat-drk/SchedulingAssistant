/**
 * React hook for managing File Lock state
 */

import { useEffect, useState, useRef } from 'react';
import { LockManager } from './LockManager';

export interface UseSyncResult {
  isReadOnly: boolean;
  lockedBy: string | null;
  checkLock: (folderHandle: FileSystemDirectoryHandle, email: string) => Promise<boolean>;
  releaseLock: () => Promise<void>;
}

export function useSync(): UseSyncResult {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const lockManager = useRef(new LockManager());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      lockManager.current.releaseLock();
    };
  }, []);

  const checkLock = async (folderHandle: FileSystemDirectoryHandle, email: string) => {
    lockManager.current.initialize(folderHandle, email);
    
    // Attempt to acquire
    const result = await lockManager.current.acquireLock();
    
    if (result.success) {
      setIsReadOnly(false);
      setLockedBy(null);
      return true;
    } else {
      setIsReadOnly(true);
      setLockedBy(result.lockedBy || 'Unknown User');
      return false;
    }
  };

  const releaseLock = async () => {
    await lockManager.current.releaseLock();
    setIsReadOnly(false);
    setLockedBy(null);
  };

  return {
    isReadOnly,
    lockedBy,
    checkLock,
    releaseLock
  };
}