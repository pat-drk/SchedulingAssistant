import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  Text,
  Spinner,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { History20Regular, ArrowUndo20Regular, Merge20Regular } from "@fluentui/react-icons";
import ConfirmDialog from "./ConfirmDialog";

interface FileVersionInfo {
  filename: string;
  savedAt: string;
  savedBy: string;
  sessionStartedAt: string;
  sizeBytes: number;
}

interface VersionHistoryProps {
  open: boolean;
  onClose: () => void;
  dirHandle: FileSystemDirectoryHandle | null;
  currentFilename: string;
  onRestore: (filename: string) => void;
  onMerge: (filename: string) => void;
  SQL: any;
}

const useStyles = makeStyles({
  content: {
    maxHeight: "400px",
    overflowY: "auto",
  },
  emptyState: {
    textAlign: "center",
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
  timestamp: {
    fontFamily: "monospace",
    fontSize: tokens.fontSizeBase200,
  },
  size: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  currentBadge: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    marginLeft: tokens.spacingHorizontalS,
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
  },
});

function formatTimestamp(isoString: string): string {
  if (!isoString) return "Unknown";
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VersionHistory({ 
  open, 
  onClose, 
  dirHandle, 
  currentFilename,
  onRestore, 
  onMerge,
  SQL 
}: VersionHistoryProps) {
  const styles = useStyles();
  const [files, setFiles] = useState<FileVersionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRestore, setConfirmRestore] = useState<FileVersionInfo | null>(null);

  useEffect(() => {
    if (open && dirHandle && SQL) {
      loadFiles();
    }
  }, [open, dirHandle, SQL]);

  async function loadFiles() {
    if (!dirHandle || !SQL) return;
    setLoading(true);
    
    try {
      const fileList: FileVersionInfo[] = [];
      
      for await (const entry of (dirHandle as any).values()) {
        if (entry.kind === 'file' && entry.name.startsWith('schedule-') && entry.name.endsWith('.db')) {
          try {
            const file = await entry.getFile();
            const buf = await file.arrayBuffer();
            const tempDb = new SQL.Database(new Uint8Array(buf));
            
            // Read metadata from the database
            const getVal = (key: string): string | null => {
              try {
                const rows = tempDb.exec(`SELECT value FROM meta WHERE key='${key}'`);
                return (rows[0]?.values[0]?.[0] as string) || null;
              } catch { return null; }
            };
            
            fileList.push({
              filename: entry.name,
              savedAt: getVal('saved_at') || '',
              savedBy: getVal('saved_by') || 'Unknown',
              sessionStartedAt: getVal('session_started_at') || '',
              sizeBytes: file.size,
            });
            
            tempDb.close();
          } catch (e) {
            console.warn(`[VersionHistory] Failed to read ${entry.name}:`, e);
          }
        }
      }
      
      // Sort newest first
      fileList.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      setFiles(fileList);
    } catch (e) {
      console.error("[VersionHistory] Failed to load files:", e);
      setFiles([]);
    }
    
    setLoading(false);
  }

  function handleRestoreClick(file: FileVersionInfo) {
    setConfirmRestore(file);
  }

  function handleConfirmRestore() {
    if (confirmRestore) {
      onRestore(confirmRestore.filename);
      setConfirmRestore(null);
      onClose();
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
        <DialogSurface style={{ maxWidth: "700px" }}>
          <DialogBody>
            <DialogTitle>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                <History20Regular />
                Version History
              </div>
            </DialogTitle>
            <DialogContent className={styles.content}>
              {loading ? (
                <div className={styles.emptyState}>
                  <Spinner size="medium" />
                </div>
              ) : files.length === 0 ? (
                <div className={styles.emptyState}>
                  <Text>No saved versions found.</Text>
                  <br />
                  <Text size={200}>Each save creates a new timestamped file in the folder.</Text>
                </div>
              ) : (
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Saved</TableHeaderCell>
                      <TableHeaderCell>User</TableHeaderCell>
                      <TableHeaderCell>Size</TableHeaderCell>
                      <TableHeaderCell></TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow key={file.filename}>
                        <TableCell>
                          <Text className={styles.timestamp}>{formatTimestamp(file.savedAt)}</Text>
                          {file.filename === currentFilename && (
                            <span className={styles.currentBadge}>Current</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Text size={200}>{file.savedBy}</Text>
                        </TableCell>
                        <TableCell>
                          <Text className={styles.size}>{formatSize(file.sizeBytes)}</Text>
                        </TableCell>
                        <TableCell>
                          {file.filename !== currentFilename && (
                            <div className={styles.actions}>
                              <Button
                                size="small"
                                appearance="subtle"
                                icon={<ArrowUndo20Regular />}
                                onClick={() => handleRestoreClick(file)}
                              >
                                Restore
                              </Button>
                              <Button
                                size="small"
                                appearance="subtle"
                                icon={<Merge20Regular />}
                                onClick={() => onMerge(file.filename)}
                              >
                                Merge
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={onClose}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {confirmRestore && (
        <ConfirmDialog
          open={true}
          title="Restore Version?"
          message={`This will load the version saved by ${confirmRestore.savedBy} at ${formatTimestamp(confirmRestore.savedAt)}.\n\nYour current unsaved changes will be lost.\n\nAre you sure?`}
          confirmText="Restore"
          cancelText="Cancel"
          onConfirm={handleConfirmRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </>
  );
}
