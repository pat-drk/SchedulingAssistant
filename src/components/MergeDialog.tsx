import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  Radio,
  Text,
  Spinner,
  makeStyles,
  tokens,
  Badge,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from "@fluentui/react-components";
import { Merge20Regular, Warning20Regular, Checkmark20Regular, Info20Regular } from "@fluentui/react-icons";

interface MergeChoice {
  table: string;
  choice: "mine" | "theirs";
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
  // How to describe a row from this table
  describeRow: (row: any, db: any) => string;
  // Key columns to identify unique rows
  keyColumns?: string[];
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
    keyColumns: ["date", "segment", "role_id", "person_id"],
  },
  timeoff: {
    label: "Time Off",
    description: "Vacation and leave entries",
    describeRow: (row, db) => {
      const person = getPersonName(db, row.person_id);
      // Format timestamps to readable dates
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
      const role = getRoleName(db, row.role_id);
      return `${person}: ${role} (${row.status || 'unknown'})`;
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
};

// Fallback for tables not in config
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

interface SampleDiff {
  onlyInMine: string[];
  onlyInTheirs: string[];
}

interface TableDiff {
  table: string;
  label: string;
  description: string;
  myCount: number;
  theirCount: number;
  hasDifferences: boolean;
  differenceType: "none" | "count" | "content";
  differenceDetails: string;
  sampleDiffs: SampleDiff;
}

const useStyles = makeStyles({
  tableSection: {
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tableSectionDiff: {
    border: `1px solid ${tokens.colorPaletteYellowBorder2}`,
    backgroundColor: tokens.colorPaletteYellowBackground1,
  },
  tableName: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  counts: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalS,
  },
  diffDetails: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteYellowForeground2,
    marginBottom: tokens.spacingVerticalS,
    fontStyle: "italic",
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
  sampleList: {
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusSmall,
  },
  sampleItem: {
    padding: `${tokens.spacingVerticalXXS} 0`,
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalXS,
  },
  sampleLabel: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXXS,
    display: "block",
  },
  mineLabel: {
    color: tokens.colorPaletteBlueForeground2,
  },
  theirsLabel: {
    color: tokens.colorPaletteGreenForeground1,
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
  const [tableDiffs, setTableDiffs] = useState<TableDiff[]>([]);
  const [totalTablesScanned, setTotalTablesScanned] = useState(0);
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});

  useEffect(() => {
    if (open && myDb && theirDb) {
      analyzeDbDifferences();
    }
  }, [open, myDb, theirDb]);

  function hashRow(row: any[]): string {
    return JSON.stringify(row);
  }

  function rowToObject(columns: string[], values: any[]): any {
    const obj: any = {};
    columns.forEach((col, i) => obj[col] = values[i]);
    return obj;
  }

  function analyzeDbDifferences() {
    setLoading(true);
    const diffs: TableDiff[] = [];
    const initialChoices: Record<string, "mine" | "theirs"> = {};

    const tableNames = Object.keys(TABLE_CONFIG);

    for (const tableName of tableNames) {
      const config = TABLE_CONFIG[tableName] || DEFAULT_TABLE_CONFIG;
      
      try {
        // Get row counts
        const myCountResult = myDb.exec(`SELECT COUNT(*) FROM ${tableName}`);
        const theirCountResult = theirDb.exec(`SELECT COUNT(*) FROM ${tableName}`);
        const myCount = (myCountResult[0]?.values[0]?.[0] as number) || 0;
        const theirCount = (theirCountResult[0]?.values[0]?.[0] as number) || 0;

        let hasDifferences = false;
        let differenceType: "none" | "count" | "content" = "none";
        let differenceDetails = "";
        const sampleDiffs: SampleDiff = { onlyInMine: [], onlyInTheirs: [] };

        if (myCount !== theirCount) {
          hasDifferences = true;
          differenceType = "count";
          const diff = theirCount - myCount;
          differenceDetails = diff > 0 
            ? `Their version has ${diff} more row(s)` 
            : `Your version has ${Math.abs(diff)} more row(s)`;
        }
        
        // Always check content if either has rows
        if (myCount > 0 || theirCount > 0) {
          try {
            const myRows = myDb.exec(`SELECT * FROM ${tableName}`);
            const theirRows = theirDb.exec(`SELECT * FROM ${tableName}`);
            
            const myColumns = myRows[0]?.columns || [];
            const theirColumns = theirRows[0]?.columns || [];
            
            const myData = myRows[0]?.values || [];
            const theirData = theirRows[0]?.values || [];
            
            // Create hash maps
            const myHashes = new Map<string, any[]>();
            const theirHashes = new Map<string, any[]>();
            
            for (const row of myData) {
              myHashes.set(hashRow(row), row);
            }
            for (const row of theirData) {
              theirHashes.set(hashRow(row), row);
            }
            
            // Find differences and collect samples
            let onlyInMineCount = 0;
            let onlyInTheirsCount = 0;
            
            for (const [hash, row] of myHashes) {
              if (!theirHashes.has(hash)) {
                onlyInMineCount++;
                // Collect up to 3 samples
                if (sampleDiffs.onlyInMine.length < 3) {
                  const rowObj = rowToObject(myColumns, row);
                  try {
                    sampleDiffs.onlyInMine.push(config.describeRow(rowObj, myDb));
                  } catch {
                    sampleDiffs.onlyInMine.push(JSON.stringify(rowObj).slice(0, 50));
                  }
                }
              }
            }
            
            for (const [hash, row] of theirHashes) {
              if (!myHashes.has(hash)) {
                onlyInTheirsCount++;
                if (sampleDiffs.onlyInTheirs.length < 3) {
                  const rowObj = rowToObject(theirColumns, row);
                  try {
                    sampleDiffs.onlyInTheirs.push(config.describeRow(rowObj, theirDb));
                  } catch {
                    sampleDiffs.onlyInTheirs.push(JSON.stringify(rowObj).slice(0, 50));
                  }
                }
              }
            }
            
            if (onlyInMineCount > 0 || onlyInTheirsCount > 0) {
              hasDifferences = true;
              if (differenceType === "none") {
                differenceType = "content";
              }
              differenceDetails = `${onlyInMineCount} unique in yours, ${onlyInTheirsCount} unique in theirs`;
            }
          } catch (e) {
            console.warn(`[Merge] Content comparison failed for ${tableName}:`, e);
          }
        }

        if (hasDifferences) {
          diffs.push({
            table: tableName,
            label: config.label,
            description: config.description,
            myCount,
            theirCount,
            hasDifferences,
            differenceType,
            differenceDetails,
            sampleDiffs,
          });
          
          // Default to keeping mine
          initialChoices[tableName] = "mine";
        }
      } catch (e) {
        // Table might not exist in one of the databases
        console.warn(`[Merge] Could not compare table ${tableName}:`, e);
      }
    }

    setTotalTablesScanned(tableNames.length);
    setTableDiffs(diffs);
    setChoices(initialChoices);
    setLoading(false);
  }

  function handleChoiceChange(table: string, value: "mine" | "theirs") {
    setChoices((prev) => ({ ...prev, [table]: value }));
  }

  function handleMerge() {
    const mergeChoices = Object.entries(choices).map(([table, choice]) => ({
      table,
      choice,
    }));
    onMerge(mergeChoices);
  }

  // Extract username from filename
  const theirUser = theirFilename.match(/schedule-[^-]+-[^-]+-([^.]+)\.db/)?.[1]?.replace(/-/g, ' ') || 'Other user';

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: "600px" }}>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
              <Merge20Regular />
              Merge Changes from {theirUser}
            </div>
          </DialogTitle>
          <DialogContent>
            {loading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="medium" />
                <Text block style={{ marginTop: tokens.spacingVerticalM }}>
                  Analyzing all tables for differences...
                </Text>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className={styles.summary}>
                  <Text weight="semibold" block>
                    Comparison Summary
                  </Text>
                  <Text size={200} block style={{ marginTop: tokens.spacingVerticalXS }}>
                    Scanned {totalTablesScanned} tables: {" "}
                    <Badge color="warning" appearance="filled">{tableDiffs.length} with differences</Badge>
                    {" "}
                    <Badge color="success" appearance="tint">{totalTablesScanned - tableDiffs.length} identical</Badge>
                  </Text>
                </div>

                {tableDiffs.length === 0 ? (
                  <div className={styles.noDifferences}>
                    <Checkmark20Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                    <Text block style={{ marginTop: tokens.spacingVerticalS }}>
                      No differences detected in any tables!
                    </Text>
                    <Text size={200} block style={{ marginTop: tokens.spacingVerticalS }}>
                      The databases appear to be identical. You can close this dialog.
                    </Text>
                  </div>
                ) : (
                  <>
                    <Text block style={{ marginBottom: tokens.spacingVerticalM }}>
                      Choose which version to keep for each table with differences:
                    </Text>
                    <div className={styles.scrollContainer}>
                      {tableDiffs.map((table) => (
                        <div 
                          key={table.table} 
                          className={`${styles.tableSection} ${styles.tableSectionDiff}`}
                        >
                          <div className={styles.tableName}>
                            <Warning20Regular style={{ color: tokens.colorPaletteYellowForeground1 }} />
                            <Text weight="semibold">{table.label}</Text>
                          </div>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS }}>
                            {table.description}
                          </Text>
                          <Text className={styles.counts}>
                            Your version: {table.myCount} rows | {theirUser}: {table.theirCount} rows
                          </Text>
                          {table.differenceDetails && (
                            <Text className={styles.diffDetails}>
                              {table.differenceDetails}
                            </Text>
                          )}
                          
                          {/* Show sample differences */}
                          {(table.sampleDiffs.onlyInMine.length > 0 || table.sampleDiffs.onlyInTheirs.length > 0) && (
                            <div className={styles.sampleList}>
                              {table.sampleDiffs.onlyInMine.length > 0 && (
                                <div style={{ marginBottom: tokens.spacingVerticalS }}>
                                  <Text className={`${styles.sampleLabel} ${styles.mineLabel}`}>
                                    Only in your version:
                                  </Text>
                                  {table.sampleDiffs.onlyInMine.map((item, i) => (
                                    <div key={i} className={styles.sampleItem}>
                                      <span>•</span>
                                      <Text size={200}>{item}</Text>
                                    </div>
                                  ))}
                                  {table.sampleDiffs.onlyInMine.length === 3 && (
                                    <Text size={200} style={{ fontStyle: 'italic', color: tokens.colorNeutralForeground3 }}>
                                      ...and more
                                    </Text>
                                  )}
                                </div>
                              )}
                              {table.sampleDiffs.onlyInTheirs.length > 0 && (
                                <div>
                                  <Text className={`${styles.sampleLabel} ${styles.theirsLabel}`}>
                                    Only in {theirUser}'s version:
                                  </Text>
                                  {table.sampleDiffs.onlyInTheirs.map((item, i) => (
                                    <div key={i} className={styles.sampleItem}>
                                      <span>•</span>
                                      <Text size={200}>{item}</Text>
                                    </div>
                                  ))}
                                  {table.sampleDiffs.onlyInTheirs.length === 3 && (
                                    <Text size={200} style={{ fontStyle: 'italic', color: tokens.colorNeutralForeground3 }}>
                                      ...and more
                                    </Text>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          
                          <RadioGroup
                            value={choices[table.table]}
                            onChange={(_, data) => handleChoiceChange(table.table, data.value as "mine" | "theirs")}
                            layout="horizontal"
                          >
                            <Radio value="mine" label="Keep mine" />
                            <Radio value="theirs" label="Use theirs" />
                          </RadioGroup>
                        </div>
                      ))}
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
            {tableDiffs.length > 0 && (
              <Button
                appearance="primary"
                icon={<Merge20Regular />}
                onClick={handleMerge}
                disabled={loading}
              >
                Merge & Save
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
