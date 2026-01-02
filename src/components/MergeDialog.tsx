import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Spinner,
  makeStyles,
  tokens,
  Badge,
} from "@fluentui/react-components";
import { 
  Merge20Regular, 
  Warning20Regular, 
  Checkmark20Regular, 
  ChevronDown20Regular, 
  ChevronRight20Regular, 
  Add20Regular,
  Delete20Regular,
  Edit20Regular,
  CheckmarkCircle20Regular,
  ArrowSync20Regular,
} from "@fluentui/react-icons";

// Change type for three-way merge
type ChangeType = 
  | "mine-added"      // I added this row (not in ancestor, in mine)
  | "theirs-added"    // They added this row (not in ancestor, in theirs)
  | "both-added"      // Both added same row (not in ancestor, in both)
  | "mine-deleted"    // I deleted this row (in ancestor, not in mine)
  | "theirs-deleted"  // They deleted this row (in ancestor, not in theirs)
  | "both-deleted"    // Both deleted same row (in ancestor, not in either)
  | "mine-modified"   // I modified this row (different from ancestor)
  | "theirs-modified" // They modified this row (different from ancestor)
  | "conflict"        // True conflict: both modified same row differently
  | "legacy-mine"     // Legacy two-way: only in mine
  | "legacy-theirs";  // Legacy two-way: only in theirs

// Individual change record
export interface RowChange {
  table: string;
  rowHash: string;
  rowData: any;
  ancestorData?: any;
  theirData?: any;
  columns: string[];
  description: string;
  changeType: ChangeType;
  autoMerge: boolean;
  conflictFields?: string[];
}

// Export the merge choice type for use in App.tsx
export interface MergeChoice {
  table: string;
  rowsToAdd: { data: any; columns: string[] }[];
  rowsToRemove: string[];
}

interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
  myDb: any;
  theirFilename: string;
  theirDb: any;
  ancestorFilename: string | null;
  ancestorDb: any | null;
  onMerge: (choices: MergeChoice[]) => void;
}

// Tables with human-readable configurations
const TABLE_CONFIG: Record<string, {
  label: string;
  description: string;
  primaryKey?: string[];
  describeRow: (row: any, db: any) => string;
}> = {
  person: {
    label: "People",
    description: "Staff members",
    primaryKey: ["work_email"],
    describeRow: (row) => {
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      return name || `Person #${row.id}`;
    },
  },
  person_role: {
    label: "Person Roles",
    description: "Role assignments per person",
    primaryKey: ["person_id", "role_id"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${person} → ${role}`;
    },
  },
  person_group: {
    label: "Person Groups",
    description: "Group memberships",
    primaryKey: ["person_id", "group_id"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const group = getGroupName(db, row.group_id);
      return `${person} in ${group}`;
    },
  },
  assignment: {
    label: "Daily Assignments",
    description: "Who's assigned where each day",
    primaryKey: ["date", "person_id", "segment"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${row.date}: ${person} → ${row.segment} (${role})`;
    },
  },
  timeoff: {
    label: "Time Off",
    description: "Vacation and leave entries",
    primaryKey: ["person_id", "start_ts"],
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
    primaryKey: ["person_id", "date"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const availMap: Record<string, string> = { 'U': 'Unavailable', 'AM': 'AM only', 'PM': 'PM only', 'B': 'Both AM & PM' };
      return `${person} on ${row.date}: ${availMap[row.avail] || row.avail}`;
    },
  },
  monthly_default: {
    label: "Monthly Defaults",
    description: "Default monthly assignments",
    primaryKey: ["month", "person_id", "segment"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${row.month}: ${person} → ${row.segment} (${role})`;
    },
  },
  monthly_default_day: {
    label: "Monthly Weekday Overrides",
    description: "Weekday-specific defaults",
    primaryKey: ["month", "person_id", "segment", "weekday"],
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
    primaryKey: ["month", "person_id", "segment", "week_number"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${row.month} Week ${row.week_number}: ${person} → ${row.segment} (${role})`;
    },
  },
  role: {
    label: "Roles",
    description: "Role definitions",
    primaryKey: ["name", "group_id"],
    describeRow: (row) => row.name || `Role #${row.id}`,
  },
  segment: {
    label: "Segments",
    description: "Time segments (AM, PM, etc.)",
    primaryKey: ["name"],
    describeRow: (row) => row.name || `Segment #${row.id}`,
  },
  training: {
    label: "Training",
    description: "Training records",
    primaryKey: ["person_id", "role_id"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const role = getRoleName(db, row.role_id);
      return `${person}: ${role} (${row.status || 'unknown'})`;
    },
  },
  department_event: {
    label: "Department Events",
    description: "Department-wide events",
    primaryKey: ["date", "title"],
    describeRow: (row) => `${row.date}: ${row.title || row.type}`,
  },
  grp: {
    label: "Groups",
    description: "Group definitions",
    primaryKey: ["name"],
    describeRow: (row) => row.name || `Group #${row.id}`,
  },
  skill: {
    label: "Skills",
    description: "Skill definitions",
    primaryKey: ["name"],
    describeRow: (row) => row.name || `Skill #${row.id}`,
  },
  person_skill: {
    label: "Person Skills",
    description: "Skills per person",
    primaryKey: ["person_id", "skill_id"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const skill = getSkillName(db, row.skill_id);
      return `${person}: ${skill}`;
    },
  },
  recurring_timeoff: {
    label: "Recurring Time Off",
    description: "Weekly recurring time away",
    primaryKey: ["person_id", "weekday", "start_time"],
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const dayName = weekdays[row.weekday] || `Day ${row.weekday}`;
      return `${person}: ${dayName} ${row.start_time}-${row.end_time}`;
    },
  },
};

// Helper functions
function getPersonName(db: any, personId: number): string {
  try {
    const result = db.exec(`SELECT first_name, last_name FROM person WHERE id = ${personId}`);
    const firstName = result[0]?.values[0]?.[0] as string || '';
    const lastName = result[0]?.values[0]?.[1] as string || '';
    return `${firstName} ${lastName}`.trim() || `Person #${personId}`;
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

interface TableChangeGroup {
  table: string;
  label: string;
  description: string;
  autoMergeChanges: RowChange[];
  conflictChanges: RowChange[];
}

const useStyles = makeStyles({
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
    cursor: "pointer",
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
  },
  sectionContent: {
    paddingLeft: tokens.spacingHorizontalM,
  },
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
    marginBottom: tokens.spacingVerticalXXS,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  changeItemAuto: {
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder2}`,
    paddingLeft: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorPaletteGreenBackground1,
  },
  changeItemConflict: {
    borderLeft: `3px solid ${tokens.colorPaletteRedBorder2}`,
    paddingLeft: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  changeItemMine: {
    borderLeft: `3px solid ${tokens.colorPaletteBlueBorder2}`,
    paddingLeft: tokens.spacingHorizontalS,
  },
  changeItemTheirs: {
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder2}`,
    paddingLeft: tokens.spacingHorizontalS,
  },
  changeIcon: {
    marginRight: tokens.spacingHorizontalS,
    marginTop: "2px",
    flexShrink: 0,
  },
  changeDescription: {
    flex: 1,
  },
  changeTypeLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginLeft: tokens.spacingHorizontalS,
  },
  conflictDetail: {
    marginTop: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalXS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase200,
  },
  conflictField: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalXXS,
  },
  fieldLabel: {
    fontWeight: tokens.fontWeightSemibold,
    minWidth: "80px",
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
  summaryRow: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "center",
    flexWrap: "wrap",
  },
  scrollContainer: {
    maxHeight: "450px",
    overflowY: "auto",
  },
  autoMergeSection: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    border: `1px solid ${tokens.colorPaletteGreenBorder1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
  },
  conflictSection: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
  },
  helpText: {
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  conflictOptions: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalS,
    marginLeft: tokens.spacingHorizontalL,
  },
  threeWayBadge: {
    marginLeft: tokens.spacingHorizontalS,
  },
});

export default function MergeDialog({
  open,
  onClose,
  myDb,
  theirFilename,
  theirDb,
  ancestorFilename,
  ancestorDb,
  onMerge,
}: MergeDialogProps) {
  const styles = useStyles();
  const [loading, setLoading] = useState(true);
  const [tableGroups, setTableGroups] = useState<TableChangeGroup[]>([]);
  const [autoMergeCount, setAutoMergeCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictChoices, setConflictChoices] = useState<Map<string, "mine" | "theirs">>(new Map());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["conflicts"]));
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [allChanges, setAllChanges] = useState<RowChange[]>([]);

  const isThreeWay = !!ancestorDb;
  const theirUser = theirFilename.match(/schedule-[^-]+-[^-]+-([^.]+)\.db/)?.[1]?.replace(/-/g, ' ') || 'Other user';

  useEffect(() => {
    if (open && myDb && theirDb) {
      analyzeDbDifferences();
    }
  }, [open, myDb, theirDb, ancestorDb]);

  function hashRowWithoutId(columns: string[], row: any[]): string {
    const filtered: any[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].toLowerCase() !== 'id') {
        filtered.push(row[i]);
      }
    }
    return JSON.stringify(filtered);
  }

  function getNaturalKey(columns: string[], row: any[], primaryKeyCols?: string[]): string {
    if (!primaryKeyCols || primaryKeyCols.length === 0) {
      return hashRowWithoutId(columns, row);
    }
    const keyValues: any[] = [];
    for (const keyCol of primaryKeyCols) {
      const idx = columns.indexOf(keyCol);
      if (idx >= 0) {
        keyValues.push(row[idx]);
      }
    }
    return JSON.stringify(keyValues);
  }

  function rowToObject(columns: string[], values: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => obj[col] = values[i]);
    return obj;
  }

  function findDifferingFields(obj1: any, obj2: any, columns: string[]): string[] {
    const diffFields: string[] = [];
    for (const col of columns) {
      if (col.toLowerCase() === 'id') continue;
      if (JSON.stringify(obj1[col]) !== JSON.stringify(obj2[col])) {
        diffFields.push(col);
      }
    }
    return diffFields;
  }

  function analyzeDbDifferences() {
    setLoading(true);
    const groups: TableChangeGroup[] = [];
    const changes: RowChange[] = [];
    let autoCount = 0;
    let conflictCt = 0;
    const initialExpanded = new Set<string>();

    const tableNames = Object.keys(TABLE_CONFIG);

    for (const tableName of tableNames) {
      const config = TABLE_CONFIG[tableName];
      const autoMergeChanges: RowChange[] = [];
      const conflictChanges: RowChange[] = [];
      
      try {
        let myRows, theirRows, ancestorRows;
        try { myRows = myDb.exec(`SELECT * FROM ${tableName}`); } catch { continue; }
        try { theirRows = theirDb.exec(`SELECT * FROM ${tableName}`); } catch { continue; }
        if (ancestorDb) {
          try { ancestorRows = ancestorDb.exec(`SELECT * FROM ${tableName}`); } catch { ancestorRows = null; }
        }
        
        const myColumns = myRows[0]?.columns || [];
        const theirColumns = theirRows[0]?.columns || [];
        const ancestorColumns = ancestorRows?.[0]?.columns || [];
        const myData = myRows[0]?.values || [];
        const theirData = theirRows[0]?.values || [];
        const ancestorData = ancestorRows?.[0]?.values || [];
        const primaryKey = config.primaryKey;
        
        const myMap = new Map<string, { row: any[]; columns: string[]; hash: string }>();
        const theirMap = new Map<string, { row: any[]; columns: string[]; hash: string }>();
        const ancestorMap = new Map<string, { row: any[]; columns: string[]; hash: string }>();
        
        for (const row of myData) {
          const key = getNaturalKey(myColumns, row, primaryKey);
          const hash = hashRowWithoutId(myColumns, row);
          myMap.set(key, { row, columns: myColumns, hash });
        }
        for (const row of theirData) {
          const key = getNaturalKey(theirColumns, row, primaryKey);
          const hash = hashRowWithoutId(theirColumns, row);
          theirMap.set(key, { row, columns: theirColumns, hash });
        }
        if (ancestorDb && ancestorData.length > 0) {
          for (const row of ancestorData) {
            const key = getNaturalKey(ancestorColumns, row, primaryKey);
            const hash = hashRowWithoutId(ancestorColumns, row);
            ancestorMap.set(key, { row, columns: ancestorColumns, hash });
          }
        }
        
        const allKeys = new Set([...myMap.keys(), ...theirMap.keys(), ...ancestorMap.keys()]);
        
        for (const key of allKeys) {
          const mine = myMap.get(key);
          const theirs = theirMap.get(key);
          const ancestor = ancestorMap.get(key);
          
          if (mine && theirs && mine.hash === theirs.hash) continue;
          
          let changeType: ChangeType;
          let autoMerge = false;
          let rowData: any;
          let ancestorDataRow: any;
          let theirDataRow: any;
          let columns: string[];
          let conflictFields: string[] | undefined;
          let db = myDb;
          
          if (isThreeWay && ancestorMap.size > 0) {
            if (!ancestor) {
              if (mine && theirs) {
                if (mine.hash === theirs.hash) {
                  changeType = "both-added";
                  autoMerge = true;
                } else {
                  changeType = "conflict";
                  conflictCt++;
                }
                rowData = rowToObject(mine.columns, mine.row);
                theirDataRow = rowToObject(theirs.columns, theirs.row);
                columns = mine.columns;
                conflictFields = findDifferingFields(rowData, theirDataRow, mine.columns);
              } else if (mine) {
                changeType = "mine-added";
                autoMerge = true;
                rowData = rowToObject(mine.columns, mine.row);
                columns = mine.columns;
              } else {
                changeType = "theirs-added";
                autoMerge = true;
                rowData = rowToObject(theirs!.columns, theirs!.row);
                columns = theirs!.columns;
                db = theirDb;
              }
            } else {
              if (!mine && !theirs) {
                changeType = "both-deleted";
                autoMerge = true;
                rowData = rowToObject(ancestor.columns, ancestor.row);
                columns = ancestor.columns;
              } else if (!mine && theirs) {
                if (theirs.hash === ancestor.hash) {
                  changeType = "mine-deleted";
                  autoMerge = true;
                } else {
                  changeType = "conflict";
                  conflictCt++;
                  conflictFields = findDifferingFields(
                    rowToObject(ancestor.columns, ancestor.row),
                    rowToObject(theirs.columns, theirs.row),
                    theirs.columns
                  );
                }
                rowData = rowToObject(ancestor.columns, ancestor.row);
                theirDataRow = rowToObject(theirs.columns, theirs.row);
                ancestorDataRow = rowToObject(ancestor.columns, ancestor.row);
                columns = ancestor.columns;
              } else if (mine && !theirs) {
                if (mine.hash === ancestor.hash) {
                  changeType = "theirs-deleted";
                  autoMerge = true;
                } else {
                  changeType = "conflict";
                  conflictCt++;
                  conflictFields = findDifferingFields(
                    rowToObject(ancestor.columns, ancestor.row),
                    rowToObject(mine.columns, mine.row),
                    mine.columns
                  );
                }
                rowData = rowToObject(mine.columns, mine.row);
                ancestorDataRow = rowToObject(ancestor.columns, ancestor.row);
                columns = mine.columns;
              } else {
                const mineChanged = mine!.hash !== ancestor.hash;
                const theirsChanged = theirs!.hash !== ancestor.hash;
                
                if (!mineChanged && theirsChanged) {
                  changeType = "theirs-modified";
                  autoMerge = true;
                  rowData = rowToObject(theirs!.columns, theirs!.row);
                  ancestorDataRow = rowToObject(ancestor.columns, ancestor.row);
                  columns = theirs!.columns;
                  db = theirDb;
                } else if (mineChanged && !theirsChanged) {
                  changeType = "mine-modified";
                  autoMerge = true;
                  rowData = rowToObject(mine!.columns, mine!.row);
                  ancestorDataRow = rowToObject(ancestor.columns, ancestor.row);
                  columns = mine!.columns;
                } else {
                  changeType = "conflict";
                  conflictCt++;
                  rowData = rowToObject(mine!.columns, mine!.row);
                  theirDataRow = rowToObject(theirs!.columns, theirs!.row);
                  ancestorDataRow = rowToObject(ancestor.columns, ancestor.row);
                  columns = mine!.columns;
                  conflictFields = findDifferingFields(rowData, theirDataRow, mine!.columns);
                }
              }
            }
          } else {
            if (mine && !theirs) {
              changeType = "legacy-mine";
              autoMerge = false;
              rowData = rowToObject(mine.columns, mine.row);
              columns = mine.columns;
            } else if (!mine && theirs) {
              changeType = "legacy-theirs";
              autoMerge = false;
              rowData = rowToObject(theirs.columns, theirs.row);
              columns = theirs.columns;
              db = theirDb;
            } else {
              changeType = "conflict";
              conflictCt++;
              rowData = rowToObject(mine!.columns, mine!.row);
              theirDataRow = rowToObject(theirs!.columns, theirs!.row);
              columns = mine!.columns;
              conflictFields = findDifferingFields(rowData, theirDataRow, mine!.columns);
            }
          }
          
          let description: string;
          try {
            description = config.describeRow(rowData, db);
          } catch {
            description = JSON.stringify(rowData).slice(0, 50);
          }
          
          const change: RowChange = {
            table: tableName,
            rowHash: key,
            rowData,
            ancestorData: ancestorDataRow,
            theirData: theirDataRow,
            columns,
            description,
            changeType,
            autoMerge,
            conflictFields,
          };
          
          if (autoMerge) {
            autoMergeChanges.push(change);
            autoCount++;
          } else {
            conflictChanges.push(change);
          }
          changes.push(change);
        }
        
        if (autoMergeChanges.length > 0 || conflictChanges.length > 0) {
          groups.push({
            table: tableName,
            label: config.label,
            description: config.description,
            autoMergeChanges,
            conflictChanges,
          });
          if (conflictChanges.length > 0) {
            initialExpanded.add(tableName);
          }
        }
      } catch (e) {
        console.warn(`[Merge] Could not compare table ${tableName}:`, e);
      }
    }

    setTableGroups(groups);
    setAllChanges(changes);
    setAutoMergeCount(autoCount);
    setConflictCount(conflictCt);
    setExpandedTables(initialExpanded);
    
    const initialChoices = new Map<string, "mine" | "theirs">();
    for (const change of changes) {
      if (!change.autoMerge) {
        initialChoices.set(`${change.table}:${change.rowHash}`, "theirs");
      }
    }
    setConflictChoices(initialChoices);
    setLoading(false);
  }

  function toggleSection(section: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function toggleTable(tableName: string) {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) next.delete(tableName);
      else next.add(tableName);
      return next;
    });
  }

  function setConflictChoice(changeId: string, choice: "mine" | "theirs") {
    setConflictChoices(prev => {
      const next = new Map(prev);
      next.set(changeId, choice);
      return next;
    });
  }

  function handleMerge() {
    const choicesByTable = new Map<string, MergeChoice>();
    
    for (const change of allChanges) {
      if (!choicesByTable.has(change.table)) {
        choicesByTable.set(change.table, { table: change.table, rowsToAdd: [], rowsToRemove: [] });
      }
      const choice = choicesByTable.get(change.table)!;
      
      if (change.autoMerge) {
        switch (change.changeType) {
          case "theirs-added":
          case "theirs-modified": {
            const addCols = change.columns.filter(c => c.toLowerCase() !== 'id');
            const addData: Record<string, any> = {};
            for (const col of addCols) addData[col] = change.rowData[col];
            choice.rowsToAdd.push({ data: addData, columns: addCols });
            if (change.changeType === "theirs-modified" && change.ancestorData?.id) {
              choice.rowsToRemove.push(JSON.stringify(change.ancestorData));
            }
            break;
          }
          case "theirs-deleted":
            choice.rowsToRemove.push(JSON.stringify(change.rowData));
            break;
        }
      } else {
        const changeId = `${change.table}:${change.rowHash}`;
        const userChoice = conflictChoices.get(changeId) || "theirs";
        
        if (userChoice === "theirs" && change.theirData) {
          const addCols = change.columns.filter(c => c.toLowerCase() !== 'id');
          const addData: Record<string, any> = {};
          for (const col of addCols) addData[col] = change.theirData[col];
          choice.rowsToAdd.push({ data: addData, columns: addCols });
          if (change.rowData?.id) {
            choice.rowsToRemove.push(JSON.stringify(change.rowData));
          }
        } else if (userChoice === "theirs" && change.changeType === "legacy-theirs") {
          const addCols = change.columns.filter(c => c.toLowerCase() !== 'id');
          const addData: Record<string, any> = {};
          for (const col of addCols) addData[col] = change.rowData[col];
          choice.rowsToAdd.push({ data: addData, columns: addCols });
        }
      }
    }
    
    const finalChoices = Array.from(choicesByTable.values()).filter(
      c => c.rowsToAdd.length > 0 || c.rowsToRemove.length > 0
    );
    onMerge(finalChoices);
  }

  function getChangeIcon(changeType: ChangeType) {
    switch (changeType) {
      case "theirs-added":
      case "mine-added":
      case "both-added":
        return <Add20Regular />;
      case "theirs-deleted":
      case "mine-deleted":
      case "both-deleted":
        return <Delete20Regular />;
      case "theirs-modified":
      case "mine-modified":
        return <Edit20Regular />;
      case "conflict":
        return <Warning20Regular />;
      default:
        return <ArrowSync20Regular />;
    }
  }

  function getChangeLabel(changeType: ChangeType): string {
    switch (changeType) {
      case "theirs-added": return `Added by ${theirUser}`;
      case "mine-added": return "Added by you";
      case "both-added": return "Added by both";
      case "theirs-deleted": return `Deleted by ${theirUser}`;
      case "mine-deleted": return "Deleted by you";
      case "both-deleted": return "Deleted by both";
      case "theirs-modified": return `Modified by ${theirUser}`;
      case "mine-modified": return "Modified by you";
      case "conflict": return "Conflict";
      case "legacy-mine": return "Only in your version";
      case "legacy-theirs": return `Only in ${theirUser}'s version`;
      default: return "Change";
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: "800px", width: "90vw" }}>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
              <Merge20Regular />
              Merge Changes with {theirUser}
              {isThreeWay && (
                <Badge appearance="tint" color="success" className={styles.threeWayBadge}>
                  3-way merge
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogContent>
            {loading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="medium" />
                <Text block style={{ marginTop: tokens.spacingVerticalM }}>Analyzing changes...</Text>
              </div>
            ) : (
              <>
                <div className={styles.summary}>
                  <Text weight="semibold" block style={{ marginBottom: tokens.spacingVerticalS }}>
                    Merge Summary
                  </Text>
                  <div className={styles.summaryRow}>
                    {isThreeWay ? (
                      <>
                        <Badge appearance="filled" color="success" icon={<CheckmarkCircle20Regular />}>
                          {autoMergeCount} auto-merged
                        </Badge>
                        {conflictCount > 0 && (
                          <Badge appearance="filled" color="danger" icon={<Warning20Regular />}>
                            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} to resolve
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Badge appearance="filled" color="warning">
                        {allChanges.length} difference{allChanges.length !== 1 ? 's' : ''} (two-way mode)
                      </Badge>
                    )}
                  </div>
                  {!isThreeWay && (
                    <Text size={200} block style={{ marginTop: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 }}>
                      No common ancestor found. All differences require manual review.
                    </Text>
                  )}
                </div>

                {allChanges.length === 0 ? (
                  <div className={styles.noDifferences}>
                    <Checkmark20Regular style={{ color: tokens.colorPaletteGreenForeground1, fontSize: "24px" }} />
                    <Text block style={{ marginTop: tokens.spacingVerticalS }}>No differences detected!</Text>
                  </div>
                ) : (
                  <div className={styles.scrollContainer}>
                    {autoMergeCount > 0 && (
                      <div className={styles.autoMergeSection}>
                        <div className={styles.sectionHeader} onClick={() => toggleSection("auto")}>
                          {expandedSections.has("auto") ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                          <CheckmarkCircle20Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                          <Text weight="semibold">Auto-Merged Changes ({autoMergeCount})</Text>
                        </div>
                        {expandedSections.has("auto") && (
                          <div className={styles.sectionContent}>
                            <Text size={200} block style={{ marginBottom: tokens.spacingVerticalS, color: tokens.colorNeutralForeground2 }}>
                              These changes don't conflict and will be merged automatically.
                            </Text>
                            {tableGroups.filter(g => g.autoMergeChanges.length > 0).map(group => (
                              <div key={`auto-${group.table}`} className={styles.tableSection}>
                                <div className={styles.tableHeader} onClick={() => toggleTable(`auto-${group.table}`)}>
                                  <div className={styles.tableHeaderLeft}>
                                    {expandedTables.has(`auto-${group.table}`) ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                                    <Text weight="semibold">{group.label}</Text>
                                    <Badge appearance="tint" color="success">{group.autoMergeChanges.length}</Badge>
                                  </div>
                                </div>
                                {expandedTables.has(`auto-${group.table}`) && (
                                  <div className={styles.changeList}>
                                    {group.autoMergeChanges.map((change, idx) => (
                                      <div key={idx} className={`${styles.changeItem} ${styles.changeItemAuto}`}>
                                        <div className={styles.changeIcon} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                                          {getChangeIcon(change.changeType)}
                                        </div>
                                        <div className={styles.changeDescription}>
                                          <Text size={200}>{change.description}</Text>
                                          <Text className={styles.changeTypeLabel}>{getChangeLabel(change.changeType)}</Text>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {conflictCount > 0 && (
                      <div className={styles.conflictSection}>
                        <div className={styles.sectionHeader} onClick={() => toggleSection("conflicts")}>
                          {expandedSections.has("conflicts") ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                          <Warning20Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
                          <Text weight="semibold">Conflicts Requiring Your Decision ({conflictCount})</Text>
                        </div>
                        {expandedSections.has("conflicts") && (
                          <div className={styles.sectionContent}>
                            <Text size={200} block style={{ marginBottom: tokens.spacingVerticalS, color: tokens.colorNeutralForeground2 }}>
                              Both you and {theirUser} modified these items. Choose which version to keep.
                            </Text>
                            {tableGroups.filter(g => g.conflictChanges.length > 0).map(group => (
                              <div key={`conflict-${group.table}`} className={styles.tableSection}>
                                <div className={styles.tableHeader} onClick={() => toggleTable(`conflict-${group.table}`)}>
                                  <div className={styles.tableHeaderLeft}>
                                    {expandedTables.has(`conflict-${group.table}`) ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                                    <Text weight="semibold">{group.label}</Text>
                                    <Badge appearance="tint" color="danger">{group.conflictChanges.length}</Badge>
                                  </div>
                                </div>
                                {expandedTables.has(`conflict-${group.table}`) && (
                                  <div className={styles.changeList}>
                                    {group.conflictChanges.map((change, idx) => {
                                      const changeId = `${change.table}:${change.rowHash}`;
                                      const choice = conflictChoices.get(changeId) || "theirs";
                                      
                                      return (
                                        <div key={idx} className={`${styles.changeItem} ${styles.changeItemConflict}`}>
                                          <div className={styles.changeIcon} style={{ color: tokens.colorPaletteRedForeground1 }}>
                                            <Warning20Regular />
                                          </div>
                                          <div className={styles.changeDescription}>
                                            <Text size={200} weight="semibold">{change.description}</Text>
                                            <Text className={styles.changeTypeLabel}>{getChangeLabel(change.changeType)}</Text>
                                            
                                            {change.conflictFields && change.conflictFields.length > 0 && (
                                              <div className={styles.conflictDetail}>
                                                <Text size={200} weight="semibold">Differing fields:</Text>
                                                {change.conflictFields.slice(0, 3).map(field => (
                                                  <div key={field} className={styles.conflictField}>
                                                    <span className={styles.fieldLabel}>{field}:</span>
                                                    <span>You: {JSON.stringify(change.rowData?.[field])}</span>
                                                    <span>{theirUser}: {JSON.stringify(change.theirData?.[field])}</span>
                                                  </div>
                                                ))}
                                                {change.conflictFields.length > 3 && (
                                                  <Text size={200}>...and {change.conflictFields.length - 3} more</Text>
                                                )}
                                              </div>
                                            )}
                                            
                                            <div className={styles.conflictOptions}>
                                              <Button
                                                appearance={choice === "mine" ? "primary" : "secondary"}
                                                size="small"
                                                onClick={() => setConflictChoice(changeId, "mine")}
                                              >
                                                Keep yours
                                              </Button>
                                              <Button
                                                appearance={choice === "theirs" ? "primary" : "secondary"}
                                                size="small"
                                                onClick={() => setConflictChoice(changeId, "theirs")}
                                              >
                                                Use {theirUser}'s
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {!isThreeWay && allChanges.length > 0 && (
                      <>
                        <div className={styles.helpText}>
                          <Text size={200}>
                            <strong>Two-way merge mode:</strong> Without a common ancestor, we can't determine 
                            who made each change. Review each difference and choose which version to keep.
                          </Text>
                        </div>
                        {tableGroups.map(group => (
                          <div key={group.table} className={styles.tableSection}>
                            <div className={styles.tableHeader} onClick={() => toggleTable(group.table)}>
                              <div className={styles.tableHeaderLeft}>
                                {expandedTables.has(group.table) ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                                <Text weight="semibold">{group.label}</Text>
                                <Badge appearance="tint" color="warning">
                                  {group.autoMergeChanges.length + group.conflictChanges.length}
                                </Badge>
                              </div>
                            </div>
                            {expandedTables.has(group.table) && (
                              <div className={styles.changeList}>
                                {[...group.autoMergeChanges, ...group.conflictChanges].map((change, idx) => {
                                  const changeId = `${change.table}:${change.rowHash}`;
                                  const choice = conflictChoices.get(changeId) || "theirs";
                                  const isMine = change.changeType === "legacy-mine";
                                  
                                  return (
                                    <div key={idx} className={`${styles.changeItem} ${isMine ? styles.changeItemMine : styles.changeItemTheirs}`}>
                                      <div className={styles.changeIcon}>
                                        <Add20Regular />
                                      </div>
                                      <div className={styles.changeDescription}>
                                        <Text size={200}>{change.description}</Text>
                                        <Text className={styles.changeTypeLabel}>{getChangeLabel(change.changeType)}</Text>
                                        
                                        <div className={styles.conflictOptions}>
                                          {isMine ? (
                                            <>
                                              <Button
                                                appearance={choice === "mine" ? "primary" : "secondary"}
                                                size="small"
                                                onClick={() => setConflictChoice(changeId, "mine")}
                                              >Keep</Button>
                                              <Button
                                                appearance={choice === "theirs" ? "primary" : "secondary"}
                                                size="small"
                                                onClick={() => setConflictChoice(changeId, "theirs")}
                                              >Discard</Button>
                                            </>
                                          ) : (
                                            <>
                                              <Button
                                                appearance={choice === "theirs" ? "primary" : "secondary"}
                                                size="small"
                                                onClick={() => setConflictChoice(changeId, "theirs")}
                                              >Add</Button>
                                              <Button
                                                appearance={choice === "mine" ? "primary" : "secondary"}
                                                size="small"
                                                onClick={() => setConflictChoice(changeId, "mine")}
                                              >Skip</Button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            {allChanges.length > 0 && (
              <Button
                appearance="primary"
                icon={<Merge20Regular />}
                onClick={handleMerge}
                disabled={loading}
              >
                {isThreeWay && conflictCount === 0 
                  ? `Apply ${autoMergeCount} Auto-Merged Changes`
                  : `Complete Merge`
                }
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
