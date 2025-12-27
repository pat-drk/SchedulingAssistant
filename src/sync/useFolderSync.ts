/**
 * useFolderSync - Hook for folder-based database sync workflow
 * 
 * Manages the folder sync lifecycle:
 * 1. Open folder → scan for base & working files
 * 2. Merge if needed (multiple working files)
 * 3. Create/open working file for current user
 * 4. Save to working file
 * 5. Auto-checkpoint when solo user for 3+ days
 */

import { useState, useRef, useCallback } from 'react';
import type { Database, SqlJsStatic } from 'sql.js';
import {
  scanFolder,
  cleanupOldBackups,
  createWorkingFileFromBase,
  createEmptyBase,
  updateBase,
  archiveWorkingFile,
  saveToWorkingFile,
  readDatabaseFile,
  shouldCheckpoint,
  generateUUID,
  createMergeLock,
  removeMergeLock,
  checkMergeLock,
  type FolderScanResult,
  type WorkingFileInfo,
  type MergeLockInfo,
} from './FolderSyncService';
import {
  performThreeWayMerge,
  performTwoWayMerge,
  performNWayMerge,
  applyConflictResolutions,
  copyNonSyncedTables,
  type MergeResult,
  type MergeConflict,
  type ConflictResolution,
  type ConflictResolutionEntry,
} from './ThreeWayMerge';

export interface FolderSyncState {
  /** Whether folder sync is active */
  isActive: boolean;
  /** Current user's email */
  userEmail: string | null;
  /** Folder handle for file operations */
  folderHandle: FileSystemDirectoryHandle | null;
  /** Current user's working file handle */
  workingFileHandle: FileSystemFileHandle | null;
  /** Base file handle */
  baseFileHandle: FileSystemFileHandle | null;
  /** Last scan result */
  lastScanResult: FolderScanResult | null;
  /** Whether a merge is pending */
  pendingMerge: {
    conflicts: MergeConflict[];
    workingFiles: WorkingFileInfo[];
    mergeResult: MergeResult;
    targetDb: Database;
  } | null;
  /** Loading/processing state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

export interface FolderSyncActions {
  /** Open a folder and initialize sync */
  openFolder: (
    SQL: SqlJsStatic,
    applyMigrations: (db: Database) => void
  ) => Promise<{ success: boolean; db: Database | null; needsEmail: boolean; staleMergeLock?: MergeLockInfo }>;
  
  /** Set user email after folder is opened */
  setUserEmail: (
    email: string,
    SQL: SqlJsStatic,
    applyMigrations: (db: Database) => void
  ) => Promise<{ success: boolean; db: Database | null }>;
  
  /** Save current database to working file */
  saveToWorking: (db: Database) => Promise<{ success: boolean; error?: string }>;
  
  /** Resolve merge conflicts and complete merge */
  resolveMergeConflicts: (
    resolutions: ConflictResolutionEntry[],
    applyMigrations: (db: Database) => void
  ) => Promise<{ success: boolean; db: Database | null }>;
  
  /** Perform checkpoint (merge working into base) */
  checkpoint: (db: Database) => Promise<{ success: boolean; error?: string }>;
  
  /** Reset/close folder sync */
  reset: () => void;
  
  /** Clear a stale merge lock after user acknowledgment */
  clearStaleLock: () => Promise<void>;
}

export function useFolderSync(): [FolderSyncState, FolderSyncActions] {
  const [state, setState] = useState<FolderSyncState>({
    isActive: false,
    userEmail: null,
    folderHandle: null,
    workingFileHandle: null,
    baseFileHandle: null,
    lastScanResult: null,
    pendingMerge: null,
    isLoading: false,
    error: null,
  });

  // Use ref to access latest SQL instance
  const sqlRef = useRef<SqlJsStatic | null>(null);

  const openFolder = useCallback(async (
    SQL: SqlJsStatic,
    applyMigrations: (db: Database) => void
  ): Promise<{ success: boolean; db: Database | null; needsEmail: boolean; staleMergeLock?: MergeLockInfo }> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      sqlRef.current = SQL;

      // Request folder access
      const folderHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      // Check for stale merge lock (indicates previous merge may have crashed)
      const staleLock = await checkMergeLock(folderHandle);
      if (staleLock) {
        // Return early with the stale lock info - let the caller decide how to handle
        setState(prev => ({ ...prev, folderHandle, isLoading: false }));
        return { success: true, db: null, needsEmail: true, staleMergeLock: staleLock };
      }

      // Cleanup old backups
      await cleanupOldBackups(folderHandle, 3);

      // Scan for files
      const scanResult = await scanFolder(folderHandle, '');

      setState(prev => ({
        ...prev,
        folderHandle,
        lastScanResult: scanResult,
        baseFileHandle: scanResult.baseFile,
      }));

      // If no base file and no working files, this is a new folder
      if (!scanResult.baseFile && scanResult.workingFiles.length === 0) {
        // We need email first to know where to save
        setState(prev => ({ ...prev, isLoading: false }));
        return { success: true, db: null, needsEmail: true };
      }

      // If base exists but we need to know which file is the user's
      // We need email to proceed
      setState(prev => ({ ...prev, isLoading: false }));
      return { success: true, db: null, needsEmail: true };

    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to open folder';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      return { success: false, db: null, needsEmail: false };
    }
  }, []);

  const setUserEmail = useCallback(async (
    email: string,
    SQL: SqlJsStatic,
    applyMigrations: (db: Database) => void
  ): Promise<{ success: boolean; db: Database | null }> => {
    const { folderHandle, lastScanResult } = state;
    if (!folderHandle) {
      return { success: false, db: null };
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, userEmail: email, error: null }));
      sqlRef.current = SQL;

      // Re-scan with email to identify user's file
      const scanResult = await scanFolder(folderHandle, email);
      setState(prev => ({ ...prev, lastScanResult: scanResult }));

      let db: Database;
      let workingHandle: FileSystemFileHandle;

      // Case 1: No base file - create new database
      if (!scanResult.baseFile) {
        db = new SQL.Database();
        applyMigrations(db);
        
        // Set sync_uuid for this database instance
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_uuid', ?)`, [generateUUID()]);
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_checkpoint', ?)`, [new Date().toISOString()]);
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('user_email', ?)`, [email]);

        // Save as base
        const baseData = db.export();
        const baseHandle = await createEmptyBase(folderHandle, baseData);
        
        // Create working file
        workingHandle = await createWorkingFileFromBase(folderHandle, baseHandle, email);
        
        setState(prev => ({
          ...prev,
          isActive: true,
          baseFileHandle: baseHandle,
          workingFileHandle: workingHandle,
          isLoading: false,
        }));

        return { success: true, db };
      }

      // Case 2: Base exists - check for merge
      if (scanResult.needsMerge) {
        // We need to merge multiple working files
        const result = await performMerge(
          SQL,
          applyMigrations,
          folderHandle,
          scanResult.baseFile,
          scanResult.workingFiles,
          email
        );

        if (result.conflicts.length > 0) {
          // Store pending merge for conflict resolution
          setState(prev => ({
            ...prev,
            pendingMerge: {
              conflicts: result.conflicts,
              workingFiles: scanResult.workingFiles,
              mergeResult: result.mergeResult,
              targetDb: result.targetDb,
            },
            isLoading: false,
          }));
          return { success: true, db: null };
        }

        // No conflicts - auto-merged successfully
        db = result.targetDb;
        
        // Update base with merged data
        await updateBase(scanResult.baseFile, db.export());
        
        // Archive old working files
        for (const wf of scanResult.workingFiles) {
          await archiveWorkingFile(folderHandle, wf);
        }

        // Remove merge lock - merge completed successfully
        await removeMergeLock(folderHandle);

        // Create new working file for current user
        workingHandle = await createWorkingFileFromBase(folderHandle, scanResult.baseFile, email);

        setState(prev => ({
          ...prev,
          isActive: true,
          workingFileHandle: workingHandle,
          isLoading: false,
        }));

        return { success: true, db };
      }

      // Case 3: No merge needed - open user's working file or create one
      if (scanResult.myWorkingFile) {
        // User has existing working file
        const data = await readDatabaseFile(scanResult.myWorkingFile);
        db = new SQL.Database(new Uint8Array(data));
        applyMigrations(db);
        workingHandle = scanResult.myWorkingFile;
      } else {
        // Create working file from base
        workingHandle = await createWorkingFileFromBase(folderHandle, scanResult.baseFile, email);
        const data = await readDatabaseFile(workingHandle);
        db = new SQL.Database(new Uint8Array(data));
        applyMigrations(db);
      }

      // Store user email in db
      db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('user_email', ?)`, [email]);

      // Check if checkpoint is needed (solo user for 3+ days)
      const lastCheckpoint = getMetaValue(db, 'last_checkpoint');
      if (shouldCheckpoint(lastCheckpoint) && scanResult.workingFiles.length <= 1) {
        // Solo user - checkpoint working file to base
        await updateBase(scanResult.baseFile, db.export());
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_checkpoint', ?)`, [new Date().toISOString()]);
        console.log('[FolderSync] Auto-checkpointed (solo user for 3+ days)');
      }

      setState(prev => ({
        ...prev,
        isActive: true,
        workingFileHandle: workingHandle,
        isLoading: false,
      }));

      return { success: true, db };

    } catch (e: any) {
      const errorMsg = e?.message || 'Failed to initialize with email';
      setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
      return { success: false, db: null };
    }
  }, [state.folderHandle, state.lastScanResult]);

  const saveToWorking = useCallback(async (
    db: Database
  ): Promise<{ success: boolean; error?: string }> => {
    const { workingFileHandle, userEmail } = state;
    
    if (!workingFileHandle) {
      return { success: false, error: 'No working file handle' };
    }

    try {
      // Update modified_by in meta before save
      if (userEmail) {
        db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('user_email', ?)`, [userEmail]);
      }

      const data = db.export();
      await saveToWorkingFile(workingFileHandle, data);
      
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Save failed' };
    }
  }, [state.workingFileHandle, state.userEmail]);

  const resolveMergeConflicts = useCallback(async (
    resolutions: ConflictResolutionEntry[],
    applyMigrations: (db: Database) => void
  ): Promise<{ success: boolean; db: Database | null }> => {
    const { pendingMerge, folderHandle, baseFileHandle, userEmail } = state;
    
    if (!pendingMerge || !folderHandle || !baseFileHandle) {
      return { success: false, db: null };
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Apply resolutions to the target database
      applyConflictResolutions(
        pendingMerge.targetDb,
        pendingMerge.conflicts,
        resolutions
      );

      // Update base with resolved data
      await updateBase(baseFileHandle, pendingMerge.targetDb.export());

      // Archive old working files
      for (const wf of pendingMerge.workingFiles) {
        await archiveWorkingFile(folderHandle, wf);
      }

      // Remove merge lock - conflicts resolved successfully
      await removeMergeLock(folderHandle);

      // Create new working file for current user
      const workingHandle = await createWorkingFileFromBase(
        folderHandle,
        baseFileHandle,
        userEmail || 'unknown'
      );

      setState(prev => ({
        ...prev,
        isActive: true,
        workingFileHandle: workingHandle,
        pendingMerge: null,
        isLoading: false,
      }));

      return { success: true, db: pendingMerge.targetDb };

    } catch (e: any) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: e?.message || 'Failed to resolve conflicts' 
      }));
      return { success: false, db: null };
    }
  }, [state.pendingMerge, state.folderHandle, state.baseFileHandle, state.userEmail]);

  const checkpoint = useCallback(async (
    db: Database
  ): Promise<{ success: boolean; error?: string }> => {
    const { baseFileHandle } = state;
    
    if (!baseFileHandle) {
      return { success: false, error: 'No base file handle' };
    }

    try {
      // Update last_checkpoint timestamp
      db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_checkpoint', ?)`, [new Date().toISOString()]);
      
      // Save to base
      await updateBase(baseFileHandle, db.export());
      
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Checkpoint failed' };
    }
  }, [state.baseFileHandle]);

  const reset = useCallback(() => {
    setState({
      isActive: false,
      userEmail: null,
      folderHandle: null,
      workingFileHandle: null,
      baseFileHandle: null,
      lastScanResult: null,
      pendingMerge: null,
      isLoading: false,
      error: null,
    });
  }, []);

  const clearStaleLock = useCallback(async () => {
    const { folderHandle } = state;
    if (folderHandle) {
      await removeMergeLock(folderHandle);
    }
  }, [state.folderHandle]);

  return [state, { openFolder, setUserEmail, saveToWorking, resolveMergeConflicts, checkpoint, reset, clearStaleLock }];
}

/**
 * Helper to get a meta value from the database
 */
function getMetaValue(db: Database, key: string): string | null {
  try {
    const stmt = db.prepare('SELECT value FROM meta WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row.value as string;
    }
    stmt.free();
    return null;
  } catch {
    return null;
  }
}

/**
 * Performs a merge of multiple working files using n-way merge
 * 
 * All working files are compared against base simultaneously to detect
 * conflicts when 2+ users modified the same row.
 */
async function performMerge(
  SQL: SqlJsStatic,
  applyMigrations: (db: Database) => void,
  folderHandle: FileSystemDirectoryHandle,
  baseHandle: FileSystemFileHandle,
  workingFiles: WorkingFileInfo[],
  currentUserEmail: string
): Promise<{
  targetDb: Database;
  mergeResult: MergeResult;
  conflicts: MergeConflict[];
}> {
  // Create merge lock to enable crash recovery
  await createMergeLock(
    folderHandle,
    currentUserEmail,
    workingFiles.map(wf => wf.fileName)
  );

  // Load base database
  const baseData = await readDatabaseFile(baseHandle);
  const baseDb = new SQL.Database(new Uint8Array(baseData));
  applyMigrations(baseDb);

  // Create target database (copy of base to accumulate changes)
  const targetDb = new SQL.Database(new Uint8Array(baseData));
  applyMigrations(targetDb);

  let result: MergeResult;

  if (workingFiles.length === 1) {
    // Simple 2-way merge
    const wf = workingFiles[0];
    const wfData = await readDatabaseFile(wf.handle);
    const wfDb = new SQL.Database(new Uint8Array(wfData));
    applyMigrations(wfDb);

    result = performTwoWayMerge(baseDb, wfDb, targetDb);
    wfDb.close();

  } else if (workingFiles.length === 2) {
    // 3-way merge (optimized path for exactly 2 working files)
    const [wfA, wfB] = workingFiles;
    const wfAData = await readDatabaseFile(wfA.handle);
    const wfBData = await readDatabaseFile(wfB.handle);
    const dbA = new SQL.Database(new Uint8Array(wfAData));
    const dbB = new SQL.Database(new Uint8Array(wfBData));
    applyMigrations(dbA);
    applyMigrations(dbB);

    result = performThreeWayMerge(baseDb, dbA, dbB, targetDb);
    dbA.close();
    dbB.close();

  } else {
    // N-way merge: compare all working files against base simultaneously
    // This correctly detects conflicts between any pair of users
    const workingDbs: { db: Database; email: string }[] = [];
    
    for (const wf of workingFiles) {
      const wfData = await readDatabaseFile(wf.handle);
      const wfDb = new SQL.Database(new Uint8Array(wfData));
      applyMigrations(wfDb);
      workingDbs.push({ db: wfDb, email: wf.email });
    }

    result = performNWayMerge(baseDb, workingDbs, targetDb);

    // Close all working databases
    for (const { db } of workingDbs) {
      db.close();
    }
  }

  // Copy non-synced tables (config tables like segment, role, grp, etc.)
  // These don't have sync_id columns and are taken from base
  copyNonSyncedTables(baseDb, targetDb);

  baseDb.close();

  return {
    targetDb,
    mergeResult: result,
    conflicts: result.conflicts,
  };
}
