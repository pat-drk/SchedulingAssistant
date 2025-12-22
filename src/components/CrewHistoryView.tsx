import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input, Dropdown, Option, Button, Checkbox, Table, TableHeader, TableBody, TableRow, TableHeaderCell, TableCell, makeStyles, tokens, Label, Badge } from "@fluentui/react-components";
import SmartSelect from "./controls/SmartSelect";
import PersonName from "./PersonName";
import type { Segment } from "../services/segments";
import PeopleFiltersBar, { filterPeopleList, PeopleFiltersState, freshPeopleFilters } from "./filters/PeopleFilters";

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

interface CrewHistoryViewProps {
  sqlDb: any;
  monthlyDefaults: any[];
  segments: any[];
  people: any[];
  roles: any[];
  groups: any[];
  roleListForSegment: (segment: Segment) => any[];
  setMonthlyDefaultForMonth: (
    month: string,
    personId: number,
    segment: Segment,
    roleId: number | null,
  ) => void;
  all: (sql: string, params?: any[]) => any[];
}

const NAME_COL_PX = 240;
const SEG_COL_PX = 160;

const useCrewHistoryViewStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
    rowGap: tokens.spacingVerticalM,
  },
  toolbar: {
    display: 'grid',
    gap: tokens.spacingVerticalS,
    paddingBlockEnd: tokens.spacingVerticalS,
    minWidth: 0,
  },
  controlsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    alignItems: 'stretch',
    gridAutoRows: 'minmax(40px, auto)',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  controlCell: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'end',
    '& > *': { maxWidth: '100%' },
  },
  stack: {
    display: 'grid',
    gridAutoRows: 'max-content',
    rowGap: tokens.spacingVerticalXS,
    alignItems: 'stretch',
    minWidth: 0,
    '& > *': { minWidth: 0 },
  },
  full: {
    width: '100%',
  },
  segmentsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXS,
    paddingBlockEnd: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  monthRange: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
  scroll: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'auto',
    overscrollBehaviorX: 'contain',
  },
  stickyName: {
    position: 'sticky',
    left: '0px',
    zIndex: 3,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: `inset -1px 0 0 ${tokens.colorNeutralStroke2}`,
    width: `${NAME_COL_PX}px`,
    minWidth: `${NAME_COL_PX}px`,
    maxWidth: `${NAME_COL_PX}px`,
  },
  stickySeg: {
    position: 'sticky',
    left: `${NAME_COL_PX}px`,
    zIndex: 2,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: `inset -1px 0 0 ${tokens.colorNeutralStroke2}`,
    width: `${SEG_COL_PX}px`,
    minWidth: `${SEG_COL_PX}px`,
    maxWidth: `${SEG_COL_PX}px`,
  },
});

export default function CrewHistoryView({
  sqlDb,
  monthlyDefaults,
  segments,
  people,
  roles,
  groups,
  roleListForSegment,
  setMonthlyDefaultForMonth,
  all,
}: CrewHistoryViewProps) {
  const styles = useCrewHistoryViewStyles();
  // Cache for converting hex colors to CSS styles so we don't recompute for every cell
  const colorStyleCache = useRef<Map<string, React.CSSProperties>>(new Map());

  function hexToRgb(hex?: string): [number, number, number] | null {
    if (!hex) return null;
    const s = hex.trim();
    const m = s.match(/^#?([\da-fA-F]{3}|[\da-fA-F]{6})$/);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const num = parseInt(h, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return [r, g, b];
  }

  function styleForGroupColor(hex?: string): React.CSSProperties | undefined {
    if (!hex) return undefined;
    const cached = colorStyleCache.current.get(hex);
    if (cached) return cached;
    const rgb = hexToRgb(hex);
    if (!rgb) return undefined;
    const [r, g, b] = rgb;
    // Subtle overlay that adapts to light/dark themes by using transparency
    const bgAlpha = 0.18;
    const borderAlpha = 0.35;
    const style: React.CSSProperties = {
      backgroundImage: `linear-gradient(0deg, rgba(${r}, ${g}, ${b}, ${bgAlpha}), rgba(${r}, ${g}, ${b}, ${bgAlpha}))`,
      // Use an inset box-shadow as a border to avoid altering table layout
      boxShadow: `inset 0 0 0 1px rgba(${r}, ${g}, ${b}, ${borderAlpha})`,
    };
    colorStyleCache.current.set(hex, style);
    return style;
  }
  const [defs, setDefs] = useState<any[]>([]);
  const [filters, setFilters] = useState<PeopleFiltersState>(() => freshPeopleFilters());
  const segmentNames = useMemo(
    () => segments.map((s) => s.name as Segment),
    [segments],
  );
  const [showSeg, setShowSeg] = useState<Record<string, boolean>>(
    () => Object.fromEntries(segmentNames.map((s) => [s, true])),
  );
  // People-wide filters handled by PeopleFiltersBar
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [sortField, setSortField] = useState<string>("last");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [startMonth, setStartMonth] = useState<string>("");
  const [endMonth, setEndMonth] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [editPast, setEditPast] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOnlyTrainees, setShowOnlyTrainees] = useState(false);

  const sortFieldLabel = useMemo(() => {
    const base: Record<string, string> = {
      last: "Last Name",
      first: "First Name",
      brother_sister: "B/S",
      commuter: "Commute",
      active: "Active",
      avail_mon: "Mon",
      avail_tue: "Tue",
      avail_wed: "Wed",
      avail_thu: "Thu",
      avail_fri: "Fri",
    };
    if (base[sortField]) return base[sortField];
    if (segmentNames.includes(sortField as Segment)) {
      return `${sortField} Role`;
    }
    return "";
  }, [sortField, segmentNames]);

  const filterMonthLabel = filterMonth ? filterMonth : "All Months";
  const groupFilterLabel = useMemo(
    () => (groupFilter.length ? groupFilter.join(", ") : "All Groups"),
    [groupFilter],
  );

  useEffect(() => {
    if (sqlDb) {
      setDefs(all(`SELECT * FROM monthly_default`));
    }
  }, [sqlDb, monthlyDefaults]);

  const nextMonth = useMemo(() => {
    const now = new Date();
    const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${nm.getFullYear()}-${pad2(nm.getMonth() + 1)}`;
  }, []);

  useEffect(() => {
    if (startMonth && endMonth) return;
    let min: string | null = null;
    let max: string | null = null;
    defs.forEach((d: any) => {
      if (!min || d.month < min) min = d.month;
      if (!max || d.month > max) max = d.month;
    });
    const nm = nextMonth;
    if (!min) min = nm;
  if (!max || String(nm) > String(max)) max = nm;
    setStartMonth(min);
    setEndMonth(max);
  }, [defs, nextMonth, startMonth, endMonth]);

  const months = useMemo(() => {
    const arr: string[] = [];
    if (!startMonth || !endMonth) return arr;
    const [sy, sm] = startMonth.split("-").map(Number);
    const [ey, em] = endMonth.split("-").map(Number);
    let d = new Date(sy, sm - 1, 1);
    const end = new Date(ey, em - 1, 1);
    while (d <= end) {
      arr.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
      d.setMonth(d.getMonth() + 1);
    }
    return arr;
  }, [startMonth, endMonth]);

  useEffect(() => {
    if (months.length && !months.includes(filterMonth)) {
      setFilterMonth(months[0]);
    }
  }, [months, filterMonth]);

  const filteredPeople = useMemo(() => {
    const monthsToCheck = filterMonth ? [filterMonth] : months;
    return filterPeopleList(people, filters)
      .filter((p: any) => {
        if (groupFilter.length === 0) return true;
        return monthsToCheck.some((m) =>
          segmentNames.some((seg) => {
            const def = defs.find(
              (d) => d.month === m && d.person_id === p.id && d.segment === seg,
            );
            const role = roles.find((r) => r.id === def?.role_id);
            return role && groupFilter.includes(role.group_name);
          }),
        );
  })
      .sort((a: any, b: any) => {
        let av: any;
        let bv: any;
        switch (sortField) {
          case "last":
            av = a.last_name;
            bv = b.last_name;
            break;
          case "first":
            av = a.first_name;
            bv = b.first_name;
            break;
          case "brother_sister":
            av = a.brother_sister || "";
            bv = b.brother_sister || "";
            break;
          case "commuter":
            av = a.commuter ? 1 : 0;
            bv = b.commuter ? 1 : 0;
            break;
          case "active":
            av = a.active ? 1 : 0;
            bv = b.active ? 1 : 0;
            break;
          case "avail_mon":
            av = a.avail_mon;
            bv = b.avail_mon;
            break;
          case "avail_tue":
            av = a.avail_tue;
            bv = b.avail_tue;
            break;
          case "avail_wed":
            av = a.avail_wed;
            bv = b.avail_wed;
            break;
          case "avail_thu":
            av = a.avail_thu;
            bv = b.avail_thu;
            break;
          case "avail_fri":
            av = a.avail_fri;
            bv = b.avail_fri;
            break;
          default:
            if (segmentNames.includes(sortField)) {
              const month = filterMonth || months[0];
              const defA = defs.find(
                (d) =>
                  d.month === month &&
                  d.person_id === a.id &&
                  d.segment === sortField,
              );
              const defB = defs.find(
                (d) =>
                  d.month === month &&
                  d.person_id === b.id &&
                  d.segment === sortField,
              );
              const roleA = roles.find((r) => r.id === defA?.role_id)?.name || "";
              const roleB = roles.find((r) => r.id === defB?.role_id)?.name || "";
              av = roleA;
              bv = roleB;
            } else {
              av = "";
              bv = "";
            }
            break;
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [
    people,
    defs,
    roles,
    months,
  filters,
    groupFilter,
    sortField,
    sortDir,
    filterMonth,
    segmentNames,
  ]);

  // Calculate trainee info
  const traineeInfo = useMemo(() => {
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
    const REQUIRED_AREAS = ["Dining Room", "Machine Room", "Veggie Room", "Receiving"];
    const now = new Date();
    const info = new Map<number, { isTrainee: boolean; completedAreas: Set<string> }>();

    for (const person of filteredPeople) {
      if (!person.start_date) {
        info.set(person.id, { isTrainee: false, completedAreas: new Set() });
        continue;
      }

      const startDate = new Date(person.start_date);
      const endDate = person.end_date ? new Date(person.end_date) : null;
      const sixMonthsAfterStart = new Date(startDate.getTime() + SIX_MONTHS_MS);
      const isTrainee = now < sixMonthsAfterStart && (!endDate || now < endDate);

      if (!isTrainee) {
        info.set(person.id, { isTrainee: false, completedAreas: new Set() });
        continue;
      }

      // Get all groups they've been assigned to across all months
      const completedAreas = new Set<string>();
      for (const def of defs) {
        if (def.person_id === person.id && def.role_id) {
          const role = roles.find(r => r.id === def.role_id);
          if (role) {
            const group = groups.find(g => g.id === role.group_id);
            if (group && REQUIRED_AREAS.includes(group.name)) {
              completedAreas.add(group.name);
            }
          }
        }
      }

      info.set(person.id, { isTrainee, completedAreas });
    }

    return info;
  }, [filteredPeople, defs, roles, groups]);

  // Filter for trainees if toggle is on
  const displayPeople = useMemo(() => {
    if (!showOnlyTrainees) return filteredPeople;
    return filteredPeople.filter(p => traineeInfo.get(p.id)?.isTrainee);
  }, [filteredPeople, showOnlyTrainees, traineeInfo]);

  useEffect(() => {
    setShowSeg((prev) => {
      const next: Record<string, boolean> = {};
      segmentNames.forEach((s) => {
        next[s] = prev[s] ?? true;
      });
      return next;
    });
  }, [segmentNames]);

  const segs: Segment[] = segmentNames.filter((s) => showSeg[s]);

  function RoleSelect({
    month,
    personId,
    seg,
    def,
  }: {
    month: string;
    personId: number;
    seg: Segment;
    def: any;
  }) {
  const options = roleListForSegment(seg);
    return (
      <SmartSelect
        options={[{ value: "", label: "--" }, ...options.map((r: any) => ({ value: String(r.id), label: r.name }))]}
        value={def?.role_id != null ? String(def.role_id) : null}
        onChange={(v) => {
          const rid = v ? Number(v) : null;
          setMonthlyDefaultForMonth(month, personId, seg, rid);
          setDefs(all(`SELECT * FROM monthly_default`));
        }}
        placeholder="--"
      />
    );
  }

  function cellData(month: string, personId: number, seg: Segment) {
    const def = defs.find(
      (d: any) => d.month === month && d.person_id === personId && d.segment === seg,
    );
    const role = roles.find((r: any) => r.id === def?.role_id);
    const color = role ? role.group_color : undefined;
    if (month === nextMonth || editPast) {
      return {
        content: (
          <RoleSelect
            month={month}
            personId={personId}
            seg={seg}
            def={def}
          />
        ),
        color,
      };
    }
    return { content: role?.code || "", color };
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.controlsGrid}>
          <PeopleFiltersBar state={filters} onChange={(next) => setFilters((s) => ({ ...s, ...next }))} />
          <div className={styles.stack}>
            <Label>Sort</Label>
            <Dropdown
              className={styles.full}
              selectedOptions={[sortField]}
              value={sortFieldLabel}
              onOptionSelect={(_, data) => setSortField(data.optionValue as any)}
            >
              <Option value="last" text="Last Name">Last Name</Option>
              <Option value="first" text="First Name">First Name</Option>
              <Option value="brother_sister" text="B/S">B/S</Option>
              <Option value="commuter" text="Commute">Commute</Option>
              <Option value="active" text="Active">Active</Option>
              <Option value="avail_mon" text="Mon">Mon</Option>
              <Option value="avail_tue" text="Tue">Tue</Option>
              <Option value="avail_wed" text="Wed">Wed</Option>
              <Option value="avail_thu" text="Thu">Thu</Option>
              <Option value="avail_fri" text="Fri">Fri</Option>
              {segmentNames.map((seg) => {
                const label = `${seg} Role`;
                return (
                  <Option key={seg} value={seg} text={label}>
                    {label}
                  </Option>
                );
              })}
            </Dropdown>
          </div>
          <div className={styles.stack}>
            <Label>Filter month</Label>
            <Dropdown
              className={styles.full}
              placeholder="All Months"
              selectedOptions={[filterMonth || ""]}
              value={filterMonthLabel}
              onOptionSelect={(_, data) => setFilterMonth((data.optionValue as string) || "")}
            >
              <Option value="" text="All Months">All Months</Option>
              {months.map((m) => (
                <Option key={m} value={m} text={m}>
                  {m}
                </Option>
              ))}
            </Dropdown>
          </div>
          <div className={styles.stack}>
            <Label>Role groups</Label>
            <Dropdown
              className={styles.full}
              multiselect
              placeholder="All Groups"
              selectedOptions={groupFilter}
              value={groupFilterLabel}
              onOptionSelect={(_, data) => setGroupFilter(data.selectedOptions as string[])}
            >
              {groups.map((g) => (
                <Option key={g.name} value={g.name} text={g.name}>
                  {g.name}
                </Option>
              ))}
            </Dropdown>
          </div>
          <div className={styles.controlCell}>
            <Button onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}> {sortDir === "asc" ? "Asc" : "Desc"} </Button>
          </div>
          <div className={styles.controlCell}>
            <Button appearance="secondary" onClick={() => setShowAdvanced(v => !v)}>{showAdvanced ? 'Hide options' : 'More options'}</Button>
          </div>
          <div className={styles.controlCell}>
            <Checkbox label="Trainees only" checked={showOnlyTrainees} onChange={(_, data) => setShowOnlyTrainees(!!data.checked)} />
          </div>
          {showAdvanced && (
            <>
              <div className={styles.controlCell}><Checkbox label="Edit past months" checked={editPast} onChange={(_, data) => setEditPast(!!data.checked)} /></div>
              <div className={`${styles.controlCell} ${styles.monthRange}`}>
                <span className={styles.label}>From</span>
                <Input type="month" value={startMonth} onChange={(_, d) => setStartMonth(d.value)} />
                <span className={styles.label}>To</span>
                <Input type="month" value={endMonth} onChange={(_, d) => setEndMonth(d.value)} />
              </div>
            </>
          )}
        </div>
        <div className={styles.segmentsWrap}>
          <span className={styles.label}>Segments:</span>
          {segmentNames.map((seg) => (
            <Checkbox key={seg} label={seg} checked={!!showSeg[seg]} onChange={(_, data) => setShowSeg({ ...showSeg, [seg]: !!data.checked })} />
          ))}
        </div>
      </div>
      <div className={styles.scroll}>
        <Table size="small" aria-label="Crew history">
          <TableHeader>
            <TableRow>
              <TableHeaderCell className={styles.stickyName}>
                Name
              </TableHeaderCell>
              <TableHeaderCell className={styles.stickySeg}>
                Segment
              </TableHeaderCell>
              {months.map((m) => (
                <TableHeaderCell key={m}>{m}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayPeople.map((p) => {
              const segList = segs;
              const trainee = traineeInfo.get(p.id);
              const REQUIRED_AREAS = ["Dining Room", "Machine Room", "Veggie Room", "Receiving"];
              const incompleteAreas = trainee?.isTrainee 
                ? REQUIRED_AREAS.filter(area => !trainee.completedAreas.has(area))
                : [];
              return (
                <React.Fragment key={p.id}>
                  {segList.map((seg, idx) => (
                    <TableRow key={`${p.id}-${seg}`} style={trainee?.isTrainee ? { backgroundColor: tokens.colorNeutralBackground2 } : undefined}>
                      {idx === 0 && (
                        <TableCell rowSpan={segList.length} className={styles.stickyName}>
                          <PersonName personId={p.id}>
                            {p.last_name}, {p.first_name}
                          </PersonName>
                          {trainee?.isTrainee && (
                            <Badge appearance="tint" color="informative" size="small" style={{ marginLeft: tokens.spacingHorizontalXS }}>
                              Trainee
                            </Badge>
                          )}
                          {trainee?.isTrainee && incompleteAreas.length > 0 && (
                            <div style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS }}>
                              Needs: {incompleteAreas.join(', ')}
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className={styles.stickySeg}>{seg}</TableCell>
                      {months.map((m) => {
                        const { content, color } = cellData(m, p.id, seg);
                        const style = styleForGroupColor(color);
                        return (
                          <TableCell key={m} style={style}>
                            {content}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

