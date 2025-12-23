/**
 * ConflictResolutionDialog - UI for resolving merge conflicts
 * Shows user-friendly options to resolve conflicts when they occur
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Conflict, ConflictResolution } from '../sync/types';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  conflictItem: {
    padding: tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  conflictHeader: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalS,
    color: tokens.colorPaletteRedForeground1,
  },
  conflictDetails: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalM,
  },
  valueComparison: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    marginTop: tokens.spacingVerticalS,
  },
  valueBox: {
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase300,
  },
  yourValue: {
    borderLeft: `3px solid ${tokens.colorPaletteBlueForeground1}`,
  },
  theirValue: {
    borderLeft: `3px solid ${tokens.colorPaletteGreenForeground1}`,
  },
  separator: {
    color: tokens.colorNeutralForeground3,
  },
  summary: {
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    marginBottom: tokens.spacingVerticalM,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
});

interface ConflictResolutionDialogProps {
  conflicts: Conflict[];
  onResolve: (resolutions: Map<Conflict, ConflictResolution>) => void;
  onCancel: () => void;
  autoMergedCount?: number;
}

export default function ConflictResolutionDialog({
  conflicts,
  onResolve,
  onCancel,
  autoMergedCount = 0,
}: ConflictResolutionDialogProps) {
  const styles = useStyles();
  const [resolutions, setResolutions] = useState<Map<Conflict, ConflictResolution>>(new Map());

  const handleResolve = (conflict: Conflict, action: ConflictResolution['action']) => {
    const newResolutions = new Map(resolutions);
    newResolutions.set(conflict, { action });
    setResolutions(newResolutions);
  };

  const handleApplyAll = () => {
    // Auto-resolve any unresolved conflicts by keeping theirs
    const finalResolutions = new Map(resolutions);
    conflicts.forEach(conflict => {
      if (!finalResolutions.has(conflict)) {
        finalResolutions.set(conflict, { action: 'KEEP_THEIRS' });
      }
    });
    onResolve(finalResolutions);
  };

  const allResolved = conflicts.every(c => resolutions.has(c));

  const getConflictDescription = (conflict: Conflict): string => {
    switch (conflict.reason) {
      case 'SAME_FIELD_DIFFERENT_VALUES':
        return 'Another user changed the same field to a different value';
      case 'DELETE_VS_UPDATE':
        return 'Another user deleted this record while you were editing it';
      case 'DUPLICATE_INSERT':
        return 'This record already exists in the database';
      case 'VERSION_MISMATCH':
        return 'The database has been updated since you last loaded it';
      default:
        return 'A conflict occurred with changes from another user';
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Dialog open>
      <DialogSurface style={{ maxWidth: '800px' }}>
        <DialogBody>
          <DialogTitle>Resolve Conflicts</DialogTitle>
          <DialogContent className={styles.content}>
            {autoMergedCount > 0 && (
              <div className={styles.summary}>
                ✓ {autoMergedCount} change{autoMergedCount !== 1 ? 's' : ''} merged automatically
              </div>
            )}

            <div className={styles.summary}>
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} need{conflicts.length === 1 ? 's' : ''} your attention
            </div>

            {conflicts.map((conflict, index) => (
              <div key={index} className={styles.conflictItem}>
                <div className={styles.conflictHeader}>
                  Conflict {index + 1}: {conflict.operation.table}
                </div>
                <div className={styles.conflictDetails}>
                  {getConflictDescription(conflict)}
                </div>

                {conflict.reason === 'SAME_FIELD_DIFFERENT_VALUES' && conflict.existingOperation && (
                  <div className={styles.valueComparison}>
                    <div className={`${styles.valueBox} ${styles.yourValue}`}>
                      <div style={{ fontSize: tokens.fontSizeBase100, marginBottom: '4px' }}>
                        Your change:
                      </div>
                      <div>{formatValue(conflict.operation.newValue)}</div>
                    </div>
                    <div className={styles.separator}>vs</div>
                    <div className={`${styles.valueBox} ${styles.theirValue}`}>
                      <div style={{ fontSize: tokens.fontSizeBase100, marginBottom: '4px' }}>
                        Their change:
                      </div>
                      <div>{formatValue(conflict.existingOperation.newValue)}</div>
                    </div>
                  </div>
                )}

                <div className={styles.actions}>
                  <Button
                    appearance={resolutions.get(conflict)?.action === 'KEEP_YOURS' ? 'primary' : 'secondary'}
                    onClick={() => handleResolve(conflict, 'KEEP_YOURS')}
                  >
                    Keep Yours
                  </Button>
                  <Button
                    appearance={resolutions.get(conflict)?.action === 'KEEP_THEIRS' ? 'primary' : 'secondary'}
                    onClick={() => handleResolve(conflict, 'KEEP_THEIRS')}
                  >
                    Keep Theirs
                  </Button>
                  <Button
                    appearance={resolutions.get(conflict)?.action === 'SKIP' ? 'primary' : 'secondary'}
                    onClick={() => handleResolve(conflict, 'SKIP')}
                  >
                    Skip
                  </Button>
                </div>
              </div>
            ))}
          </DialogContent>
          <DialogActions>
            <Button onClick={onCancel}>Cancel</Button>
            <Button 
              appearance="primary" 
              onClick={handleApplyAll}
              disabled={!allResolved}
            >
              Apply Resolutions
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
