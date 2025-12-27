/**
 * OfflineQueue - IndexedDB persistence for pending sync changes
 * 
 * Stores change operations in IndexedDB so they survive browser restarts.
 * When the user goes online, these changes can be synced to other users.
 * 
 * Schema follows Option B: High-level change objects (table, rowId, field, oldValue, newValue)
 */

const DB_NAME = 'SchedulingAssistantSync';
const DB_VERSION = 1;
const STORE_NAME = 'pendingChanges';

export interface PersistedChange {
  /** UUID for this change */
  id: string;
  /** Table name (e.g., "person", "assignment", "segment") */
  table: string;
  /** Operation type */
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Primary key of the affected row */
  rowId: string | number;
  /** Field name (for UPDATE operations) */
  field?: string;
  /** Previous value (for UPDATE/DELETE) */
  oldValue?: unknown;
  /** New value (for INSERT/UPDATE) */
  newValue?: unknown;
  /** Full record data (for INSERT/DELETE) */
  data?: Record<string, unknown>;
  /** When the change was made */
  timestamp: number;
  /** User who made the change */
  userId: string;
  /** Whether this change has been synced to the changes folder */
  synced: boolean;
}

/**
 * Generate a UUID for change IDs
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create the pendingChanges store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        
        // Index for querying unsynced changes
        store.createIndex('synced', 'synced', { unique: false });
        
        // Index for querying by timestamp
        store.createIndex('timestamp', 'timestamp', { unique: false });
        
        // Index for querying by user
        store.createIndex('userId', 'userId', { unique: false });
        
        // Compound index for table + rowId (for deduplication)
        store.createIndex('tableRowId', ['table', 'rowId'], { unique: false });
      }
    };
  });
}

/**
 * OfflineQueue class for managing persisted changes
 */
export class OfflineQueue {
  private db: IDBDatabase | null = null;
  private userId: string = '';

  /**
   * Initialize the offline queue with the current user's ID
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    this.db = await openDatabase();
  }

  /**
   * Check if the queue is initialized
   */
  isInitialized(): boolean {
    return this.db !== null && this.userId !== '';
  }

  /**
   * Add a change to the offline queue
   */
  async addChange(
    table: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    rowId: string | number,
    options: {
      field?: string;
      oldValue?: unknown;
      newValue?: unknown;
      data?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    const change: PersistedChange = {
      id: generateId(),
      table,
      operation,
      rowId,
      field: options.field,
      oldValue: options.oldValue,
      newValue: options.newValue,
      data: options.data,
      timestamp: Date.now(),
      userId: this.userId,
      synced: false,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(change);

      request.onsuccess = () => resolve(change.id);
      request.onerror = () => reject(new Error(`Failed to add change: ${request.error?.message}`));
    });
  }

  /**
   * Get all unsynced changes
   */
  async getUnsyncedChanges(): Promise<PersistedChange[]> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => {
        // Sort by timestamp ascending
        const changes = request.result as PersistedChange[];
        changes.sort((a, b) => a.timestamp - b.timestamp);
        resolve(changes);
      };
      request.onerror = () => reject(new Error(`Failed to get unsynced changes: ${request.error?.message}`));
    });
  }

  /**
   * Get all changes (for debugging/admin)
   */
  async getAllChanges(): Promise<PersistedChange[]> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const changes = request.result as PersistedChange[];
        changes.sort((a, b) => a.timestamp - b.timestamp);
        resolve(changes);
      };
      request.onerror = () => reject(new Error(`Failed to get all changes: ${request.error?.message}`));
    });
  }

  /**
   * Mark changes as synced
   */
  async markAsSynced(changeIds: string[]): Promise<void> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      let completed = 0;
      let hadError = false;

      for (const id of changeIds) {
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
          const change = getRequest.result as PersistedChange | undefined;
          if (change) {
            change.synced = true;
            const putRequest = store.put(change);
            putRequest.onsuccess = () => {
              completed++;
              if (completed === changeIds.length && !hadError) {
                resolve();
              }
            };
            putRequest.onerror = () => {
              if (!hadError) {
                hadError = true;
                reject(new Error(`Failed to mark change as synced: ${putRequest.error?.message}`));
              }
            };
          } else {
            completed++;
            if (completed === changeIds.length && !hadError) {
              resolve();
            }
          }
        };
        
        getRequest.onerror = () => {
          if (!hadError) {
            hadError = true;
            reject(new Error(`Failed to get change for marking: ${getRequest.error?.message}`));
          }
        };
      }

      // Handle empty array case
      if (changeIds.length === 0) {
        resolve();
      }
    });
  }

  /**
   * Delete synced changes older than the specified age (default: 7 days)
   */
  async cleanupOldChanges(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    const cutoff = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      let deletedCount = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const change = cursor.value as PersistedChange;
          // Only delete if synced
          if (change.synced) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(new Error(`Failed to cleanup old changes: ${request.error?.message}`));
    });
  }

  /**
   * Get count of unsynced changes
   */
  async getUnsyncedCount(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('synced');
      const request = index.count(IDBKeyRange.only(false));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to count unsynced: ${request.error?.message}`));
    });
  }

  /**
   * Clear all changes (for testing/reset)
   */
  async clearAll(): Promise<void> {
    if (!this.db) {
      throw new Error('OfflineQueue not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear changes: ${request.error?.message}`));
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance for convenience
let _instance: OfflineQueue | null = null;

/**
 * Get the singleton OfflineQueue instance
 */
export function getOfflineQueue(): OfflineQueue {
  if (!_instance) {
    _instance = new OfflineQueue();
  }
  return _instance;
}
