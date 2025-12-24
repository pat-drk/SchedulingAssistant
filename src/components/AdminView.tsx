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
} from "@fluentui/react-components";
import {
  Settings20Regular,
  CalendarLtr20Regular,
  DatabaseLightning20Regular,
} from "@fluentui/react-icons";
import SegmentEditor from "./SegmentEditor";
import SegmentAdjustmentEditor from "./SegmentAdjustmentEditor";
import GroupEditor from "./GroupEditor";
import RoleEditor from "./RoleEditor";
import ExportGroupEditor from "./ExportGroupEditor";
import type { SegmentRow } from "../services/segments";
import TimeOffManager from "./TimeOffManager";
import AvailabilityOverrideManager from "./AvailabilityOverrideManager";
import AutoFillSettings from "./AutoFillSettings";
import SkillsEditor from "./SkillsEditor";
import WeekCalculationSettings from "./WeekCalculationSettings";

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
}

export default function AdminView({ sqlDb, all, run, refresh, segments }: AdminViewProps) {
  const s = useAdminViewStyles();
  const [showOverrides, setShowOverrides] = React.useState(false);
  const [showAutoFillSettings, setShowAutoFillSettings] = React.useState(false);
  const [showWeekCalcSettings, setShowWeekCalcSettings] = React.useState(false);
  
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
            <Button appearance="outline" onClick={() => setShowAutoFillSettings(true)}>
              Auto-Fill Settings
            </Button>
            <Button appearance="outline" onClick={() => setShowWeekCalcSettings(true)}>
              Week Calculation Settings
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

      {/* Data Configuration Section */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <DatabaseLightning20Regular />
          <Text className={s.sectionTitle}>Data Configuration</Text>
        </div>
        <SegmentEditor all={all} run={run} refresh={refresh} />
        <SegmentAdjustmentEditor all={all} run={run} refresh={refresh} segments={segments} />
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
      
      {showAutoFillSettings && (
        <AutoFillSettings open={showAutoFillSettings} onClose={() => setShowAutoFillSettings(false)} />
      )}
      
      {showWeekCalcSettings && (
        <WeekCalculationSettings 
          open={showWeekCalcSettings} 
          onClose={() => setShowWeekCalcSettings(false)}
          all={all}
          run={run}
        />
      )}
    </div>
  );
}
