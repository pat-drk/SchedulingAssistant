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
} from "@fluentui/react-components";
import { Merge20Regular } from "@fluentui/react-icons";

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

const HIGH_CONFLICT_TABLES = [
  { name: "assignment", label: "Daily Assignments", description: "Who's assigned where each day" },
  { name: "timeoff", label: "Time Off", description: "Vacation and leave entries" },
  { name: "availability_override", label: "Availability Overrides", description: "Per-day availability changes" },
  { name: "monthly_default", label: "Monthly Defaults", description: "Default monthly assignments" },
  { name: "monthly_default_day", label: "Monthly Weekday Overrides", description: "Weekday-specific defaults" },
  { name: "monthly_default_week", label: "Monthly Week Overrides", description: "Week-specific defaults" },
];

const useStyles = makeStyles({
  tableSection: {
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tableName: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
  },
  counts: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalS,
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
  sameCount: {
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
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
  const [tableDiffs, setTableDiffs] = useState<Array<{
    table: string;
    label: string;
    myCount: number;
    theirCount: number;
    hasDifferences: boolean;
  }>>([]);
  const [choices, setChoices] = useState<Record<string, "mine" | "theirs">>({});

  useEffect(() => {
    if (open && myDb && theirDb) {
      analyzeDbDifferences();
    }
  }, [open, myDb, theirDb]);

  function analyzeDbDifferences() {
    setLoading(true);
    const diffs: typeof tableDiffs = [];
    const initialChoices: Record<string, "mine" | "theirs"> = {};

    for (const table of HIGH_CONFLICT_TABLES) {
      try {
        const myRows = myDb.exec(`SELECT COUNT(*) FROM ${table.name}`);
        const theirRows = theirDb.exec(`SELECT COUNT(*) FROM ${table.name}`);
        const myCount = (myRows[0]?.values[0]?.[0] as number) || 0;
        const theirCount = (theirRows[0]?.values[0]?.[0] as number) || 0;
        
        const hasDifferences = myCount !== theirCount;
        diffs.push({
          table: table.name,
          label: table.label,
          myCount,
          theirCount,
          hasDifferences,
        });
        
        // Default to keeping mine
        initialChoices[table.name] = "mine";
      } catch (e) {
        // Table might not exist in one of the databases
        console.warn(`[Merge] Could not compare table ${table.name}:`, e);
      }
    }

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

  const tablesWithDifferences = tableDiffs.filter((t) => t.hasDifferences);

  // Extract username from filename
  const theirUser = theirFilename.match(/schedule-[^-]+-[^-]+-([^.]+)\.db/)?.[1]?.replace(/-/g, ' ') || 'Other user';

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: "550px" }}>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
              <Merge20Regular />
              Merge Changes
            </div>
          </DialogTitle>
          <DialogContent>
            {loading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="medium" />
                <Text block style={{ marginTop: tokens.spacingVerticalM }}>
                  Analyzing differences...
                </Text>
              </div>
            ) : tablesWithDifferences.length === 0 ? (
              <div className={styles.noDifferences}>
                <Text block>No differences detected in high-conflict tables.</Text>
                <Text size={200} block style={{ marginTop: tokens.spacingVerticalS }}>
                  You can save without merging, or merge anyway if you want to pick specific data.
                </Text>
              </div>
            ) : (
              <>
                <Text block style={{ marginBottom: tokens.spacingVerticalM }}>
                  Choose which version to keep for tables with differences:
                </Text>
                {tablesWithDifferences.map((table) => (
                  <div key={table.table} className={styles.tableSection}>
                    <Text className={styles.tableName}>{table.label}</Text>
                    <Text className={styles.counts}>
                      Your version: {table.myCount} rows | {theirUser}: {table.theirCount} rows
                    </Text>
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
              </>
            )}

            {!loading && tablesWithDifferences.length > 0 && tableDiffs.filter(t => !t.hasDifferences).length > 0 && (
              <Text size={200} className={styles.sameCount} block style={{ marginTop: tokens.spacingVerticalM }}>
                Tables with same row counts (no action needed): {tableDiffs.filter(t => !t.hasDifferences).map(t => t.label).join(', ')}
              </Text>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={<Merge20Regular />}
              onClick={handleMerge}
              disabled={loading}
            >
              Merge & Save
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
