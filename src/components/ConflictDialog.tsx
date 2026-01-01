import React from "react";
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
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Warning20Regular, Merge20Regular, Save20Regular } from "@fluentui/react-icons";

interface FileVersionInfo {
  filename: string;
  savedAt: string;
  savedBy: string;
  sessionStartedAt: string;
  sizeBytes: number;
}

interface ConflictDetail {
  table: string;
  description: string;
  countA: number;
  countB: number;
  differences: number;
}

interface ConflictInfo {
  conflictingFiles: FileVersionInfo[];
  conflictDetails: ConflictDetail[];
}

interface ConflictDialogProps {
  open: boolean;
  onClose: () => void;
  conflicts: ConflictInfo;
  onSaveAnyway: () => void;
  onMerge: (filename: string) => void;
}

const useStyles = makeStyles({
  warningBanner: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  conflictList: {
    marginBottom: tokens.spacingVerticalM,
  },
  fileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tableLabel: {
    textTransform: "capitalize",
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

export default function ConflictDialog({
  open,
  onClose,
  conflicts,
  onSaveAnyway,
  onMerge,
}: ConflictDialogProps) {
  const styles = useStyles();

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: "600px" }}>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
              <Warning20Regular />
              Conflicting Changes Detected
            </div>
          </DialogTitle>
          <DialogContent>
            <div className={styles.warningBanner}>
              <Warning20Regular />
              <Text>
                While you were editing, another user saved changes. You may want to merge before saving.
              </Text>
            </div>

            <Text weight="semibold" block style={{ marginBottom: tokens.spacingVerticalS }}>
              Files saved since you opened:
            </Text>
            <div className={styles.conflictList}>
              {conflicts.conflictingFiles.map((file) => (
                <div key={file.filename} className={styles.fileRow}>
                  <div>
                    <Text weight="semibold">{file.savedBy}</Text>
                    <Text size={200} style={{ marginLeft: tokens.spacingHorizontalS }}>
                      saved at {formatTimestamp(file.savedAt)}
                    </Text>
                  </div>
                  <Button
                    size="small"
                    icon={<Merge20Regular />}
                    onClick={() => onMerge(file.filename)}
                  >
                    Merge
                  </Button>
                </div>
              ))}
            </div>

            {conflicts.conflictDetails.length > 0 && (
              <>
                <Text weight="semibold" block style={{ marginBottom: tokens.spacingVerticalS }}>
                  Differences detected:
                </Text>
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Table</TableHeaderCell>
                      <TableHeaderCell>Your Version</TableHeaderCell>
                      <TableHeaderCell>Their Version</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conflicts.conflictDetails.map((detail) => (
                      <TableRow key={detail.table}>
                        <TableCell>
                          <Text className={styles.tableLabel}>
                            {detail.table.replace(/_/g, ' ')}
                          </Text>
                        </TableCell>
                        <TableCell>{detail.countA} rows</TableCell>
                        <TableCell>{detail.countB} rows</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            {conflicts.conflictDetails.length === 0 && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                No significant differences detected in assignment tables. The changes may be in configuration or other areas.
              </Text>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button appearance="secondary" icon={<Save20Regular />} onClick={onSaveAnyway}>
              Save Anyway (Create Branch)
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
