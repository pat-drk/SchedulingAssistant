/**
 * MergeConflictDialog - Displays N-way merge conflicts and allows user resolution
 * 
 * Shows conflicts between multiple working files and provides:
 * - Quick buttons to keep all from a specific user
 * - "Keep Original" to revert to base
 * - "Keep All Versions" for additive tables (timeoff, assignment)
 * - Advanced row-by-row resolution option
 */

import React, { useState, useMemo } from "react";
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
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Radio,
  RadioGroup,
  Badge,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Divider,
  Text,
} from "@fluentui/react-components";
import type { MergeConflict, ConflictResolution, ConflictResolutionEntry } from "../sync/ThreeWayMerge";

const useStyles = makeStyles({
  surface: {
    maxWidth: '900px',
    width: '90vw',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  summary: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  quickActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
    flexWrap: 'wrap',
  },
  conflictTable: {
    width: '100%',
  },
  cellValue: {
    fontSize: tokens.fontSizeBase200,
    fontFamily: 'monospace',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modifiedBy: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  conflictRow: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  warningText: {
    color: tokens.colorPaletteRedForeground1,
  },
  userList: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
});

export interface MergeConflictDialogProps {
  open: boolean;
  conflicts: MergeConflict[];
  onResolve: (resolutions: ConflictResolutionEntry[]) => void;
  onCancel: () => void;
}

// Helper to create resolution entry
function makeResolution(conflict: MergeConflict, resolution: ConflictResolution): ConflictResolutionEntry {
  return {
    conflictKey: conflict.conflictKey,
    table: conflict.table,
    syncId: conflict.syncId,
    resolution,
  };
}

export default function MergeConflictDialog({
  open,
  conflicts,
  onResolve,
  onCancel,
}: MergeConflictDialogProps) {
  const styles = useStyles();
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Resolution state: map from conflictKey to resolution
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});

  // Get unique users who have conflicts
  const allModifiers = useMemo(() => {
    const emails = new Set<string>();
    for (const conflict of conflicts) {
      for (const modifier of conflict.modifiers) {
        if (modifier.email) {
          emails.add(modifier.email);
        }
      }
    }
    return Array.from(emails);
  }, [conflicts]);

  // Group conflicts by table
  const conflictsByTable = useMemo(() => {
    const grouped: Record<string, MergeConflict[]> = {};
    for (const conflict of conflicts) {
      if (!grouped[conflict.table]) {
        grouped[conflict.table] = [];
      }
      grouped[conflict.table].push(conflict);
    }
    return grouped;
  }, [conflicts]);

  // Set all resolutions to base
  const handleKeepAllOriginal = () => {
    const allResolutions: ConflictResolutionEntry[] = conflicts.map(c => 
      makeResolution(c, { type: 'base' })
    );
    onResolve(allResolutions);
  };

  // Set all resolutions to a specific user
  const handleKeepAllFromUser = (email: string) => {
    const allResolutions: ConflictResolutionEntry[] = conflicts.map(c => {
      const modifierIndex = c.modifiers.findIndex(m => m.email === email);
      if (modifierIndex >= 0) {
        return makeResolution(c, { type: 'modifier', index: modifierIndex });
      }
      // User didn't modify this row - keep base
      return makeResolution(c, { type: 'base' });
    });
    onResolve(allResolutions);
  };

  // Handle advanced merge submit
  const handleAdvancedSubmit = () => {
    const allResolutions: ConflictResolutionEntry[] = conflicts.map(c => {
      const resolution = resolutions[c.conflictKey];
      return makeResolution(c, resolution || { type: 'base' });
    });
    onResolve(allResolutions);
  };

  // Set resolution for a specific conflict
  const setResolution = (conflictKey: string, resolution: ConflictResolution) => {
    setResolutions(prev => ({
      ...prev,
      [conflictKey]: resolution,
    }));
  };

  // Set all resolutions to a specific choice (for quick buttons in advanced mode)
  const setAllToBase = () => {
    const newResolutions: Record<string, ConflictResolution> = {};
    for (const conflict of conflicts) {
      newResolutions[conflict.conflictKey] = { type: 'base' };
    }
    setResolutions(newResolutions);
  };

  const setAllToUser = (email: string) => {
    const newResolutions: Record<string, ConflictResolution> = {};
    for (const conflict of conflicts) {
      const modifierIndex = conflict.modifiers.findIndex(m => m.email === email);
      if (modifierIndex >= 0) {
        newResolutions[conflict.conflictKey] = { type: 'modifier', index: modifierIndex };
      } else {
        newResolutions[conflict.conflictKey] = { type: 'base' };
      }
    }
    setResolutions(newResolutions);
  };

  // Check if all conflicts have a resolution in advanced mode
  const allResolved = conflicts.every(c => resolutions[c.conflictKey] !== undefined);

  // Format a value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Get the key differences between rows
  const getDifferences = (rows: (Record<string, unknown> | null)[]): string[] => {
    const nonNullRows = rows.filter(r => r !== null) as Record<string, unknown>[];
    if (nonNullRows.length < 2) return [];
    
    const diffs = new Set<string>();
    const allKeys = new Set(nonNullRows.flatMap(r => Object.keys(r)));
    
    for (const key of allKeys) {
      if (key === 'sync_id' || key === 'modified_at' || key === 'modified_by' || key === 'deleted_at') continue;
      const values = nonNullRows.map(r => formatValue(r[key]));
      if (new Set(values).size > 1) {
        diffs.add(key);
      }
    }
    return Array.from(diffs);
  };

  // Get radio value from resolution
  const getRadioValue = (resolution: ConflictResolution | undefined): string => {
    if (!resolution) return '';
    switch (resolution.type) {
      case 'base': return 'base';
      case 'modifier': return `modifier-${resolution.index}`;
      case 'delete': return 'delete';
      case 'all': return 'all';
      default: return '';
    }
  };

  // Parse radio value to resolution
  const parseRadioValue = (value: string): ConflictResolution => {
    if (value === 'base') return { type: 'base' };
    if (value === 'delete') return { type: 'delete' };
    if (value === 'all') return { type: 'all' };
    if (value.startsWith('modifier-')) {
      const index = parseInt(value.replace('modifier-', ''), 10);
      return { type: 'modifier', index };
    }
    return { type: 'base' };
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onCancel()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Merge Conflicts Detected</DialogTitle>
          <DialogContent className={styles.content}>
            <div className={styles.summary}>
              <Badge appearance="filled" color="warning">
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
              </Badge>
              <Text>
                Changes from multiple users affect the same records:
              </Text>
              <div className={styles.userList}>
                {allModifiers.map((email) => (
                  <Badge key={email} appearance="outline" color="informative">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>

            {!showAdvanced ? (
              <>
                <Text>Choose how to resolve all conflicts:</Text>
                <div className={styles.quickActions}>
                  <Button appearance="outline" onClick={handleKeepAllOriginal}>
                    Keep All Original
                  </Button>
                  {allModifiers.map(email => (
                    <Button 
                      key={email} 
                      appearance="primary" 
                      onClick={() => handleKeepAllFromUser(email)}
                    >
                      Keep All from {email}
                    </Button>
                  ))}
                </div>
                <Divider />
                <Button appearance="subtle" onClick={() => setShowAdvanced(true)}>
                  Advanced: Resolve individually...
                </Button>
              </>
            ) : (
              <>
                <Button appearance="subtle" onClick={() => setShowAdvanced(false)}>
                  ← Back to quick options
                </Button>
                <div className={styles.quickActions}>
                  <Text size={200}>Set all to:</Text>
                  <Button size="small" onClick={setAllToBase}>Original</Button>
                  {allModifiers.map(email => (
                    <Button key={email} size="small" onClick={() => setAllToUser(email)}>
                      {email}
                    </Button>
                  ))}
                </div>
                <Divider />
                <Accordion multiple collapsible>
                  {Object.entries(conflictsByTable).map(([table, tableConflicts]) => (
                    <AccordionItem key={table} value={table}>
                      <AccordionHeader>
                        {table} ({tableConflicts.length} conflict{tableConflicts.length !== 1 ? 's' : ''})
                      </AccordionHeader>
                      <AccordionPanel>
                        <Table className={styles.conflictTable} size="small">
                          <TableHeader>
                            <TableRow>
                              <TableHeaderCell>Record</TableHeaderCell>
                              <TableHeaderCell>Differences</TableHeaderCell>
                              <TableHeaderCell>Resolution</TableHeaderCell>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableConflicts.map(conflict => {
                              const diffs = getDifferences([
                                conflict.baseRow,
                                ...conflict.modifiers.map(m => m.row),
                              ]);
                              const currentResolution = resolutions[conflict.conflictKey];
                              const hasDeletedVersion = conflict.modifiers.some(m => m.row === null);
                              
                              return (
                                <TableRow key={conflict.conflictKey} className={styles.conflictRow}>
                                  <TableCell>
                                    <div>{conflict.rowDescription}</div>
                                    <div className={styles.modifiedBy}>
                                      {conflict.modifiers.map((m, i) => (
                                        <div key={i}>
                                          {m.email}: {m.row ? 'modified' : 'deleted'}
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className={styles.cellValue}>
                                      {diffs.length > 0 ? diffs.join(', ') : 'All fields'}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <RadioGroup
                                      className={styles.radioGroup}
                                      value={getRadioValue(currentResolution)}
                                      onChange={(_, data) => {
                                        setResolution(conflict.conflictKey, parseRadioValue(data.value));
                                      }}
                                    >
                                      <Radio value="base" label="Keep original" />
                                      {conflict.modifiers.map((m, i) => (
                                        <Radio 
                                          key={i} 
                                          value={`modifier-${i}`} 
                                          label={`Keep ${m.email}'s ${m.row ? 'version' : 'deletion'}`}
                                        />
                                      ))}
                                      {hasDeletedVersion && (
                                        <Radio value="delete" label="Accept deletion" />
                                      )}
                                      {conflict.allowMultiple && (
                                        <Radio value="all" label="Keep all versions" />
                                      )}
                                    </RadioGroup>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </AccordionPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              </>
            )}
          </DialogContent>
          <DialogActions className={styles.actions}>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel Merge
            </Button>
            {showAdvanced && (
              <Button
                appearance="primary"
                onClick={handleAdvancedSubmit}
                disabled={!allResolved}
              >
                Apply Resolutions ({Object.keys(resolutions).length}/{conflicts.length})
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
