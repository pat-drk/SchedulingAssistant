/**
 * LockManager - Handles file-based locking for exclusive access.
 * 
 * OneDrive/SharePoint-Compatible Design:
 * Uses timestamp-based lock filenames to avoid OneDrive's conflict renaming.
 * When two users create locks simultaneously before sync completes, each
 * creates a unique file. The "lastSeenLock" field detects if files existed
 * that hadn't synced yet - the oldest valid lock wins.
 * 
 * Lock File Format:
 * - Filename: lock-{ISO-timestamp}-{machineId}.json
 * - Contents: { user, lastSeenLock, lastHeartbeat }
 * 
 * Acquisition Logic:
 * 1. Scan for existing lock files, record the "lastSeen" filename
 * 2. If a valid (non-stale) lock exists, enter read-only mode
 * 3. Otherwise, create our timestamped lock file
 * 4. Wait for sync, then rescan
 * 5. If any files appear with timestamps AFTER lastSeen but BEFORE ours,
 *    those files existed but hadn't synced - we must rescind
 * 6. Cleanup stale lock files
 */

export interface LockInfo {
  user: string;
  lastSeenLock: string | null;  // Filename of most recent lock when we created ours
  lastHeartbeat: string;        // ISO timestamp of last heartbeat (for staleness)
}

interface LockFileEntry {
  filename: string;
  timestamp: Date;
  contents: LockInfo;
}

export class LockManager {
  private dbFolderHandle: FileSystemDirectoryHandle | null = null;
  private currentUser: string = '';
  private machineId: string = '';
  private ourLockFilename: string | null = null;
  private ourLastSeenLock: string | null = null; // Track what we saw when acquiring
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private conflictCheckInterval: NodeJS.Timeout | null = null;
  
  // Settings - optimized for SharePoint/OneDrive sync latency
  private readonly LOCK_FILE_PREFIX = 'lock-';
  private readonly LOCK_FILE_SUFFIX = '.json';
  private readonly STALE_THRESHOLD_MS = 1000 * 300; // 5 minutes
  private readonly HEARTBEAT_MS = 1000 * 30; // 30 seconds
  private readonly SYNC_WAIT_MS = 3000; // Wait for OneDrive sync before verifying
  private readonly EXTENDED_CONFLICT_CHECK_MS = 10000; // Continue checking for conflicts
  private readonly EXTENDED_CONFLICT_CHECK_COUNT = 3; // Number of extended checks (10s, 20s, 30s)

  constructor() {
    this.machineId = Math.random().toString(36).substring(2, 15);
  }

  /**
   * Initialize with the folder handle
   */
  initialize(dbFolderHandle: FileSystemDirectoryHandle, userEmail: string) {
    this.dbFolderHandle = dbFolderHandle;
    this.currentUser = userEmail;
    this.ourLockFilename = null;
    this.ourLastSeenLock = null;
  }

  /**
   * Try to acquire the lock.
   * Returns true if successful, false if locked by someone else.
   */
  async acquireLock(): Promise<{ success: boolean; error?: string; lockedBy?: string }> {
    if (!this.dbFolderHandle) return { success: false, error: 'Not initialized' };

    try {
      // 1. Scan for existing lock files
      const existingLocks = await this.scanLockFiles();
      const validLocks = this.filterValidLocks(existingLocks);
      
      // Record what we saw (for conflict detection later)
      const lastSeenLock = validLocks.length > 0 
        ? validLocks[validLocks.length - 1].filename  // Most recent valid lock
        : null;

      // 2. Check if we already own a lock (page reload scenario)
      const ourExistingLock = existingLocks.find(l => 
        l.filename.includes(this.machineId)
      );
      if (ourExistingLock) {
        this.ourLockFilename = ourExistingLock.filename;
        this.startHeartbeat();
        return { success: true };
      }

      // 3. If someone else has a valid lock, enter read-only
      if (validLocks.length > 0) {
        const winner = validLocks[0]; // Oldest valid lock wins
        return { success: false, lockedBy: winner.contents.user };
      }

      // 4. Create our lock file with timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-'); // Safe for filenames
      this.ourLockFilename = `${this.LOCK_FILE_PREFIX}${timestamp}-${this.machineId}${this.LOCK_FILE_SUFFIX}`;
      
      await this.writeLockFile(lastSeenLock);

      // 5. Wait for OneDrive/SharePoint sync
      await new Promise(r => setTimeout(r, this.SYNC_WAIT_MS));

      // 6. Rescan and check for conflicts using lastSeen logic
      const afterSyncLocks = await this.scanLockFiles();
      const conflictDetected = this.detectConflict(afterSyncLocks, lastSeenLock);
      
      if (conflictDetected) {
        // Files appeared that we didn't see - they were created before ours but hadn't synced
        // We must rescind our lock
        console.log('[LockManager] Conflict detected - rescinding lock');
        await this.deleteLockFile(this.ourLockFilename);
        this.ourLockFilename = null;
        
        const winner = this.filterValidLocks(afterSyncLocks)[0];
        return { success: false, lockedBy: winner?.contents.user || 'another user' };
      }

      // 7. Verify our file still exists (OneDrive didn't rename it due to conflict)
      const ourFileStillExists = afterSyncLocks.some(l => l.filename === this.ourLockFilename);
      if (!ourFileStillExists) {
        console.log('[LockManager] Our lock file was renamed/removed by OneDrive conflict resolution');
        this.ourLockFilename = null;
        
        const validAfterSync = this.filterValidLocks(afterSyncLocks);
        const winner = validAfterSync[0];
        return { success: false, lockedBy: winner?.contents.user || 'another user' };
      }

      // 8. Cleanup stale locks
      await this.cleanupStaleLocks(afterSyncLocks);

      // 9. Store lastSeenLock for ongoing conflict detection
      this.ourLastSeenLock = lastSeenLock;

      // 10. Success! Start heartbeat and extended conflict checking
      this.startHeartbeat();
      this.startExtendedConflictChecking();
      return { success: true };

    } catch (e: any) {
      console.error('[LockManager] Error acquiring lock:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Detect if files appeared that indicate a conflict.
   * Returns true if any lock files have timestamps AFTER lastSeen but BEFORE ours.
   */
  private detectConflict(locks: LockFileEntry[], lastSeenLock: string | null): boolean {
    if (!this.ourLockFilename) return false;
    
    const ourTimestamp = this.parseTimestampFromFilename(this.ourLockFilename);
    if (!ourTimestamp) return false;

    const lastSeenTimestamp = lastSeenLock 
      ? this.parseTimestampFromFilename(lastSeenLock) 
      : null;

    for (const lock of locks) {
      // Skip our own file
      if (lock.filename === this.ourLockFilename) continue;
      
      // Skip stale files
      if (this.isStale(lock)) continue;
      
      const lockTimestamp = this.parseTimestampFromFilename(lock.filename);
      if (!lockTimestamp) continue;

      // Check if this file is AFTER lastSeen but BEFORE ours
      const isAfterLastSeen = !lastSeenTimestamp || lockTimestamp > lastSeenTimestamp;
      const isBeforeOurs = lockTimestamp < ourTimestamp;

      if (isAfterLastSeen && isBeforeOurs) {
        console.log(`[LockManager] Conflict: ${lock.filename} appeared (after lastSeen, before ours)`);
        return true;
      }
    }

    return false;
  }

  /**
   * Verify we still own the lock (for pre-save checks and periodic validation)
   */
  async verifyOwnLock(): Promise<boolean> {
    if (!this.dbFolderHandle || !this.ourLockFilename) return false;
    
    try {
      const locks = await this.scanLockFiles();
      
      // Check our file still exists
      const ourLock = locks.find(l => l.filename === this.ourLockFilename);
      if (!ourLock) {
        console.warn('[LockManager] Our lock file is missing');
        return false;
      }

      // Check no one else has an older valid lock
      const validLocks = this.filterValidLocks(locks);
      if (validLocks.length > 0 && validLocks[0].filename !== this.ourLockFilename) {
        console.warn('[LockManager] Someone else has an older valid lock');
        return false;
      }

      // Check for late-arriving conflicts (files that synced after we acquired)
      if (this.detectConflict(locks, this.ourLastSeenLock)) {
        console.warn('[LockManager] Late conflict detected - lock files appeared after acquisition');
        return false;
      }
      
      return true;
    } catch (e) {
      console.error('[LockManager] Error verifying lock:', e);
      return false;
    }
  }

  /**
   * Release the lock (delete our file)
   */
  async releaseLock() {
    this.stopHeartbeat();
    this.stopExtendedConflictChecking();
    if (!this.dbFolderHandle || !this.ourLockFilename) return;

    try {
      await this.deleteLockFile(this.ourLockFilename);
      this.ourLockFilename = null;
      this.ourLastSeenLock = null;
    } catch (e) {
      console.warn('[LockManager] Failed to release lock:', e);
    }
  }

  /**
   * Force unlock (delete all lock files)
   */
  async forceUnlock(): Promise<void> {
    if (!this.dbFolderHandle) return;
    try {
      const locks = await this.scanLockFiles();
      for (const lock of locks) {
        await this.deleteLockFile(lock.filename);
      }
    } catch (e) {
      console.warn('[LockManager] Failed to force unlock:', e);
      throw e;
    }
  }

  /**
   * Check if locked by another user
   */
  async isLockedByOther(): Promise<string | null> {
    if (!this.dbFolderHandle) return null;
    try {
      const locks = await this.scanLockFiles();
      const validLocks = this.filterValidLocks(locks);
      
      // Find oldest valid lock that isn't ours
      for (const lock of validLocks) {
        if (lock.filename !== this.ourLockFilename) {
          return lock.contents.user;
        }
      }
    } catch (e) {
      console.error('[LockManager] Error checking lock:', e);
    }
    return null;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.writeLockFile(null); // lastSeenLock not needed for heartbeat updates
    }, this.HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Extended conflict checking - continues checking for late-syncing lock files
   * that may indicate we acquired the lock when we shouldn't have.
   * Runs a few times after initial acquisition (10s, 20s, 30s).
   */
  private startExtendedConflictChecking() {
    this.stopExtendedConflictChecking();
    
    let checksRemaining = this.EXTENDED_CONFLICT_CHECK_COUNT;
    
    this.conflictCheckInterval = setInterval(async () => {
      checksRemaining--;
      
      if (checksRemaining <= 0) {
        this.stopExtendedConflictChecking();
        console.log('[LockManager] Extended conflict checking complete - no conflicts found');
        return;
      }
      
      try {
        const locks = await this.scanLockFiles();
        const conflictDetected = this.detectConflict(locks, this.ourLastSeenLock);
        
        if (conflictDetected) {
          console.warn('[LockManager] Late conflict detected - lock should be rescinded');
          // Notify via verifyOwnLock returning false
          // The periodic check in useSync will catch this
          this.stopExtendedConflictChecking();
        }
      } catch (e) {
        console.error('[LockManager] Error in extended conflict check:', e);
      }
    }, this.EXTENDED_CONFLICT_CHECK_MS);
  }

  private stopExtendedConflictChecking() {
    if (this.conflictCheckInterval) {
      clearInterval(this.conflictCheckInterval);
      this.conflictCheckInterval = null;
    }
  }

  /**
   * Scan folder for all lock files
   */
  private async scanLockFiles(): Promise<LockFileEntry[]> {
    if (!this.dbFolderHandle) return [];
    
    const entries: LockFileEntry[] = [];
    
    try {
      for await (const [name, handle] of (this.dbFolderHandle as any).entries()) {
        if (handle.kind === 'file' && 
            name.startsWith(this.LOCK_FILE_PREFIX) && 
            name.endsWith(this.LOCK_FILE_SUFFIX)) {
          try {
            const file = await handle.getFile();
            const text = await file.text();
            const contents = JSON.parse(text) as LockInfo;
            const timestamp = this.parseTimestampFromFilename(name);
            
            if (timestamp) {
              entries.push({ filename: name, timestamp, contents });
            }
          } catch (e) {
            console.warn(`[LockManager] Failed to read lock file ${name}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('[LockManager] Error scanning lock files:', e);
    }

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return entries;
  }

  /**
   * Filter to only valid (non-stale) locks
   */
  private filterValidLocks(locks: LockFileEntry[]): LockFileEntry[] {
    return locks.filter(lock => !this.isStale(lock));
  }

  /**
   * Check if a lock is stale
   */
  private isStale(lock: LockFileEntry): boolean {
    const heartbeat = new Date(lock.contents.lastHeartbeat).getTime();
    return Date.now() - heartbeat > this.STALE_THRESHOLD_MS;
  }

  /**
   * Parse timestamp from lock filename
   */
  private parseTimestampFromFilename(filename: string): Date | null {
    // Format: lock-2025-12-30T14-30-45-123Z-machineId.json
    const match = filename.match(/^lock-(.+)-[a-z0-9]+\.json$/i);
    if (!match) return null;
    
    // Convert back from filename-safe format
    const isoString = match[1].replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z');
    try {
      return new Date(isoString);
    } catch {
      return null;
    }
  }

  /**
   * Cleanup stale lock files
   */
  private async cleanupStaleLocks(locks: LockFileEntry[]): Promise<void> {
    for (const lock of locks) {
      if (this.isStale(lock) && lock.filename !== this.ourLockFilename) {
        console.log(`[LockManager] Cleaning up stale lock: ${lock.filename}`);
        await this.deleteLockFile(lock.filename);
      }
    }
  }

  /**
   * Delete a specific lock file
   */
  private async deleteLockFile(filename: string): Promise<void> {
    if (!this.dbFolderHandle) return;
    try {
      await this.dbFolderHandle.removeEntry(filename);
    } catch (e) {
      console.warn(`[LockManager] Failed to delete ${filename}:`, e);
    }
  }

  /**
   * Write/update our lock file
   */
  private async writeLockFile(lastSeenLock: string | null) {
    if (!this.dbFolderHandle || !this.ourLockFilename) return;
    
    try {
      // Read existing to preserve lastSeenLock on heartbeat updates
      let existingLastSeen = lastSeenLock;
      try {
        const fileHandle = await this.dbFolderHandle.getFileHandle(this.ourLockFilename);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const existing = JSON.parse(text) as LockInfo;
        if (lastSeenLock === null && existing.lastSeenLock) {
          existingLastSeen = existing.lastSeenLock;
        }
      } catch {
        // File doesn't exist yet, use provided lastSeenLock
      }

      const lockData: LockInfo = {
        user: this.currentUser,
        lastSeenLock: existingLastSeen,
        lastHeartbeat: new Date().toISOString()
      };
      
      const fileHandle = await this.dbFolderHandle.getFileHandle(this.ourLockFilename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(lockData, null, 2));
      await writable.close();
    } catch (e) {
      console.error('[LockManager] Failed to write lock:', e);
    }
  }
}
