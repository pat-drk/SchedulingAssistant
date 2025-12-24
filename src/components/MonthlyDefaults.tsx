import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Input,
  Button,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
  makeStyles,
  tokens,
  Dropdown,
  Option,
  Tooltip,
  Textarea,
  Badge,
  Card,
  CardHeader,
  Caption1,
  Title3,
  Subtitle2,
  Tab,
  TabList,
  Checkbox,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from "@fluentui/react-components";
import { MoreHorizontal20Regular, Note20Regular } from "@fluentui/react-icons";
import PeopleFiltersBar, { filterPeopleList, PeopleFiltersState, usePersistentFilters } from "./filters/PeopleFilters";
import SmartSelect from "./controls/SmartSelect";
import PersonName from "./PersonName";
import { exportMonthOneSheetXlsx } from "../excel/export-one-sheet";
import { type Segment, type SegmentRow } from "../services/segments";
import type { Availability } from "../services/availabilityOverrides";
import FluentDateInput from "./FluentDateInput";
import { SIX_MONTHS_MS, REQUIRED_TRAINING_AREAS, isInTrainingPeriod } from "../utils/trainingConstants";
import { getWeekDateRange, formatDateRange, type WeekStartMode } from "../utils/weekCalculation";
import AlertDialog from "./AlertDialog";
import { useDialogs } from "../hooks/useDialogs";
import { logger } from "../utils/logger";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
type WeekdayKey = 1 | 2 | 3 | 4 | 5;
const WEEKDAY_ORDER: WeekdayKey[] = [1, 2, 3, 4, 5];

const pad2 = (value: number) => (value < 10 ? `0${value}` : `${value}`);
const toYmd = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const groupThemePalette: Record<string, { bg: string; fg: string }> = {
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
  if (!theme) return { bg: undefined as string | undefined, fg: undefined as string | undefined };
  const key = theme.replace(/^\d+\.\s*/, "");
  return groupThemePalette[key] || { bg: undefined, fg: undefined };
};

const AVERAGE_EPSILON = 0.05;

const formatAverage = (value: number) => {
  if (!Number.isFinite(value) || Math.abs(value) < AVERAGE_EPSILON) return "0";
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < AVERAGE_EPSILON) return String(rounded);
  return value.toFixed(1);
};

const formatSigned = (value: number) => {
  if (!Number.isFinite(value) || Math.abs(value) < AVERAGE_EPSILON) return "0";
  const rounded = Math.round(Math.abs(value));
  const base = Math.abs(Math.abs(value) - rounded) < AVERAGE_EPSILON ? String(rounded) : Math.abs(value).toFixed(1);
  return `${value > 0 ? "+" : "-"}${base}`;
};

const formatPercent = (value: number) => {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.05) {
    return `${rounded}%`;
  }
  return `${value.toFixed(1)}%`;
};

const formatStaffingPercent = (assigned: number, required: number) => {
  if (!Number.isFinite(assigned) || !Number.isFinite(required) || required <= 0) {
    return null;
  }
  const ratio = (assigned / required) * 100;
  if (!Number.isFinite(ratio)) {
    return null;
  }
  if (Math.abs(ratio) < 0.05) {
    return "0%";
  }
  return formatPercent(ratio);
};

type CoverageRow = {
  key: string;
  segment: Segment;
  roleId: number;
  roleName: string;
  groupId: number;
  groupName: string;
  requiredTotal: number;
  assignedTotal: number;
  requiredAvg: number;
  assignedAvg: number;
  weekdayBreakdown: Record<WeekdayKey, { requiredAvg: number; assignedAvg: number }>;
};

type DashboardSummary = {
  rows: CoverageRow[];
  weekdayCounts: Record<WeekdayKey, number>;
  totalWeekdays: number;
  monthLabel: string;
};

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box",
    rowGap: tokens.spacingVerticalM,
  },
  toolbar: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    paddingBlockEnd: tokens.spacingVerticalS,
    minWidth: 0,
    // Mobile adjustments
    "@media (max-width: 767px)": {
      gap: tokens.spacingVerticalXS,
    },
  },
  topRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    alignItems: "end",
    // Mobile adjustments
    "@media (max-width: 767px)": {
      gap: tokens.spacingHorizontalS,
    },
  },
  controlGroup: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: "140px",
    // Mobile: full width
    "@media (max-width: 767px)": {
      minWidth: "100%",
      flex: "1 1 100%",
    },
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    alignItems: "center",
    paddingTop: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    // Mobile adjustments
    "@media (max-width: 767px)": {
      gap: tokens.spacingHorizontalS,
    },
  },
  primaryActions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    // Mobile: full width
    "@media (max-width: 767px)": {
      flex: "1 1 100%",
      flexWrap: "wrap",
    },
  },
  secondaryActions: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    alignItems: "center",
    marginLeft: "auto",
    // Mobile: reset margin and full width
    "@media (max-width: 767px)": {
      marginLeft: 0,
      flex: "1 1 100%",
      gap: tokens.spacingHorizontalS,
    },
  },
  copySection: {
    display: "flex",
    alignItems: "end",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  leftControls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: tokens.spacingHorizontalS,
    alignItems: "end",
    // Mobile: stack vertically
    "@media (max-width: 767px)": {
      gridTemplateColumns: "1fr",
      gap: tokens.spacingVerticalXS,
    },
  },
  rightActions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "end",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    // Mobile: full width
    "@media (max-width: 767px)": {
      justifyContent: "flex-start",
    },
  },
  label: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightMedium,
  },
  field: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  scroll: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "auto",
    overflowY: "auto",
    overscrollBehaviorX: "contain",
  },
  inlineLink: {
    marginLeft: tokens.spacingHorizontalS,
    fontSize: tokens.fontSizeBase200,
  },
  boardOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingHorizontalXL,
    zIndex: 10,
  },
  boardSurface: {
    width: "min(1200px, calc(100vw - 48px))",
    maxWidth: "100%",
    maxHeight: "calc(100vh - 48px)",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow64,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  boardHeader: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalS,
    alignItems: "flex-start",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  boardHeaderLeft: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
    flex: "1 1 auto",
  },
  boardHeading: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
  },
  boardMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  boardSubmeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  boardControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    marginLeft: "auto",
  },
  boardFilter: {
    minWidth: "160px",
  },
  boardBody: {
    flex: 1,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalL}`,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  boardGroupGrid: {
    display: "grid",
    gap: tokens.spacingHorizontalL,
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    alignContent: "start",
  },
  boardGroupCard: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    paddingBottom: tokens.spacingVerticalM,
  },
  boardGroupSummary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `0 ${tokens.spacingHorizontalL}`,
    columnGap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  boardRolesGrid: {
    flex: 1,
    display: "grid",
    gap: tokens.spacingHorizontalM,
    padding: `0 ${tokens.spacingHorizontalL}`,
  },
  boardRoleCard: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    display: "grid",
    rowGap: tokens.spacingVerticalS,
    boxShadow: tokens.shadow4,
  },
  groupMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  roleHeader: {
    display: "flex",
    justifyContent: "space-between",
    columnGap: tokens.spacingHorizontalS,
    alignItems: "baseline",
  },
  roleName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: tokens.spacingHorizontalS,
    alignItems: "stretch",
  },
  metricBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    rowGap: tokens.spacingVerticalXXS,
  },
  metricLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  metricValue: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    fontVariantNumeric: "tabular-nums",
  },
  metricHint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  weekdayChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  weekdayChip: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    fontVariantNumeric: "tabular-nums",
  },
  emptyState: {
    padding: tokens.spacingVerticalL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
});

interface MonthlyDefaultsProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  copyFromMonth: string;
  setCopyFromMonth: (month: string) => void;
  people: any[];
  segments: SegmentRow[];
  monthlyDefaults: any[];
  monthlyOverrides: any[];
  monthlyWeekOverrides: any[];
  monthlyNotes: any[];
  monthlyEditing: boolean;
  setMonthlyEditing: (v: boolean) => void;
  setMonthlyDefault: (personId: number, segment: Segment, roleId: number | null) => void;
  setWeeklyOverride: (personId: number, weekday: number, segment: Segment, roleId: number | null) => void;
  setWeekNumberOverride: (personId: number, weekNumber: number, segment: Segment, roleId: number | null) => void;
  setMonthlyNote: (personId: number, note: string | null) => void;
  copyMonthlyDefaults: (fromMonth: string, toMonth: string) => void;
  applyMonthlyDefaults: (month: string) => Promise<void> | void;
  exportMonthlyDefaults: (month: string) => void;
  roleListForSegment: (segment: Segment) => any[];
  groups: any[];
  roles: any[];
  availabilityOverrides: Array<{ person_id: number; date: string; avail: Availability }>;
  getRequiredFor: (date: Date, groupId: number, roleId: number, segment: Segment) => number;
  all: (sql: string, params?: any[]) => any[];
}

export default function MonthlyDefaults({
  selectedMonth,
  setSelectedMonth,
  copyFromMonth,
  setCopyFromMonth,
  people,
  segments,
  monthlyDefaults,
  monthlyOverrides,
  monthlyWeekOverrides,
  monthlyNotes,
  monthlyEditing,
  setMonthlyEditing,
  setMonthlyDefault,
  setWeeklyOverride,
  setWeekNumberOverride,
  setMonthlyNote,
  copyMonthlyDefaults,
  applyMonthlyDefaults,
  exportMonthlyDefaults,
  roleListForSegment,
  groups,
  roles,
  availabilityOverrides,
  getRequiredFor,
  all,
}: MonthlyDefaultsProps) {
  const styles = useStyles();
  const segmentNames = useMemo(() => segments.map(s => s.name as Segment), [segments]);
  const [filters, setFilters] = usePersistentFilters('monthlyDefaultsFilters');
  const dialogs = useDialogs();
  
  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };
  
  // Handle copy with confirmation
  const handleCopyClick = async () => {
    const sourceMonth = formatMonth(copyFromMonth);
    const targetMonth = formatMonth(selectedMonth);
    
    const confirmed = await dialogs.showConfirm(
      `This will overwrite all defaults in ${targetMonth} with data from ${sourceMonth}. Continue?`,
      "Confirm Copy"
    );
    
    if (confirmed) {
      copyMonthlyDefaults(copyFromMonth, selectedMonth);
    }
  };
  
  // Handle export with error handling
  const handleExportXlsx = async () => {
    try {
      await exportMonthOneSheetXlsx(selectedMonth);
    } catch (err: any) {
      dialogs.showAlert(err?.message || "Export failed", "Export Error");
    }
  };
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortKeyLabel = useMemo(() => {
    const base: Record<string, string> = {
      name: "Name",
      email: "Email",
      brother_sister: "B/S",
      commuter: "Commute",
      active: "Active",
      avail_mon: "Mon",
      avail_tue: "Tue",
      avail_wed: "Wed",
      avail_thu: "Thu",
      avail_fri: "Fri",
    };
    if (base[sortKey]) return base[sortKey];
    if (segmentNames.includes(sortKey as Segment)) {
      return `${sortKey} Role`;
    }
    return "";
  }, [sortKey, segmentNames]);
  const [weekdayPerson, setWeekdayPerson] = useState<number | null>(null);
  const [weekNumberPerson, setWeekNumberPerson] = useState<number | null>(null);
  const [notePerson, setNotePerson] = useState<number | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardGroupId, setDashboardGroupId] = useState<string>('all');
  const [activeDashboardSegment, setActiveDashboardSegment] = useState<Segment | null>(() => segmentNames[0] ?? null);
  const [showOnlyTrainees, setShowOnlyTrainees] = useState(false);

  useEffect(() => {
    if (!monthlyEditing) {
      setShowDashboard(false);
    }
  }, [monthlyEditing]);

  useEffect(() => {
    if (dashboardGroupId === 'all') return;
    if (!groups.some((g: any) => String(g.id) === dashboardGroupId)) {
      setDashboardGroupId('all');
    }
  }, [dashboardGroupId, groups]);

  useEffect(() => {
    if (segmentNames.length === 0) {
      if (activeDashboardSegment !== null) {
        setActiveDashboardSegment(null);
      }
      return;
    }
    if (!activeDashboardSegment || !segmentNames.includes(activeDashboardSegment)) {
      setActiveDashboardSegment(segmentNames[0] ?? null);
    }
  }, [segmentNames, activeDashboardSegment]);

  const selectedDashboardGroup = useMemo(() => {
    if (dashboardGroupId === 'all') return null;
    return groups.find((g: any) => String(g.id) === dashboardGroupId) ?? null;
  }, [dashboardGroupId, groups]);

  const dashboardData = useMemo<DashboardSummary>(() => {
    const empty: DashboardSummary = {
      rows: [],
      weekdayCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      totalWeekdays: 0,
      monthLabel: '',
    };
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) {
      return empty;
    }
    const monthIndex = month - 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (!Number.isFinite(daysInMonth) || daysInMonth <= 0) {
      return empty;
    }

    const toAvailability = (value: unknown): Availability => {
      if (value == null) return 'U';
      const normalized = String(value).toUpperCase();
      switch (normalized) {
        case 'AM':
        case 'PM':
        case 'B':
        case 'U':
          return normalized as Availability;
        default:
          return 'U';
      }
    };

    const availabilityByPerson = new Map<number, Record<WeekdayKey, Availability>>();
    for (const person of people) {
      availabilityByPerson.set(person.id, {
        1: toAvailability((person as any).avail_mon),
        2: toAvailability((person as any).avail_tue),
        3: toAvailability((person as any).avail_wed),
        4: toAvailability((person as any).avail_thu),
        5: toAvailability((person as any).avail_fri),
      });
    }

    const availabilityOverrideMap = new Map<string, Availability>();
    for (const override of availabilityOverrides) {
      if (override?.person_id == null || !override?.date) continue;
      const key = `${override.person_id}|${String(override.date)}`;
      availabilityOverrideMap.set(key, toAvailability(override.avail));
    }

    const availabilityMatchesSegment = (availability: Availability, segment: Segment): boolean => {
      if (availability === 'U') return false;
      if (segment === 'AM' || segment === 'Early') {
        return availability === 'AM' || availability === 'B';
      }
      if (segment === 'PM') {
        return availability === 'PM' || availability === 'B';
      }
      return availability === 'AM' || availability === 'PM' || availability === 'B';
    };

    const weekdayCounts: Record<WeekdayKey, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const segmentOrder = new Map<Segment, number>(segmentNames.map((seg, idx) => [seg, idx]));
    const groupMap = new Map<number, any>(groups.map((g: any) => [g.id, g]));
    const roleMap = new Map<number, any>(roles.map((r: any) => [r.id, r]));
    const rolesByGroup = new Map<number, any[]>();
    for (const role of roles) {
      if (!rolesByGroup.has(role.group_id)) {
        rolesByGroup.set(role.group_id, []);
      }
      rolesByGroup.get(role.group_id)!.push(role);
    }

    type SummaryEntry = {
      key: string;
      groupId: number;
      roleId: number;
      segment: Segment;
      requiredTotal: number;
      assignedTotal: number;
      requiredByWeekday: Partial<Record<WeekdayKey, number>>;
      assignedByWeekday: Partial<Record<WeekdayKey, number>>;
    };

    const summaryMap = new Map<string, SummaryEntry>();
    const ensureEntry = (groupId: number, roleId: number, segment: Segment): SummaryEntry => {
      const key = `${groupId}|${roleId}|${segment}`;
      let entry = summaryMap.get(key);
      if (!entry) {
        entry = {
          key,
          groupId,
          roleId,
          segment,
          requiredTotal: 0,
          assignedTotal: 0,
          requiredByWeekday: {},
          assignedByWeekday: {},
        };
        summaryMap.set(key, entry);
      }
      return entry;
    };

    const defaultMap = new Map<string, number>();
    for (const def of monthlyDefaults) {
      if (def.role_id != null) {
        defaultMap.set(`${def.person_id}|${def.segment}`, def.role_id);
      }
    }
    const overrideMap = new Map<string, number>();
    for (const ov of monthlyOverrides) {
      if (ov.role_id != null) {
        overrideMap.set(`${ov.person_id}|${ov.weekday}|${ov.segment}`, ov.role_id);
      }
    }
    const personIds = new Set<number>();
    for (const def of monthlyDefaults) personIds.add(def.person_id);
    for (const ov of monthlyOverrides) personIds.add(ov.person_id);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthIndex, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      const weekday = dayOfWeek as WeekdayKey;
      weekdayCounts[weekday] += 1;

      for (const group of groups) {
        const groupRoles = rolesByGroup.get(group.id);
        if (!groupRoles) continue;
        for (const role of groupRoles) {
          const allowedSegments = Array.isArray(role.segments) ? (role.segments as Segment[]) : [];
          for (const seg of segmentNames) {
            if (!allowedSegments.includes(seg)) continue;
            const required = getRequiredFor(date, group.id, role.id, seg);
            if (required > 0) {
              const entry = ensureEntry(group.id, role.id, seg);
              entry.requiredTotal += required;
              entry.requiredByWeekday[weekday] = (entry.requiredByWeekday[weekday] ?? 0) + required;
            }
          }
        }
      }

      const dateKey = toYmd(date);
      for (const personId of personIds) {
        for (const seg of segmentNames) {
          let roleId = overrideMap.get(`${personId}|${weekday}|${seg}`);
          if (roleId === undefined) {
            roleId = defaultMap.get(`${personId}|${seg}`);
          }
          if (roleId == null) continue;
          const role = roleMap.get(roleId);
          if (!role) continue;
          const allowedSegments = Array.isArray(role.segments) ? (role.segments as Segment[]) : [];
          if (!allowedSegments.includes(seg)) continue;
          const availabilityForPerson = availabilityByPerson.get(personId);
          const overrideAvailability = availabilityOverrideMap.get(`${personId}|${dateKey}`);
          const dayAvailability = overrideAvailability ?? availabilityForPerson?.[weekday] ?? ('U' as Availability);
          if (!availabilityMatchesSegment(dayAvailability, seg)) continue;
          const entry = ensureEntry(role.group_id, role.id, seg);
          entry.assignedTotal += 1;
          entry.assignedByWeekday[weekday] = (entry.assignedByWeekday[weekday] ?? 0) + 1;
        }
      }
    }

    const totalWeekdays = WEEKDAY_ORDER.reduce((sum, key) => sum + (weekdayCounts[key] || 0), 0);

    const rows: CoverageRow[] = Array.from(summaryMap.values())
      .filter((entry) => entry.requiredTotal > 0 || entry.assignedTotal > 0)
      .map((entry) => {
        const role = roleMap.get(entry.roleId);
        const group = groupMap.get(entry.groupId);
        const breakdown = {} as Record<WeekdayKey, { requiredAvg: number; assignedAvg: number }>;
        for (const w of WEEKDAY_ORDER) {
          const occurrences = weekdayCounts[w] || 0;
          const requiredByDay = entry.requiredByWeekday[w] ?? 0;
          const assignedByDay = entry.assignedByWeekday[w] ?? 0;
          breakdown[w] = {
            requiredAvg: occurrences ? requiredByDay / occurrences : 0,
            assignedAvg: occurrences ? assignedByDay / occurrences : 0,
          };
        }
        return {
          key: entry.key,
          segment: entry.segment,
          roleId: entry.roleId,
          roleName: role?.name ?? `Role ${entry.roleId}`,
          groupId: entry.groupId,
          groupName: group?.name ?? `Group ${entry.groupId}`,
          requiredTotal: entry.requiredTotal,
          assignedTotal: entry.assignedTotal,
          requiredAvg: totalWeekdays ? entry.requiredTotal / totalWeekdays : 0,
          assignedAvg: totalWeekdays ? entry.assignedTotal / totalWeekdays : 0,
          weekdayBreakdown: breakdown,
        };
      })
      .sort((a, b) => {
        const segIdxA = segmentOrder.get(a.segment) ?? 0;
        const segIdxB = segmentOrder.get(b.segment) ?? 0;
        if (segIdxA !== segIdxB) return segIdxA - segIdxB;
        if (a.groupName !== b.groupName) return a.groupName.localeCompare(b.groupName);
        return a.roleName.localeCompare(b.roleName);
      });

    const labelDate = new Date(year, monthIndex, 1);
    const monthLabel = Number.isNaN(labelDate.getTime())
      ? ''
      : labelDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return { rows, weekdayCounts, totalWeekdays, monthLabel };
  }, [selectedMonth, monthlyDefaults, monthlyOverrides, segmentNames, groups, roles, getRequiredFor, people, availabilityOverrides]);

  const filteredDashboardRows = useMemo(() => {
    const rows = dashboardData.rows;
    if (dashboardGroupId === 'all') {
      return rows;
    }
    const groupId = Number(dashboardGroupId);
    if (!Number.isFinite(groupId)) {
      return rows;
    }
    return rows.filter((row) => row.groupId === groupId);
  }, [dashboardData, dashboardGroupId]);

  const viewPeople = useMemo(() => {
    const filtered = filterPeopleList(people, filters);
    const sorted = [...filtered].sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (sortKey === "name") {
        av = `${a.last_name} ${a.first_name}`.toLowerCase();
        bv = `${b.last_name} ${b.first_name}`.toLowerCase();
      } else if (sortKey === "email") {
        av = a.email?.toLowerCase() ?? "";
        bv = b.email?.toLowerCase() ?? "";
      } else if (sortKey === "brother_sister") {
        av = a.brother_sister;
        bv = b.brother_sister;
      } else if (sortKey === "commuter") {
        av = a.commuter;
        bv = b.commuter;
      } else if (sortKey === "active") {
        av = a.active;
        bv = b.active;
      } else if (segmentNames.includes(sortKey as Segment)) {
        const defA = monthlyDefaults.find(d => d.person_id === a.id && d.segment === sortKey);
        const defB = monthlyDefaults.find(d => d.person_id === b.id && d.segment === sortKey);
        const segRoles = roleListForSegment(sortKey as Segment);
        av = defA ? segRoles.find(r => r.id === defA.role_id)?.name ?? "" : "";
        bv = defB ? segRoles.find(r => r.id === defB.role_id)?.name ?? "" : "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [people, monthlyDefaults, filters, sortKey, sortDir, segmentNames, roleListForSegment]);

  // Calculate trainee status for each person
  const traineeInfo = useMemo(() => {
    const now = new Date();
    const info = new Map<number, { isTrainee: boolean; incompleteAreas: string[] }>();

    for (const person of viewPeople) {
      if (!person.start_date) {
        info.set(person.id, { isTrainee: false, incompleteAreas: [] });
        continue;
      }

      const startDate = new Date(person.start_date);
      const endDate = person.end_date ? new Date(person.end_date) : null;
      const isTrainee = isInTrainingPeriod(startDate, endDate, now);

      if (!isTrainee) {
        info.set(person.id, { isTrainee: false, incompleteAreas: [] });
        continue;
      }

      // Get all groups they've been assigned to
      const assignedGroups = new Set<string>();
      
      // Check monthly defaults
      for (const def of monthlyDefaults) {
        if (def.person_id === person.id && def.role_id) {
          const role = roles.find(r => r.id === def.role_id);
          if (role) {
            const group = groups.find(g => g.id === role.group_id);
            if (group) assignedGroups.add(group.name);
          }
        }
      }

      const incompleteAreas = REQUIRED_TRAINING_AREAS.filter(area => !assignedGroups.has(area));
      info.set(person.id, { isTrainee, incompleteAreas });
    }

    return info;
  }, [viewPeople, monthlyDefaults, roles, groups]);

  // Filter to show only trainees if toggle is on
  const displayPeople = useMemo(() => {
    if (!showOnlyTrainees) return viewPeople;
    return viewPeople.filter(p => traineeInfo.get(p.id)?.isTrainee);
  }, [viewPeople, showOnlyTrainees, traineeInfo]);

  function MonthlyCoverageBoard({
    monthLabel,
    totalWeekdays,
    weekdayCounts,
    filteredRows,
    allRows,
    segments,
    activeSegment,
    onSegmentChange,
    groupFilterId,
    onGroupFilterChange,
    groups,
    selectedGroup,
    onClose,
  }: {
    monthLabel: string;
    totalWeekdays: number;
    weekdayCounts: Record<WeekdayKey, number>;
    filteredRows: CoverageRow[];
    allRows: CoverageRow[];
    segments: Segment[];
    activeSegment: Segment | null;
    onSegmentChange: (segment: Segment) => void;
    groupFilterId: string;
    onGroupFilterChange: (value: string) => void;
    groups: any[];
    selectedGroup: any | null;
    onClose: () => void;
  }) {
    const segmentValue = activeSegment ?? (segments[0] ?? null);

    const segmentRows = useMemo(() => {
      if (!segmentValue) return [] as CoverageRow[];
      const rows = filteredRows.filter((row) => row.segment === segmentValue);
      rows.sort((a, b) => a.roleName.localeCompare(b.roleName));
      return rows;
    }, [filteredRows, segmentValue]);

    const groupOrder = useMemo(() => new Map(groups.map((g: any, idx: number) => [g.id, idx])), [groups]);
    const groupMap = useMemo(() => new Map(groups.map((g: any) => [g.id, g])), [groups]);

    const groupEntries = useMemo(() => {
      const entries: Array<{ group: any; rows: CoverageRow[] }> = [];
      const seen = new Map<number, { group: any; rows: CoverageRow[] }>();
      for (const row of segmentRows) {
        const group = groupMap.get(row.groupId) ?? { id: row.groupId, name: row.groupName, theme: null };
        let entry = seen.get(row.groupId);
        if (!entry) {
          entry = { group, rows: [] };
          seen.set(row.groupId, entry);
          entries.push(entry);
        }
        entry.rows.push(row);
      }
      for (const entry of entries) {
        entry.rows.sort((a, b) => a.roleName.localeCompare(b.roleName));
      }
      entries.sort((a, b) => {
        const orderA = groupOrder.get(a.group.id);
        const orderB = groupOrder.get(b.group.id);
        if (orderA != null && orderB != null && orderA !== orderB) return orderA - orderB;
        if (orderA != null) return -1;
        if (orderB != null) return 1;
        return String(a.group.name ?? "").localeCompare(String(b.group.name ?? ""));
      });
      return entries;
    }, [segmentRows, groupMap, groupOrder]);

    const emptyMessage = useMemo(() => {
      if (allRows.length === 0) {
        return "Monthly defaults will appear here once roles are assigned.";
      }
      if (filteredRows.length === 0) {
        return "No roles match this group filter yet.";
      }
      if (!segmentValue) {
        return "Add segments to view monthly coverage.";
      }
      return "No coverage metrics for this segment yet.";
    }, [allRows.length, filteredRows.length, segmentValue]);

    function GroupCard({ group, rows }: { group: any; rows: CoverageRow[] }) {
      const { bg, fg } = themeColors(group?.theme);
      const totalRequiredAvg = rows.reduce((sum, row) => sum + row.requiredAvg, 0);
      const totalAssignedAvg = rows.reduce((sum, row) => sum + row.assignedAvg, 0);
      const totalRequired = rows.reduce((sum, row) => sum + row.requiredTotal, 0);
      const totalAssigned = rows.reduce((sum, row) => sum + row.assignedTotal, 0);
      const diffAvg = totalAssignedAvg - totalRequiredAvg;
      const diffMagnitude = Math.abs(diffAvg);
      const diffLabel = diffMagnitude < AVERAGE_EPSILON ? "On target" : `${formatSigned(diffAvg)} avg`;
      const diffColor = diffMagnitude < AVERAGE_EPSILON ? "informative" : diffAvg > 0 ? "success" : "danger";
      const totalsDiff = totalAssigned - totalRequired;
      const totalsDiffLabel = totalsDiff === 0 ? "0 diff" : `${totalsDiff > 0 ? "+" : ""}${totalsDiff} diff`;
      const totalsPercentLabel = formatStaffingPercent(totalAssigned, totalRequired);
      const totalsSummaryParts = [totalsDiffLabel];
      if (totalsPercentLabel) {
        totalsSummaryParts.push(`${totalsPercentLabel} staffed`);
      }
      const needsMet = rows.every((row) => row.assignedAvg + AVERAGE_EPSILON >= row.requiredAvg);
      const borderColor =
        rows.length === 0
          ? tokens.colorNeutralStroke2
          : needsMet
          ? tokens.colorPaletteGreenBorderActive
          : tokens.colorPaletteRedBorderActive;
      const cardStyle: CSSProperties = {
        borderColor,
        borderLeftColor: borderColor,
      };
      if (bg) cardStyle.backgroundColor = bg;
      if (fg) cardStyle.color = fg;

      return (
        <Card className={styles.boardGroupCard} style={cardStyle}>
          <CardHeader
            header={<Title3>{group?.name ?? `Group ${rows[0]?.groupId ?? ""}`}</Title3>}
            description={<Caption1 className={styles.groupMeta}>{group?.theme || "No Theme"}</Caption1>}
            action={
              <Badge appearance="ghost">
                {rows.length} role{rows.length === 1 ? "" : "s"}
              </Badge>
            }
          />
          <div className={styles.boardGroupSummary}>
            <Subtitle2>
              Avg defaults {formatAverage(totalAssignedAvg)} / need {formatAverage(totalRequiredAvg)}
            </Subtitle2>
            <Badge appearance="outline" color={diffColor}>
              {diffLabel}
            </Badge>
          </div>
          <div className={styles.boardGroupSummary}>
            <Caption1>
              Totals {totalAssigned}/{totalRequired}
            </Caption1>
            <Caption1 className={styles.metricHint}>{totalsSummaryParts.join(" · ")}</Caption1>
          </div>
          <div className={styles.boardRolesGrid}>
            {rows.map((row) => (
              <RoleSummary key={row.key} row={row} />
            ))}
          </div>
        </Card>
      );
    }

    function RoleSummary({ row }: { row: CoverageRow }) {
      const diffAvg = row.assignedAvg - row.requiredAvg;
      const diffMagnitude = Math.abs(diffAvg);
      const diffLabel = diffMagnitude < AVERAGE_EPSILON ? "On target" : `${formatSigned(diffAvg)} avg`;
      const diffColor = diffMagnitude < AVERAGE_EPSILON ? "informative" : diffAvg > 0 ? "success" : "danger";
      const totalDiff = row.assignedTotal - row.requiredTotal;
      const totalDiffLabel = totalDiff === 0 ? "0 diff" : `${totalDiff > 0 ? "+" : ""}${totalDiff} diff`;
      const totalPercentLabel = formatStaffingPercent(row.assignedTotal, row.requiredTotal);
      const totalsHintParts = [totalDiffLabel];
      if (totalPercentLabel) {
        totalsHintParts.push(`${totalPercentLabel} staffed`);
      }

      return (
        <div className={styles.boardRoleCard}>
          <div className={styles.roleHeader}>
            <div className={styles.roleName}>{row.roleName}</div>
            <Badge appearance="outline" color={diffColor}>
              {diffLabel}
            </Badge>
          </div>
          <div className={styles.metricsRow}>
            <div className={styles.metricBlock}>
              <span className={styles.metricLabel}>Avg need</span>
              <span className={styles.metricValue}>{formatAverage(row.requiredAvg)}</span>
              <span className={styles.metricHint}>{row.requiredTotal} total</span>
            </div>
            <div className={styles.metricBlock}>
              <span className={styles.metricLabel}>Avg defaults</span>
              <span className={styles.metricValue}>{formatAverage(row.assignedAvg)}</span>
              <span className={styles.metricHint}>{row.assignedTotal} total</span>
            </div>
            <div className={styles.metricBlock}>
              <span className={styles.metricLabel}>Totals</span>
              <span className={styles.metricValue}>
                {row.assignedTotal}/{row.requiredTotal}
              </span>
              <span className={styles.metricHint}>{totalsHintParts.join(" · ")}</span>
            </div>
          </div>
          <div className={styles.weekdayChips}>
            {WEEKDAY_ORDER.map((w) => {
              const occurrences = weekdayCounts[w] ?? 0;
              if (!occurrences) return null;
              const breakdown = row.weekdayBreakdown[w];
              return (
                <Tooltip
                  key={w}
                  content={`${occurrences} ${WEEKDAYS[w - 1]}${occurrences === 1 ? "" : "s"} this month`}
                  relationship="description"
                >
                  <span className={styles.weekdayChip}>
                    {WEEKDAYS[w - 1].slice(0, 3)} {formatAverage(breakdown.assignedAvg)}/
                    {formatAverage(breakdown.requiredAvg)}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.boardOverlay}>
        <div className={styles.boardSurface}>
          <div className={styles.boardHeader}>
            <div className={styles.boardHeaderLeft}>
              <div className={styles.boardHeading}>Monthly Coverage</div>
              <div className={styles.boardMeta}>
                {monthLabel
                  ? `${monthLabel} · ${totalWeekdays} weekdays`
                  : "Select a month to see coverage insights"}
              </div>
              {selectedGroup && <div className={styles.boardSubmeta}>Showing {selectedGroup.name}</div>}
              <div className={styles.weekdayChips}>
                {WEEKDAY_ORDER.map((w) => {
                  const count = weekdayCounts[w] ?? 0;
                  if (!count) return null;
                  return (
                    <span key={w} className={styles.weekdayChip}>
                      {WEEKDAYS[w - 1].slice(0, 3)} × {count}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className={styles.boardControls}>
              {segments.length > 0 && segmentValue && (
                <TabList
                  size="small"
                  selectedValue={segmentValue}
                  onTabSelect={(_, data) => {
                    if (typeof data.value === "string") {
                      onSegmentChange(data.value as Segment);
                    }
                  }}
                >
                  {segments.map((seg) => (
                    <Tab key={seg} value={seg}>
                      {seg}
                    </Tab>
                  ))}
                </TabList>
              )}
              <Dropdown
                className={styles.boardFilter}
                aria-label="Filter coverage by group"
                size="small"
                selectedOptions={[groupFilterId]}
                onOptionSelect={(_, data) => {
                  const value = data.optionValue ?? "all";
                  onGroupFilterChange(String(value));
                }}
                disabled={groups.length === 0}
              >
                <Option value="all" text="All groups">
                  All groups
                </Option>
                {groups.map((group: any) => (
                  <Option key={group.id} value={String(group.id)} text={group.name}>
                    {group.name}
                  </Option>
                ))}
              </Dropdown>
              <Button appearance="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
          <div className={styles.boardBody}>
            {segmentRows.length === 0 ? (
              <div className={styles.emptyState}>{emptyMessage}</div>
            ) : (
              <div className={styles.boardGroupGrid}>
                {groupEntries.map((entry) => (
                  <GroupCard
                    key={entry.group.id ?? entry.rows[0]?.groupId ?? entry.rows[0]?.key}
                    group={entry.group}
                    rows={entry.rows}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function WeeklyOverrideModal({ personId, onClose }: { personId: number; onClose: () => void }) {
    const person = people.find(p => p.id === personId);
    if (!person) return null;
    const weekdays = [1, 2, 3, 4, 5];
    const segNames = segmentNames;
    return (
      <Dialog open onOpenChange={(_, d)=>{ if(!d.open) onClose(); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Weekly Overrides - {person.first_name} {person.last_name}</DialogTitle>
            <DialogContent>
              <Table size="small" aria-label="Weekly overrides">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell></TableHeaderCell>
                    {weekdays.map(w => (
                      <TableHeaderCell key={w}>{WEEKDAYS[w - 1].slice(0, 3)}</TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segNames.map(seg => (
                    <TableRow key={seg}>
                      <TableCell>{seg}</TableCell>
                      {weekdays.map(w => {
                        const ov = monthlyOverrides.find(o => o.person_id === personId && o.weekday === w && o.segment === seg);
                        const options = roleListForSegment(seg);
                        return (
                          <TableCell key={w}>
                            <SmartSelect
                              options={[{ value: "", label: "(default)" }, ...options.map((r: any) => ({ value: String(r.id), label: r.name }))]}
                              value={ov?.role_id != null ? String(ov.role_id) : null}
                              onChange={(v) => {
                                const rid = v ? Number(v) : null;
                                setWeeklyOverride(personId, w, seg, rid);
                              }}
                              placeholder="(default)"
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }

  function WeekNumberModal({ personId, onClose }: { personId: number; onClose: () => void }) {
    const person = people.find(p => p.id === personId);
    if (!person) return null;
    const weekNumbers = [1, 2, 3, 4, 5];
    const segNames = segmentNames;
    
    // Load week_start_mode setting
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
      logger.error('Failed to load week_start_mode:', e);
    }
    
    // Parse selected month to get year and month
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    
    // Generate week date ranges
    const weekLabels: { [key: number]: string } = {};
    weekNumbers.forEach(w => {
      const range = getWeekDateRange(year, month, w, weekStartMode);
      if (range) {
        weekLabels[w] = `Week ${w}\n${formatDateRange(range.start, range.end)}`;
      } else {
        weekLabels[w] = `Week ${w}`;
      }
    });
    
    return (
      <Dialog open onOpenChange={(_, d)=>{ if(!d.open) onClose(); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Week-by-Week Overrides - {person.first_name} {person.last_name}</DialogTitle>
            <DialogContent>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
                Week numbers calculated using <strong>{weekStartMode === 'first_monday' ? 'First Monday' : 'First Day'}</strong> mode.
                {weekStartMode === 'first_monday' && ' Days before the first Monday are not assigned to any week.'}
              </div>
              <Table size="small" aria-label="Week overrides">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell></TableHeaderCell>
                    {weekNumbers.map(w => (
                      <TableHeaderCell key={w} style={{ whiteSpace: 'pre-line', textAlign: 'center', fontSize: '11px' }}>
                        {weekLabels[w]}
                      </TableHeaderCell>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segNames.map(seg => (
                    <TableRow key={seg}>
                      <TableCell>{seg}</TableCell>
                      {weekNumbers.map(w => {
                        const ov = monthlyWeekOverrides.find(o => o.person_id === personId && o.week_number === w && o.segment === seg);
                        const options = roleListForSegment(seg);
                        return (
                          <TableCell key={w}>
                            <SmartSelect
                              options={[{ value: "", label: "(default)" }, ...options.map((r: any) => ({ value: String(r.id), label: r.name }))]}
                              value={ov?.role_id != null ? String(ov.role_id) : null}
                              onChange={(v) => {
                                const rid = v ? Number(v) : null;
                                setWeekNumberOverride(personId, w, seg, rid);
                              }}
                              placeholder="(default)"
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }

  function NotesModal({ personId, onClose }: { personId: number; onClose: () => void }) {
    const person = people.find(p => p.id === personId);
    if (!person) return null;
    const noteObj = monthlyNotes.find(n => n.person_id === personId);
    const [text, setText] = useState<string>(noteObj?.note || "");
    return (
      <Dialog open onOpenChange={(_, d)=>{ if(!d.open) onClose(); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Notes - {person.first_name} {person.last_name}</DialogTitle>
            <DialogContent>
              <Textarea value={text} onChange={(_, d) => setText(d.value)} />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={onClose}>Cancel</Button>
              <Button appearance="primary" onClick={() => { setMonthlyNote(personId, text); onClose(); }}>Save</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        {/* Top row: Controls */}
        <div className={styles.topRow}>
          <div className={styles.controlGroup}>
            <span className={styles.label}>Month</span>
            <FluentDateInput className={styles.field} type="month" value={selectedMonth} onChange={(_, d) => setSelectedMonth(d.value)} />
          </div>
          <div className={styles.controlGroup}>
            <span className={styles.label}>Sort by</span>
            <Dropdown
              className={styles.field}
              selectedOptions={[sortKey]}
              value={sortKeyLabel}
              onOptionSelect={(_, data) => setSortKey(data.optionValue as any)}
            >
              <Option value="name" text="Name">Name</Option>
              <Option value="email" text="Email">Email</Option>
              <Option value="brother_sister" text="B/S">B/S</Option>
              <Option value="commuter" text="Commute">Commute</Option>
              <Option value="active" text="Active">Active</Option>
              <Option value="avail_mon" text="Mon">Mon</Option>
              <Option value="avail_tue" text="Tue">Tue</Option>
              <Option value="avail_wed" text="Wed">Wed</Option>
              <Option value="avail_thu" text="Thu">Thu</Option>
              <Option value="avail_fri" text="Fri">Fri</Option>
              {segmentNames.map(seg => (
                <Option key={seg} value={seg} text={`${seg} Role`}>{`${seg} Role`}</Option>
              ))}
            </Dropdown>
          </div>
          <Button 
            appearance="subtle" 
            size="small"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          >
            {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </Button>
          <Checkbox
            label="Trainees only"
            checked={showOnlyTrainees}
            onChange={(_, data) => setShowOnlyTrainees(!!data.checked)}
          />
          <PeopleFiltersBar state={filters} onChange={(next) => setFilters((s) => ({ ...s, ...next }))} />
        </div>
        
        {/* Action row */}
        <div className={styles.actionRow}>
          <div className={styles.primaryActions}>
            <Button 
              appearance={monthlyEditing ? 'primary' : 'secondary'}
              onClick={() => setMonthlyEditing(!monthlyEditing)}
            >
              {monthlyEditing ? 'Done Editing' : 'Edit Defaults'}
            </Button>
            {monthlyEditing && (
              <Button
                appearance={showDashboard ? 'primary' : 'secondary'}
                onClick={() => setShowDashboard((prev) => !prev)}
              >
                {showDashboard ? 'Hide Dashboard' : 'Dashboard'}
              </Button>
            )}
            <Button appearance="secondary" onClick={() => void applyMonthlyDefaults(selectedMonth)}>
              Apply to Month
            </Button>
          </div>
          
          <div className={styles.secondaryActions}>
            <div className={styles.copySection}>
              <div className={styles.controlGroup} style={{ minWidth: '110px' }}>
                <span className={styles.label}>Copy from</span>
                <FluentDateInput type="month" value={copyFromMonth} onChange={(_, d) => setCopyFromMonth(d.value)} />
              </div>
              <Button appearance="primary" size="small" onClick={handleCopyClick}>
                Copy
              </Button>
            </div>
            
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button appearance="secondary" icon={<MoreHorizontal20Regular />}>
                  Export
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem onClick={() => exportMonthlyDefaults(selectedMonth)}>Export HTML</MenuItem>
                  <MenuItem onClick={handleExportXlsx}>Export Excel (.xlsx)</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        </div>
      </div>
      <div className={styles.scroll}>
        <Table size="small" aria-label="Monthly defaults">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              {segmentNames.map((seg) => (
                <TableHeaderCell key={seg}>{seg}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayPeople.map((p: any) => {
              const note = monthlyNotes.find(n => n.person_id === p.id)?.note;
              const trainee = traineeInfo.get(p.id);
              const tooltipContent = trainee?.isTrainee && trainee.incompleteAreas.length > 0
                ? `Trainee - needs exposure to: ${trainee.incompleteAreas.join(', ')}`
                : note || "Add note";
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <PersonName personId={p.id}>
                      {p.last_name}, {p.first_name}
                    </PersonName>
                    {trainee?.isTrainee && (
                      <Badge appearance="tint" color="informative" size="small" style={{ marginLeft: tokens.spacingHorizontalXS }}>
                        Trainee
                      </Badge>
                    )}
                    {monthlyEditing && (
                      <>
                        <Link appearance="subtle" className={styles.inlineLink} onClick={() => setWeekdayPerson(p.id)}>
                          Days{monthlyOverrides.some((o) => o.person_id === p.id) ? "*" : ""}
                        </Link>
                        <Link appearance="subtle" className={styles.inlineLink} onClick={() => setWeekNumberPerson(p.id)}>
                          Weeks{monthlyWeekOverrides.some((o) => o.person_id === p.id) ? "*" : ""}
                        </Link>
                      </>
                    )}
                    {(note || monthlyEditing || trainee?.isTrainee) && (
                      <Tooltip content={tooltipContent} relationship="description">
                        <Button size="small" appearance="subtle" icon={<Note20Regular />} onClick={() => setNotePerson(p.id)} />
                      </Tooltip>
                    )}
                  </TableCell>
                  {segmentNames.map((seg) => {
                    const def = monthlyDefaults.find(
                      (d) => d.person_id === p.id && d.segment === seg,
                    );
                    const options = roleListForSegment(seg);
                    return (
                      <TableCell key={seg}>
                        <SmartSelect
                          options={[{ value: "", label: "--" }, ...options.map((r: any) => ({ value: String(r.id), label: r.name }))]}
                          value={def?.role_id != null ? String(def.role_id) : null}
                          onChange={(v) => {
                            const rid = v ? Number(v) : null;
                            setMonthlyDefault(p.id, seg, rid);
                          }}
                          placeholder="--"
                          disabled={!monthlyEditing}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {monthlyEditing && showDashboard && (
        <MonthlyCoverageBoard
          monthLabel={dashboardData.monthLabel}
          totalWeekdays={dashboardData.totalWeekdays}
          weekdayCounts={dashboardData.weekdayCounts}
          filteredRows={filteredDashboardRows}
          allRows={dashboardData.rows}
          segments={segmentNames}
          activeSegment={activeDashboardSegment}
          onSegmentChange={(segment) => setActiveDashboardSegment(segment)}
          groupFilterId={dashboardGroupId}
          onGroupFilterChange={(value) => setDashboardGroupId(value)}
          groups={groups}
          selectedGroup={selectedDashboardGroup}
          onClose={() => setShowDashboard(false)}
        />
      )}
      {weekdayPerson !== null && (
        <WeeklyOverrideModal personId={weekdayPerson} onClose={() => setWeekdayPerson(null)} />
      )}
      {weekNumberPerson !== null && (
        <WeekNumberModal personId={weekNumberPerson} onClose={() => setWeekNumberPerson(null)} />
      )}
      {notePerson !== null && (
        <NotesModal personId={notePerson} onClose={() => setNotePerson(null)} />
      )}
      
      {/* Dialog components */}
      {dialogs.alertState && (
        <AlertDialog
          open={true}
          title={dialogs.alertState.title}
          message={dialogs.alertState.message}
          onClose={dialogs.closeAlert}
        />
      )}
      
      {dialogs.confirmState && (
        <Dialog open onOpenChange={(_, data) => !data.open && dialogs.handleConfirm(false)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>{dialogs.confirmState.options.title || "Confirm"}</DialogTitle>
              <DialogContent>{dialogs.confirmState.options.message}</DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => dialogs.handleConfirm(false)}>
                  {dialogs.confirmState.options.cancelText || "Cancel"}
                </Button>
                <Button appearance="primary" onClick={() => dialogs.handleConfirm(true)}>
                  {dialogs.confirmState.options.confirmText || "OK"}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}

