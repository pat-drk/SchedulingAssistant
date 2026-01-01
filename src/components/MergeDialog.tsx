import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  Text,
  Spinner,
  makeStyles,
  tokens,
  Badge,
} from "@fluentui/react-components";
import { Merge20Regular, Warning20Regular, Checkmark20Regular, ChevronDown20Regular, ChevronRight20Regular, Add20Regular } from "@fluentui/react-icons";

interface FileVersionInfo {
  filename: string;
  savedAt: string;
  savedBy: string;
  sessionStartedAt: string;
  sizeBytes: number;
}

// Individual change that user can select
export interface RowChange {
  table: string;
  rowHash: string;  // Unique identifier for this row
  rowData: any;     // The actual row data
  columns: string[]; // Column names for reinserting
  description: string; // Human-readable description
  source: "mine" | "theirs"; // Where this change came from
  changeType: "added" | "removed"; // Whether this is an addition or removal from user's perspective
}

// Export the merge choice type for use in App.tsx
export interface MergeChoice {
  table: string;
  rowsToAdd: { data: any; columns: string[] }[];      // Rows from theirs to add
  rowsToRemove: string[]; // Row hashes from mine to remove (when accepting theirs over mine)
}

interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
  myDb: any;
  theirFilename: string;
  theirDb: any;
  onMerge: (choices: MergeChoice[]) => void;
}

// Tables with human-readable configurations for showing differences
const TABLE_CONFIG: Record<string, {
  label: string;
  description: string;
  describeRow: (row: any, db: any) => string;
}> = {
  person: {
    label: "People",
    description: "Staff members",
    describeRow: (row) => {
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      return name || `Person #${row.id}`;
    },
  },
  person_role: {
    label: "Person Roles",
    description: "Role assignments per person",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${person} → ${role}`;
    },
  },
  person_group: {
    label: "Person Groups",
    description: "Group memberships",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const group = getGroupName(db, row.group_id);
      return `${person} in ${group}`;
    },
  },
  assignment: {
    label: "Daily Assignments",
    description: "Who's assigned where each day",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${row.date}: ${person} → ${row.segment} (${role})`;
    },
  },
  timeoff: {
    label: "Time Off",
    description: "Vacation and leave entries",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const startDate = row.start_ts ? new Date(row.start_ts).toLocaleDateString() : 'unknown';
      const endDate = row.end_ts ? new Date(row.end_ts).toLocaleDateString() : 'unknown';
      return `${person}: ${startDate} to ${endDate}`;
    },
  },
  availability_override: {
    label: "Availability Overrides",
    description: "Per-day availability changes",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const availMap: Record<string, string> = { 'U': 'Unavailable', 'AM': 'AM only', 'PM': 'PM only', 'B': 'Both AM & PM' };
      return `${person} on ${row.date}: ${availMap[row.avail] || row.avail}`;
    },
  },
  monthly_default: {
    label: "Monthly Defaults",
    description: "Default monthly assignments",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${row.month}: ${person} → ${row.segment} (${role})`;
    },
  },
  monthly_default_day: {
    label: "Monthly Weekday Overrides",
    description: "Weekday-specific defaults",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const dayName = weekdays[row.weekday] || `Day ${row.weekday}`;
      return `${row.month} ${dayName}: ${person} → ${row.segment} (${role})`;
    },
  },
  monthly_default_week: {
    label: "Monthly Week Overrides",
    description: "Week-specific defaults",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${row.month} Week ${row.week_number}: ${person} → ${row.segment} (${role})`;
    },
  },
  role: {
    label: "Roles",
    description: "Role definitions",
    describeRow: (row) => row.name || `Role #${row.id}`,
  },
  segment: {
    label: "Segments",
    description: "Time segments (AM, PM, etc.)",
    describeRow: (row) => row.name || `Segment #${row.id}`,
  },
  training: {
    label: "Training",
    description: "Training records",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      return `${person}: ${row.area} (${row.completed ? 'completed' : 'in progress'})`;
    },
  },
  department_event: {
    label: "Department Events",
    description: "Department-wide events",
    describeRow: (row) => `${row.date}: ${row.title || row.type}`,
  },
  grp: {
    label: "Groups",
    description: "Group definitions",
    describeRow: (row) => row.name || `Group #${row.id}`,
  },
  skill: {
    label: "Skills",
    description: "Skill definitions",
    describeRow: (row) => row.name || `Skill #${row.id}`,
  },
  person_skill: {
    label: "Person Skills",
    description: "Skills per person",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const skill = getSkillName(db, row.skill_id);
      return `${person}: ${skill}`;
    },
  },
  recurring_timeoff: {
    label: "Recurring Time Off (Flex Time)",
    description: "Weekly recurring time away",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const dayName = weekdays[row.weekday] || `Day ${row.weekday}`;
      return `${person}: ${dayName} ${row.start_time}-${row.end_time}`;
    },
  },
};

const DEFAULT_TABLE_CONFIG = {
  label: "Data",
  description: "Database records",
  describeRow: (row: any) => JSON.stringify(row).slice(0, 60) + "...",
};

// Helper functions to resolve IDs to names
function getPersonName(db: any, personId: number): string {
  try {
    const result = db.exec(`SELECT first_name, last_name FROM person WHERE id = ${personId}`);
    const firstName = result[0]?.values[0]?.[0] as string || '';
    const lastName = result[0]?.values[0]?.[1] as string || '';
    const name = `${firstName} ${lastName}`.trim();
    return name || `Person #${personId}`;
  } catch { return `Person #${personId}`; }
}

function getRoleName(db: any, roleId: number): string {
  try {
    const result = db.exec(`SELECT name FROM role WHERE id = ${roleId}`);
    return result[0]?.values[0]?.[0] as string || `Role #${roleId}`;
  } catch { return `Role #${roleId}`; }
}

function getGroupName(db: any, groupId: number): string {
  try {
    const result = db.exec(`SELECT name FROM grp WHERE id = ${groupId}`);
    return result[0]?.values[0]?.[0] as string || `Group #${groupId}`;
  } catch { return `Group #${groupId}`; }
}

function getSkillName(db: any, skillId: number): string {
  try {
    const result = db.exec(`SELECT name FROM skill WHERE id = ${skillId}`);
    return result[0]?.values[0]?.[0] as string || `Skill #${skillId}`;
  } catch { return `Skill #${skillId}`; }
}

// Group changes by table
interface TableChangeGroup {
  table: string;
  label: string;
  description: string;
  changes: RowChange[];
}

const useStyles = makeStyles({
  tableSection: {
    marginBottom: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: "hidden",
  },
  tableHeader: {
    padding: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
  },
  tableHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  changeList: {
    padding: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  changeItem: {
    display: "flex",
    alignItems: "flex-start",
    padding: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusSmall,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  changeItemAdded: {
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder2}`,
    paddingLeft: tokens.spacingHorizontalS,
    marginLeft: tokens.spacingHorizontalXS,
  },
  changeItemRemoved: {
    borderLeft: `3px solid ${tokens.colorPaletteRedBorder2}`,
    paddingLeft: tokens.spacingHorizontalS,
    marginLeft: tokens.spacingHorizontalXS,
  },
  changeIcon: {
    marginRight: tokens.spacingHorizontalS,
    marginTop: "2px",
  },
  addIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },
  removeIcon: {
    color: tokens.colorPaletteRedForeground1,
  },
  changeDescription: {
    flex: 1,
  },
  sourceLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginLeft: tokens.spacingHorizontalS,
  },
  noDifferences: {
    textAlign: "center",
    padding: tokens.spacingVerticalL,
    color: tokens.colorNeutralForeground3,
  },
  loadingContainer: {
    textAlign: "center",
    padding: tokens.spacingVerticalXXL,
  },
  summary: {
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  scrollContainer: {
    maxHeight: "400px",
    overflowY: "auto",
  },
  selectAllRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  helpText: {
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalS,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    marginRight: tokens.spacingHorizontalM,
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    marginTop: tokens.spacingVerticalXS,
  },
});

export default function MergeDialog({
  open,
  onClose,
  myDb,
  theirFilename,
  theirDb,
  onMerge,
}: MergeDialogProps) {
  const styles = useStyles();
  const [loading, setLoading] = useState(true);
  const [tableGroups, setTableGroups] = useState<TableChangeGroup[]>([]);
  const [totalTablesScanned, setTotalTablesScanned] = useState(0);
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [allChanges, setAllChanges] = useState<RowChange[]>([]);

  useEffect(() => {
    if (open && myDb && theirDb) {
      analyzeDbDifferences();
    }
  }, [open, myDb, theirDb]);

  // Hash a row excluding the 'id' column for comparison purposes
  // This way, rows with different auto-increment IDs but same data are considered equal
  function hashRowWithoutId(columns: string[], row: any[]): string {
    const filtered: any[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].toLowerCase() !== 'id') {
        filtered.push(row[i]);
      }
    }
    return JSON.stringify(filtered);
  }

  function rowToObject(columns: string[], values: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => obj[col] = values[i]);
    return obj;
  }
  
  // Get columns and values excluding 'id' column for insertion
  function getColumnsWithoutId(columns: string[], row: any[]): { columns: string[]; values: any[] } {
    const filteredColumns: string[] = [];
    const filteredValues: any[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].toLowerCase() !== 'id') {
        filteredColumns.push(columns[i]);
        filteredValues.push(row[i]);
      }
    }
    return { columns: filteredColumns, values: filteredValues };
  }

  function analyzeDbDifferences() {
    setLoading(true);
    const groups: TableChangeGroup[] = [];
    const changes: RowChange[] = [];
    const initialSelected = new Set<string>();
    const initialExpanded = new Set<string>();

    const tableNames = Object.keys(TABLE_CONFIG);
    let tablesScanned = 0;

    for (const tableName of tableNames) {
      const config = TABLE_CONFIG[tableName] || DEFAULT_TABLE_CONFIG;
      const tableChanges: RowChange[] = [];
      
      try {
        // Check if table exists in both databases
        let myRows, theirRows;
        try {
          myRows = myDb.exec(`SELECT * FROM ${tableName}`);
        } catch {
          // Table doesn't exist in my database
          continue;
        }
        try {
          theirRows = theirDb.exec(`SELECT * FROM ${tableName}`);
        } catch {
          // Table doesn't exist in their database
          continue;
        }
        
        tablesScanned++;
        
        const myColumns = myRows[0]?.columns || [];
        const theirColumns = theirRows[0]?.columns || [];
        
        const myData = myRows[0]?.values || [];
        const theirData = theirRows[0]?.values || [];
        
        // Create hash maps using hash WITHOUT id column
        const myHashes = new Map<string, { row: any[]; columns: string[] }>();
        const theirHashes = new Map<string, { row: any[]; columns: string[] }>();
        
        for (const row of myData) {
          const hash = hashRowWithoutId(myColumns, row);
          myHashes.set(hash, { row, columns: myColumns });
        }
        for (const row of theirData) {
          const hash = hashRowWithoutId(theirColumns, row);
          theirHashes.set(hash, { row, columns: theirColumns });
        }
        
        // Find rows only in theirs (they added)
        for (const [hash, { row, columns }] of theirHashes) {
          if (!myHashes.has(hash)) {
            const rowObj = rowToObject(columns, row);
            let description: string;
            try {
              description = config.describeRow(rowObj, theirDb);
            } catch {
              description = JSON.stringify(rowObj).slice(0, 50);
            }
            
            const changeId = `${tableName}:theirs:${hash}`;
            tableChanges.push({
              table: tableName,
              rowHash: hash,
              rowData: rowObj,
              columns,
              description,
              source: "theirs",
              changeType: "added",
            });
            // By default, select changes from theirs (to incorporate their additions)
            initialSelected.add(changeId);
          }
        }
        
        // Find rows only in mine (I added, they don't have)
        for (const [hash, { row, columns }] of myHashes) {
          if (!theirHashes.has(hash)) {
            const rowObj = rowToObject(columns, row);
            let description: string;
            try {
              description = config.describeRow(rowObj, myDb);
            } catch {
              description = JSON.stringify(rowObj).slice(0, 50);
            }
            
            // This represents something I have that they don't
            // If selected, we KEEP it. If deselected, we remove it.
            const changeId = `${tableName}:mine:${hash}`;
            tableChanges.push({
              table: tableName,
              rowHash: hash,
              rowData: rowObj,
              columns,
              description,
              source: "mine",
              changeType: "added", // From my perspective, I added this
            });
            // By default, keep my changes too
            initialSelected.add(changeId);
          }
        }
        
        if (tableChanges.length > 0) {
          groups.push({
            table: tableName,
            label: config.label,
            description: config.description,
            changes: tableChanges,
          });
          changes.push(...tableChanges);
          initialExpanded.add(tableName);
        }
      } catch (e) {
        console.warn(`[Merge] Could not compare table ${tableName}:`, e);
      }
    }

    setTotalTablesScanned(tablesScanned);
    setTableGroups(groups);
    setAllChanges(changes);
    setSelectedChanges(initialSelected);
    setExpandedTables(initialExpanded);
    setLoading(false);
  }

  function toggleChange(changeId: string) {
    setSelectedChanges(prev => {
      const next = new Set(prev);
      if (next.has(changeId)) {
        next.delete(changeId);
      } else {
        next.add(changeId);
      }
      return next;
    });
  }

  function toggleTable(tableName: string) {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  }

  function selectAllInTable(tableName: string, selected: boolean) {
    const group = tableGroups.find(g => g.table === tableName);
    if (!group) return;
    
    setSelectedChanges(prev => {
      const next = new Set(prev);
      for (const change of group.changes) {
        const changeId = `${change.table}:${change.source}:${change.rowHash}`;
        if (selected) {
          next.add(changeId);
        } else {
          next.delete(changeId);
        }
      }
      return next;
    });
  }

  function selectAll(selected: boolean) {
    if (selected) {
      const all = new Set<string>();
      for (const change of allChanges) {
        all.add(`${change.table}:${change.source}:${change.rowHash}`);
      }
      setSelectedChanges(all);
    } else {
      setSelectedChanges(new Set());
    }
  }

  function handleMerge() {
    // Build merge choices based on selected changes
    const choicesByTable = new Map<string, MergeChoice>();
    
    console.log('[MergeDialog] Building merge choices...');
    console.log('[MergeDialog] Total changes:', allChanges.length);
    console.log('[MergeDialog] Selected changes:', selectedChanges.size);
    
    for (const change of allChanges) {
      const changeId = `${change.table}:${change.source}:${change.rowHash}`;
      const isSelected = selectedChanges.has(changeId);
      
      console.log(`[MergeDialog] Change: ${change.table} source=${change.source} selected=${isSelected} desc="${change.description}"`);
      
      if (!choicesByTable.has(change.table)) {
        choicesByTable.set(change.table, {
          table: change.table,
          rowsToAdd: [],
          rowsToRemove: [],
        });
      }
      
      const choice = choicesByTable.get(change.table)!;
      
      if (change.source === "theirs" && isSelected) {
        // User wants to add this row from theirs
        // Filter out the 'id' column to avoid UNIQUE constraint issues
        const filteredColumns: string[] = [];
        const filteredData: Record<string, any> = {};
        for (const col of change.columns) {
          if (col.toLowerCase() !== 'id') {
            filteredColumns.push(col);
            filteredData[col] = change.rowData[col];
          }
        }
        choice.rowsToAdd.push({ data: filteredData, columns: filteredColumns });
        console.log(`[MergeDialog] -> Will ADD: ${change.description}`);
      } else if (change.source === "mine" && !isSelected) {
        // User wants to remove this row from mine (deselected = don't keep)
        // Pass the rowData so we can match by content (not by id)
        choice.rowsToRemove.push(JSON.stringify(change.rowData));
        console.log(`[MergeDialog] -> Will REMOVE: ${change.description} (id=${change.rowData.id})`);
      }
      // If mine is selected, we keep it (do nothing)
      // If theirs is not selected, we don't add it (do nothing)
    }
    
    const finalChoices = Array.from(choicesByTable.values()).filter(
      c => c.rowsToAdd.length > 0 || c.rowsToRemove.length > 0
    );
    console.log('[MergeDialog] Final choices:', finalChoices.length, 'tables');
    for (const c of finalChoices) {
      console.log(`[MergeDialog]   ${c.table}: add=${c.rowsToAdd.length}, remove=${c.rowsToRemove.length}`);
    }
    
    onMerge(finalChoices);
  }

  // Extract username from filename
  const theirUser = theirFilename.match(/schedule-[^-]+-[^-]+-([^.]+)\.db/)?.[1]?.replace(/-/g, ' ') || 'Other user';

  const totalChanges = allChanges.length;
  const theirChanges = allChanges.filter(c => c.source === "theirs").length;
  const myChanges = allChanges.filter(c => c.source === "mine").length;

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: "700px" }}>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
              <Merge20Regular />
              Merge Changes with {theirUser}
            </div>
          </DialogTitle>
          <DialogContent>
            {loading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="medium" />
                <Text block style={{ marginTop: tokens.spacingVerticalM }}>
                  Analyzing changes...
                </Text>
              </div>
            ) : (
              <>
                {/* Help text */}
                <div className={styles.helpText}>
                  <Warning20Regular style={{ color: tokens.colorPaletteYellowForeground1, flexShrink: 0 }} />
                  <div>
                    <Text weight="semibold" block>Select which changes to keep</Text>
                    <Text size={200} block style={{ marginTop: tokens.spacingVerticalXS }}>
                      Check the changes you want to include in the merged result. Unchecked changes will be discarded.
                    </Text>
                    <div className={styles.legend}>
                      <div className={styles.legendItem}>
                        <Add20Regular style={{ color: tokens.colorPaletteGreenForeground1, fontSize: "14px" }} />
                        <Text size={200}>= Added by {theirUser}</Text>
                      </div>
                      <div className={styles.legendItem}>
                        <Add20Regular style={{ color: tokens.colorPaletteBlueForeground2, fontSize: "14px" }} />
                        <Text size={200}>= Added by you</Text>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className={styles.summary}>
                  <Text weight="semibold" block>
                    Summary
                  </Text>
                  <Text size={200} block style={{ marginTop: tokens.spacingVerticalXS }}>
                    Found {totalChanges} difference{totalChanges !== 1 ? 's' : ''}: {" "}
                    <Badge color="success" appearance="tint">{theirChanges} from {theirUser}</Badge>
                    {" "}
                    <Badge color="informative" appearance="tint">{myChanges} from you</Badge>
                    {" • "}
                    <Badge color="warning" appearance="filled">{selectedChanges.size} selected to keep</Badge>
                  </Text>
                </div>

                {totalChanges === 0 ? (
                  <div className={styles.noDifferences}>
                    <Checkmark20Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                    <Text block style={{ marginTop: tokens.spacingVerticalS }}>
                      No differences detected!
                    </Text>
                    <Text size={200} block style={{ marginTop: tokens.spacingVerticalS }}>
                      The databases appear to be identical. You can close this dialog.
                    </Text>
                  </div>
                ) : (
                  <>
                    <div className={styles.selectAllRow}>
                      <Checkbox
                        checked={selectedChanges.size === totalChanges ? true : selectedChanges.size === 0 ? false : "mixed"}
                        onChange={(_, data) => selectAll(!!data.checked)}
                        label={<Text weight="semibold">Select all changes</Text>}
                      />
                    </div>
                    <div className={styles.scrollContainer}>
                      {tableGroups.map((group) => {
                        const isExpanded = expandedTables.has(group.table);
                        const selectedInTable = group.changes.filter(c => 
                          selectedChanges.has(`${c.table}:${c.source}:${c.rowHash}`)
                        ).length;
                        const allSelectedInTable = selectedInTable === group.changes.length;
                        const noneSelectedInTable = selectedInTable === 0;
                        
                        return (
                          <div key={group.table} className={styles.tableSection}>
                            <div 
                              className={styles.tableHeader}
                              onClick={() => toggleTable(group.table)}
                            >
                              <div className={styles.tableHeaderLeft}>
                                {isExpanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                                <Text weight="semibold">{group.label}</Text>
                                <Badge appearance="tint" color="warning">{group.changes.length}</Badge>
                              </div>
                              <Checkbox
                                checked={allSelectedInTable ? true : noneSelectedInTable ? false : "mixed"}
                                onChange={(e, data) => {
                                  e.stopPropagation();
                                  selectAllInTable(group.table, !!data.checked);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {isExpanded && (
                              <div className={styles.changeList}>
                                {group.changes.map((change) => {
                                  const changeId = `${change.table}:${change.source}:${change.rowHash}`;
                                  const isSelected = selectedChanges.has(changeId);
                                  const isTheirs = change.source === "theirs";
                                  
                                  return (
                                    <div 
                                      key={changeId} 
                                      className={`${styles.changeItem} ${isTheirs ? styles.changeItemAdded : styles.changeItemRemoved}`}
                                      style={{ borderLeftColor: isTheirs ? tokens.colorPaletteGreenBorder2 : tokens.colorNeutralStroke1 }}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onChange={() => toggleChange(changeId)}
                                      />
                                      <div className={`${styles.changeIcon} ${isTheirs ? styles.addIcon : ''}`} style={{ color: isTheirs ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteBlueForeground2 }}>
                                        <Add20Regular />
                                      </div>
                                      <div className={styles.changeDescription}>
                                        <Text size={200}>{change.description}</Text>
                                        <Text className={styles.sourceLabel}>
                                          ({isTheirs ? theirUser : "you"})
                                        </Text>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            {totalChanges > 0 && (
              <Button
                appearance="primary"
                icon={<Merge20Regular />}
                onClick={handleMerge}
                disabled={loading}
              >
                Merge {selectedChanges.size} Change{selectedChanges.size !== 1 ? 's' : ''}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
