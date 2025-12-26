import { loadExcelJS } from './exceljs-loader';
import { availabilityFor } from '../services/availability';
import { getWeekOfMonth, type WeekStartMode } from '../utils/weekCalculation';

type ExportGroupRow = {
  group_name: string;
  code: string;
  color: string;
  column_group: string;
};

type GroupInfo = Record<string, { code: string; color: string; column_group: string }>;

/** Format a list of week numbers into a readable label like "Weeks 1 & 2" or "Week 3" */
function formatWeekLabel(weeks: number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  if (sorted.length === 1) return `Week ${sorted[0]}`;
  // Check for consecutive ranges
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      if (start === end) {
        ranges.push(String(start));
      } else if (end === start + 1) {
        ranges.push(`${start} & ${end}`);
      } else {
        ranges.push(`${start}-${end}`);
      }
      if (i < sorted.length) {
        start = sorted[i];
        end = sorted[i];
      }
    }
  }
  const label = ranges.join(', ');
  return sorted.length === 1 ? `Week ${label}` : `Weeks ${label}`;
}

function loadExportGroups(): { info: GroupInfo; col1: string[]; col2: string[]; dining: string[] } {
  const rows = all<ExportGroupRow>(
    `SELECT g.name AS group_name, eg.code, eg.color, eg.column_group
       FROM export_group eg
       JOIN grp g ON g.id = eg.group_id
      ORDER BY eg.column_group, g.name`
  );
  const info: GroupInfo = {};
  const col1: string[] = [];
  const col2: string[] = [];
  const dining: string[] = [];
  for (const r of rows) {
    info[r.group_name] = { code: r.code, color: r.color, column_group: r.column_group };
    if (r.column_group === 'kitchen1') col1.push(r.group_name);
    else if (r.column_group === 'kitchen2') col2.push(r.group_name);
    else if (r.column_group === 'dining') dining.push(r.group_name);
  }
  // Ensure Lunch group is available even if export_group lacks an entry
  if (!info['Lunch']) {
    info['Lunch'] = { code: 'LUNCH', color: 'FFF9A8D4', column_group: 'dining' };
    dining.push('Lunch');
  }
  return { info, col1, col2, dining };
}


const DAY_ORDER = ['M','T','W','TH','F'] as const;
type DayLetter = typeof DAY_ORDER[number];

type Seg = 'AM'|'PM';

// ---------- Types ----------
type WithAvail = {
  avail_mon: string | null;
  avail_tue: string | null;
  avail_wed: string | null;
  avail_thu: string | null;
  avail_fri: string | null;
};

type DefaultRow = WithAvail & {
  person_id: number;
  segment: string | null; // tolerate variants
  group_name: string;
  role_id: number;
  role_name: string;
  person: string;
  commuter: number;
  month: string;
};

type DayRow = WithAvail & {
  person_id: number;
  weekday: number; // tolerate 0..4 or 1..5; we’ll normalize to DayLetter
  segment: string | null;
  group_name: string;
  role_id: number;
  role_name: string;
  person: string;
  commuter: number;
  month: string;
};

// Buckets: regular/commuter -> groupCode -> personName -> { AM days, PM days, roles, weekLabel }
type Buckets = Record<'regular'|'commuter',
  Record<string, Record<string, { AM: Set<DayLetter>; PM: Set<DayLetter>; roles: Set<string>; weekLabel: string }>>
>;

type LunchBuckets = Record<'regular'|'commuter',
  Record<string, Record<string, { days: Set<DayLetter>; roles: Set<string>; roleDays: Map<string, Set<DayLetter>>; weekLabel: string }>>
>;

type WeekRow = WithAvail & {
  person_id: number;
  week_number: number; // 1-5
  segment: string | null;
  group_name: string;
  role_id: number;
  role_name: string;
  person: string;
  commuter: number;
  month: string;
};

// ---------- DB helpers ----------
function requireDb() {
  const db = (globalThis as any).sqlDb;
  if (!db) throw new Error('No database loaded');
  return db;
}

function all<T = any>(sql: string, params: any[] = []): T[] {
  const db = requireDb();
  const stmt = db.prepare(sql);
  const rows: T[] = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject() as T);
  stmt.free();
  return rows;
}

// ---------- Month / segment / weekday normalization ----------
/** Normalize any incoming month string to "YYYY-MM". Accepts "YYYY-M", "YYYY-MM", "YYYY-MM-DD", "YYYYMM", "YYYYMMDD". */
function normalizeMonthKey(value: string): string {
  const v = (value || '').trim();
  // ISO-ish
  let m = v.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) {
    const y = m[1];
    const mm = String(parseInt(m[2], 10)).padStart(2, '0');
    return `${y}-${mm}`;
  }
  // Compact
  m = v.match(/^(\d{4})(\d{2})(\d{2})?$/);
  if (m) return `${m[1]}-${m[2]}`;
  // Fallback
  return v.slice(0, 7);
}

/** Return SQL WHERE clause and params that match many month formats for the given column. */
function monthWhere(column: string, monthKey: string): { where: string; params: string[] } {
  const ym = monthKey;                  // "YYYY-MM"
  const likeYm = `${ym}%`;              // "YYYY-MM%"
  const ymCompact = ym.replace('-', '');      // "YYYYMM"
  const ymdCompact = `${ymCompact}01`;        // "YYYYMM01"
  const ymd = `${ym}-01`;               // "YYYY-MM-01"
  const where = `(
    substr(${column}, 1, 7) = ? OR
    ${column} LIKE ? OR
    replace(${column}, '-', '') = ? OR
    replace(substr(${column}, 1, 10), '-', '') = ? OR
    ${column} = ?
  )`;
  const params = [ym, likeYm, ymCompact, ymdCompact, ymd];
  return { where, params };
}

function expandSegments(seg: string | null | undefined): Seg[] {
  const s = (seg || '').toString().trim().toUpperCase();
  if (s === 'AM') return ['AM'];
  if (s === 'PM') return ['PM'];
  // Treat '', null, 'B', 'BOTH', 'ALL', '*' as both shifts
  return ['AM','PM'];
}

/** Convert various stored weekday numbers to our DayLetter (Mon–Fri only). */
function weekdayToLetter(weekday: number): DayLetter | undefined {
  // 1..5 => Mon..Fri
  if (weekday >= 1 && weekday <= 5) return DAY_ORDER[weekday - 1];
  // 0..4 => Mon..Fri (0-based Mon)
  if (weekday >= 0 && weekday <= 4) return DAY_ORDER[weekday];
  // Unknown encodings are ignored
  return undefined;
}

function dateForDay(month: string, day: DayLetter): Date {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10));
  const first = new Date(y, m - 1, 1);
  const target = day === 'M' ? 1 : day === 'T' ? 2 : day === 'W' ? 3 : day === 'TH' ? 4 : 5;
  const diff = (target - first.getDay() + 7) % 7;
  return new Date(y, m - 1, 1 + diff);
}

/** Get availability code for a given day letter using overrides. */
function availCodeFor(day: DayLetter, row: WithAvail & { person_id: number; month: string }): string {
  const db = requireDb();
  const date = dateForDay(row.month, day);
  return availabilityFor(db, row.person_id, date);
}

/** Whether this segment is allowed by availability for the given day. */
function isAllowedByAvail(day: DayLetter, seg: Seg, row: WithAvail & { person_id: number; month: string }): boolean {
  const ac = availCodeFor(day, row);
  if (ac === 'B') return true;
  return ac === seg;
}

function isAllowedForLunch(day: DayLetter, row: WithAvail & { person_id: number; month: string }): boolean {
  const ac = availCodeFor(day, row);
  return ac === 'AM' || ac === 'PM' || ac === 'B';
}

export async function exportMonthOneSheetXlsx(month: string): Promise<void> {
  requireDb();

  // Load ExcelJS ONCE
  const ExcelJS = await loadExcelJS();

  const monthKey = normalizeMonthKey(month); // "YYYY-MM"
  const mdMonth = monthWhere('md.month', monthKey);
  const mddMonth = monthWhere('mdd.month', monthKey);

  const { info: GROUP_INFO, col1: KITCHEN_COL1_GROUPS, col2: KITCHEN_COL2_GROUPS, dining: DINING_GROUPS } = loadExportGroups();

  // NOTE: Accept all segments in SQL; normalize/expand in code.
  const defaults = all<DefaultRow>(
    `SELECT md.person_id, md.segment,
            g.name AS group_name, r.id AS role_id, r.name AS role_name,
            (p.last_name || ', ' || p.first_name) AS person,
            p.commuter AS commuter,
            p.avail_mon, p.avail_tue, p.avail_wed, p.avail_thu, p.avail_fri,
            md.month as month
       FROM monthly_default md
      JOIN role r ON r.id = md.role_id
      JOIN grp  g ON g.id = r.group_id
      JOIN person p ON p.id = md.person_id
      WHERE ${mdMonth.where} AND p.active = 1
      ORDER BY g.name, person`,
    mdMonth.params
  );

  const perDays = all<DayRow>(
    `SELECT mdd.person_id, mdd.weekday, mdd.segment,
            g.name AS group_name, r.id AS role_id, r.name AS role_name,
            (p.last_name || ', ' || p.first_name) AS person,
            p.commuter AS commuter,
            p.avail_mon, p.avail_tue, p.avail_wed, p.avail_thu, p.avail_fri,
            mdd.month as month
       FROM monthly_default_day mdd
      JOIN role r ON r.id = mdd.role_id
      JOIN grp  g ON g.id = r.group_id
      JOIN person p ON p.id = mdd.person_id
      WHERE ${mddMonth.where} AND p.active = 1`,
    mddMonth.params
  );

  // Query week-by-week overrides
  const mdwMonth = monthWhere('mdw.month', monthKey);
  const perWeeks = all<WeekRow>(
    `SELECT mdw.person_id, mdw.week_number, mdw.segment,
            g.name AS group_name, r.id AS role_id, r.name AS role_name,
            (p.last_name || ', ' || p.first_name) AS person,
            p.commuter AS commuter,
            p.avail_mon, p.avail_tue, p.avail_wed, p.avail_thu, p.avail_fri,
            mdw.month as month
       FROM monthly_default_week mdw
      JOIN role r ON r.id = mdw.role_id
      JOIN grp  g ON g.id = r.group_id
      JOIN person p ON p.id = mdw.person_id
      WHERE ${mdwMonth.where} AND p.active = 1`,
    mdwMonth.params
  );

  // Load week_start_mode setting
  let weekStartMode: WeekStartMode = 'first_monday';
  try {
    const modeRows = all<{ value: string }>(`SELECT value FROM meta WHERE key='week_start_mode'`);
    if (modeRows.length > 0 && modeRows[0].value) {
      const modeValue = modeRows[0].value;
      if (modeValue === 'first_monday' || modeValue === 'first_day') {
        weekStartMode = modeValue;
      }
    }
  } catch {
    // Use default
  }

  // Build a map of person/segment -> week_number -> role_id for week overrides
  const weekOverrideMap = new Map<string, Map<number, { roleId: number; groupName: string; roleName: string }>>();
  for (const row of perWeeks) {
    const segNorm = (row.segment || '').toString().trim().toUpperCase();
    if (segNorm === 'LUNCH') continue;
    const segs = expandSegments(segNorm);
    for (const s of segs) {
      const key = `${row.person_id}|${s}`;
      let weekMap = weekOverrideMap.get(key);
      if (!weekMap) {
        weekMap = new Map();
        weekOverrideMap.set(key, weekMap);
      }
      weekMap.set(row.week_number, { roleId: row.role_id, groupName: row.group_name, roleName: row.role_name });
    }
  }

  // Build a set of which weeks exist in the month (for calculating which weeks the default applies to)
  const [yearNum, monthNum] = monthKey.split('-').map(n => parseInt(n, 10));
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const weeksInMonth = new Set<number>();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(yearNum, monthNum - 1, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const weekNum = getWeekOfMonth(date, weekStartMode);
    if (weekNum > 0) weeksInMonth.add(weekNum);
  }
  const allWeeksArray = Array.from(weeksInMonth).sort((a, b) => a - b);

  const buckets: Buckets = { regular: {}, commuter: {} };

  // Map (person_id|segment) -> Map<DayLetter, role_id> for precise subtraction
  const psKey = (pid:number, seg:Seg) => `${pid}|${seg}`;
  const perDayMap = new Map<string, Map<DayLetter, number>>();

  // 1) Add explicit per-day assignments (respect AVAILABILITY) and build the perDayMap (by DAY LETTER)
  for (const row of perDays) {
    const dayLetter = weekdayToLetter(row.weekday);
    if (!dayLetter) continue;
    const segNorm = (row.segment || '').toString().trim().toUpperCase();
    if (segNorm === 'LUNCH') continue;

    const segs = expandSegments(segNorm);
    for (const s of segs) {
      if (!isAllowedByAvail(dayLetter, s, row)) continue; // skip days not allowed by availability

      const code = GROUP_INFO[row.group_name]?.code;
      if (!code) continue;

      const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
      const groupBucket = buckets[kind][code] || (buckets[kind][code] = {});
      const personBucket = groupBucket[row.person] || (groupBucket[row.person] = { AM: new Set<DayLetter>(), PM: new Set<DayLetter>(), roles: new Set<string>(), weekLabel: '' });
      personBucket.roles.add(row.role_name);

      if (s === 'AM') personBucket.AM.add(dayLetter);
      else personBucket.PM.add(dayLetter);

      let dayMap = perDayMap.get(psKey(row.person_id, s));
      if (!dayMap) {
        dayMap = new Map<DayLetter, number>();
        perDayMap.set(psKey(row.person_id, s), dayMap);
      }
      dayMap.set(dayLetter, row.role_id);
    }
  }

  // 2) Process week overrides FIRST to build a map of which weeks each person has overrides for
  //    This allows us to determine which weeks the default applies to
  // Key: person_id|segment|groupCode -> array of week numbers
  const weekOverrideGroupMap = new Map<string, number[]>();
  for (const row of perWeeks) {
    const segNorm = (row.segment || '').toString().trim().toUpperCase();
    if (segNorm === 'LUNCH') continue;
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;
    const segs = expandSegments(segNorm);
    for (const s of segs) {
      const key = `${row.person_id}|${s}|${code}`;
      const existing = weekOverrideGroupMap.get(key) || [];
      if (!existing.includes(row.week_number)) {
        existing.push(row.week_number);
      }
      weekOverrideGroupMap.set(key, existing);
    }
  }

  // 3) Apply defaults, considering week overrides:
  //    - Respect AVAILABILITY
  //    - SUBTRACT days that have per-day rows with a DIFFERENT role (by DAY LETTER)
  //    - Check for week overrides to determine if person appears in multiple groups with week labels
  for (const row of defaults) {
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;
    const segNorm = (row.segment || '').toString().trim().toUpperCase();
    if (segNorm === 'LUNCH') continue;

    const segs = expandSegments(segNorm);
    for (const s of segs) {
      const dayMap = perDayMap.get(psKey(row.person_id, s));
      const weekMap = weekOverrideMap.get(psKey(row.person_id, s));

      // Determine which weeks have overrides to a DIFFERENT group
      const overriddenWeeks: number[] = [];
      const defaultWeeks: number[] = [];
      
      for (const weekNum of allWeeksArray) {
        const weekOverride = weekMap?.get(weekNum);
        if (weekOverride) {
          const overrideCode = GROUP_INFO[weekOverride.groupName]?.code;
          if (overrideCode && overrideCode !== code) {
            // This week is overridden to a different group
            overriddenWeeks.push(weekNum);
          } else {
            // Override is to the same group, treat as default
            defaultWeeks.push(weekNum);
          }
        } else {
          // No override, use default
          defaultWeeks.push(weekNum);
        }
      }

      const keepLetters: DayLetter[] = [];
      for (const d of DAY_ORDER) {
        if (!isAllowedByAvail(d, s, row)) continue; // default not effective when unavailable

        const overriddenRoleId = dayMap?.get(d);
        if (overriddenRoleId == null || overriddenRoleId === row.role_id) {
          keepLetters.push(d);
        }
      }

      if (keepLetters.length === 0) continue;

      const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
      const groupBucket = buckets[kind][code] || (buckets[kind][code] = {});
      
      // Calculate week label for this default entry
      let weekLabel = '';
      if (overriddenWeeks.length > 0 && defaultWeeks.length > 0) {
        // Person has some weeks overridden to different groups - show week label
        weekLabel = formatWeekLabel(defaultWeeks);
      }
      
      // Use a composite key for person entries when week labels differ
      const personKey = weekLabel ? `${row.person}|${weekLabel}` : row.person;
      const personBucket = groupBucket[personKey] || (groupBucket[personKey] = { AM: new Set<DayLetter>(), PM: new Set<DayLetter>(), roles: new Set<string>(), weekLabel });
      personBucket.roles.add(row.role_name);

      for (const d of keepLetters) {
        if (s === 'AM') personBucket.AM.add(d);
        else personBucket.PM.add(d);
      }
    }
  }

  // 4) Add week override entries to their respective groups with week labels
  for (const row of perWeeks) {
    const segNorm = (row.segment || '').toString().trim().toUpperCase();
    if (segNorm === 'LUNCH') continue;
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;

    const segs = expandSegments(segNorm);
    for (const s of segs) {
      // Find which weeks this person has overrides for in this specific group
      const key = `${row.person_id}|${s}|${code}`;
      const weeksForThisGroup = weekOverrideGroupMap.get(key) || [];
      
      // Check if person also has a default that differs from this override group
      const personDefault = defaults.find(d => d.person_id === row.person_id && expandSegments(d.segment).includes(s));
      const defaultCode = personDefault ? GROUP_INFO[personDefault.group_name]?.code : null;
      
      // Only add week labels if the override is to a different group than the default
      const needsWeekLabel = defaultCode && defaultCode !== code;
      const weekLabel = needsWeekLabel ? formatWeekLabel(weeksForThisGroup) : '';
      
      const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
      const groupBucket = buckets[kind][code] || (buckets[kind][code] = {});
      const personKey = weekLabel ? `${row.person}|${weekLabel}` : row.person;
      const personBucket = groupBucket[personKey] || (groupBucket[personKey] = { AM: new Set<DayLetter>(), PM: new Set<DayLetter>(), roles: new Set<string>(), weekLabel });
      personBucket.roles.add(row.role_name);

      // Add all available days for this segment (week overrides apply to all days of their weeks)
      for (const d of DAY_ORDER) {
        if (!isAllowedByAvail(d, s, row)) continue;
        if (s === 'AM') personBucket.AM.add(d);
        else personBucket.PM.add(d);
      }
    }
  }

  // ---------- Sheet rendering ----------
  const [y, m] = monthKey.split('-').map(n => parseInt(n, 10));
  const monthDate = new Date(y, m - 1, 1);
  const titleText = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');
  ws.columns = [
    { width:30 }, { width:20 }, { width:10 }, { width:18 }, { width:2 },
    { width:30 }, { width:20 }, { width:10 }, { width:18 }, { width:2 },
    { width:30 }, { width:20 }, { width:10 }, { width:18 }
  ];

  ws.mergeCells(1,1,1,14);
  const titleCell = ws.getCell(1,1);
  titleCell.value = `Kitchen / Dining Room Schedule — ${titleText}`;
  titleCell.font = { bold: true, size: 18, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'center' };

  const paneState = { kitchen1: 2, kitchen2: 2, dining: 2 } as Record<'kitchen1'|'kitchen2'|'dining', number>;

  function setRowBorders(row: any, startCol: number, endCol: number) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
      const border: any = { bottom: { style: 'thin' } };
      if (c === startCol) border.left = { style: 'thin' };
      if (c === endCol) border.right = { style: 'thin' };
      cell.border = border;
    }
  }

  function renderBlock(
    pane: 'kitchen1'|'kitchen2'|'dining',
    group: string,
    people: Record<string,{AM:Set<DayLetter>;PM:Set<DayLetter>;roles:Set<string>;weekLabel:string}>)
  {
    const startCol = pane==='kitchen1'?1:pane==='kitchen2'?6:11;
    if (!people || !Object.keys(people).length) return;
    const rowIndex = paneState[pane];

    // Group header
    ws.mergeCells(rowIndex, startCol, rowIndex, startCol + 3);
    const hcell = ws.getCell(rowIndex, startCol);
    hcell.value = group;
    hcell.alignment = { horizontal: 'left' };
    const fill = GROUP_INFO[group]?.color || 'FFEFEFEF';
    hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    // Ensure all cells in the merged range are bolded so row-level fonts from
    // other panes do not override the header styling.
    for (let c = startCol; c <= startCol + 3; c++) {
      ws.getCell(rowIndex, c).font = { bold: true, size: 18 };
    }
    setRowBorders(ws.getRow(rowIndex), startCol, startCol + 3);

    function simplifyRole(role: string): string | null {
      if (role === group) return null;
      const prefix = group + ' ';
      if (role.startsWith(prefix)) {
        return role.slice(prefix.length);
      }
      return role;
    }

    let r = rowIndex + 1;
    const names = Object.keys(people).sort((a,b)=>a.localeCompare(b));
    for (const name of names) {
      const info = people[name];
      
      // Extract actual person name (strip composite key suffix if present)
      const actualName = info.weekLabel ? name.replace(`|${info.weekLabel}`, '') : name;

      // Shift column: blank if both AM & PM somewhere in the week
      const hasAM = info.AM.size > 0;
      const hasPM = info.PM.size > 0;

      // Track AM/PM coverage separately so we can show day-specific assignments
      const amList = DAY_ORDER.filter(d => info.AM.has(d));
      const pmList = DAY_ORDER.filter(d => info.PM.has(d));
      const amText = amList.length === DAY_ORDER.length ? 'Full-Time' : amList.join('/');
      const pmText = pmList.length === DAY_ORDER.length ? 'Full-Time' : pmList.join('/');
      const daySet = new Set<DayLetter>([...info.AM, ...info.PM]);
      const dayList = DAY_ORDER.filter(d => daySet.has(d));
      let days: string;
      if (hasAM && hasPM) {
        const sameDays =
          amList.length === pmList.length &&
          amList.every((d, idx) => pmList[idx] === d);
        if (sameDays) {
          days = dayList.length === DAY_ORDER.length ? 'Full-Time' : dayList.join('/');
        } else {
          const amDisplay = amText || '—';
          const pmDisplay = pmText || '—';
          days = `AM: ${amDisplay}; PM: ${pmDisplay}`;
        }
      } else {
        days = dayList.length === DAY_ORDER.length ? 'Full-Time' : dayList.join('/');
      }

      // Display name with week label if present
      const displayName = info.weekLabel ? `${actualName} (${info.weekLabel})` : actualName;
      ws.getCell(r, startCol).value = displayName;
      ws.getCell(r, startCol).alignment = { vertical: 'top', wrapText: true };

      const roleNames = Array.from(info.roles)
        .map(simplifyRole)
        .filter((v): v is string => Boolean(v));
      const roleText = Array.from(new Set(roleNames)).sort().join('/');
      ws.getCell(r, startCol + 1).value = roleText;
      ws.getCell(r, startCol + 1).alignment = { vertical: 'top', wrapText: true };

      if (hasAM && hasPM) {
        // both -> blank
      } else if (hasAM) {
        ws.getCell(r, startCol + 2).value = 'AM';
      } else if (hasPM) {
        ws.getCell(r, startCol + 2).value = 'PM';
      }

      const dayCell = ws.getCell(r, startCol + 3);
      dayCell.value = days;
      dayCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      // Apply font to each cell individually to avoid interfering with other
      // panes that may use the same worksheet row.
      for (let c = startCol; c <= startCol + 3; c++) {
        ws.getCell(r, c).font = { size: 16 };
      }
      setRowBorders(ws.getRow(r), startCol, startCol + 3);
      r++;
    }
    paneState[pane] = r;
  }

  function renderSection(kind: 'regular'|'commuter') {
    for (const g of KITCHEN_COL1_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = buckets[kind][code];
      if (people && Object.keys(people).length) renderBlock('kitchen1', g, people);
    }
    for (const g of KITCHEN_COL2_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = buckets[kind][code];
      if (people && Object.keys(people).length) renderBlock('kitchen2', g, people);
    }
    for (const g of DINING_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = buckets[kind][code];
      if (people && Object.keys(people).length) renderBlock('dining', g, people);
    }
  }

  // Regulars first
  renderSection('regular');

  // Insert COMMUTERS divider if needed, then render commuters
  const hasAny = (kind:'regular'|'commuter') =>
    Object.values(buckets[kind]).some(groupMap => groupMap && Object.keys(groupMap).length);

  if (hasAny('commuter')) {
    const afterRegular = Math.max(paneState.kitchen1, paneState.kitchen2, paneState.dining);
    ws.mergeCells(afterRegular,1,afterRegular,14);
    const commCell = ws.getCell(afterRegular,1);
    commCell.value = 'COMMUTERS';
    commCell.font = { bold:true, size:18 };
    commCell.alignment = { horizontal:'left' };
    commCell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFEFEF'} };
    commCell.border = { top:{ style:'thick' } };

    paneState.kitchen1 = afterRegular + 1;
    paneState.kitchen2 = afterRegular + 1;
    paneState.dining = afterRegular + 1;

    renderSection('commuter');
  }

  // ---------- Lunch jobs sheet ----------
  const lunchDefaults = all<DefaultRow>(
    `SELECT md.person_id, md.segment,
            g.name AS group_name, r.id AS role_id, r.name AS role_name,
            (p.last_name || ', ' || p.first_name) AS person,
            p.commuter AS commuter,
            p.avail_mon, p.avail_tue, p.avail_wed, p.avail_thu, p.avail_fri,
            md.month as month
       FROM monthly_default md
      JOIN role r ON r.id = md.role_id
      JOIN grp  g ON g.id = r.group_id
      JOIN person p ON p.id = md.person_id
      WHERE ${mdMonth.where} AND p.active = 1 AND TRIM(UPPER(md.segment)) = 'LUNCH'
      ORDER BY g.name, person`,
    mdMonth.params
  );

  const lunchPerDays = all<DayRow>(
    `SELECT mdd.person_id, mdd.weekday, mdd.segment,
            g.name AS group_name, r.id AS role_id, r.name AS role_name,
            (p.last_name || ', ' || p.first_name) AS person,
            p.commuter AS commuter,
            p.avail_mon, p.avail_tue, p.avail_wed, p.avail_thu, p.avail_fri,
            mdd.month as month
       FROM monthly_default_day mdd
      JOIN role r ON r.id = mdd.role_id
      JOIN grp  g ON g.id = r.group_id
      JOIN person p ON p.id = mdd.person_id
      WHERE ${mddMonth.where} AND p.active = 1 AND TRIM(UPPER(mdd.segment)) = 'LUNCH'`,
    mddMonth.params
  );

  // Query lunch week overrides
  const lunchPerWeeks = all<WeekRow>(
    `SELECT mdw.person_id, mdw.week_number, mdw.segment,
            g.name AS group_name, r.id AS role_id, r.name AS role_name,
            (p.last_name || ', ' || p.first_name) AS person,
            p.commuter AS commuter,
            p.avail_mon, p.avail_tue, p.avail_wed, p.avail_thu, p.avail_fri,
            mdw.month as month
       FROM monthly_default_week mdw
      JOIN role r ON r.id = mdw.role_id
      JOIN grp  g ON g.id = r.group_id
      JOIN person p ON p.id = mdw.person_id
      WHERE ${mdwMonth.where} AND p.active = 1 AND TRIM(UPPER(mdw.segment)) = 'LUNCH'`,
    mdwMonth.params
  );

  // Build lunch week override maps
  const lunchWeekOverrideMap = new Map<number, Map<number, { roleId: number; groupName: string; roleName: string }>>();
  for (const row of lunchPerWeeks) {
    let weekMap = lunchWeekOverrideMap.get(row.person_id);
    if (!weekMap) {
      weekMap = new Map();
      lunchWeekOverrideMap.set(row.person_id, weekMap);
    }
    weekMap.set(row.week_number, { roleId: row.role_id, groupName: row.group_name, roleName: row.role_name });
  }

  // Build lunch week override group map
  const lunchWeekOverrideGroupMap = new Map<string, number[]>();
  for (const row of lunchPerWeeks) {
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;
    const key = `${row.person_id}|${code}`;
    const existing = lunchWeekOverrideGroupMap.get(key) || [];
    if (!existing.includes(row.week_number)) {
      existing.push(row.week_number);
    }
    lunchWeekOverrideGroupMap.set(key, existing);
  }

  const lunchBuckets: LunchBuckets = { regular: {}, commuter: {} };
  const lunchPerDayMap = new Map<number, Map<DayLetter, number>>();

  for (const row of lunchPerDays) {
    const dayLetter = weekdayToLetter(row.weekday);
    if (!dayLetter) continue;
    if (!isAllowedForLunch(dayLetter, row)) continue;
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;
    const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
    const groupBucket = lunchBuckets[kind][code] || (lunchBuckets[kind][code] = {});
    const personBucket = groupBucket[row.person] || (groupBucket[row.person] = {
      days: new Set<DayLetter>(),
      roles: new Set<string>(),
      roleDays: new Map<string, Set<DayLetter>>(),
      weekLabel: ''
    });
    personBucket.roles.add(row.role_name);
    let roleDaySet = personBucket.roleDays.get(row.role_name);
    if (!roleDaySet) {
      roleDaySet = new Set<DayLetter>();
      personBucket.roleDays.set(row.role_name, roleDaySet);
    }
    roleDaySet.add(dayLetter);
    personBucket.days.add(dayLetter);
    let dayMap = lunchPerDayMap.get(row.person_id);
    if (!dayMap) {
      dayMap = new Map<DayLetter, number>();
      lunchPerDayMap.set(row.person_id, dayMap);
    }
    dayMap.set(dayLetter, row.role_id);
  }

  for (const row of lunchDefaults) {
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;
    const dayMap = lunchPerDayMap.get(row.person_id);
    const weekMap = lunchWeekOverrideMap.get(row.person_id);
    
    // Determine which weeks have overrides to a DIFFERENT group
    const overriddenWeeks: number[] = [];
    const defaultWeeks: number[] = [];
    
    for (const weekNum of allWeeksArray) {
      const weekOverride = weekMap?.get(weekNum);
      if (weekOverride) {
        const overrideCode = GROUP_INFO[weekOverride.groupName]?.code;
        if (overrideCode && overrideCode !== code) {
          overriddenWeeks.push(weekNum);
        } else {
          defaultWeeks.push(weekNum);
        }
      } else {
        defaultWeeks.push(weekNum);
      }
    }
    
    const keepLetters: DayLetter[] = [];
    for (const d of DAY_ORDER) {
      if (!isAllowedForLunch(d, row)) continue;
      const overriddenRoleId = dayMap?.get(d);
      if (overriddenRoleId == null || overriddenRoleId === row.role_id) {
        keepLetters.push(d);
      }
    }
    if (keepLetters.length === 0) continue;
    const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
    const groupBucket = lunchBuckets[kind][code] || (lunchBuckets[kind][code] = {});
    
    // Calculate week label for this default entry
    let weekLabel = '';
    if (overriddenWeeks.length > 0 && defaultWeeks.length > 0) {
      weekLabel = formatWeekLabel(defaultWeeks);
    }
    
    const personKey = weekLabel ? `${row.person}|${weekLabel}` : row.person;
    const personBucket = groupBucket[personKey] || (groupBucket[personKey] = {
      days: new Set<DayLetter>(),
      roles: new Set<string>(),
      roleDays: new Map<string, Set<DayLetter>>(),
      weekLabel
    });
    personBucket.roles.add(row.role_name);
    for (const d of keepLetters) {
      personBucket.days.add(d);
      let roleDaySet = personBucket.roleDays.get(row.role_name);
      if (!roleDaySet) {
        roleDaySet = new Set<DayLetter>();
        personBucket.roleDays.set(row.role_name, roleDaySet);
      }
      roleDaySet.add(d);
    }
  }

  // Add lunch week override entries
  for (const row of lunchPerWeeks) {
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;

    const key = `${row.person_id}|${code}`;
    const weeksForThisGroup = lunchWeekOverrideGroupMap.get(key) || [];
    
    const personDefault = lunchDefaults.find(d => d.person_id === row.person_id);
    const defaultCode = personDefault ? GROUP_INFO[personDefault.group_name]?.code : null;
    
    const needsWeekLabel = defaultCode && defaultCode !== code;
    const weekLabel = needsWeekLabel ? formatWeekLabel(weeksForThisGroup) : '';
    
    const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
    const groupBucket = lunchBuckets[kind][code] || (lunchBuckets[kind][code] = {});
    const personKey = weekLabel ? `${row.person}|${weekLabel}` : row.person;
    const personBucket = groupBucket[personKey] || (groupBucket[personKey] = {
      days: new Set<DayLetter>(),
      roles: new Set<string>(),
      roleDays: new Map<string, Set<DayLetter>>(),
      weekLabel
    });
    personBucket.roles.add(row.role_name);
    
    for (const d of DAY_ORDER) {
      if (!isAllowedForLunch(d, row)) continue;
      personBucket.days.add(d);
      let roleDaySet = personBucket.roleDays.get(row.role_name);
      if (!roleDaySet) {
        roleDaySet = new Set<DayLetter>();
        personBucket.roleDays.set(row.role_name, roleDaySet);
      }
      roleDaySet.add(d);
    }
  }

  const wsL = wb.addWorksheet('Lunch Jobs', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  wsL.columns = [
    { width: 30 }, { width: 20 }, { width: 10 }, { width: 18 }
  ];

  wsL.mergeCells(1, 1, 1, 4);
  const lunchTitle = wsL.getCell(1, 1);
  lunchTitle.value = `Lunch Jobs — ${titleText}`;
  lunchTitle.font = { bold: true, size: 18, name: 'Calibri' };
  lunchTitle.alignment = { horizontal: 'center' };

  let lunchRow = 2;

  function renderLunchBlock(group: string, people: Record<string, { days: Set<DayLetter>; roles: Set<string>; roleDays: Map<string, Set<DayLetter>>; weekLabel: string }>) {
    if (!people || !Object.keys(people).length) return;
    wsL.mergeCells(lunchRow, 1, lunchRow, 4);
    const hcell = wsL.getCell(lunchRow, 1);
    hcell.value = group;
    hcell.alignment = { horizontal: 'left' };
    const fill = GROUP_INFO[group]?.color || 'FFEFEFEF';
    hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    for (let c = 1; c <= 4; c++) {
      wsL.getCell(lunchRow, c).font = { bold: true, size: 18 };
    }
    setRowBorders(wsL.getRow(lunchRow), 1, 4);

    function simplifyRole(role: string): string | null {
      if (role === group) return null;
      const prefix = group + ' ';
      if (role.startsWith(prefix)) {
        return role.slice(prefix.length);
      }
      return role;
    }

    let r = lunchRow + 1;
    const names = Object.keys(people).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const info = people[name];
      
      // Extract actual person name and display with week label if present
      const actualName = info.weekLabel ? name.replace(`|${info.weekLabel}`, '') : name;
      const displayName = info.weekLabel ? `${actualName} (${info.weekLabel})` : actualName;
      wsL.getCell(r, 1).value = displayName;
      wsL.getCell(r, 1).alignment = { vertical: 'top', wrapText: true };
      
      const roleNames = Array.from(info.roles)
        .map(simplifyRole)
        .filter((v): v is string => Boolean(v));
      const roleText = Array.from(new Set(roleNames)).sort().join('/');
      wsL.getCell(r, 2).value = roleText;
      wsL.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };
      
      wsL.getCell(r, 3).value = 'Lunch';
      const dayList = DAY_ORDER.filter(d => info.days.has(d));
      const simplifiedRoleDayMap = new Map<string, Set<DayLetter>>();
      for (const [roleName, daySet] of info.roleDays.entries()) {
        const simplified = simplifyRole(roleName) ?? 'Lunch';
        let mapSet = simplifiedRoleDayMap.get(simplified);
        if (!mapSet) {
          mapSet = new Set<DayLetter>();
          simplifiedRoleDayMap.set(simplified, mapSet);
        }
        for (const d of daySet) mapSet.add(d);
      }
      const roleDayEntries = Array.from(simplifiedRoleDayMap.entries());
      const hasMixedAssignments =
        roleDayEntries.length > 1 &&
        roleDayEntries.some(([, set]) => set.size !== info.days.size);
      let days: string;
      if (hasMixedAssignments) {
        const perDay: string[] = [];
        for (const d of DAY_ORDER) {
          if (!info.days.has(d)) continue;
          const rolesForDay: string[] = [];
          for (const [role, daySet] of roleDayEntries) {
            if (daySet.has(d)) rolesForDay.push(role);
          }
          if (!rolesForDay.length) continue;
          perDay.push(`${d}: ${rolesForDay.sort().join(' & ')}`);
        }
        days = perDay.join('; ');
      } else {
        days = dayList.length === DAY_ORDER.length ? 'Full-Time' : dayList.join('/');
      }
      const dayCell = wsL.getCell(r, 4);
      dayCell.value = days;
      dayCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      
      for (let c = 1; c <= 4; c++) {
        wsL.getCell(r, c).font = { size: 16 };
      }
      setRowBorders(wsL.getRow(r), 1, 4);
      r++;
    }
    lunchRow = r;
  }

  function renderLunchSection(kind: 'regular' | 'commuter') {
    for (const g of KITCHEN_COL1_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = lunchBuckets[kind][code];
      if (people && Object.keys(people).length) renderLunchBlock(g, people);
    }
    for (const g of KITCHEN_COL2_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = lunchBuckets[kind][code];
      if (people && Object.keys(people).length) renderLunchBlock(g, people);
    }
    for (const g of DINING_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = lunchBuckets[kind][code];
      if (people && Object.keys(people).length) renderLunchBlock(g, people);
    }
  }

  renderLunchSection('regular');

  const lunchHasAny = (kind: 'regular' | 'commuter') =>
    Object.values(lunchBuckets[kind]).some(groupMap => groupMap && Object.keys(groupMap).length);

  if (lunchHasAny('commuter')) {
    wsL.mergeCells(lunchRow, 1, lunchRow, 4);
    const commCell = wsL.getCell(lunchRow, 1);
    commCell.value = 'COMMUTERS';
    commCell.font = { bold: true, size: 18 };
    commCell.alignment = { horizontal: 'left' };
    commCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    commCell.border = { top: { style: 'thick' } };
    lunchRow += 1;

    renderLunchSection('commuter');
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const monthName = monthDate.toLocaleString('default',{ month: 'long', year: 'numeric' });
  a.download = `Kitchen-DR Schedule — ${monthName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Daily assignment row type
type DailyAssignmentRow = {
  person_id: number;
  person: string;
  role_id: number;
  role_name: string;
  group_name: string;
  group_id: number;
  commuter: number;
  segment: string;
};

/**
 * Export daily schedule for a specific date to XLSX.
 * Exports all segments for the day.
 * Uses the same format and styling as the monthly export.
 */
export async function exportDailyScheduleXlsx(date: string): Promise<void> {
  requireDb();

  // Load ExcelJS
  const ExcelJS = await loadExcelJS();

  const { info: GROUP_INFO, col1: KITCHEN_COL1_GROUPS, col2: KITCHEN_COL2_GROUPS, dining: DINING_GROUPS } = loadExportGroups();

  // Query all assignments for the given date (all segments except LUNCH)
  const assignments = all<DailyAssignmentRow>(
    `SELECT a.person_id, a.role_id, a.segment,
            (p.last_name || ', ' || p.first_name) AS person,
            r.name AS role_name,
            g.name AS group_name, g.id AS group_id,
            p.commuter AS commuter
       FROM assignment a
      JOIN person p ON p.id = a.person_id
      JOIN role r ON r.id = a.role_id
      JOIN grp g ON g.id = r.group_id
      WHERE a.date = ? AND TRIM(UPPER(a.segment)) != 'LUNCH'
      ORDER BY g.name, person`,
    [date]
  );

  // Organize assignments by regular/commuter -> group code -> person -> segments and roles
  type PersonBucket = {
    segments: Set<string>;
    roles: Set<string>;
  };
  const buckets: Record<'regular' | 'commuter', Record<string, Record<string, PersonBucket>>> = {
    regular: {},
    commuter: {}
  };

  for (const row of assignments) {
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;

    const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
    const groupBucket = buckets[kind][code] || (buckets[kind][code] = {});
    const personBucket = groupBucket[row.person] || (groupBucket[row.person] = { segments: new Set<string>(), roles: new Set<string>() });
    personBucket.segments.add(row.segment);
    personBucket.roles.add(row.role_name);
  }

  // Handle Lunch assignments separately
  const lunchAssignments = all<DailyAssignmentRow>(
    `SELECT a.person_id, a.role_id,
            (p.last_name || ', ' || p.first_name) AS person,
            r.name AS role_name,
            g.name AS group_name, g.id AS group_id,
            p.commuter AS commuter
       FROM assignment a
      JOIN person p ON p.id = a.person_id
      JOIN role r ON r.id = a.role_id
      JOIN grp g ON g.id = r.group_id
      WHERE a.date = ? AND TRIM(UPPER(a.segment)) = 'LUNCH'
      ORDER BY g.name, person`,
    [date]
  );

  const lunchBuckets: Record<'regular' | 'commuter', Record<string, Record<string, PersonBucket>>> = {
    regular: {},
    commuter: {}
  };

  for (const row of lunchAssignments) {
    const code = GROUP_INFO[row.group_name]?.code;
    if (!code) continue;

    const kind: 'regular' | 'commuter' = row.commuter ? 'commuter' : 'regular';
    const groupBucket = lunchBuckets[kind][code] || (lunchBuckets[kind][code] = {});
    const personBucket = groupBucket[row.person] || (groupBucket[row.person] = { segments: new Set<string>(), roles: new Set<string>() });
    personBucket.segments.add('LUNCH');
    personBucket.roles.add(row.role_name);
  }

  // Query department events for this date
  type DepartmentEventRow = {
    id: number;
    title: string;
    start_time: string;
    end_time: string;
    group_id: number | null;
    group_name: string | null;
    role_id: number | null;
    role_name: string | null;
    description: string | null;
  };
  
  const departmentEvents = all<DepartmentEventRow>(
    `SELECT de.id, de.title, de.start_time, de.end_time, 
            de.group_id, g.name AS group_name,
            de.role_id, r.name AS role_name,
            de.description
       FROM department_event de
       LEFT JOIN grp g ON g.id = de.group_id
       LEFT JOIN role r ON r.id = de.role_id
       WHERE de.date = ?
       ORDER BY de.start_time`,
    [date]
  );

  // Query attendees for department events (assignments where segment matches event title)
  type EventAssignmentRow = {
    person: string;
    segment: string;
    commuter: number;
  };

  const eventAttendees = new Map<string, EventAssignmentRow[]>();
  for (const event of departmentEvents) {
    const attendees = all<EventAssignmentRow>(
      `SELECT (p.last_name || ', ' || p.first_name) AS person,
              a.segment,
              p.commuter AS commuter
         FROM assignment a
        JOIN person p ON p.id = a.person_id
        WHERE a.date = ? AND a.segment = ?
        ORDER BY p.last_name, p.first_name`,
      [date, event.title]
    );
    eventAttendees.set(event.title, attendees);
  }

  // ---------- Sheet rendering ----------
  const dateObj = new Date(date);
  const dateText = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');
  // 3 columns per pane: Name, Role, Segment (no day column for daily export)
  ws.columns = [
    { width: 30 }, { width: 24 }, { width: 18 }, { width: 2 },
    { width: 30 }, { width: 24 }, { width: 18 }, { width: 2 },
    { width: 30 }, { width: 24 }, { width: 18 }
  ];

  ws.mergeCells(1, 1, 1, 11);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Kitchen / Dining Room Schedule — ${dateText}`;
  titleCell.font = { bold: true, size: 18, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'center' };

  const paneState = { kitchen1: 2, kitchen2: 2, dining: 2 } as Record<'kitchen1' | 'kitchen2' | 'dining', number>;

  function setRowBorders(row: any, startCol: number, endCol: number) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
      const border: any = { bottom: { style: 'thin' } };
      if (c === startCol) border.left = { style: 'thin' };
      if (c === endCol) border.right = { style: 'thin' };
      cell.border = border;
    }
  }

  function renderBlock(
    pane: 'kitchen1' | 'kitchen2' | 'dining',
    group: string,
    people: Record<string, PersonBucket>
  ) {
    // 3 columns per pane: Name, Role, Segment (no day column)
    // Pane start columns: kitchen1=1, kitchen2=5, dining=9 (with 1-col gap between panes)
    const startCol = pane === 'kitchen1' ? 1 : pane === 'kitchen2' ? 5 : 9;
    if (!people || !Object.keys(people).length) return;
    const rowIndex = paneState[pane];

    // Group header (spans 3 columns: Name, Role, Segment)
    ws.mergeCells(rowIndex, startCol, rowIndex, startCol + 2);
    const hcell = ws.getCell(rowIndex, startCol);
    hcell.value = group;
    hcell.alignment = { horizontal: 'left' };
    const fill = GROUP_INFO[group]?.color || 'FFEFEFEF';
    hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    for (let c = startCol; c <= startCol + 2; c++) {
      ws.getCell(rowIndex, c).font = { bold: true, size: 18 };
    }
    setRowBorders(ws.getRow(rowIndex), startCol, startCol + 2);

    function simplifyRole(role: string): string | null {
      if (role === group) return null;
      const prefix = group + ' ';
      if (role.startsWith(prefix)) {
        return role.slice(prefix.length);
      }
      return role;
    }

    let r = rowIndex + 1;
    const names = Object.keys(people).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const info = people[name];
      ws.getCell(r, startCol).value = name;
      ws.getCell(r, startCol).alignment = { vertical: 'top', wrapText: true };

      const roleNames = Array.from(info.roles)
        .map(simplifyRole)
        .filter((v): v is string => Boolean(v));
      const roleText = Array.from(new Set(roleNames)).sort().join('/');
      ws.getCell(r, startCol + 1).value = roleText;
      ws.getCell(r, startCol + 1).alignment = { vertical: 'top', wrapText: true };

      // For daily schedule, show segments (Early/AM/PM etc.) in the segment column
      const segments = Array.from(info.segments).sort().join('/');
      ws.getCell(r, startCol + 2).value = segments;
      ws.getCell(r, startCol + 2).alignment = { vertical: 'top', wrapText: true };

      for (let c = startCol; c <= startCol + 2; c++) {
        ws.getCell(r, c).font = { size: 16 };
      }
      setRowBorders(ws.getRow(r), startCol, startCol + 2);
      r++;
    }
    paneState[pane] = r;
  }

  function renderSection(kind: 'regular' | 'commuter') {
    for (const g of KITCHEN_COL1_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = buckets[kind][code];
      if (people && Object.keys(people).length) renderBlock('kitchen1', g, people);
    }
    for (const g of KITCHEN_COL2_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = buckets[kind][code];
      if (people && Object.keys(people).length) renderBlock('kitchen2', g, people);
    }
    for (const g of DINING_GROUPS) {
      const code = GROUP_INFO[g]?.code;
      if (!code) continue;
      const people = buckets[kind][code];
      if (people && Object.keys(people).length) renderBlock('dining', g, people);
    }
  }

  // Regulars first
  renderSection('regular');

  // Insert COMMUTERS divider if needed, then render commuters
  const hasAny = (kind: 'regular' | 'commuter') =>
    Object.values(buckets[kind]).some(groupMap => groupMap && Object.keys(groupMap).length);

  if (hasAny('commuter')) {
    const afterRegular = Math.max(paneState.kitchen1, paneState.kitchen2, paneState.dining);
    ws.mergeCells(afterRegular, 1, afterRegular, 11);
    const commCell = ws.getCell(afterRegular, 1);
    commCell.value = 'COMMUTERS';
    commCell.font = { bold: true, size: 18 };
    commCell.alignment = { horizontal: 'left' };
    commCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    commCell.border = { top: { style: 'thick' } };

    paneState.kitchen1 = afterRegular + 1;
    paneState.kitchen2 = afterRegular + 1;
    paneState.dining = afterRegular + 1;

    renderSection('commuter');
  }

  // ---------- Lunch jobs sheet ----------
  const lunchHasAny = (kind: 'regular' | 'commuter') =>
    Object.values(lunchBuckets[kind]).some(groupMap => groupMap && Object.keys(groupMap).length);

  if (lunchHasAny('regular') || lunchHasAny('commuter')) {
    const wsL = wb.addWorksheet('Lunch');
    // 2 columns for daily lunch: Name, Role (no day column needed)
    wsL.columns = [{ width: 30 }, { width: 24 }];

    wsL.mergeCells(1, 1, 1, 2);
    const lunchTitleCell = wsL.getCell(1, 1);
    lunchTitleCell.value = `Lunch Jobs — ${dateText}`;
    lunchTitleCell.font = { bold: true, size: 18, name: 'Calibri' };
    lunchTitleCell.alignment = { horizontal: 'center' };

    let lunchRow = 2;

    function renderLunchBlock(group: string, people: Record<string, PersonBucket>) {
      if (!people || !Object.keys(people).length) return;

      wsL.mergeCells(lunchRow, 1, lunchRow, 2);
      const hcell = wsL.getCell(lunchRow, 1);
      hcell.value = group;
      hcell.alignment = { horizontal: 'left' };
      const fill = GROUP_INFO[group]?.color || 'FFEFEFEF';
      hcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      for (let c = 1; c <= 2; c++) {
        wsL.getCell(lunchRow, c).font = { bold: true, size: 18 };
      }
      setRowBorders(wsL.getRow(lunchRow), 1, 2);

      function simplifyRole(role: string): string | null {
        if (role === group) return null;
        const prefix = group + ' ';
        if (role.startsWith(prefix)) {
          return role.slice(prefix.length);
        }
        return role;
      }

      let r = lunchRow + 1;
      const names = Object.keys(people).sort((a, b) => a.localeCompare(b));
      for (const name of names) {
        const info = people[name];
        wsL.getCell(r, 1).value = name;
        wsL.getCell(r, 1).alignment = { vertical: 'top', wrapText: true };

        const roleNames = Array.from(info.roles)
          .map(simplifyRole)
          .filter((v): v is string => Boolean(v));
        const roleText = Array.from(new Set(roleNames)).sort().join('/');
        wsL.getCell(r, 2).value = roleText;
        wsL.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };

        for (let c = 1; c <= 2; c++) {
          wsL.getCell(r, c).font = { size: 16 };
        }
        setRowBorders(wsL.getRow(r), 1, 2);
        r++;
      }
      lunchRow = r;
    }

    function renderLunchSection(kind: 'regular' | 'commuter') {
      for (const g of KITCHEN_COL1_GROUPS) {
        const code = GROUP_INFO[g]?.code;
        if (!code) continue;
        const people = lunchBuckets[kind][code];
        if (people && Object.keys(people).length) renderLunchBlock(g, people);
      }
      for (const g of KITCHEN_COL2_GROUPS) {
        const code = GROUP_INFO[g]?.code;
        if (!code) continue;
        const people = lunchBuckets[kind][code];
        if (people && Object.keys(people).length) renderLunchBlock(g, people);
      }
      for (const g of DINING_GROUPS) {
        const code = GROUP_INFO[g]?.code;
        if (!code) continue;
        const people = lunchBuckets[kind][code];
        if (people && Object.keys(people).length) renderLunchBlock(g, people);
      }
    }

    renderLunchSection('regular');

    if (lunchHasAny('commuter')) {
      wsL.mergeCells(lunchRow, 1, lunchRow, 2);
      const commCell = wsL.getCell(lunchRow, 1);
      commCell.value = 'COMMUTERS';
      commCell.font = { bold: true, size: 18 };
      commCell.alignment = { horizontal: 'left' };
      commCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      commCell.border = { top: { style: 'thick' } };
      lunchRow += 1;

      renderLunchSection('commuter');
    }
  }

  // ---------- Department Events sheet ----------
  if (departmentEvents.length > 0) {
    const wsE = wb.addWorksheet('Events');
    wsE.columns = [
      { width: 30 }, { width: 14 }, { width: 40 }
    ];

    wsE.mergeCells(1, 1, 1, 3);
    const eventsTitleCell = wsE.getCell(1, 1);
    eventsTitleCell.value = `Department Events — ${dateText}`;
    eventsTitleCell.font = { bold: true, size: 18, name: 'Calibri' };
    eventsTitleCell.alignment = { horizontal: 'center' };

    let eventRow = 2;

    // Helper to format time in 12-hour format
    const formatTime12h = (time: string): string => {
      const [h, m] = time.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    for (const event of departmentEvents) {
      // Event header row
      wsE.mergeCells(eventRow, 1, eventRow, 3);
      const eventHeaderCell = wsE.getCell(eventRow, 1);
      const timeRange = `${formatTime12h(event.start_time)} – ${formatTime12h(event.end_time)}`;
      eventHeaderCell.value = `${event.title} (${timeRange})`;
      eventHeaderCell.font = { bold: true, size: 16 };
      eventHeaderCell.alignment = { horizontal: 'left' };
      
      // Use group color if available
      const groupCode = event.group_name ? GROUP_INFO[event.group_name]?.code : null;
      const fill = groupCode ? GROUP_INFO[event.group_name!]?.color || 'FFEFEFEF' : 'FFEFEFEF';
      eventHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      
      for (let c = 1; c <= 3; c++) {
        const cell = wsE.getCell(eventRow, c);
        cell.border = { 
          bottom: { style: 'thin' },
          left: c === 1 ? { style: 'thin' } : undefined,
          right: c === 3 ? { style: 'thin' } : undefined
        };
      }
      eventRow++;

      // Description row if present
      if (event.description) {
        wsE.mergeCells(eventRow, 1, eventRow, 3);
        const descCell = wsE.getCell(eventRow, 1);
        descCell.value = event.description;
        descCell.font = { italic: true, size: 12 };
        descCell.alignment = { horizontal: 'left', wrapText: true };
        eventRow++;
      }

      // Attendees
      const attendees = eventAttendees.get(event.title) || [];
      if (attendees.length > 0) {
        // Group into regular and commuters
        const regularAttendees = attendees.filter(a => !a.commuter);
        const commuterAttendees = attendees.filter(a => a.commuter);

        for (const attendee of regularAttendees) {
          wsE.getCell(eventRow, 1).value = attendee.person;
          wsE.getCell(eventRow, 1).alignment = { vertical: 'top', wrapText: true };
          wsE.getCell(eventRow, 1).font = { size: 14 };
          for (let c = 1; c <= 3; c++) {
            const cell = wsE.getCell(eventRow, c);
            cell.border = { 
              bottom: { style: 'thin' },
              left: c === 1 ? { style: 'thin' } : undefined,
              right: c === 3 ? { style: 'thin' } : undefined
            };
          }
          eventRow++;
        }

        if (commuterAttendees.length > 0) {
          wsE.mergeCells(eventRow, 1, eventRow, 3);
          const commLabel = wsE.getCell(eventRow, 1);
          commLabel.value = 'Commuters:';
          commLabel.font = { italic: true, size: 12 };
          eventRow++;

          for (const attendee of commuterAttendees) {
            wsE.getCell(eventRow, 1).value = attendee.person;
            wsE.getCell(eventRow, 1).alignment = { vertical: 'top', wrapText: true };
            wsE.getCell(eventRow, 1).font = { size: 14 };
            for (let c = 1; c <= 3; c++) {
              const cell = wsE.getCell(eventRow, c);
              cell.border = { 
                bottom: { style: 'thin' },
                left: c === 1 ? { style: 'thin' } : undefined,
                right: c === 3 ? { style: 'thin' } : undefined
              };
            }
            eventRow++;
          }
        }
      } else {
        wsE.getCell(eventRow, 1).value = '(No attendees assigned)';
        wsE.getCell(eventRow, 1).font = { italic: true, size: 12, color: { argb: 'FF888888' } };
        eventRow++;
      }

      // Add spacing between events
      eventRow++;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const shortDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  a.download = `Daily Schedule — ${shortDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
