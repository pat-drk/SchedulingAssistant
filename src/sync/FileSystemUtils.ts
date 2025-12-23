/**
 * FileSystemUtils - Utilities for managing sync folder structure
 * Handles creation and access of the changes folder on network drives
 */

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
   * Get a directory handle for the changes folder
   * Creates it if it doesn't exist
   */
  static async getChangesFolderHandle(
    dbFileHandle: FileSystemFileHandle
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      // Get the parent directory of the database file
      // Note: This requires the File System Access API's getParent() method
      // which may not be available in all browsers
      
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
    try {
      const changesFolderHandle = await parentDirHandle.getDirectoryHandle(
        this.getChangesFolderName(),
        { create: true }
      );
      return changesFolderHandle;
    } catch (error) {
      throw new Error(`Failed to create changes folder: ${error}`);
    }
  }

  /**
   * List all change files in the changes folder
   */
  static async listChangeFiles(
    changesFolderHandle: FileSystemDirectoryHandle
  ): Promise<string[]> {
    const files: string[] = [];
    try {
      for await (const entry of changesFolderHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json') && entry.name !== this.getSyncStateFileName()) {
          files.push(entry.name);
        }
      }
    } catch (error) {
      console.error('Error listing change files:', error);
    }
    return files.sort();
  }

  /**
   * Read a change file
   */
  static async readChangeFile(
    changesFolderHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<any> {
    try {
      const fileHandle = await changesFolderHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (error) {
      console.error(`Error reading change file ${fileName}:`, error);
      throw error;
    }
  }

  /**
   * Write a change file
   */
  static async writeChangeFile(
    changesFolderHandle: FileSystemDirectoryHandle,
    fileName: string,
    data: any
  ): Promise<void> {
    try {
      const fileHandle = await changesFolderHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (error) {
      console.error(`Error writing change file ${fileName}:`, error);
      throw error;
    }
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
}
