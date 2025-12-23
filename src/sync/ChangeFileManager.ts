/**
 * ChangeFileManager - Manages reading/writing change files
 * Handles creating, reading, and managing change files in the changes folder
 */

import { ChangeSet, ChangeOperation, SyncState } from './types';
import { FileSystemUtils } from './FileSystemUtils';

export class ChangeFileManager {
  private changesFolderHandle: FileSystemDirectoryHandle | null = null;
  private currentUser: string = '';

  /**
   * Initialize the change file manager with a directory handle
   */
  async initialize(
    changesFolderHandle: FileSystemDirectoryHandle,
    userEmail: string
  ): Promise<void> {
    this.changesFolderHandle = changesFolderHandle;
    this.currentUser = userEmail;
  }

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean {
    return this.changesFolderHandle !== null && this.currentUser !== '';
  }

  /**
   * Create and write a new change file
   */
  async writeChangeSet(operations: ChangeOperation[], baseVersion: number): Promise<string> {
    if (!this.changesFolderHandle) {
      throw new Error('ChangeFileManager not initialized');
    }

    const changeSet: ChangeSet = {
      id: this.generateChangeSetId(),
      user: this.currentUser,
      timestamp: new Date().toISOString(),
      baseVersion,
      operations,
    };

    const fileName = FileSystemUtils.createChangeFileName(this.currentUser);
    await FileSystemUtils.writeChangeFile(this.changesFolderHandle, fileName, changeSet);
    
    return changeSet.id;
  }

  /**
   * Read all pending change files (not yet applied)
   */
  async readPendingChanges(appliedChangeIds: string[]): Promise<ChangeSet[]> {
    if (!this.changesFolderHandle) {
      throw new Error('ChangeFileManager not initialized');
    }

    const fileNames = await FileSystemUtils.listChangeFiles(this.changesFolderHandle);
    const changeSets: ChangeSet[] = [];
    const appliedSet = new Set(appliedChangeIds);

    for (const fileName of fileNames) {
      try {
        const changeSet = await FileSystemUtils.readChangeFile(
          this.changesFolderHandle,
          fileName
        ) as ChangeSet;

        // Skip if already applied
        if (!appliedSet.has(changeSet.id)) {
          changeSets.push(changeSet);
        }
      } catch (error) {
        console.error(`Failed to read change file ${fileName}:`, error);
      }
    }

    // Sort by timestamp
    changeSets.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return changeSets;
  }

  /**
   * Read all change files from other users
   */
  async readOtherUsersChanges(appliedChangeIds: string[]): Promise<ChangeSet[]> {
    const allChanges = await this.readPendingChanges(appliedChangeIds);
    return allChanges.filter(cs => cs.user !== this.currentUser);
  }

  /**
   * Get list of users who have pending changes
   */
  async getActiveUsers(appliedChangeIds: string[]): Promise<string[]> {
    const changes = await this.readPendingChanges(appliedChangeIds);
    const users = new Set(changes.map(cs => cs.user));
    users.delete(this.currentUser); // Remove current user
    return Array.from(users);
  }

  /**
   * Mark change files as applied (archive or delete them)
   */
  async markChangesApplied(changeIds: string[]): Promise<void> {
    if (!this.changesFolderHandle) {
      throw new Error('ChangeFileManager not initialized');
    }

    // For now, we'll just track applied changes in sync-state.json
    // In a production system, you might want to archive or delete the files
    // For safety, we'll keep the files but track them as applied
  }

  /**
   * Clean up old change files that have been applied
   */
  async cleanupAppliedChanges(changeIds: string[]): Promise<void> {
    if (!this.changesFolderHandle) {
      throw new Error('ChangeFileManager not initialized');
    }

    const fileNames = await FileSystemUtils.listChangeFiles(this.changesFolderHandle);
    const changeIdSet = new Set(changeIds);

    for (const fileName of fileNames) {
      try {
        const changeSet = await FileSystemUtils.readChangeFile(
          this.changesFolderHandle,
          fileName
        ) as ChangeSet;

        // Delete if it's been applied and is older than 7 days
        if (changeIdSet.has(changeSet.id)) {
          const changeDate = new Date(changeSet.timestamp);
          const daysSince = (Date.now() - changeDate.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysSince > 7) {
            await FileSystemUtils.deleteChangeFile(this.changesFolderHandle, fileName);
          }
        }
      } catch (error) {
        console.error(`Failed to process change file ${fileName} for cleanup:`, error);
      }
    }
  }

  /**
   * Read sync state
   */
  async readSyncState(): Promise<SyncState> {
    if (!this.changesFolderHandle) {
      throw new Error('ChangeFileManager not initialized');
    }

    return await FileSystemUtils.readSyncState(this.changesFolderHandle);
  }

  /**
   * Write sync state
   */
  async writeSyncState(state: SyncState): Promise<void> {
    if (!this.changesFolderHandle) {
      throw new Error('ChangeFileManager not initialized');
    }

    await FileSystemUtils.writeSyncState(this.changesFolderHandle, state);
  }

  /**
   * Generate a unique ID for a change set
   */
  private generateChangeSetId(): string {
    return `${this.currentUser}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current user email
   */
  getCurrentUser(): string {
    return this.currentUser;
  }
}
