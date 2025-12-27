/**
 * DatabaseFallback - Manual export/import for non-Chromium browsers
 * 
 * The File System Access API is only available in Chromium-based browsers.
 * For Firefox, Safari, and other browsers, we provide a fallback using:
 * - Download via <a download> for export
 * - File input via <input type="file"> for import
 * 
 * This component provides the UI for these fallback operations.
 */

import React, { useRef, useCallback } from 'react';
import { 
  makeStyles, 
  tokens, 
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Card,
  CardHeader,
  Text,
} from '@fluentui/react-components';
import { 
  ArrowDownload24Regular, 
  ArrowUpload24Regular,
  Warning24Regular,
  Database24Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons';
import { FileSystemUtils } from '../sync/FileSystemUtils';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  buttonRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  hiddenInput: {
    display: 'none',
  },
  warningText: {
    flex: 1,
    minWidth: '200px',
  },
  dismissButton: {
    marginLeft: 'auto',
  },
});

interface DatabaseFallbackProps {
  /** Callback when a database file is imported (receives ArrayBuffer) */
  onImport: (arrayBuffer: ArrayBuffer) => void;
  /** Function to get the current database data for export (returns Uint8Array or null) */
  getExportData: () => Uint8Array | null;
  /** Whether a database is currently loaded */
  hasDatabase: boolean;
  /** Callback when user dismisses the warning banner */
  onDismiss?: () => void;
}

export default function DatabaseFallback({
  onImport,
  getExportData,
  hasDatabase,
  onDismiss,
}: DatabaseFallbackProps) {
  const styles = useStyles();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupported = FileSystemUtils.isFileSystemAccessSupported();

  /**
   * Export/download the current database
   */
  const handleExport = useCallback(() => {
    const data = getExportData();
    if (!data) return;

    try {
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `schedule-backup-${timestamp}.db`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export database:', error);
      alert('Failed to export database. Please try again.');
    }
  }, [getExportData]);

  /**
   * Trigger file input for import
   */
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle file selection for import
   */
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      onImport(buffer);
    } catch (error) {
      console.error('Failed to import database:', error);
      alert('Failed to import database. Please ensure the file is a valid SQLite database.');
    }

    // Reset the input so the same file can be selected again
    event.target.value = '';
  }, [onImport]);

  // If File System Access API is supported, don't show fallback
  if (isSupported) {
    return null;
  }

  return (
    <div className={styles.root}>
      <MessageBar intent="warning" icon={<Warning24Regular />}>
        <MessageBarBody>
          <MessageBarTitle>Limited Browser Support</MessageBarTitle>
          <div className={styles.content}>
            <span className={styles.warningText}>
              Your browser doesn't support automatic file sync. Use the buttons below to manually save and load your database.
              For the best experience, use <strong>Microsoft Edge</strong> or <strong>Google Chrome</strong>.
            </span>
            <div className={styles.buttonRow}>
              <Button
                appearance="secondary"
                size="small"
                icon={<ArrowUpload24Regular />}
                onClick={handleImportClick}
              >
                Import Database
              </Button>
              {hasDatabase && (
                <Button
                  appearance="primary"
                  size="small"
                  icon={<ArrowDownload24Regular />}
                  onClick={handleExport}
                >
                  Export Database
                </Button>
              )}
            </div>
            {onDismiss && (
              <Button
                appearance="subtle"
                size="small"
                icon={<Dismiss24Regular />}
                onClick={onDismiss}
                className={styles.dismissButton}
                title="Dismiss"
              />
            )}
          </div>
        </MessageBarBody>
      </MessageBar>

      <input
        ref={fileInputRef}
        type="file"
        accept=".db,.sqlite,.sqlite3"
        onChange={handleFileChange}
        className={styles.hiddenInput}
      />
    </div>
  );
}

/**
 * Hook to check if File System Access API is available
 */
export function useFileSystemAccessSupport(): boolean {
  return FileSystemUtils.isFileSystemAccessSupported();
}
