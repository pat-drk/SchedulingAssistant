import React from "react";
import {
  makeStyles,
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Text,
  Divider,
  Card,
  tokens,
  Input,
  Label,
} from "@fluentui/react-components";
import {
  Settings20Regular,
  CalendarLtr20Regular,
  CalendarMonth20Regular,
  DatabaseLightning20Regular,
  History20Regular,
} from "@fluentui/react-icons";
import SegmentEditor from "./SegmentEditor";
import DepartmentEventManager from "./DepartmentEventManager";
import SegmentAdjustmentEditor from "./SegmentAdjustmentEditor";
import GroupEditor from "./GroupEditor";
import RoleEditor from "./RoleEditor";
import ExportGroupEditor from "./ExportGroupEditor";
import type { SegmentRow } from "../services/segments";
import TimeOffManager from "./TimeOffManager";
import AvailabilityOverrideManager from "./AvailabilityOverrideManager";
import { AutoFillPrioritySettings } from "./AutoFillSettings";
import SkillsEditor from "./SkillsEditor";
import WeekCalculationSettings from "./WeekCalculationSettings";
import TimeOffThresholdSettings from "./TimeOffThresholdSettings";
import VersionHistory from "./VersionHistory";

const useAdminViewStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalXL,
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalXXL,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalL,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  card: {
    padding: tokens.spacingHorizontalL,
  },
  buttonRow: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
});

interface AdminViewProps {
  sqlDb: any;
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
  segments: SegmentRow[];
  groups: any[];
  onTimeOffThresholdChange?: (threshold: number) => void;
  dirHandle: FileSystemDirectoryHandle | null;
  currentFilename: string;
  onRestoreVersion: (filename: string) => void;
  onMergeVersion: (filename: string) => void;
  SQL: any;
}

export default function AdminView({ 
  sqlDb, all, run, refresh, segments, groups, onTimeOffThresholdChange,
  dirHandle, currentFilename, onRestoreVersion, onMergeVersion, SQL
}: AdminViewProps) {
  const s = useAdminViewStyles();
  const [showOverrides, setShowOverrides] = React.useState(false);
  const [showAutoFillPrioritySettings, setShowAutoFillPrioritySettings] = React.useState(false);
  const [showWeekCalcSettings, setShowWeekCalcSettings] = React.useState(false);
  const [showTimeOffThresholdSettings, setShowTimeOffThresholdSettings] = React.useState(false);
  const [showVersionHistory, setShowVersionHistory] = React.useState(false);
  
  return (
    <div className={s.root}>
      {/* Settings Section */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <Settings20Regular />
          <Text className={s.sectionTitle}>Settings</Text>
        </div>
        <Card className={s.card}>
          <div className={s.buttonRow}>
            <Button appearance="outline" onClick={() => setShowAutoFillPrioritySettings(true)}>
              Auto-Fill Priority
            </Button>
            <Button appearance="outline" onClick={() => setShowWeekCalcSettings(true)}>
              Week Calculation Settings
            </Button>
            <Button appearance="outline" onClick={() => setShowTimeOffThresholdSettings(true)}>
              Time-Off Threshold Settings
            </Button>
            <Button appearance="outline" icon={<History20Regular />} onClick={() => setShowVersionHistory(true)}>
              Version History
            </Button>
          </div>
        </Card>
      </div>

      <Divider />

      {/* Availability Section */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <CalendarLtr20Regular />
          <Text className={s.sectionTitle}>Availability</Text>
        </div>
        <Card className={s.card}>
          <div className={s.buttonRow}>
            <Button appearance="outline" onClick={() => setShowOverrides(true)}>
              Availability Overrides
            </Button>
          </div>
        </Card>
        <TimeOffManager all={all} run={run} refresh={refresh} />
      </div>

      <Divider />

      {/* Department Events Section */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <CalendarMonth20Regular />
          <Text className={s.sectionTitle}>Department Events</Text>
        </div>
        <DepartmentEventManager all={all} run={run} refresh={refresh} />
      </div>

      <Divider />

      {/* Data Configuration Section */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <DatabaseLightning20Regular />
          <Text className={s.sectionTitle}>Data Configuration</Text>
        </div>
        <SegmentEditor all={all} run={run} refresh={refresh} />
        <SegmentAdjustmentEditor all={all} run={run} refresh={refresh} segments={segments} db={sqlDb} />
        <GroupEditor all={all} run={run} refresh={refresh} />
        <RoleEditor all={all} run={run} refresh={refresh} segments={segments} />
        <ExportGroupEditor all={all} run={run} refresh={refresh} />
        <div>
          <Text weight="semibold" style={{ marginBottom: tokens.spacingVerticalS, display: "block" }}>
            Skills Catalog
          </Text>
          <SkillsEditor all={all} run={run} refresh={refresh} />
        </div>
      </div>

      {/* Dialogs */}
      {showOverrides && (
        <Dialog open onOpenChange={(_, d) => { if (!d.open) setShowOverrides(false); }}>
          <DialogSurface aria-describedby={undefined}>
            <DialogBody>
              <DialogTitle>Availability Overrides</DialogTitle>
              <DialogContent>
                <AvailabilityOverrideManager sqlDb={sqlDb} all={all} refresh={refresh} />
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setShowOverrides(false)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      
      {showAutoFillPrioritySettings && (
        <AutoFillPrioritySettings 
          open={showAutoFillPrioritySettings} 
          onClose={() => setShowAutoFillPrioritySettings(false)}
          all={all}
          run={run}
          groups={groups}
        />
      )}
      
      {showWeekCalcSettings && (
        <WeekCalculationSettings 
          open={showWeekCalcSettings} 
          onClose={() => setShowWeekCalcSettings(false)}
          all={all}
          run={run}
        />
      )}
      
      {showTimeOffThresholdSettings && (
        <TimeOffThresholdSettings 
          open={showTimeOffThresholdSettings} 
          onClose={() => setShowTimeOffThresholdSettings(false)}
          all={all}
          run={run}
          onThresholdChange={onTimeOffThresholdChange}
        />
      )}
      
      {showVersionHistory && (
        <VersionHistory
          open={showVersionHistory}
          onClose={() => setShowVersionHistory(false)}
          dirHandle={dirHandle}
          currentFilename={currentFilename}
          onRestore={onRestoreVersion}
          onMerge={onMergeVersion}
          SQL={SQL}
        />
      )}
    </div>
  );
}
