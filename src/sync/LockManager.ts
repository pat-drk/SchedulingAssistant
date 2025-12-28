/**
 * LockManager - Handles file-based locking for exclusive access.
 * 
 * Logic:
 * 1. Checks for a `lock.json` file in the database folder.
 * 2. If present and valid (not stale), denies access (Read-Only).
 * 3. If absent, creates `lock.json` to claim access.
 * 4. Updates timestamp periodically (Heartbeat).
 * 5. Deletes `lock.json` on release.
 */

import { FileSystemUtils } from './FileSystemUtils';

export interface LockInfo {
  user: string;
  timestamp: string;
  machineId: string;
}

export class LockManager {
  private dbFolderHandle: FileSystemDirectoryHandle | null = null;
  private currentUser: string = '';
  private machineId: string = '';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  // Settings
  private readonly LOCK_FILE_NAME = 'lock.json';
  private readonly STALE_THRESHOLD_MS = 1000 * 60 * 5; // 5 minutes (Lock expires if app crashes)
  private readonly HEARTBEAT_MS = 1000 * 60; // 1 minute

  constructor() {
    this.machineId = Math.random().toString(36).substring(2, 15);
  }

  /**
   * Initialize with the folder handle
   */
  initialize(dbFolderHandle: FileSystemDirectoryHandle, userEmail: string) {
    this.dbFolderHandle = dbFolderHandle;
    this.currentUser = userEmail;
  }

  /**
   * Try to acquire the lock.
   * Returns true if successful, false if locked by someone else.
   */
  async acquireLock(): Promise<{ success: boolean; error?: string; lockedBy?: string }> {
    if (!this.dbFolderHandle) return { success: false, error: 'Not initialized' };

    try {
      // 1. Check if lock exists
      const currentLock = await this.readLockFile();

      if (currentLock) {
        // Check if it's our own lock (maybe from a reload)
        if (currentLock.user === this.currentUser && currentLock.machineId === this.machineId) {
          this.startHeartbeat();
          return { success: true };
        }

        // Check if it's stale
        const lockTime = new Date(currentLock.timestamp).getTime();
        const now = Date.now();
        if (now - lockTime > this.STALE_THRESHOLD_MS) {
          console.log('[LockManager] Found stale lock, breaking it.');
          // Proceed to overwrite
        } else {
          // It's a valid lock by someone else
          return { success: false, lockedBy: currentLock.user };
        }
      }

      // 2. Write our lock
      await this.writeLockFile();

      // 3. Double-check (Race Condition Mitigation)
      // Wait a moment and check if we are still the winner. 
      // In a robust system, we'd wait longer (e.g., 5s), but for UX we'll check immediately
      // and rely on the heartbeat to maintain it.
      const verifyLock = await this.readLockFile();
      if (verifyLock && verifyLock.machineId !== this.machineId) {
        return { success: false, lockedBy: verifyLock.user };
      }

      this.startHeartbeat();
      return { success: true };

    } catch (e: any) {
      console.error('[LockManager] Error acquiring lock:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Release the lock (delete the file)
   */
  async releaseLock() {
    this.stopHeartbeat();
    if (!this.dbFolderHandle) return;

    try {
      // Only delete if it's OUR lock
      const currentLock = await this.readLockFile();
      if (currentLock && currentLock.machineId === this.machineId) {
        await this.dbFolderHandle.removeEntry(this.LOCK_FILE_NAME);
      }
    } catch (e) {
      console.warn('[LockManager] Failed to release lock:', e);
    }
  }

  /**
   * Check if the lock is still valid
   */
  async isLockedByOther(): Promise<string | null> {
    if (!this.dbFolderHandle) return null;
    try {
      const lock = await this.readLockFile();
      if (lock && lock.machineId !== this.machineId) {
        const lockTime = new Date(lock.timestamp).getTime();
        if (Date.now() - lockTime < this.STALE_THRESHOLD_MS) {
          return lock.user;
        }
      }
    } catch (e) {}
    return null;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => this.writeLockFile(), this.HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async readLockFile(): Promise<LockInfo | null> {
    if (!this.dbFolderHandle) return null;
    try {
      const fileHandle = await this.dbFolderHandle.getFileHandle(this.LOCK_FILE_NAME);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as LockInfo;
    } catch (e) {
      return null; // File doesn't exist or read error
    }
  }

  private async writeLockFile() {
    if (!this.dbFolderHandle) return;
    try {
      const lockData: LockInfo = {
        user: this.currentUser,
        timestamp: new Date().toISOString(),
        machineId: this.machineId
      };
      
      // Use the FileSystemUtils helper if available, or direct API
      // We'll implement a simple write here to avoid dependency cycle if utils not perfect
      const fileHandle = await this.dbFolderHandle.getFileHandle(this.LOCK_FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(lockData, null, 2));
      await writable.close();
    } catch (e) {
      console.error('[LockManager] Failed to write lock:', e);
    }
  }
}
