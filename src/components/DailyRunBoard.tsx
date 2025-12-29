import React, { useEffect, useState, useMemo, useCallback } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { Segment, SegmentRow } from "../services/segments";
import type { SegmentAdjustmentRow } from "../services/segmentAdjustments";
import { listSegmentAdjustmentConditions } from "../services/segmentAdjustments";
import { getEventsForDate, getAdjustedSegments, formatTime12h, type DepartmentEvent } from "../services/departmentEvents";
import "../styles/scrollbar.css";
import PersonName from "./PersonName";
import { getAutoFillPriority } from "./AutoFillSettings";
import { exportDailyScheduleXlsx } from "../excel/export-one-sheet";
import { getEffectiveMonth, getWeekOfMonth, type WeekStartMode } from "../utils/weekCalculation";
import { formatTime12h as formatTime12hWebhook } from "../services/teamsWebhook";
import {
  Button,
  Dropdown,
  Option,
  Tab,
  TabList,
  Input,
  tokens,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
  makeStyles,
  Badge,
  Card,
  CardHeader,
  Body1,
  Title3,
  Subtitle2,
  Tooltip,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  Text,
  Textarea,
} from "@fluentui/react-components";
import { Navigation20Regular, CalendarMonth20Regular } from "@fluentui/react-icons";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

const Grid = WidthProvider(GridLayout);
// Work around TS typing issues: cast WidthProvider result to any for JSX use
const GridWP: any = Grid;

// Map configured group themes to Fluent 2 palette tokens so tinted backgrounds
// adapt automatically in both light and dark modes.
const themeTokens: Record<string, { bg: string; fg: string }> = {
  Purple: {
    bg: tokens.colorPalettePurpleBackground2,
    fg: tokens.colorPalettePurpleForeground2,
  },
  Pink: {
    bg: tokens.colorPalettePinkBackground2,
    fg: tokens.colorPalettePinkForeground2,
  },
  DarkPink: {
    bg: tokens.colorPaletteMagentaBackground2,
    fg: tokens.colorPaletteMagentaForeground2,
  },
  DarkYellow: {
    bg: tokens.colorPaletteGoldBackground2,
    fg: tokens.colorPaletteGoldForeground2,
  },
  Green: {
    bg: tokens.colorPaletteGreenBackground2,
    fg: tokens.colorPaletteGreenForeground2,
  },
  DarkPurple: {
    bg: tokens.colorPaletteGrapeBackground2,
    fg: tokens.colorPaletteGrapeForeground2,
  },
  DarkGreen: {
    bg: tokens.colorPaletteDarkGreenBackground2,
    fg: tokens.colorPaletteDarkGreenForeground2,
  },
  DarkBlue: {
    bg: tokens.colorPaletteNavyBackground2,
    fg: tokens.colorPaletteNavyForeground2,
  },
};

const themeColors = (theme: string | null | undefined) => {
  if (!theme) return { bg: undefined, fg: undefined };
  const key = theme.replace(/^\d+\.\s*/, "");
  return themeTokens[key] || { bg: undefined, fg: undefined };
};

// Styles moved outside the component to avoid recreating style objects on each render
const useStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground2,
    minHeight: "100%",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingHorizontalL,
    ["@media (min-width: 1024px)"]: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacingHorizontalM,
    },
  },
  headerLeft: { 
    display: "flex", 
    alignItems: "center", 
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  headerCenter: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    ["@media (max-width: 1023px)"]: {
      justifyContent: "flex-start",
    },
  },
  headerRight: { 
    display: "flex", 
    flexWrap: "wrap", 
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    ["@media (min-width: 1024px)"]: {
      marginLeft: "auto",
    },
  },
  label: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
  },
  groupCard: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    boxShadow: tokens.shadow2,
    overflow: "visible",
    borderRadius: tokens.borderRadiusLarge,
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: tokens.spacingVerticalS,
  },
  rolesGrid: {
    flex: 1,
    display: "grid",
    gap: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingHorizontalS,
    overflow: "auto",
    minHeight: 0,
    // Better mobile scrolling
    "@media (max-width: 767px)": {
      gap: tokens.spacingHorizontalXXS,
      paddingLeft: tokens.spacingHorizontalXS,
      paddingRight: tokens.spacingHorizontalXS,
    },
  },
  roleCard: {
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    height: "100%", // Fill container height
    overflowY: "auto",
    overflowX: "hidden",
    // Mobile adjustments
    "@media (max-width: 767px)": {
      padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    },
  },
  roleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacingVerticalXS,
    flexShrink: 0,
  },
  roleName: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  roleCount: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightMedium,
  },
  assignmentsList: {
    listStyleType: "none",
    padding: 0,
    margin: 0,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    flex: 1,
    minHeight: 0,
  },
  assignmentItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    columnGap: tokens.spacingHorizontalS,
    flexShrink: 0,
    width: "100%", // Ensure item fills the available width
    fontSize: tokens.fontSizeBase200,
    transition: `background-color ${tokens.durationFast} ${tokens.curveEasyEase}`,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
  },
  assignmentName: {
    flex: 1,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  actionsRow: {
    display: "flex",
    columnGap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  movedBadge: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    color: tokens.colorPaletteYellowForeground2,
    fontSize: tokens.fontSizeBase100,
    padding: `0 ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusSmall,
    marginLeft: tokens.spacingHorizontalXS,
  },
});

// Component to display today's moves
function TodaysMovesList({ date, all, allRoles, people }: { date: string; all: (sql: string, params?: any[]) => any[]; allRoles: any[]; people: any[] }) {
  const moves = React.useMemo(() => {
    // Get moves from the last week for cleanup display, but focus on today
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoStr = `${oneWeekAgo.getFullYear()}-${String(oneWeekAgo.getMonth() + 1).padStart(2, '0')}-${String(oneWeekAgo.getDate()).padStart(2, '0')}`;
    
    return all(
      `SELECT cl.*, p.first_name, p.last_name 
       FROM change_log cl 
       JOIN person p ON p.id = cl.person_id 
       WHERE cl.date = ? AND cl.action = 'move'
       ORDER BY cl.created_at DESC`,
      [date]
    );
  }, [all, date]);
  
  const getRoleName = (roleId: number) => {
    const role = allRoles.find((r: any) => r.id === roleId);
    return role ? role.name : 'Unknown';
  };
  
  if (moves.length === 0) {
    return <Text>No moves recorded for this date.</Text>;
  }
  
  return (
    <Table size="small">
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Person</TableHeaderCell>
          <TableHeaderCell>From</TableHeaderCell>
          <TableHeaderCell>To</TableHeaderCell>
          <TableHeaderCell>Segment</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {moves.map((m: any) => (
          <TableRow key={m.id}>
            <TableCell>{m.first_name} {m.last_name}</TableCell>
            <TableCell>{getRoleName(m.from_role_id)}</TableCell>
            <TableCell>{getRoleName(m.to_role_id)}</TableCell>
            <TableCell>{m.segment}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface DailyRunBoardProps {
  activeRunSegment: Segment;
  setActiveRunSegment: (seg: Segment) => void;
  groups: any[];
  segments: SegmentRow[];
  lockEmail: string;
  sqlDb: any | null;
  all: (sql: string, params?: any[], db?: any) => any[];
  roleListForSegment: (segment: Segment) => any[];
  selectedDate: string;
  selectedDateObj: Date;
  setSelectedDate: (date: string) => void;
  fmtDateMDY: (d: Date) => string;
  parseYMD: (s: string) => Date;
  ymd: (d: Date) => string;
  setShowNeedsEditor: (v: boolean) => void;
  canEdit: boolean;
  peopleOptionsForSegment: (
    date: Date,
    segment: Segment,
    role: any
  ) => Array<{ id: number; label: string; blocked: boolean; trained: boolean; partialTimeOff?: boolean; overlapPercent?: number }>;
  getTimeOffOverlapInfo: (personId: number, date: Date, segment: Segment) => { hasOverlap: boolean; overlapPercent: number; overlapMinutes: number };
  getRequiredFor: (
    date: Date,
    groupId: number,
    roleId: number,
    segment: Segment
  ) => number;
  addAssignment: (
    dateMDY: string,
    personId: number,
    roleId: number,
    segment: Segment
  ) => void;
  deleteAssignment: (id: number) => void;
  segmentAdjustments: SegmentAdjustmentRow[];
  loadMonthlyDefaultsForMonth: (month: string) => {
    defaults: any[];
    overrides: any[];
    weekOverrides: any[];
  };
  people: any[];
  allRoles: any[];
  availabilityFor: (db: any, personId: number, date: Date) => string;
  isSegmentBlockedByTimeOff: (personId: number, date: Date, segment: Segment) => boolean;
  timeOffThreshold: number;
  weekdayName: (d: Date) => string;
  refreshCaches: () => void;
  setStatus: (msg: string) => void;
  run: (sql: string, params?: any[]) => void;
}

export default function DailyRunBoard({
  activeRunSegment,
  setActiveRunSegment,
  groups,
  segments,
  lockEmail,
  sqlDb,
  all,
  roleListForSegment,
  selectedDate,
  selectedDateObj,
  setSelectedDate,
  fmtDateMDY,
  parseYMD,
  ymd,
  setShowNeedsEditor,
  canEdit,
  peopleOptionsForSegment,
  getTimeOffOverlapInfo,
  getRequiredFor,
  addAssignment,
  deleteAssignment,
  segmentAdjustments,
  loadMonthlyDefaultsForMonth,
  people,
  allRoles,
  availabilityFor,
  isSegmentBlockedByTimeOff,
  timeOffThreshold,
  weekdayName,
  refreshCaches,
  setStatus,
  run,
}: DailyRunBoardProps) {
  // Height of each react-grid-layout row in pixels. Increase to make group cards taller.
  const RGL_ROW_HEIGHT = 110;
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const dialogs = useDialogs();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const s = useStyles();
  const seg: Segment = activeRunSegment;
  const [layout, setLayout] = useState<any[]>([]);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [moveContext, setMoveContext] = useState<{
    assignment: any;
    targets: Array<{ role: any; group: any; need: number; trained: boolean }>;
  } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<number | null>(null);
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [autoFillSuggestions, setAutoFillSuggestions] = useState<
    Array<{ role: any; group: any; candidates: Array<{ id: number; label: string }>; selected: number | null }>
  >([]);
  const [showMovesModal, setShowMovesModal] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [showTeamsDraft, setShowTeamsDraft] = useState(false);
  const [teamsDraftText, setTeamsDraftText] = useState('');

  const moveSelectedLabel = useMemo(() => {
    if (!moveContext || moveTargetId == null) return "";
    const target = moveContext.targets.find((t) => t.role.id === moveTargetId);
    if (!target) return "";
    const needSuffix = target.need > 0 ? ` (need ${target.need})` : "";
    const untrainedSuffix = !target.trained ? " (Untrained)" : "";
    return `${target.group.name} - ${target.role.name}${needSuffix}${untrainedSuffix}`;
  }, [moveContext, moveTargetId]);

  const roles = useMemo(() => roleListForSegment(seg), [roleListForSegment, seg]);

  useEffect(() => {
    setLayoutLoaded(false);
    const key = `layout:${seg}:${lockEmail || "default"}`;
    let saved: any[] = [];
    try {
      const rows = all(`SELECT value FROM meta WHERE key=?`, [key]);
      if (rows[0] && rows[0].value) saved = JSON.parse(String(rows[0].value));
    } catch {}
    const byId = new Map(saved.map((l: any) => [l.i, l]));
    const merged = groups.map((g: any, idx: number) => {
      const rolesForGroup = roles.filter((r) => r.group_id === g.id);
      const roleCount = rolesForGroup.length;
      // Base height estimates number of role rows across ~3 columns plus header
      const baseH = Math.max(2, Math.ceil(roleCount / 3)) + 1;
      // Estimate extra rows based on additional required people beyond 1 per role
      const extraNeededSum = rolesForGroup.reduce((sum, r) => {
        const req = getRequiredFor(selectedDateObj, g.id, r.id, seg);
        return sum + Math.max(0, req - 1);
      }, 0);
      const extraRows = Math.ceil(extraNeededSum / 3);
      const h = baseH + extraRows;
      return (
        byId.get(String(g.id)) || {
          i: String(g.id),
          x: (idx % 4) * 3,
          y: Math.floor(idx / 4) * h,
          w: 3,
          h,
        }
      );
    });
    setLayout(merged);
    setLayoutLoaded(true);
  }, [groups, lockEmail, seg, roles, all, getRequiredFor, selectedDateObj]);

  function handleLayoutChange(l: any[]) {
    setLayout(l);
    if (!layoutLoaded) return;
    const key = `layout:${seg}:${lockEmail || "default"}`;
    try {
      const stmt = sqlDb.prepare(`INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)`);
      stmt.bind([key, JSON.stringify(l)]);
      stmt.step();
      stmt.free();
    } catch {}
  }

  // Department events for the selected date
  const departmentEvents = useMemo((): DepartmentEvent[] => {
    if (!sqlDb) return [];
    return getEventsForDate(all, ymd(selectedDateObj));
  }, [all, ymd, selectedDateObj]);

  // Adjusted segments (accounts for department events carving out time)
  const adjustedSegments = useMemo(() => {
    return getAdjustedSegments(segments, departmentEvents);
  }, [segments, departmentEvents]);

  const assignedCountMap = useMemo(() => {
    const rows = all(
      `SELECT role_id, COUNT(*) as c FROM assignment WHERE date=? AND segment=? GROUP BY role_id`,
      [ymd(selectedDateObj), seg]
    );
    return new Map<number, number>(rows.map((r: any) => [r.role_id, r.c]));
  }, [all, selectedDateObj, seg, ymd]);

  const assignedIdSet = useMemo(
    () =>
      new Set(
        all(`SELECT person_id FROM assignment WHERE date=? AND segment=?`, [ymd(selectedDateObj), seg]).map(
          (r: any) => r.person_id
        )
      ),
    [all, selectedDateObj, seg, ymd]
  );
  // assignedIdSet was unused; removed to keep build warnings clean
  void assignedIdSet;

  // Track which person_id + role_id combinations were moved to for showing "Moved" badge
  const movedToMap = useMemo(() => {
    const moves = all(
      `SELECT person_id, to_role_id FROM change_log WHERE date=? AND segment=? AND action='move'`,
      [ymd(selectedDateObj), seg]
    );
    const map = new Map<string, boolean>();
    for (const m of moves) {
      map.set(`${m.person_id}:${m.to_role_id}`, true);
    }
    return map;
  }, [all, selectedDateObj, seg, ymd]);

  // Get all unassigned but available people for this segment
  const unassignedAvailable = useMemo(() => {
    const dayName = weekdayName(selectedDateObj);
    if (dayName === 'Weekend') return [];
    
    const availCol = `avail_${dayName.toLowerCase().slice(0, 3)}`;
    
    // Get all active people with their availability
    const allPeople = all(
      `SELECT id, first_name, last_name, ${availCol} as avail FROM person WHERE active = 1 ORDER BY last_name, first_name`
    );
    
    // Get people assigned in this segment
    const dateStr = ymd(selectedDateObj);
    const assignedPeople = new Set(
      all(`SELECT DISTINCT person_id FROM assignment WHERE date=? AND segment=?`, [dateStr, seg])
        .map((r: any) => r.person_id)
    );
    
    // Get availability overrides for this date
    const overrides = all(
      `SELECT person_id, avail FROM availability_override WHERE date=?`,
      [dateStr]
    );
    const overrideMap = new Map(overrides.map((o: any) => [o.person_id, o.avail]));
    
    // Get time-off info for the day
    const dayStart = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, 0, 0, 0, 0);
    const timeOffRows = all(
      `SELECT person_id FROM timeoff WHERE NOT (? >= end_ts OR ? <= start_ts)`,
      [dayStart.toISOString(), dayEnd.toISOString()]
    );
    const timeOffPersonIds = new Set(timeOffRows.map((r: any) => r.person_id));
    
    // Get recurring time-off (Flex Time) for this weekday
    const jsWeekday = selectedDateObj.getDay();
    const weekday = jsWeekday >= 1 && jsWeekday <= 5 ? jsWeekday - 1 : -1;
    if (weekday >= 0) {
      const recurringRows = all(
        `SELECT person_id FROM recurring_timeoff WHERE weekday=? AND active=1`,
        [weekday]
      );
      for (const r of recurringRows) {
        timeOffPersonIds.add(r.person_id);
      }
    }
    
    // Filter to available but unassigned
    return allPeople.filter((p: any) => {
      if (assignedPeople.has(p.id)) return false;
      
      // Check availability (override takes precedence)
      const avail = overrideMap.get(p.id) || p.avail || 'U';
      if (avail === 'U') return false;
      
      // Check segment compatibility
      if (seg === 'AM' || seg === 'Early') {
        return avail === 'AM' || avail === 'B';
      } else if (seg === 'PM') {
        return avail === 'PM' || avail === 'B';
      } else if (seg === 'Lunch') {
        return avail !== 'U';
      }
      return avail !== 'U';
    }).map((p: any) => ({
      ...p,
      hasTimeOff: timeOffPersonIds.has(p.id),
    }));
  }, [all, selectedDateObj, seg, ymd, weekdayName]);

  const groupMap = useMemo(() => new Map(groups.map((g: any) => [g.id, g])), [groups]);

  const deficitRoles = useMemo(() => {
    const deficits: Array<{ role: any; group: any }> = [];
    for (const r of roles) {
      const assigned = assignedCountMap.get(r.id) || 0;
      const req = getRequiredFor(selectedDateObj, r.group_id, r.id, seg);
      const missing = req - assigned;
      for (let i = 0; i < missing; i++) {
        deficits.push({ role: r, group: groupMap.get(r.group_id) });
      }
    }
    return deficits;
  }, [roles, assignedCountMap, getRequiredFor, selectedDateObj, seg, groupMap]);

  function handleAutoFill() {
    if (!deficitRoles.length) {
      dialogs.showAlert("No unmet needs for this segment. All roles are filled.", "No Unmet Needs");
      return;
    }

    const priority = getAutoFillPriority();
    const assignedCounts = new Map(assignedCountMap);
    const requiredByRole = new Map<number, number>();
    const rolesById = new Map<number, any>();
    for (const r of roles) {
      rolesById.set(r.id, r);
      requiredByRole.set(r.id, getRequiredFor(selectedDateObj, r.group_id, r.id, seg));
    }

    const assignments = all(
      `SELECT a.person_id, a.role_id, r.group_id, p.last_name, p.first_name
       FROM assignment a
       JOIN role r ON r.id=a.role_id
       JOIN person p ON p.id=a.person_id
       WHERE a.date=? AND a.segment=?`,
      [ymd(selectedDateObj), seg]
    ) as Array<{ person_id: number; role_id: number; group_id: number; last_name: string; first_name: string }>;
    const assignmentByPerson = new Map<number, { role_id: number; group_id: number; label: string }>();
    for (const a of assignments) {
      assignmentByPerson.set(a.person_id, {
        role_id: a.role_id,
        group_id: a.group_id,
        label: `${a.last_name}, ${a.first_name}`,
      });
    }

    const optionsByRole = new Map<number, Array<{ id: number; label: string; trained: boolean }>>();
    for (const r of roles) {
      let opts = peopleOptionsForSegment(selectedDateObj, seg, r).filter((o) => !assignmentByPerson.has(o.id));
      opts.sort((a, b) => {
        if (priority === "alphabetical") return a.label.localeCompare(b.label);
        if (a.trained !== b.trained) return a.trained ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      optionsByRole.set(r.id, opts);
    }

    // Map monthly default assignments for quick lookup
    const monthKey = `${selectedDateObj.getFullYear()}-${String(selectedDateObj.getMonth() + 1).padStart(2, "0")}`;
    const weekday = selectedDateObj.getDay() === 0 ? 7 : selectedDateObj.getDay(); // 1=Mon .. 7=Sun
    const defDayRows = all(
      `SELECT person_id, role_id FROM monthly_default_day WHERE month=? AND weekday=? AND segment=?`,
      [monthKey, weekday, seg]
    ) as Array<{ person_id: number; role_id: number }>;
    const defMonthRows = all(
      `SELECT person_id, role_id FROM monthly_default WHERE month=? AND segment=?`,
      [monthKey, seg]
    ) as Array<{ person_id: number; role_id: number }>;
    const defaultsDay = new Map<number, number[]>();
    for (const r of defDayRows) {
      let arr = defaultsDay.get(r.role_id);
      if (!arr) {
        arr = [];
        defaultsDay.set(r.role_id, arr);
      }
      arr.push(r.person_id);
    }
    const defaultsMonth = new Map<number, number[]>();
    for (const r of defMonthRows) {
      let arr = defaultsMonth.get(r.role_id);
      if (!arr) {
        arr = [];
        defaultsMonth.set(r.role_id, arr);
      }
      arr.push(r.person_id);
    }

    const trainedCache = new Map<number, Set<number>>();
    function trainedSetForRole(role: any) {
      let set = trainedCache.get(role.id);
      if (!set) {
        set = new Set<number>([
          ...all(`SELECT person_id FROM training WHERE role_id=? AND status='Qualified'`, [role.id]).map((r: any) => r.person_id),
          ...all(
            `SELECT DISTINCT person_id FROM monthly_default WHERE role_id=? AND segment=?
             UNION
             SELECT DISTINCT person_id FROM monthly_default_day WHERE role_id=? AND segment=?`,
            [role.id, seg, role.id, seg]
          ).map((r: any) => r.person_id),
        ]);
        trainedCache.set(role.id, set);
      }
      return set;
    }

    const used = new Set<number>();
    const queue = deficitRoles.slice();
    const suggestions: Array<{ role: any; group: any; candidates: any[]; selected: number | null }> = [];

    function findCandidate(
      targetRole: any,
      targetGroupId: number,
      mode: "same" | "other" | "any",
      training: "trained" | "untrained" | "any",
      overstaffed: boolean,
      replaceable: boolean
    ) {
      const trainedTarget = trainedSetForRole(targetRole);
      for (const [pid, info] of assignmentByPerson.entries()) {
        if (used.has(pid)) continue;
        const rinfo = rolesById.get(info.role_id)!;
        if (mode === "same" && rinfo.group_id !== targetGroupId) continue;
        if (mode === "other" && rinfo.group_id === targetGroupId) continue;
        if (info.role_id === targetRole.id) continue;
        if (overstaffed) {
          const req = requiredByRole.get(rinfo.id) || 0;
          if ((assignedCounts.get(rinfo.id) || 0) <= req) continue;
        }
        if (replaceable) {
          const optsForSrc = optionsByRole
            .get(rinfo.id)
            ?.filter((o) => o.trained && !assignmentByPerson.has(o.id) && !used.has(o.id));
          if (!optsForSrc || optsForSrc.length === 0) continue;
        }
        const isTrained = trainedTarget.has(pid);
        if (training === "trained" && !isTrained) continue;
        if (training === "untrained" && isTrained) continue;
        return { person_id: pid, role_id: info.role_id, label: info.label, group_id: rinfo.group_id };
      }
      return null;
    }

    while (queue.length) {
      const { role, group } = queue.shift()!;
      let selected: number | null = null;
      let candidates: Array<{ id: number; label: string }> = [];
      // Step -1: check monthly defaults for this role
      const defIds = [
        ...(defaultsDay.get(role.id) || []),
        ...(defaultsMonth.get(role.id) || []),
      ];
      for (const pid of defIds) {
        if (selected != null) break;
        if (used.has(pid)) continue;
        if (assignmentByPerson.has(pid)) continue;
        const opt = (optionsByRole.get(role.id) || []).find((o) => o.id === pid && !used.has(o.id));
        if (opt) {
          selected = pid;
          candidates = [{ id: pid, label: opt.label }];
          used.add(pid);
          assignmentByPerson.set(pid, { role_id: role.id, group_id: group.id, label: opt.label });
          assignedCounts.set(role.id, (assignedCounts.get(role.id) || 0) + 1);
        }
      }

      // Special rule: promote assistants when coordinator/supervisor is missing
      if (selected == null && /Coordinator|Supervisor/i.test(role.name)) {
        const trainedTarget = trainedSetForRole(role);
        let trainedPromoted: { person_id: number; role_id: number; label: string } | null = null;
        let untrainedPromoted: { person_id: number; role_id: number; label: string } | null = null;
        for (const [pid, info] of assignmentByPerson.entries()) {
          if (used.has(pid)) continue;
          if (info.group_id !== group.id) continue;
          const srcRole = rolesById.get(info.role_id)!;
          if (!/Assistant/i.test(srcRole.name)) continue;
          const candidate = { person_id: pid, role_id: info.role_id, label: info.label };
          if (trainedTarget.has(pid)) {
            if (!trainedPromoted) trainedPromoted = candidate;
          } else if (!untrainedPromoted) {
            untrainedPromoted = candidate;
          }
        }
        const promoted = trainedPromoted || untrainedPromoted;
        if (promoted) {
          selected = promoted.person_id;
          candidates = [{ id: promoted.person_id, label: promoted.label }];
          used.add(selected);
          const fromCount = (assignedCounts.get(promoted.role_id) || 0) - 1;
          assignedCounts.set(promoted.role_id, fromCount);
          const reqFrom = requiredByRole.get(promoted.role_id) || 0;
          if (fromCount < reqFrom) {
            const fromRole = rolesById.get(promoted.role_id)!;
            const fromGroup = groupMap.get(fromRole.group_id)!;
            queue.push({ role: fromRole, group: fromGroup });
          }
          assignmentByPerson.set(selected, { role_id: role.id, group_id: group.id, label: promoted.label });
          assignedCounts.set(role.id, (assignedCounts.get(role.id) || 0) + 1);
        }
      }

      if (selected == null) {
        const opts = (optionsByRole.get(role.id) || []).filter((o) => !used.has(o.id));
        candidates = opts;
        const trainedOpts = opts.filter((o) => o.trained);

        if (trainedOpts.length > 0) {
          // Step 0: use any available trained members
          selected = trainedOpts[0].id;
          used.add(selected);
          assignmentByPerson.set(selected, { role_id: role.id, group_id: group.id, label: trainedOpts[0].label });
          assignedCounts.set(role.id, (assignedCounts.get(role.id) || 0) + 1);
        } else {
          // Steps 1-8
          let moved =
            findCandidate(role, group.id, "same", "trained", true, false) || // Step 1
            findCandidate(role, group.id, "other", "trained", true, false) || // Step 2
            findCandidate(role, group.id, "same", "trained", false, true) || // Step 3
            findCandidate(role, group.id, "other", "trained", false, true) || // Step 5
            findCandidate(role, group.id, "same", "untrained", true, false) || // Step 7
            findCandidate(role, group.id, "other", "untrained", true, false); // Step 8

          if (moved) {
            selected = moved.person_id;
            candidates = [{ id: moved.person_id, label: moved.label }];
            used.add(selected);
            const fromCount = (assignedCounts.get(moved.role_id) || 0) - 1;
            assignedCounts.set(moved.role_id, fromCount);
            const reqFrom = requiredByRole.get(moved.role_id) || 0;
            if (fromCount < reqFrom) {
              const fromRole = rolesById.get(moved.role_id)!;
              const fromGroup = groupMap.get(fromRole.group_id)!;
              queue.push({ role: fromRole, group: fromGroup });
            }
            assignmentByPerson.set(selected, { role_id: role.id, group_id: group.id, label: moved.label });
            assignedCounts.set(role.id, (assignedCounts.get(role.id) || 0) + 1);
          }
        }
      }

      suggestions.push({ role, group, candidates: candidates.map((c) => ({ id: c.id, label: c.label })), selected });
    }

    setAutoFillSuggestions(suggestions);
    setAutoFillOpen(true);
  }

  function applyAutoFill() {
    for (const s of autoFillSuggestions) {
      if (s.selected != null) addAssignment(selectedDate, s.selected, s.role.id, seg);
    }
    setAutoFillOpen(false);
  }

  function cancelAutoFill() {
    setAutoFillOpen(false);
  }

  async function handleCopyDefaults() {
    if (!sqlDb) {
      dialogs.showAlert("No database connection available.", "Database Error");
      return;
    }

    try {
      // Load week_start_mode setting from meta table
      let weekStartMode: WeekStartMode = 'first_monday';
      try {
        const modeRows = all(`SELECT value FROM meta WHERE key='week_start_mode'`);
        if (modeRows.length > 0 && modeRows[0].value) {
          const modeValue = modeRows[0].value;
          if (modeValue === 'first_monday' || modeValue === 'first_day') {
            weekStartMode = modeValue;
          }
        }
      } catch (e) {
        console.error('Failed to load week_start_mode:', e);
      }

      // Get the effective month for the selected date
      const effectiveMonth = getEffectiveMonth(selectedDateObj, weekStartMode);
      
      // Load monthly defaults for the effective month
      const { defaults, overrides, weekOverrides } = loadMonthlyDefaultsForMonth(effectiveMonth);
      
      if (defaults.length === 0 && overrides.length === 0 && weekOverrides.length === 0) {
        dialogs.showAlert(
          `No monthly defaults found for ${effectiveMonth}. Please set up monthly defaults first.`,
          "No Defaults Found"
        );
        return;
      }

      // Build maps for quick lookup
      const defaultMap = new Map<string, number>();
      for (const def of defaults) {
        defaultMap.set(`${def.person_id}|${def.segment}`, def.role_id);
      }
      const overrideMap = new Map<string, number>();
      for (const ov of overrides) {
        overrideMap.set(`${ov.person_id}|${ov.weekday}|${ov.segment}`, ov.role_id);
      }
      const weekOverrideMap = new Map<string, number>();
      for (const wov of weekOverrides) {
        weekOverrideMap.set(`${wov.person_id}|${wov.week_number}|${wov.segment}`, wov.role_id);
      }

      // Calculate week number and weekday for the selected date
      const weekNum = getWeekOfMonth(selectedDateObj, weekStartMode);
      const wdNum = selectedDateObj.getDay(); // 0=Sun, 1=Mon, etc.
      const wdName = weekdayName(selectedDateObj);
      
      if (wdName === 'Weekend') {
        dialogs.showAlert("Cannot copy defaults for weekend dates.", "Invalid Date");
        return;
      }

      // Collect assignments to be created
      const assignmentsToCreate: Array<{ personId: number; roleId: number; segment: Segment; personName: string }> = [];
      
      for (const person of people) {
        for (const segmentRow of segments) {
          const seg = segmentRow.name as Segment;
          
          // Priority: week override > weekday override > default
          let roleId = weekNum > 0 ? weekOverrideMap.get(`${person.id}|${weekNum}|${seg}`) : undefined;
          if (roleId === undefined) roleId = overrideMap.get(`${person.id}|${wdNum}|${seg}`);
          if (roleId === undefined) roleId = defaultMap.get(`${person.id}|${seg}`);
          if (roleId == null) continue;
          
          // Check availability
          const avail = availabilityFor(sqlDb, person.id, selectedDateObj);
          let ok = false;
          if (seg === 'AM' || seg === 'Early') ok = avail === 'AM' || avail === 'B';
          else if (seg === 'PM') ok = avail === 'PM' || avail === 'B';
          else if (seg === 'Lunch') ok = avail === 'AM' || avail === 'PM' || avail === 'B';
          else ok = avail === 'AM' || avail === 'PM' || avail === 'B';
          if (!ok) continue;
          
          // Check time-off blocking (uses configurable threshold - blocks only if overlap >= threshold%)
          if (isSegmentBlockedByTimeOff(person.id, selectedDateObj, seg)) continue;
          
          // Check if already assigned
          const dateStr = ymd(selectedDateObj);
          const existing = all(
            `SELECT role_id FROM assignment WHERE date=? AND person_id=? AND segment=?`,
            [dateStr, person.id, seg]
          );
          if (existing.length > 0) continue; // Skip if already assigned
          
          assignmentsToCreate.push({
            personId: person.id,
            roleId,
            segment: seg,
            personName: `${person.last_name}, ${person.first_name}`,
          });
        }
      }

      if (assignmentsToCreate.length === 0) {
        dialogs.showAlert(
          "No new assignments to create. All defaults are either already assigned or blocked by availability/time-off.",
          "No Changes Needed"
        );
        return;
      }

      // Show confirmation dialog
      const confirmed = await dialogs.showConfirm(
        `Apply ${assignmentsToCreate.length} assignment(s) from monthly defaults for ${effectiveMonth} to ${fmtDateMDY(selectedDateObj)}?`,
        "Confirm Copy Defaults"
      );

      if (!confirmed) return;

      // Apply the assignments
      for (const assign of assignmentsToCreate) {
        const dateStr = ymd(selectedDateObj);
        run(
          `INSERT OR REPLACE INTO assignment (date, person_id, role_id, segment) VALUES (?,?,?,?)`,
          [dateStr, assign.personId, assign.roleId, assign.segment]
        );
      }

      refreshCaches();
      setStatus(`Applied ${assignmentsToCreate.length} assignment(s) from monthly defaults.`);
    } catch (error) {
      dialogs.showAlert(
        `Failed to copy defaults: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "Copy Defaults Error"
      );
    }
  }

  async function handleExportDaily() {
    try {
      await exportDailyScheduleXlsx(ymd(selectedDateObj));
    } catch (error) {
      dialogs.showAlert(
        `Failed to export schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "Export Error"
      );
    }
  }

  function handleSendToTeams() {
    // Get assignments for current segment only
    const dateStr = ymd(selectedDateObj);
    const assigns = all(
      `SELECT a.id, a.segment, a.role_id, a.person_id, p.first_name, p.last_name, r.name as role_name, g.name as group_name
       FROM assignment a
       JOIN person p ON p.id = a.person_id
       JOIN role r ON r.id = a.role_id
       JOIN grp g ON g.id = r.group_id
       WHERE a.date = ? AND a.segment = ?
       ORDER BY g.name, r.name, p.last_name, p.first_name`,
      [dateStr, seg]
    );
    
    if (assigns.length === 0) {
      dialogs.showAlert("No assignments found for this segment.", "No Data");
      return;
    }
    
    // Format date for display
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
    const dayNum = dateObj.getDate();
    
    // Group assignments by group and role, sorted by role
    // Store person info including their individual start time
    interface PersonEntry {
      name: string;
      startTime: string;
    }
    const byGroupRole = new Map<string, Map<string, PersonEntry[]>>();
    for (const a of assigns) {
      let groupMap = byGroupRole.get(a.group_name);
      if (!groupMap) {
        groupMap = new Map<string, PersonEntry[]>();
        byGroupRole.set(a.group_name, groupMap);
      }
      let roleList = groupMap.get(a.role_name);
      if (!roleList) {
        roleList = [];
        groupMap.set(a.role_name, roleList);
      }
      // Get individual start time for this person
      const personSegTimes = getSegTimesForPersonTop(a.person_id);
      const segStart = personSegTimes[seg]?.start || segTimesTop[seg]?.start;
      const startTimeStr = segStart 
        ? formatTime12hWebhook(`${segStart.getHours().toString().padStart(2, '0')}:${segStart.getMinutes().toString().padStart(2, '0')}`)
        : '';
      
      roleList.push({
        name: `@${a.first_name} ${a.last_name}`,
        startTime: startTimeStr,
      });
    }
    
    // Build the draft text, sorted by role within each group
    let draft = `📅 **${dayName}, ${monthName} ${dayNum}** — ${seg}\n\n`;
    
    for (const [groupName, roleMap] of byGroupRole) {
      draft += `**${groupName}**\n`;
      // Sort roles alphabetically within group
      const sortedRoles = Array.from(roleMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [roleName, people] of sortedRoles) {
        // Simplify role label
        const roleLabel = roleName === groupName ? '' : (roleName.startsWith(groupName + ' ') ? roleName.slice(groupName.length + 1) : roleName);
        const rolePrefix = roleLabel ? `${roleLabel}: ` : '';
        // Format each person with their individual start time
        const peopleFormatted = people.map(p => `${p.name} (${p.startTime})`).join(', ');
        draft += `• ${rolePrefix}${peopleFormatted}\n`;
      }
      draft += '\n';
    }
    
    draft += `_Total: ${assigns.length} assignments_`;
    
    setTeamsDraftText(draft);
    setShowTeamsDraft(true);
  }
  
  async function handleCopyTeamsDraft() {
    try {
      await navigator.clipboard.writeText(teamsDraftText);
      dialogs.showAlert('Copied to clipboard!', 'Success');
    } catch (err) {
      dialogs.showAlert('Failed to copy. Please select and copy manually.', 'Error');
    }
  }

  // Base segment times for the selected date (without per-person adjustments)
  // Per-person adjustments are calculated in RoleCard for accurate time-off overlap
  const segTimesTop = useMemo(() => {
    const day = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());
    const mk = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
    };
    const map: Record<string, { start: Date; end: Date }> = {};
    for (const srow of segments) {
      map[srow.name] = { start: mk(srow.start_time), end: mk(srow.end_time) };
    }
    return map;
  }, [segments, selectedDateObj]);

  // Get all assignments for this date grouped by person
  const personAssignmentsTop = useMemo(() => {
    const rows = all(
      `SELECT person_id, segment, role_id FROM assignment WHERE date=?`,
      [ymd(selectedDateObj)]
    ) as { person_id: number; segment: string; role_id: number }[];
    
    const byPerson = new Map<number, Map<string, Set<number>>>();
    for (const r of rows) {
      let personMap = byPerson.get(r.person_id);
      if (!personMap) {
        personMap = new Map<string, Set<number>>();
        byPerson.set(r.person_id, personMap);
      }
      let roleSet = personMap.get(r.segment);
      if (!roleSet) {
        roleSet = new Set<number>();
        personMap.set(r.segment, roleSet);
      }
      roleSet.add(r.role_id);
    }
    return byPerson;
  }, [all, ymd, selectedDateObj]);

  // Calculate segment times for a specific person (applies adjustments based on THEIR assignments)
  const getSegTimesForPersonTop = useCallback((personId: number): Record<string, { start: Date; end: Date }> => {
    const map: Record<string, { start: Date; end: Date }> = {};
    for (const [segName, times] of Object.entries(segTimesTop)) {
      map[segName] = { start: new Date(times.start), end: new Date(times.end) };
    }

    const segRoleMap = personAssignmentsTop.get(personId);
    if (!segRoleMap) return map;

    const checkAdjustmentConditions = (adj: SegmentAdjustmentRow): boolean => {
      try {
        const conditions = listSegmentAdjustmentConditions(sqlDb, adj.id);
        if (conditions.length === 0) {
          const roles = segRoleMap.get(adj.condition_segment);
          if (!roles) return false;
          if (adj.condition_role_id != null && !roles.has(adj.condition_role_id)) return false;
          return true;
        }
        const logicOp = adj.logic_operator || 'AND';
        if (logicOp === 'AND') {
          return conditions.every(cond => {
            const roles = segRoleMap.get(cond.condition_segment);
            if (!roles) return false;
            if (cond.condition_role_id != null && !roles.has(cond.condition_role_id)) return false;
            return true;
          });
        } else {
          return conditions.some(cond => {
            const roles = segRoleMap.get(cond.condition_segment);
            if (!roles) return false;
            if (cond.condition_role_id != null && !roles.has(cond.condition_role_id)) return false;
            return true;
          });
        }
      } catch (e) {
        const roles = segRoleMap.get(adj.condition_segment);
        if (!roles) return false;
        if (adj.condition_role_id != null && !roles.has(adj.condition_role_id)) return false;
        return true;
      }
    };

    const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60000);
    for (const adj of segmentAdjustments) {
      if (!checkAdjustmentConditions(adj)) continue;
      const target = map[adj.target_segment];
      if (!target) continue;
      const cond = map[adj.condition_segment];
      let base: Date | undefined;
      switch (adj.baseline) {
        case 'condition.start': base = cond?.start; break;
        case 'condition.end': base = cond?.end; break;
        case 'target.start': base = target.start; break;
        case 'target.end': base = target.end; break;
      }
      if (!base) continue;
      (target as any)[adj.target_field] = addMinutes(base, adj.offset_minutes);
    }
    return map;
  }, [segTimesTop, personAssignmentsTop, segmentAdjustments, sqlDb]);

  const segDurationMinutesTop = useMemo(() => {
    const st = segTimesTop[seg]?.start;
    const en = segTimesTop[seg]?.end;
    if (!st || !en || seg === "Early") return 0;
    return Math.max(0, Math.round((en.getTime() - st.getTime()) / 60000));
  }, [segTimesTop, seg]);
  // segDurationMinutesTop is currently unused; keep code simple by ignoring to satisfy linter
  void segDurationMinutesTop;

  // Compute effective assigned counts per role (exclude heavy time-off overlaps)
  // Uses per-person segment times based on their individual assignments
  const assignedEffectiveCountMap = useMemo(() => {
    const map = new Map<number, number>();
    const baseSt = segTimesTop[seg]?.start;
    const baseEn = segTimesTop[seg]?.end;
    if (!baseSt || !baseEn || seg === "Early") {
      // Fallback to raw counts
      for (const r of roles) map.set(r.id, assignedCountMap.get(r.id) || 0);
      return map;
    }
    
    const dayStart = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, 0, 0, 0, 0);
    const timeOff = all(
      `SELECT person_id, start_ts, end_ts FROM timeoff WHERE NOT (? >= end_ts OR ? <= start_ts)`,
      [dayStart.toISOString(), dayEnd.toISOString()]
    ) as any[];
    
    // Also fetch recurring_timeoff (Flex Time) entries for this day
    // Convert Date's getDay() (0=Sun..6=Sat) to our weekday (0=Mon..4=Fri)
    const jsWeekday = selectedDateObj.getDay();
    const weekday = jsWeekday >= 1 && jsWeekday <= 5 ? jsWeekday - 1 : -1;
    
    // Group time-off entries by person (using Date objects for easier calculation)
    const timeOffByPerson = new Map<number, { start: Date; end: Date }[]>();
    
    for (const t of timeOff) {
      const entries = timeOffByPerson.get(t.person_id) || [];
      entries.push({ start: new Date(t.start_ts), end: new Date(t.end_ts) });
      timeOffByPerson.set(t.person_id, entries);
    }
    
    // Add recurring_timeoff entries for weekdays (Mon-Fri)
    if (weekday >= 0) {
      const recurringRows = all(
        `SELECT person_id, start_time, end_time FROM recurring_timeoff WHERE weekday=? AND active=1`,
        [weekday]
      ) as any[];
      for (const r of recurringRows) {
        const [startH, startM] = (r.start_time as string).split(':').map(Number);
        const [endH, endM] = (r.end_time as string).split(':').map(Number);
        const entries = timeOffByPerson.get(r.person_id) || [];
        entries.push({
          start: new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), startH, startM, 0, 0),
          end: new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), endH, endM, 0, 0),
        });
        timeOffByPerson.set(r.person_id, entries);
      }
    }
    
    const assigns = all(`SELECT person_id, role_id FROM assignment WHERE date=? AND segment=?`, [ymd(selectedDateObj), seg]) as any[];
    for (const r of roles) map.set(r.id, 0);
    
    for (const a of assigns) {
      // Get this person's adjusted segment times
      const personSegTimes = getSegTimesForPersonTop(a.person_id);
      const st = personSegTimes[seg]?.start || baseSt;
      const en = personSegTimes[seg]?.end || baseEn;
      const segStart = st.getTime();
      const segEnd = en.getTime();
      const segDuration = segEnd - segStart;
      // Use configurable threshold instead of hardcoded 50%
      const thresholdMs = Math.ceil(segDuration * (timeOffThreshold / 100));
      
      // Calculate overlap for this person
      const personTimeOff = timeOffByPerson.get(a.person_id) || [];
      let ovl = 0;
      for (const t of personTimeOff) {
        const s = t.start.getTime();
        const e = t.end.getTime();
        ovl += Math.max(0, Math.min(e, segEnd) - Math.max(s, segStart));
      }
      
      const heavy = ovl >= thresholdMs;
      if (heavy) continue;
      map.set(a.role_id, (map.get(a.role_id) || 0) + 1);
    }
    return map;
  }, [all, roles, seg, segTimesTop, selectedDateObj, ymd, assignedCountMap, getSegTimesForPersonTop, timeOffThreshold]);

  const GroupCard = React.memo(function GroupCard({ group, isDraggable }: { group: any; isDraggable: boolean }) {
    const rolesForGroup = roles.filter((r) => r.group_id === group.id);
    
    // Calculate total filled and total required for the group
    // Use effectiveCount which accounts for time-off overlaps
    let totalFilled = 0;
    let totalRequired = 0;
    for (const r of rolesForGroup) {
      const effectiveCount = assignedEffectiveCountMap.get(r.id) || 0;
      const req = getRequiredFor(selectedDateObj, group.id, r.id, seg);
      totalFilled += effectiveCount;
      totalRequired += req;
    }
    
    const groupNeedsMet = rolesForGroup.every((r: any) => {
      const effectiveCount = assignedEffectiveCountMap.get(r.id) || 0;
      const req = getRequiredFor(selectedDateObj, group.id, r.id, seg);
      return effectiveCount >= req;
    });
    // Use more subtle accent colors
    const groupAccent = groupNeedsMet
      ? tokens.colorPaletteGreenBackground2
      : tokens.colorPaletteRedBackground2;
    const { bg: groupBg, fg: groupFg } = themeColors(group.theme);
    return (
      <Card
        className={s.groupCard}
        style={{
          borderTopWidth: "3px",
          borderTopStyle: "solid",
          borderTopColor: groupAccent,
          backgroundColor: groupBg,
          color: groupFg,
        }}
      >
        <CardHeader
          className={isDraggable ? "drag-handle" : ""}
          header={
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, width: "100%", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                {isDraggable && (
                  <div 
                    style={{ 
                      cursor: "grab",
                      color: tokens.colorNeutralForeground3,
                      display: "flex",
                      alignItems: "center",
                    }}
                    aria-label="Drag to reposition group"
                  >
                    <Navigation20Regular />
                  </div>
                )}
                <Title3>{group.name}</Title3>
              </div>
              <Badge
                appearance="tint"
                color={groupNeedsMet ? "success" : "danger"}
                style={{ marginLeft: "auto", flexShrink: 0 }}
              >
                {totalFilled}/{totalRequired}
              </Badge>
            </div>
          }
        />
        <div
          className={s.rolesGrid}
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            ["--scrollbar-thumb" as any]: tokens.colorNeutralStroke1,
          }}
        >
          {rolesForGroup.map((r: any) => (
            <RoleCard key={r.id} group={group} role={r} />
          ))}
        </div>
      </Card>
    );
  });

  const RoleCard = React.memo(function RoleCard({ group, role }: { group: any; role: any }) {
    const assigns = useMemo(
      () =>
        all(
          `SELECT a.id, p.first_name, p.last_name, p.id as person_id FROM assignment a JOIN person p ON p.id=a.person_id WHERE a.date=? AND a.role_id=? AND a.segment=? ORDER BY p.last_name,p.first_name`,
          [ymd(selectedDateObj), role.id, seg]
        ),
      [all, selectedDateObj, role.id, seg, ymd]
    );

    const trainedBefore = useMemo(() => {
      const qualified = all(
        `SELECT person_id FROM training WHERE role_id=? AND status='Qualified'`,
        [role.id]
      ).map((r: any) => r.person_id);
      // Treat monthly assignment history as implicit qualification for this role/segment
      const monthly = all(
        `SELECT DISTINCT person_id FROM monthly_default WHERE role_id=? AND segment=?
         UNION
         SELECT DISTINCT person_id FROM monthly_default_day WHERE role_id=? AND segment=?`,
        [role.id, seg, role.id, seg]
      ).map((r: any) => r.person_id);
      return new Set<number>([...qualified, ...monthly]);
    }, [all, role.id, seg]);

    const opts = useMemo(
      () => peopleOptionsForSegment(selectedDateObj, seg, role),
      [peopleOptionsForSegment, selectedDateObj, seg, role]
    );

    const sortedOpts = useMemo(() => {
      const normalize = (s: string) => s.replace(/\s*\(Untrained\)$/i, "");
      const arr = [...opts];
      arr.sort((a, b) => {
        const ta = trainedBefore.has(a.id) ? 1 : 0;
        const tb = trainedBefore.has(b.id) ? 1 : 0;
        if (ta !== tb) return tb - ta; // trained first
        return normalize(a.label).localeCompare(normalize(b.label));
      });
      return arr;
    }, [opts, trainedBefore]);

    // Base segment times (without per-person adjustments)
    const baseSegTimes = useMemo(() => {
      const day = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());
      const mk = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
      };
      const map: Record<string, { start: Date; end: Date }> = {};
      for (const srow of segments) {
        map[srow.name] = { start: mk(srow.start_time), end: mk(srow.end_time) };
      }
      return map;
    }, [segments, selectedDateObj]);

    // Get assignments for a specific person on this date
    const personAssignments = useMemo(() => {
      const rows = all(
        `SELECT person_id, segment, role_id FROM assignment WHERE date=?`,
        [ymd(selectedDateObj)]
      ) as { person_id: number; segment: string; role_id: number }[];
      
      // Group by person_id -> Map<segment, Set<role_id>>
      const byPerson = new Map<number, Map<string, Set<number>>>();
      for (const r of rows) {
        let personMap = byPerson.get(r.person_id);
        if (!personMap) {
          personMap = new Map<string, Set<number>>();
          byPerson.set(r.person_id, personMap);
        }
        let roleSet = personMap.get(r.segment);
        if (!roleSet) {
          roleSet = new Set<number>();
          personMap.set(r.segment, roleSet);
        }
        roleSet.add(r.role_id);
      }
      return byPerson;
    }, [all, ymd, selectedDateObj]);

    // Calculate segment times for a specific person (applies adjustments based on THEIR assignments)
    const getSegTimesForPerson = useCallback((personId: number): Record<string, { start: Date; end: Date }> => {
      // Start with a deep copy of base times
      const map: Record<string, { start: Date; end: Date }> = {};
      for (const [segName, times] of Object.entries(baseSegTimes)) {
        map[segName] = { start: new Date(times.start), end: new Date(times.end) };
      }

      // Get this person's assignments (segment -> role_id set)
      const segRoleMap = personAssignments.get(personId);
      if (!segRoleMap) return map; // No assignments, return base times

      // Helper function to check if adjustment conditions are met FOR THIS PERSON
      const checkAdjustmentConditions = (adj: SegmentAdjustmentRow): boolean => {
        try {
          const conditions = listSegmentAdjustmentConditions(sqlDb, adj.id);
          
          // If no conditions in new table, fall back to old format
          if (conditions.length === 0) {
            const roles = segRoleMap.get(adj.condition_segment);
            if (!roles) return false;
            if (adj.condition_role_id != null && !roles.has(adj.condition_role_id)) return false;
            return true;
          }
          
          // Check multiple conditions with AND/OR logic
          const logicOp = adj.logic_operator || 'AND';
          
          if (logicOp === 'AND') {
            return conditions.every(cond => {
              const roles = segRoleMap.get(cond.condition_segment);
              if (!roles) return false;
              if (cond.condition_role_id != null && !roles.has(cond.condition_role_id)) return false;
              return true;
            });
          } else {
            return conditions.some(cond => {
              const roles = segRoleMap.get(cond.condition_segment);
              if (!roles) return false;
              if (cond.condition_role_id != null && !roles.has(cond.condition_role_id)) return false;
              return true;
            });
          }
        } catch (e) {
          const roles = segRoleMap.get(adj.condition_segment);
          if (!roles) return false;
          if (adj.condition_role_id != null && !roles.has(adj.condition_role_id)) return false;
          return true;
        }
      };

      const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60000);
      for (const adj of segmentAdjustments) {
        if (!checkAdjustmentConditions(adj)) continue;
        
        const target = map[adj.target_segment];
        if (!target) continue;
        
        const cond = map[adj.condition_segment];
        let base: Date | undefined;
        switch (adj.baseline) {
          case 'condition.start': base = cond?.start; break;
          case 'condition.end': base = cond?.end; break;
          case 'target.start': base = target.start; break;
          case 'target.end': base = target.end; break;
        }
        if (!base) continue;
        (target as any)[adj.target_field] = addMinutes(base, adj.offset_minutes);
      }
      return map;
    }, [baseSegTimes, personAssignments, segmentAdjustments, sqlDb]);

    // For backward compatibility, keep a global segTimes for segment duration display
    // (uses base times without per-person adjustments)
    const segTimes = baseSegTimes;

    // Compute time-off overlap vs this segment; derive partial/heavy flags
    // Uses per-person segment times based on their individual assignments
    const overlapByPerson = useMemo(() => {
      if (seg === "Early") return new Map<number, { minutes: number; heavy: boolean; partial: boolean }>();
      const map = new Map<number, { minutes: number; heavy: boolean; partial: boolean }>();
      
      // Base segment times for fallback
      const baseSt = baseSegTimes[seg]?.start;
      const baseEn = baseSegTimes[seg]?.end;
      if (!baseSt || !baseEn) return map;

      // Fetch all timeoff entries overlapping this calendar day to minimize per-person queries
      const dayStart = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1, 0, 0, 0, 0);
      const rows = all(
        `SELECT person_id, start_ts, end_ts FROM timeoff WHERE NOT (? >= end_ts OR ? <= start_ts)`,
        [dayStart.toISOString(), dayEnd.toISOString()]
      );
      
      // Also fetch recurring_timeoff (Flex Time) entries for this day
      // Convert Date's getDay() (0=Sun..6=Sat) to our weekday (0=Mon..4=Fri)
      const jsWeekday = selectedDateObj.getDay();
      const weekday = jsWeekday >= 1 && jsWeekday <= 5 ? jsWeekday - 1 : -1;
      
      // Combine regular timeoff and recurring timeoff into one array
      interface TimeOffEntry { person_id: number; start: Date; end: Date; }
      const allTimeOff: TimeOffEntry[] = [];
      
      for (const r of rows as any[]) {
        allTimeOff.push({
          person_id: r.person_id,
          start: new Date(r.start_ts),
          end: new Date(r.end_ts),
        });
      }
      
      // Add recurring_timeoff entries for weekdays (Mon-Fri)
      if (weekday >= 0) {
        const recurringRows = all(
          `SELECT person_id, start_time, end_time FROM recurring_timeoff WHERE weekday=? AND active=1`,
          [weekday]
        );
        for (const r of recurringRows as any[]) {
          const [startH, startM] = (r.start_time as string).split(':').map(Number);
          const [endH, endM] = (r.end_time as string).split(':').map(Number);
          allTimeOff.push({
            person_id: r.person_id,
            start: new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), startH, startM, 0, 0),
            end: new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate(), endH, endM, 0, 0),
          });
        }
      }
      
      for (const r of allTimeOff) {
        const pid = r.person_id;
        
        // Get this person's adjusted segment times
        const personSegTimes = getSegTimesForPerson(pid);
        const st = personSegTimes[seg]?.start || baseSt;
        const en = personSegTimes[seg]?.end || baseEn;
        
        const segStart = st.getTime();
        const segEnd = en.getTime();
        const segMinutes = Math.max(0, Math.round((segEnd - segStart) / 60000));
        
        const s = r.start.getTime();
        const e = r.end.getTime();
        const ovl = Math.max(0, Math.min(e, segEnd) - Math.max(s, segStart));
        if (ovl <= 0) continue;
        const prev = map.get(pid)?.minutes || 0;
        const minutes = prev + Math.round(ovl / 60000);
        const heavy = segMinutes > 0 && minutes >= Math.ceil(segMinutes / 2);
        const partial = minutes > 0 && !heavy;
        map.set(pid, { minutes, heavy, partial });
      }
      return map;
    }, [all, seg, baseSegTimes, selectedDateObj, getSegTimesForPerson]);

    const segDurationMinutes = useMemo(() => {
      if (seg === "Early") return 0;
      const st = segTimes[seg]?.start;
      const en = segTimes[seg]?.end;
      if (!st || !en) return 0;
      return Math.max(0, Math.round((en.getTime() - st.getTime()) / 60000));
    }, [seg, segTimes]);

    // Build status per role (under/exact/over) for the whole segment to evaluate current assignments
    const roleStatusById = useMemo(() => {
      const m = new Map<number, "under" | "exact" | "over">();
      for (const r of roles) {
        const eff = assignedEffectiveCountMap.get(r.id) || 0;
        const reqR = getRequiredFor(selectedDateObj, r.group_id, r.id, seg);
        const st = eff < reqR ? "under" : eff === reqR ? "exact" : "over";
        m.set(r.id, st);
      }
      return m;
    }, [roles, assignedEffectiveCountMap, getRequiredFor, selectedDateObj, seg]);

    // Map current person -> assigned role (if any) for this date+segment
    const personAssignedRoleMap = useMemo(() => {
      const rows = all(
        `SELECT person_id, role_id FROM assignment WHERE date=? AND segment=?`,
        [ymd(selectedDateObj), seg]
      ) as any[];
      const m = new Map<number, number>();
      for (const r of rows) if (!m.has(r.person_id)) m.set(r.person_id, r.role_id);
      return m;
    }, [all, selectedDateObj, seg, ymd]);

    const req = getRequiredFor(selectedDateObj, group.id, role.id, seg);
    // Effective count excludes "heavy" time-off overlaps
    const heavyCount = assigns.reduce((n, a) => n + (overlapByPerson.get(a.person_id)?.heavy ? 1 : 0), 0);
    const assignedEffective = assigns.length - heavyCount;
    const status: "under" | "exact" | "over" =
      assignedEffective < req ? "under" : assignedEffective === req ? "exact" : "over";
    // Use more subtle accent colors for role cards
    const accentColor =
      status === "under"
        ? tokens.colorPaletteRedBackground2
        : status === "exact"
        ? tokens.colorPaletteGreenBackground2
        : tokens.colorPaletteYellowBackground2;
  // Move action availability is handled per-person (blocked for heavy time-off), not by overstaffed status

    const handleMove = useCallback(
      (a: any) => {
        // Build full target list across all roles in this segment; prioritize deficits
        // Also track training status for the person being moved
        const trainedForRole = (roleId: number) => {
          const qualified = all(
            `SELECT person_id FROM training WHERE role_id=? AND status='Qualified' AND person_id=?`,
            [roleId, a.person_id]
          );
          if (qualified.length > 0) return true;
          // Also check monthly defaults as implicit qualification
          const monthly = all(
            `SELECT DISTINCT person_id FROM monthly_default WHERE role_id=? AND person_id=?
             UNION
             SELECT DISTINCT person_id FROM monthly_default_day WHERE role_id=? AND person_id=?`,
            [roleId, a.person_id, roleId, a.person_id]
          );
          return monthly.length > 0;
        };
        
        const allTargets: Array<{ role: any; group: any; need: number; trained: boolean }> = [];
        for (const r of roles) {
          const candidateOpts = peopleOptionsForSegment(selectedDateObj, seg, r);
          const eligible = candidateOpts.some((o) => o.id === a.person_id && !o.blocked);
          if (!eligible) continue;
          const grp = groupMap.get(r.group_id);
          const req = getRequiredFor(selectedDateObj, r.group_id, r.id, seg);
          const eff = assignedEffectiveCountMap.get(r.id) || 0;
          const need = Math.max(0, req - eff);
          const trained = trainedForRole(r.id);
          allTargets.push({ role: r, group: grp, need, trained });
        }
        if (!allTargets.length) {
          dialogs.showAlert("No eligible destinations found for this person. They may not be qualified or available for any open roles.", "No Eligible Destinations");
          return;
        }
        // Sort: needs first (descending), then by group/role
        allTargets.sort((aT, bT) => {
          if (aT.need === 0 && bT.need > 0) return 1;
          if (aT.need > 0 && bT.need === 0) return -1;
          if (bT.need !== aT.need) return bT.need - aT.need;
          const ga = String(aT.group?.name || '');
          const gb = String(bT.group?.name || '');
          if (ga !== gb) return ga.localeCompare(gb);
          return String(aT.role.name).localeCompare(String(bT.role.name));
        });
        setMoveContext({ assignment: a, targets: allTargets });
        setMoveTargetId(null);
      },
      [roles, groupMap, peopleOptionsForSegment, selectedDateObj, seg, getRequiredFor, assignedEffectiveCountMap, all]
    );

    const [addSel, setAddSel] = useState<string[]>([]);
    const [openAdd, setOpenAdd] = useState(false);

    const formatCandidateLabel = useCallback(
      (candidate: { id: number; label: string }) => {
        const info = overlapByPerson.get(candidate.id);
        const parts: string[] = [];
        if (info?.heavy) parts.push("(Time-off)");
        else if (info?.partial) parts.push("(Partial Time-off)");
        const curRoleId = personAssignedRoleMap.get(candidate.id);
        const curStatus = curRoleId != null ? roleStatusById.get(curRoleId) : undefined;
        if (curStatus === "under" || curStatus === "exact") parts.push("(Assigned)");
        else if (curStatus === "over") parts.push("(Overstaffed)");
        const suffix = parts.length ? ` ${parts.join(' ')}` : "";
        return `${candidate.label}${suffix}`;
      },
      [overlapByPerson, personAssignedRoleMap, roleStatusById],
    );

    const addSelectedLabel = useMemo(() => {
      if (addSel.length === 0) return "";
      const selected = sortedOpts.find((o) => String(o.id) === addSel[0]);
      return selected ? formatCandidateLabel(selected) : "";
    }, [addSel, sortedOpts, formatCandidateLabel]);

    const { bg: groupBg, fg: groupFg } = themeColors(group.theme);

    return (
      <Card
        className={s.roleCard}
        style={{
          borderLeftColor: accentColor,
          ["--scrollbar-thumb" as any]: tokens.colorNeutralStroke1,
          backgroundColor: groupBg,
          color: groupFg,
        }}
      >
        <div className={s.roleHeader}>
          <span className={s.roleName}>{role.name}</span>
          <span className={s.roleCount}>{assignedEffective}/{req}</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: tokens.spacingHorizontalS,
            marginBottom: tokens.spacingVerticalS,
          }}
        >
          <Dropdown
            placeholder={canEdit ? "+ Add person…" : "Add person…"}
            disabled={!canEdit}
            open={openAdd}
            onOpenChange={(_, d) => setOpenAdd(Boolean(d.open))}
            selectedOptions={addSel}
            value={addSelectedLabel}
            onOptionSelect={async (_, data) => {
              const val = data.optionValue ?? '';
              if (!val) return;
              const pid = Number(val);
              
              // Check for partial time-off and show confirmation dialog
              const overlapInfo = getTimeOffOverlapInfo(pid, selectedDateObj, seg);
              if (overlapInfo.hasOverlap && overlapInfo.overlapPercent > 0) {
                const confirmed = await dialogs.showConfirm(
                  `This person has ${overlapInfo.overlapPercent}% time-off overlap during this segment. Schedule anyway?`,
                  "Partial Time Off"
                );
                if (!confirmed) {
                  setAddSel([]);
                  return;
                }
              }
              
              addAssignment(selectedDate, pid, role.id, seg);
              setAddSel([]);
            }}
            style={{ 
              width: "100%",
              minHeight: "32px",
            }}
            appearance="outline"
          >
            {openAdd &&
              sortedOpts.map((o) => {
                const info = overlapByPerson.get(o.id);
                const isHeavy = Boolean(info?.heavy);
                const isPartial = Boolean(info?.partial);
                const text = formatCandidateLabel(o);
                return (
                  <Option
                    key={o.id}
                    value={String(o.id)}
                    text={text}
                    style={isHeavy 
                      ? { fontStyle: 'italic', color: tokens.colorPaletteDarkOrangeForeground1 } 
                      : isPartial 
                        ? { fontStyle: 'italic', color: tokens.colorPaletteYellowForeground1 } 
                        : undefined}
                  >
                    {text}
                  </Option>
                );
              })}
          </Dropdown>
        </div>
    <ul className={s.assignmentsList}>
      {assigns.map((a: any) => (
            <li key={a.id} className={s.assignmentItem}>
      <Body1 className={s.assignmentName}>
                <PersonName personId={a.person_id}>
                  {a.last_name}, {a.first_name}
                  {!trainedBefore.has(a.person_id) && " (Untrained)"}
                </PersonName>
                {movedToMap.has(`${a.person_id}:${role.id}`) && (
                  <Tooltip content="This person was moved to this role" relationship="label">
                    <span className={s.movedBadge}>Moved</span>
                  </Tooltip>
                )}
        {(() => {
                  const info = overlapByPerson.get(a.person_id);
                  if (!info) return null;
                  const mins = info.minutes;
                  const pct = segDurationMinutes > 0 ? Math.round((mins / segDurationMinutes) * 100) : undefined;
                  const content = pct != null ? `Overlap: ${mins} min (${pct}%)` : `Overlap: ${mins} min`;
                  if (info.heavy) {
                    return (
                      <Tooltip content={content} relationship="label">
                        <Badge appearance="tint" color="danger" style={{ marginLeft: 8 }}>Time Off</Badge>
                      </Tooltip>
                    );
                  }
                  if (info.partial) {
                    return (
                      <Tooltip content={content} relationship="label">
                        <Badge appearance="tint" color="warning" style={{ marginLeft: 8 }}>Partial Time Off</Badge>
                      </Tooltip>
                    );
                  }
                  return null;
                })()}
      </Body1>
              {canEdit && (
                <div className={s.actionsRow}>
                  <Button size="small" appearance="secondary" onClick={() => handleMove(a)}>
                    Move
                  </Button>
                  <Button size="small" appearance="secondary" onClick={async () => {
                    try {
                      const confirmed = await dialogs.showConfirm(
                        `Remove ${a.last_name}, ${a.first_name} from ${role.name}?`,
                        "Confirm Removal"
                      );
                      if (confirmed) {
                        deleteAssignment(a.id);
                      }
                    } catch (error) {
                      // Handle any errors from the confirmation dialog
                      console.error('Error during removal confirmation:', error);
                    }
                  }}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    );
  });

  async function confirmMove() {
    if (!moveContext || moveTargetId == null) return;
    const chosen = moveContext.targets.find((t) => t.role.id === moveTargetId);
    if (!chosen) return;
    
    // Capture values before clearing state to avoid race conditions
    const assignmentId = moveContext.assignment.id;
    const personId = moveContext.assignment.person_id;
    const fromRoleId = moveContext.assignment.role_id;
    const toRoleId = chosen.role.id;
    const dateStr = ymd(selectedDateObj);
    
    // Clear state BEFORE DB operations to prevent dialog re-opening
    setMoveContext(null);
    setMoveTargetId(null);
    
    // Log the move to change_log table
    run(
      `INSERT INTO change_log (date, person_id, segment, from_role_id, to_role_id, action) VALUES (?,?,?,?,?,?)`,
      [dateStr, personId, seg, fromRoleId, toRoleId, 'move']
    );
    
    deleteAssignment(assignmentId);
    addAssignment(selectedDate, personId, toRoleId, seg);
  }

  function cancelMove() {
    setMoveContext(null);
    setMoveTargetId(null);
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <label htmlFor="run-date-picker" style={{ display: "inline-block" }}>
            <Body1>
              <b>Date</b>
            </Body1>
          </label>
          <Input
            id="run-date-picker"
            type="date"
            value={ymd(selectedDateObj)}
            onChange={(_, data) => {
              const v = data.value;
              if (v) setSelectedDate(fmtDateMDY(parseYMD(v)));
            }}
          />
        </div>
        <div className={s.headerCenter}>
          <TabList
            selectedValue={activeRunSegment}
            onTabSelect={(_, data) => setActiveRunSegment(data.value as Segment)}
          >
            {segments.map((s) => (
              <Tab key={s.name} value={s.name}>
                {s.name}
              </Tab>
            ))}
          </TabList>
        </div>
        <div className={s.headerRight}>
          <Button appearance="secondary" onClick={() => setShowMovesModal(true)}>View Moves</Button>
          <Button appearance="secondary" onClick={handleSendToTeams}>Send to Teams</Button>
          <Button appearance="secondary" onClick={handleExportDaily}>Export</Button>
          <Button appearance="secondary" onClick={handleAutoFill}>Auto Fill</Button>
          <Button appearance="secondary" onClick={handleCopyDefaults}>Copy Defaults</Button>
          <Button appearance="secondary" onClick={() => setShowNeedsEditor(true)}>
            Edit Needs for This Day
          </Button>
        </div>
      </div>

      {/* Department Events Banner */}
      {departmentEvents.length > 0 && (
        <div style={{ marginBottom: tokens.spacingVerticalM }}>
          {departmentEvents.map((event) => {
            // Find affected segments for this event
            const affectedSegs = adjustedSegments.filter(
              (adjSeg) =>
                !adjSeg.blocked &&
                adjSeg.is_split &&
                adjSeg.original_start !== adjSeg.adjusted_start ||
                adjSeg.original_end !== adjSeg.adjusted_end
            );
            const blockedSegs = adjustedSegments.filter((adjSeg) => adjSeg.blocked);
            
            return (
              <MessageBar
                key={event.id}
                intent="warning"
                style={{ marginBottom: tokens.spacingVerticalS }}
              >
                <MessageBarBody>
                  <MessageBarTitle>
                    <CalendarMonth20Regular style={{ marginRight: tokens.spacingHorizontalXS, verticalAlign: 'middle' }} />
                    {event.title}
                  </MessageBarTitle>
                  <div>
                    {formatTime12h(event.start_time)} – {formatTime12h(event.end_time)}
                    {event.description && <span> — {event.description}</span>}
                  </div>
                  {(affectedSegs.length > 0 || blockedSegs.length > 0) && (
                    <div style={{ marginTop: tokens.spacingVerticalXS, fontSize: tokens.fontSizeBase200 }}>
                      {blockedSegs.length > 0 && (
                        <span style={{ color: tokens.colorPaletteRedForeground1 }}>
                          Blocked segments: {blockedSegs.map((s) => s.name).join(', ')}
                        </span>
                      )}
                      {affectedSegs.length > 0 && (
                        <span>
                          {blockedSegs.length > 0 ? ' • ' : ''}
                          Adjusted segments: {affectedSegs.map((s) => `${s.name} (${formatTime12h(s.adjusted_start)}–${formatTime12h(s.adjusted_end)})`).join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </MessageBarBody>
              </MessageBar>
            );
          })}
        </div>
      )}

      {/* Unassigned Available People Indicator */}
      {unassignedAvailable.length > 0 && (
        <div 
          style={{ 
            marginBottom: tokens.spacingVerticalM,
            padding: tokens.spacingHorizontalS,
            backgroundColor: tokens.colorNeutralBackground3,
            borderRadius: tokens.borderRadiusMedium,
            border: `1px solid ${tokens.colorNeutralStroke2}`,
          }}
        >
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
            onClick={() => setShowUnassigned(!showUnassigned)}
          >
            <Text weight="semibold" size={200}>
              📋 {unassignedAvailable.length} available but unassigned
            </Text>
            <Button size="small" appearance="subtle">
              {showUnassigned ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showUnassigned && (
            <div style={{ 
              marginTop: tokens.spacingVerticalS,
              display: 'flex',
              flexWrap: 'wrap',
              gap: tokens.spacingHorizontalXS,
            }}>
              {unassignedAvailable.map((p: any) => (
                <Tooltip 
                  key={p.id} 
                  content={p.hasTimeOff ? "Has time off during this day" : "Available"} 
                  relationship="label"
                >
                  <Badge 
                    appearance={p.hasTimeOff ? "tint" : "outline"} 
                    color={p.hasTimeOff ? "warning" : "brand"}
                    size="small"
                  >
                    {p.hasTimeOff && "⏰ "}{p.first_name} {p.last_name}
                  </Badge>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      )}

      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingHorizontalL }}>
          {groups.map((g: any) => (
            <GroupCard key={g.id} group={g} isDraggable={false} />
          ))}
        </div>
      ) : (
  <GridWP
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={RGL_ROW_HEIGHT}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
        >
          {groups.map((g: any) => (
            <div key={String(g.id)}>
              <GroupCard group={g} isDraggable={true} />
            </div>
          ))}
  </GridWP>
      )}

      {moveContext && (
        <Dialog open onOpenChange={(_, data) => { if (!data.open) cancelMove(); }}>
          <DialogTrigger>
            <span />
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Move {moveContext.assignment.last_name}, {moveContext.assignment.first_name}</DialogTitle>
              <DialogContent>
                <Dropdown
                  placeholder="Select destination"
                  selectedOptions={moveTargetId != null ? [String(moveTargetId)] : []}
                  value={moveSelectedLabel}
                  onOptionSelect={(_, data) => {
                    const v = data.optionValue ?? data.optionText;
                    setMoveTargetId(v ? Number(v) : null);
                  }}
                  style={{ width: "100%" }}
                >
                  {moveContext.targets.map((t) => {
                    const needPart = t.need > 0 ? ` (need ${t.need})` : '';
                    const untrainedPart = !t.trained ? ' (Untrained)' : '';
                    const label = `${t.group.name} - ${t.role.name}${needPart}${untrainedPart}`;
                    return (
                      <Option key={t.role.id} value={String(t.role.id)} text={label}>
                        {label}
                      </Option>
                    );
                  })}
                </Dropdown>
              </DialogContent>
              <DialogActions>
                <Button onClick={cancelMove}>Cancel</Button>
                <Button appearance="primary" disabled={moveTargetId == null} onClick={confirmMove}>Move</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      {autoFillOpen && (
        <Dialog open onOpenChange={(_, d) => { if (!d.open) cancelAutoFill(); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Auto-Fill Suggestions</DialogTitle>
              <DialogContent>
                {autoFillSuggestions.length === 0 && <Body1>No suggestions available.</Body1>}
                {autoFillSuggestions.map((s, idx) => {
                  const selectedLabel =
                    s.selected != null
                      ? s.candidates.find((c) => c.id === s.selected)?.label ?? ""
                      : "None";
                  return (
                    <div key={s.role.id} style={{ marginBottom: tokens.spacingVerticalS }}>
                      <Subtitle2>{`${s.group.name} - ${s.role.name}`}</Subtitle2>
                      <Dropdown
                        selectedOptions={s.selected != null ? [String(s.selected)] : [""]}
                        value={selectedLabel}
                        onOptionSelect={(_, data) => {
                          const val = data.optionValue ? Number(data.optionValue) : null;
                          setAutoFillSuggestions((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, selected: val } : p))
                          );
                        }}
                        style={{ width: "100%" }}
                      >
                        <Option value="" text="None">
                          None
                        </Option>
                        {s.candidates.map((c) => (
                          <Option key={c.id} value={String(c.id)} text={c.label}>
                            {c.label}
                          </Option>
                        ))}
                      </Dropdown>
                    </div>
                  );
                })}
              </DialogContent>
              <DialogActions>
                <Button onClick={cancelAutoFill}>Cancel</Button>
                <Button appearance="primary" onClick={applyAutoFill}>Confirm</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      
      {dialogs.alertState && (
        <AlertDialog
          open={true}
          title={dialogs.alertState.title}
          message={dialogs.alertState.message}
          onClose={dialogs.closeAlert}
        />
      )}
      
      {dialogs.confirmState && (
        <ConfirmDialog
          open={true}
          title={dialogs.confirmState.options.title}
          message={dialogs.confirmState.options.message}
          confirmText={dialogs.confirmState.options.confirmText}
          cancelText={dialogs.confirmState.options.cancelText}
          onConfirm={() => dialogs.handleConfirm(true)}
          onCancel={() => dialogs.handleConfirm(false)}
        />
      )}
      
      {/* Today's Moves Summary Modal */}
      {showMovesModal && (
        <Dialog open={showMovesModal} onOpenChange={(_, d) => { if (!d.open) setShowMovesModal(false); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Today's Moves</DialogTitle>
              <DialogContent>
                <TodaysMovesList date={ymd(selectedDateObj)} all={all} allRoles={allRoles} people={people} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowMovesModal(false)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      
      {/* Teams Draft Modal */}
      {showTeamsDraft && (
        <Dialog open={showTeamsDraft} onOpenChange={(_, d) => { if (!d.open) setShowTeamsDraft(false); }}>
          <DialogSurface style={{ maxWidth: '700px', width: '90vw' }}>
            <DialogBody>
              <DialogTitle>Teams Message Draft</DialogTitle>
              <DialogContent>
                <Text size={200} style={{ marginBottom: tokens.spacingVerticalS, display: 'block' }}>
                  Copy this message and paste it into your Teams channel:
                </Text>
                <Textarea
                  value={teamsDraftText}
                  readOnly
                  style={{ width: '100%', minHeight: '400px', fontFamily: 'monospace', fontSize: '14px' }}
                  resize="vertical"
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowTeamsDraft(false)}>Close</Button>
                <Button appearance="primary" onClick={handleCopyTeamsDraft}>Copy to Clipboard</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}