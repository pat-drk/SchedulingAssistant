/**
 * FileSystemUtils - Utilities for managing sync folder structure
 * Handles creation and access of the changes folder on network drives.
 * 
 * Includes:
 * - Retry logic with exponential backoff for OneDrive/SharePoint sync latency
 * - File stability checks before reading
 * - IndexedDB persistence for directory handles
 */

// IndexedDB for storing directory handles
const HANDLE_DB_NAME = 'SchedulingAssistantHandles';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE_NAME = 'directoryHandles';

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Open IndexedDB for handle storage
 */
function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open handle database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

export class FileSystemUtils {
  /**
   * Get the changes folder path relative to the database file
   */
  static getChangesFolderName(): string {
    return 'changes';
  }

  /**
   * Get the sync state file name
   */
  static getSyncStateFileName(): string {
    return 'sync-state.json';
  }

  /**
   * Get the heartbeat file name for a user
   */
  static getHeartbeatFileName(userEmail: string): string {
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9@.-]/g, '_');
    return `heartbeat-${sanitizedEmail}.json`;
  }

  /**
   * Create a change file name based on user and timestamp
   */
  static createChangeFileName(userEmail: string, timestamp?: Date): string {
    const ts = timestamp || new Date();
    const dateStr = ts.toISOString().replace(/[:.]/g, '-').replace('T', '-').split('.')[0];
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9@.-]/g, '_');
    return `${sanitizedEmail}-${dateStr}.json`;
  }

  /**
   * Parse change file name to extract user email and timestamp
   */
  static parseChangeFileName(fileName: string): { user: string; timestamp: Date } | null {
    // Format: user-email-YYYY-MM-DD-HH-MM-SS.json
    const match = fileName.match(/^(.+?)-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.json$/);
    if (!match) return null;

    const user = match[1].replace(/_/g, '.');
    const dateStr = match[2].replace(/-/g, ':').replace(':', '-').replace(':', '-');
    const timestamp = new Date(dateStr.replace(/-/g, (m, i) => i < 2 ? '-' : ':'));
    
    return { user, timestamp };
  }

  /**
   * Check if the File System Access API is available
   */
  static isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 
           'showOpenFilePicker' in window && 
           'showSaveFilePicker' in window;
  }

  /**
   * Execute an operation with retry logic and exponential backoff
   * Handles transient failures from OneDrive/SharePoint sync
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    };

    let lastError: Error | null = null;
    let delay = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = 
          error.name === 'NotReadableError' ||
          error.name === 'NoModificationAllowedError' ||
          error.name === 'InvalidStateError' ||
          error.message?.includes('locked') ||
          error.message?.includes('sync') ||
          error.message?.includes('busy');

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`, error.message);
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Wait for a file to stabilize (stop changing)
   * Useful for ensuring OneDrive has finished syncing
   */
  static async waitForFileStability(
    fileHandle: FileSystemFileHandle,
    stableMs: number = 2000,
    checkIntervalMs: number = 500,
    maxWaitMs: number = 30000
  ): Promise<{ stable: boolean; lastModified: number }> {
    const startTime = Date.now();
    let lastModified: number | null = null;
    let stableStart: number | null = null;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const file = await fileHandle.getFile();
        const currentModified = file.lastModified;

        if (lastModified === currentModified) {
          // File hasn't changed
          if (!stableStart) {
            stableStart = Date.now();
          } else if (Date.now() - stableStart >= stableMs) {
            // File has been stable for long enough
            return { stable: true, lastModified: currentModified };
          }
        } else {
          // File changed, reset stability timer
          lastModified = currentModified;
          stableStart = null;
        }

        await sleep(checkIntervalMs);
      } catch (error) {
        // File might be locked, wait and retry
        await sleep(checkIntervalMs);
      }
    }

    return { stable: false, lastModified: lastModified || 0 };
  }

  /**
   * Store a directory handle in IndexedDB for persistence across sessions
   */
  static async storeDirectoryHandle(
    key: string,
    handle: FileSystemDirectoryHandle
  ): Promise<void> {
    try {
      const db = await openHandleDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([HANDLE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(HANDLE_STORE_NAME);
        const request = store.put({ key, handle });

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(new Error(`Failed to store handle: ${request.error?.message}`));
        };
      });
    } catch (error) {
      console.error('Failed to store directory handle:', error);
    }
  }

  /**
   * Retrieve a directory handle from IndexedDB
   * Returns null if not found or if permission was revoked
   */
  static async retrieveDirectoryHandle(
    key: string
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      const db = await openHandleDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([HANDLE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(HANDLE_STORE_NAME);
        const request = store.get(key);

        request.onsuccess = async () => {
          db.close();
          const result = request.result;
          if (!result?.handle) {
            resolve(null);
            return;
          }

          // Verify permission is still valid
          try {
            const permission = await result.handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
              resolve(result.handle);
            } else {
              // Try to request permission
              const newPermission = await result.handle.requestPermission({ mode: 'readwrite' });
              if (newPermission === 'granted') {
                resolve(result.handle);
              } else {
                resolve(null);
              }
            }
          } catch (error) {
            resolve(null);
          }
        };
        request.onerror = () => {
          db.close();
          reject(new Error(`Failed to retrieve handle: ${request.error?.message}`));
        };
      });
    } catch (error) {
      console.error('Failed to retrieve directory handle:', error);
      return null;
    }
  }

  /**
   * Get a directory handle for the changes folder
   * Creates it if it doesn't exist
   */
  static async getChangesFolderHandle(
    dbFileHandle: FileSystemFileHandle
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      // Try to retrieve from IndexedDB first
      const stored = await this.retrieveDirectoryHandle('changes-folder');
      if (stored) {
        return stored;
      }

      // For now, we'll use a workaround - ask the user to select the parent folder
      // In a real implementation, we would need to store the directory handle
      return null;
    } catch (error) {
      console.error('Error getting changes folder handle:', error);
      return null;
    }
  }

  /**
   * Create the changes folder if it doesn't exist
   */
  static async ensureChangesFolderExists(
    parentDirHandle: FileSystemDirectoryHandle
  ): Promise<FileSystemDirectoryHandle> {
    return this.withRetry(async () => {
      try {
        const changesFolderHandle = await parentDirHandle.getDirectoryHandle(
          this.getChangesFolderName(),
          { create: true }
        );
        
        // Store for future use
        await this.storeDirectoryHandle('changes-folder', changesFolderHandle);
        
        return changesFolderHandle;
      } catch (error) {
        throw new Error(`Failed to create changes folder: ${error}`);
      }
    });
  }

  /**
   * List all change files in the changes folder
   */
  static async listChangeFiles(
    changesFolderHandle: FileSystemDirectoryHandle
  ): Promise<string[]> {
    return this.withRetry(async () => {
      const files: string[] = [];
      try {
        for await (const entry of changesFolderHandle.values()) {
          if (entry.kind === 'file' && 
              entry.name.endsWith('.json') && 
              entry.name !== this.getSyncStateFileName() &&
              !entry.name.startsWith('heartbeat-')) {
            files.push(entry.name);
          }
        }
      } catch (error) {
        console.error('Error listing change files:', error);
      }
      return files.sort();
    });
  }

  /**
   * Read a change file with retry logic
   */
  static async readChangeFile(
    changesFolderHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<any> {
    return this.withRetry(async () => {
      try {
        const fileHandle = await changesFolderHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
      } catch (error) {
        console.error(`Error reading change file ${fileName}:`, error);
        throw error;
      }
    });
  }

  /**
   * Write a change file with retry logic
   */
  static async writeChangeFile(
    changesFolderHandle: FileSystemDirectoryHandle,
    fileName: string,
    data: any
  ): Promise<void> {
    return this.withRetry(async () => {
      try {
        const fileHandle = await changesFolderHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      } catch (error) {
        console.error(`Error writing change file ${fileName}:`, error);
        throw error;
      }
    });
  }

  /**
   * Delete a change file
   */
  static async deleteChangeFile(
    changesFolderHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<void> {
    try {
      await changesFolderHandle.removeEntry(fileName);
    } catch (error) {
      console.error(`Error deleting change file ${fileName}:`, error);
      // Don't throw - file might already be deleted
    }
  }

  /**
   * Read sync state
   */
  static async readSyncState(
    changesFolderHandle: FileSystemDirectoryHandle
  ): Promise<any> {
    try {
      return await this.readChangeFile(changesFolderHandle, this.getSyncStateFileName());
    } catch (error) {
      // Return default state if file doesn't exist
      return {
        version: 0,
        appliedChanges: [],
        lastSync: new Date().toISOString(),
      };
    }
  }

  /**
   * Write sync state
   */
  static async writeSyncState(
    changesFolderHandle: FileSystemDirectoryHandle,
    state: any
  ): Promise<void> {
    await this.writeChangeFile(changesFolderHandle, this.getSyncStateFileName(), state);
  }

  /**
   * Write heartbeat file for presence detection
   */
  static async writeHeartbeat(
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string
  ): Promise<void> {
    const fileName = this.getHeartbeatFileName(userEmail);
    const data = {
      user: userEmail,
      timestamp: Date.now(),
      lastActivity: new Date().toISOString(),
    };
    await this.writeChangeFile(changesFolderHandle, fileName, data);
  }

  /**
   * Read all heartbeat files to detect active users
   */
  static async readHeartbeats(
    changesFolderHandle: FileSystemDirectoryHandle
  ): Promise<Array<{ user: string; timestamp: number; stale: boolean }>> {
    const heartbeats: Array<{ user: string; timestamp: number; stale: boolean }> = [];
    const staleThresholdMs = 2 * 60 * 1000; // 2 minutes
    const now = Date.now();

    try {
      for await (const entry of changesFolderHandle.values()) {
        if (entry.kind === 'file' && entry.name.startsWith('heartbeat-')) {
          try {
            const data = await this.readChangeFile(changesFolderHandle, entry.name);
            heartbeats.push({
              user: data.user,
              timestamp: data.timestamp,
              stale: now - data.timestamp > staleThresholdMs,
            });
          } catch (error) {
            // Skip unreadable heartbeat files
          }
        }
      }
    } catch (error) {
      console.error('Error reading heartbeats:', error);
    }

    return heartbeats;
  }

  /**
   * Clean up stale heartbeat files (older than 1 hour)
   */
  static async cleanupStaleHeartbeats(
    changesFolderHandle: FileSystemDirectoryHandle,
    maxAgeMs: number = 60 * 60 * 1000
  ): Promise<void> {
    const now = Date.now();

    try {
      for await (const entry of changesFolderHandle.values()) {
        if (entry.kind === 'file' && entry.name.startsWith('heartbeat-')) {
          try {
            const data = await this.readChangeFile(changesFolderHandle, entry.name);
            if (now - data.timestamp > maxAgeMs) {
              await this.deleteChangeFile(changesFolderHandle, entry.name);
            }
          } catch (error) {
            // Skip problematic files
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up heartbeats:', error);
    }
  }
}

