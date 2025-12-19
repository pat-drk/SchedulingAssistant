import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { applyMigrations } from "./services/migrations";
import { listSegments, type Segment, type SegmentRow } from "./services/segments";
import { listSegmentAdjustments, type SegmentAdjustmentRow } from "./services/segmentAdjustments";
import { availabilityFor } from "./services/availability";
import SideRail, { TabKey } from "./components/SideRail";
import TopBar from "./components/TopBar";
import CopilotContext from "./components/CopilotContext";
const DailyRunBoard = React.lazy(() => import("./components/DailyRunBoard"));
const AdminView = React.lazy(() => import("./components/AdminView"));
const ExportPreview = React.lazy(() => import("./components/ExportPreview"));
// import { exportMonthOneSheetXlsx } from "./excel/export-one-sheet"; // not directly used here
import PersonName from "./components/PersonName";
import PersonProfileModal from "./components/PersonProfileModal";
import { ProfileContext } from "./components/ProfileContext";
import { Button, Checkbox, Dropdown, Input, Option, Table, TableHeader, TableHeaderCell, TableRow, TableBody, TableCell, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, makeStyles, tokens } from "@fluentui/react-components";
import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import MonthlyDefaults from "./components/MonthlyDefaults";
import CrewHistoryView from "./components/CrewHistoryView";
import Training from "./components/Training";
import PeopleFiltersBar, { filterPeopleList, PeopleFiltersState, freshPeopleFilters } from "./components/filters/PeopleFilters";

/*
MVP: Pure-browser scheduler for Microsoft Teams Shifts
- Data stays local via File System Access API + sql.js (WASM) SQLite
- Single-editor model (soft lock stored in DB). No multi-user concurrency.
- Views: Daily Run Board, Needs vs Coverage, Export Preview
- Features: Create/Open/Save DB, People editor, Needs baseline + date overrides,
            Assignments with rules, Export to Shifts XLSX

IMPORTANT: To avoid Rollup bundling Node-only modules (fs), we **do not import `xlsx` from NPM**.
We dynamically load the browser ESM build from SheetJS CDN at runtime.

Runtime deps (loaded via CDN):
  - sql.js (WASM) via jsDelivr
  - xlsx ESM via SheetJS CDN (no Node `fs`)

Tailwind classes used for styling. This file is a single React component export.
*/

// Types
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
type Weekday = (typeof WEEKDAYS)[number];

// Helpers
function fmtDateMDY(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function fmtTime24(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function ymd(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

function parseMDY(str: string): Date {
  // expects M/D/YYYY
  const [m, d, y] = str.split("/").map((s) => parseInt(s.trim(), 10));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt;
}

function parseYMD(str: string): Date {
  // expects YYYY-MM-DD
  const [y, m, d] = str.split("-").map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}


function weekdayName(d: Date): Weekday | "Weekend" {
  const n = d.getDay(); // 0 Sun .. 6 Sat
  switch (n) {
    case 1: return "Monday";
    case 2: return "Tuesday";
    case 3: return "Wednesday";
    case 4: return "Thursday";
    case 5: return "Friday";
    default: return "Weekend";
  }
}

// SQL.js
let SQL: any = null; // sql.js module

// XLSX (browser ESM via CDN only)
const XLSX_URL = "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";
async function loadXLSX(){
  // Prevent bundlers from trying to pre-bundle the module
  // @ts-ignore
  const mod = await import(/* @vite-ignore */ XLSX_URL);
  return mod as any;
}

const useRequiredCellStyles = makeStyles({
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  input: { width: '7ch' },
});

const useBaselineViewStyles = makeStyles({
  root: { padding: tokens.spacingHorizontalM },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400, marginBottom: tokens.spacingVerticalM },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingHorizontalM,
    ['@media (min-width: 1024px)']: { gridTemplateColumns: 'repeat(2, 1fr)' },
    ['@media (min-width: 1280px)']: { gridTemplateColumns: 'repeat(3, 1fr)' },
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
  },
  roleCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  roleGrid: {
    display: 'grid',
    gap: tokens.spacingHorizontalS,
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    alignItems: 'start',
  },
  subTitle: { fontWeight: tokens.fontWeightSemibold, marginBottom: tokens.spacingVerticalS },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS },
});

const usePeopleEditorStyles = makeStyles({
  root: { padding: tokens.spacingHorizontalM },
  tableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflowY: 'auto',
    overflowX: 'hidden',
    maxHeight: '60vh',
    width: '100%',
    boxShadow: tokens.shadow2,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacingVerticalS },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  col2: { gridColumn: 'span 2' },
  col3: { gridColumn: 'span 3' },
  col4: { gridColumn: 'span 4' },
  col6: { gridColumn: 'span 6' },
  centerRow: { display: 'flex', alignItems: 'center' },
  smallLabel: { color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS, fontSize: tokens.fontSizeBase200 },
  qualGrid: {
    display: 'grid',
    gap: tokens.spacingHorizontalXS,
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    maxHeight: '40vh',
    overflow: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalS,
  },
  row: { display: 'flex', gap: tokens.spacingHorizontalS },
  cellWrap: { whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' },
  availText: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

const useNeedsEditorStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingHorizontalM,
    ['@media (min-width: 1024px)']: { gridTemplateColumns: 'repeat(2, 1fr)' },
    ['@media (min-width: 1280px)']: { gridTemplateColumns: 'repeat(3, 1fr)' },
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
  },
  roleCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  subTitle: { fontWeight: tokens.fontWeightSemibold, marginBottom: tokens.spacingVerticalS },
  roleGrid: { display: 'grid', gap: tokens.spacingHorizontalS, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', alignItems: 'start' },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginBottom: tokens.spacingVerticalXS },
  content: { overflowY: 'auto', overflowX: 'hidden' },
  surface: { width: '90vw', maxWidth: '1200px', maxHeight: '85vh' },
});

const useAppShellStyles = makeStyles({
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
    paddingLeft: '80px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  contentRow: {
    display: 'flex',
    width: '100%',
    maxWidth: '100%',
    minHeight: 0,
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    minWidth: 0,
    overflow: 'auto',
  },
  mainInner: {
    padding: tokens.spacingHorizontalM,
  },
});

export default function App() {
  // Theme
  const [themeName, setThemeName] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });
  useEffect(() => {
    try { localStorage.setItem("theme", themeName); } catch {}
  }, [themeName]);

  const [ready, setReady] = useState(false);
  const [sqlDb, setSqlDb] = useState<any | null>(null);

  useEffect(() => {
    (window as any).sqlDb = sqlDb;
  }, [sqlDb]);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [lockEmail, setLockEmail] = useState<string>("");
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(() => fmtDateMDY(new Date()));
  const [exportStart, setExportStart] = useState<string>(() => ymd(new Date()));
  const [exportEnd, setExportEnd] = useState<string>(() => ymd(new Date()));
  const [activeTab, setActiveTab] = useState<TabKey>("RUN");
  const [activeRunSegment, setActiveRunSegment] = useState<Segment>("AM");

  // People cache for quick UI (id -> record)
  const [people, setPeople] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [segmentAdjustments, setSegmentAdjustments] = useState<SegmentAdjustmentRow[]>([]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  });
  const [copyFromMonth, setCopyFromMonth] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  });
  const [monthlyDefaults, setMonthlyDefaults] = useState<any[]>([]);
  const [monthlyEditing, setMonthlyEditing] = useState(false);
  const [monthlyOverrides, setMonthlyOverrides] = useState<any[]>([]);
  const [monthlyNotes, setMonthlyNotes] = useState<any[]>([]);
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Array<{ person_id: number; date: string; avail: string }>>([]);

  // Assignment conflict prompt
  const [conflictPrompt, setConflictPrompt] = useState<
    | null
    | {
        person: any;
        date: Date;
        segment: Segment;
        resolve: (action: 'overwrite' | 'skip' | 'overwriteAll' | 'skipAll') => void;
      }
  >(null);

  // UI: simple dialogs
  const [showNeedsEditor, setShowNeedsEditor] = useState(false);
  const [profilePersonId, setProfilePersonId] = useState<number | null>(null);

  useEffect(() => {
    if (segments.length && !segments.find(s => s.name === activeRunSegment)) {
      const first = segments[0];
      if (first) setActiveRunSegment(first.name as Segment);
    }
  }, [segments]);

  useEffect(() => {
    if (sqlDb) loadMonthlyDefaults(selectedMonth);
    const [y, m] = selectedMonth.split('-').map(n => parseInt(n, 10));
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setCopyFromMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }, [sqlDb, selectedMonth]);

  // Load sql.js
  useEffect(() => {
    (async () => {
      try {
        // @ts-ignore
        const initSqlJs = (await import("sql.js")).default;
        // Configure to load WASM files from public directory
        SQL = await initSqlJs({ 
          locateFile: (file: string) => `${import.meta.env.BASE_URL}sql-wasm/${file}`
        });
        setReady(true);
      } catch (error) {
        console.error("Failed to initialize sql.js:", error);
        setStatus("Failed to initialize database engine. Please refresh the page.");
      }
    })();
  }, []);

  // DB helpers
  function run(sql: string, params: any[] = [], db = sqlDb) {
    if (!db) throw new Error("DB not open");
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  }
  function all(sql: string, params: any[] = [], db = sqlDb) {
    if (!db) throw new Error("DB not open");
    const stmt = db.prepare(sql);
    const rows: any[] = [];
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  async function createNewDb() {
    if (!SQL) return;
    const db = new SQL.Database();
    applyMigrations(db);
    db.run(`INSERT OR REPLACE INTO meta (key,value) VALUES ('lock','{}')`);
    setSqlDb(db);
    setStatus("New DB created (unsaved). Use Save As to write a .db file.");
    refreshCaches(db);
  }

  async function openDbFromFile(readOnly = false) {
    try {
      // Ask user for SQLite DB
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: "SQLite DB", accept: { "application/octet-stream": [".db", ".sqlite"] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      const buf = await file.arrayBuffer();
      const db = new SQL.Database(new Uint8Array(buf));
      applyMigrations(db);

      if (readOnly) {
        setLockedBy("(read-only)");
        setSqlDb(db);
        fileHandleRef.current = handle;
        setStatus(`Opened ${file.name} (read-only)`);
      } else {
        // Check soft lock
        let lockJson = {} as any;
        try {
          const rows = db.exec(`SELECT value FROM meta WHERE key='lock'`);
          if (rows && rows[0] && rows[0].values[0] && rows[0].values[0][0]) {
            lockJson = JSON.parse(String(rows[0].values[0][0]));
          }
        } catch {}

        if (lockJson && lockJson.active) {
          setLockedBy(lockJson.email || "unknown");
          setSqlDb(db);
          fileHandleRef.current = handle;
          setStatus(`DB is locked by ${lockJson.email}. You can browse but cannot edit. (Per your policy: never force; make a copy if needed.)`);
        } else {
          // Ask for editor email to lock
          const email = prompt("Enter your Work Email to take the edit lock:") || "";
          if (!email) {
            alert("Lock required to edit. Opening read-only.");
            setLockedBy("(read-only)");
          } else {
            const stmt = db.prepare(`INSERT OR REPLACE INTO meta (key,value) VALUES ('lock', ?) `);
            stmt.bind([JSON.stringify({ active: true, email, ts: new Date().toISOString() })]);
            stmt.step();
            stmt.free();
            setLockEmail(email);
            setLockedBy(email);
          }
          setSqlDb(db);
          fileHandleRef.current = handle;
          setStatus(`Opened ${file.name}`);
        }
      }
      refreshCaches(db);
    } catch (e:any) {
      console.error(e);
      alert(e?.message || "Open failed");
    }
  }

  async function saveDbAs() {
    if (!sqlDb) return;
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `teams-shifts-${Date.now()}.db`,
      types: [{ description: "SQLite DB", accept: { "application/octet-stream": [".db"] } }],
    });
    await writeDbToHandle(handle);
    fileHandleRef.current = handle;
  }

  async function saveDb() {
    if (!sqlDb) return;
    if (lockedBy && lockedBy !== lockEmail) {
      alert("File is read-only or locked. Use Save As to create a copy.");
      return;
    }
    if (!fileHandleRef.current) return saveDbAs();
    await writeDbToHandle(fileHandleRef.current);
  }

  async function writeDbToHandle(handle: FileSystemFileHandle) {
    const data = sqlDb.export();
    const writable = await (handle as any).createWritable();
    await writable.write(data);
    await writable.close();
    setStatus("Saved.");
  }

  function syncTrainingFromMonthly(db = sqlDb) {
    if (!db) return;
    // Gather all (person, role) pairs from monthly defaults (any month, any weekday) as implicit qualification
    const pairs = all(
      `SELECT DISTINCT person_id, role_id FROM monthly_default
       UNION
       SELECT DISTINCT person_id, role_id FROM monthly_default_day`,
      [],
      db
    );
    const monthlySet = new Set(pairs.map((r: any) => `${r.person_id}|${r.role_id}`));

    // Upsert monthly-derived qualifications, without overriding manual
    for (const row of pairs as any[]) {
      const existing = all(
        `SELECT source FROM training WHERE person_id=? AND role_id=?`,
        [row.person_id, row.role_id],
        db
      )[0];
      if (!existing) {
        run(
          `INSERT INTO training (person_id, role_id, status, source) VALUES (?,?, 'Qualified', 'monthly')`,
          [row.person_id, row.role_id],
          db
        );
      } else if (existing.source !== 'manual') {
        run(
          `UPDATE training SET status='Qualified', source='monthly' WHERE person_id=? AND role_id=?`,
          [row.person_id, row.role_id],
          db
        );
      }
    }

    // Remove stale monthly-derived qualifications that are no longer supported by monthly defaults
    const stale = all(
      `SELECT person_id, role_id FROM training WHERE source='monthly'`,
      [],
      db
    ).filter((r: any) => !monthlySet.has(`${r.person_id}|${r.role_id}`));
    for (const r of stale) {
      run(`DELETE FROM training WHERE person_id=? AND role_id=? AND source='monthly'`, [r.person_id, r.role_id], db);
    }
  }

  function refreshCaches(db = sqlDb) {
    if (!db) return;
    const g = all(`SELECT id,name,theme,custom_color FROM grp ORDER BY name`, [], db);
    setGroups(g);
    const r = all(`SELECT r.id, r.code, r.name, r.group_id, r.segments, g.name as group_name, g.custom_color as group_color FROM role r JOIN grp g ON g.id=r.group_id ORDER BY g.name, r.name`, [], db);
    setRoles(r.map(x => ({ ...x, segments: JSON.parse(x.segments) })));
    const p = all(`SELECT * FROM person WHERE active=1 ORDER BY last_name, first_name`, [], db);
    setPeople(p);
    const s = listSegments(db);
    setSegments(s);
    const adj = listSegmentAdjustments(db);
    setSegmentAdjustments(adj);
    loadMonthlyDefaults(selectedMonth, db);
  }

  // People CRUD minimal
  function addPerson(rec: any) {
    run(
      `INSERT INTO person (last_name, first_name, work_email, brother_sister, commuter, active, avail_mon, avail_tue, avail_wed, avail_thu, avail_fri)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        rec.last_name?.trim() || "",
        rec.first_name?.trim() || "",
        rec.work_email?.trim().toLowerCase() || "",
        rec.brother_sister || null,
        rec.commuter ? 1 : 0,
        rec.active ? 1 : 1,
        rec.avail_mon || "U",
        rec.avail_tue || "U",
        rec.avail_wed || "U",
        rec.avail_thu || "U",
        rec.avail_fri || "U",
      ]
    );
    const id = all(`SELECT last_insert_rowid() as id`)[0]?.id;
    refreshCaches();
    return id;
  }

  function updatePerson(rec: any) {
    run(
      `UPDATE person SET last_name=?, first_name=?, work_email=?, brother_sister=?, commuter=?, active=?, avail_mon=?, avail_tue=?, avail_wed=?, avail_thu=?, avail_fri=? WHERE id=?`,
      [
        rec.last_name,
        rec.first_name,
        rec.work_email?.trim().toLowerCase(),
        rec.brother_sister,
        rec.commuter ? 1 : 0,
        rec.active ? 1 : 0,
        rec.avail_mon,
        rec.avail_tue,
        rec.avail_wed,
        rec.avail_thu,
        rec.avail_fri,
        rec.id,
      ]
    );
    refreshCaches();
  }

  function deletePerson(id: number) {
    run(`DELETE FROM training WHERE person_id=?`, [id]);
    run(`DELETE FROM person WHERE id=?`, [id]);
    refreshCaches();
  }

  function saveTraining(personId: number, rolesSet: Set<number>) {
    // Only adjust manual-sourced entries; preserve monthly-derived training which reflects history
    run(`DELETE FROM training WHERE person_id=? AND source='manual'`, [personId]);
    for (const rid of rolesSet) {
      run(
        `INSERT INTO training (person_id, role_id, status, source) VALUES (?,?, 'Qualified', 'manual')
         ON CONFLICT(person_id, role_id) DO UPDATE SET status='Qualified', source='manual'`,
        [personId, rid]
      );
    }
    refreshCaches();
  }

  // Assignments
  function listAssignmentsForDate(dateMDY: string) {
    const d = parseMDY(dateMDY); const dYMD = ymd(d);
    const rows = all(`SELECT a.id, a.date, a.person_id, a.role_id, a.segment,
                             p.first_name, p.last_name, p.work_email,
                             r.name as role_name, r.code as role_code, r.group_id,
                             g.name as group_name
                      FROM assignment a
                      JOIN person p ON p.id=a.person_id
                      JOIN role r ON r.id=a.role_id
                      JOIN grp g  ON g.id=r.group_id
                      WHERE a.date=?
                      ORDER BY g.name, r.name, p.last_name, p.first_name`, [dYMD]);
    return rows;
  }

  function addAssignment(dateMDY: string, personId: number, roleId: number, segment: Segment) {
    // Weekend guard
    const d = parseMDY(dateMDY);
    if (weekdayName(d) === "Weekend") { alert("Weekends are ignored. Pick a weekday."); return; }

    // Time-off block enforcement
    if (segment !== "Early") {
    const blocked = isSegmentBlockedByTimeOff(personId, d, segment);
      if (blocked) { alert("Time-off overlaps this segment. Blocked."); return; }
    }

    // Duplicate assignment guard: prevent two assignments for the same person in the same segment on the same day.
    // If detected, warn and offer to cancel or continue (continuing removes the existing assignment[s]).
    const dYMD = ymd(d);
    const existing = all(
      `SELECT a.id, a.role_id, r.name as role_name, g.name as group_name
       FROM assignment a
       JOIN role r ON r.id=a.role_id
       JOIN grp g  ON g.id=r.group_id
       WHERE a.date=? AND a.person_id=? AND a.segment=?`,
      [dYMD, personId, segment]
    );
    if (existing.length) {
      const person = people.find((p:any) => p.id === personId);
      const personName = person ? `${person.first_name} ${person.last_name}` : "This person";
      const details = existing.map((e:any)=> `${e.group_name} - ${e.role_name}`).join("; ");
      const proceed = confirm(`${personName} is already assigned in ${segment}: ${details}.\n\nClick OK to continue and remove the other assignment(s), or Cancel to abort.`);
      if (!proceed) return;
      for (const e of existing) {
        run(`DELETE FROM assignment WHERE id=?`, [e.id]);
      }
    }

    run(`INSERT INTO assignment (date, person_id, role_id, segment) VALUES (?,?,?,?)`, [ymd(d), personId, roleId, segment]);
  // Do not auto-qualify from assignment; training is user-controlled in profile
    refreshCaches();
  }

  function deleteAssignment(id:number){ run(`DELETE FROM assignment WHERE id=?`,[id]); refreshCaches(); }

  function segmentTimesForDate(date: Date): Record<string, { start: Date; end: Date }> {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const mk = (t: string) => {
      const [h, m] = t.split(":" ).map(Number);
      return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
    };
    const out: Record<string, { start: Date; end: Date }> = {};
    for (const s of segments) {
      out[s.name] = { start: mk(s.start_time), end: mk(s.end_time) };
    }

    const assigns = listAssignmentsForDate(fmtDateMDY(date));
    const segRoleMap = new Map<string, Set<number>>();
    for (const a of assigns) {
      let set = segRoleMap.get(a.segment);
      if (!set) {
        set = new Set<number>();
        segRoleMap.set(a.segment, set);
      }
      set.add(a.role_id);
    }
    for (const adj of segmentAdjustments) {
      const roles = segRoleMap.get(adj.condition_segment);
      if (!roles) continue;
      if (adj.condition_role_id != null && !roles.has(adj.condition_role_id)) continue;
      const target = out[adj.target_segment];
      if (!target) continue;
      const cond = out[adj.condition_segment];
      let base: Date | undefined;
      switch (adj.baseline) {
        case 'condition.start': base = cond?.start; break;
        case 'condition.end': base = cond?.end; break;
        case 'target.start': base = target.start; break;
        case 'target.end': base = target.end; break;
      }
      if (!base) continue;
      target[adj.target_field] = addMinutes(base, adj.offset_minutes);
    }

    return out;
  }

  function isSegmentBlockedByTimeOff(personId: number, date: Date, segment: Segment): boolean {
    // For UI adding, any overlap => return true (spec Q34 = Block)
    const intervals = listTimeOffIntervals(personId, date);
    if (intervals.length === 0) return false;
    const seg = segmentTimesForDate(date)[segment];
    if (!seg) return false;
    const start = seg.start.getTime();
    const end = seg.end.getTime();
    return intervals.some(({ start: s, end: e }) => Math.max(s.getTime(), start) < Math.min(e.getTime(), end));
  }

  function listTimeOffIntervals(personId: number, date: Date): Array<{start: Date; end: Date; reason?: string}> {
    const startDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0,0,0,0);
    const endDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23,59,59,999);
    const rows = all(`SELECT start_ts, end_ts, reason FROM timeoff WHERE person_id=?`, [personId]);
    return rows
      .map((r) => ({ start: new Date(r.start_ts), end: new Date(r.end_ts), reason: r.reason }))
      .filter((r) => r.end >= startDay && r.start <= endDay)
      .map((r) => ({ start: r.start < startDay ? startDay : r.start, end: r.end > endDay ? endDay : r.end, reason: r.reason }));
  }


  // Monthly default assignments
  function loadMonthlyDefaults(month: string, db = sqlDb) {
    if (!db) {
      setAvailabilityOverrides([]);
      return;
    }
    const rows = all(`SELECT * FROM monthly_default WHERE month=?`, [month], db);
    setMonthlyDefaults(rows);
    const ov = all(`SELECT * FROM monthly_default_day WHERE month=?`, [month], db);
    setMonthlyOverrides(ov);
    const notes = all(`SELECT * FROM monthly_default_note WHERE month=?`, [month], db);
    setMonthlyNotes(notes);

    let availOverrides: Array<{ person_id: number; date: string; avail: string }> = [];
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const monthIndex = monthNum - 1;
    if (Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 0 && monthIndex < 12) {
      const startDate = new Date(year, monthIndex, 1);
      const endDate = new Date(year, monthIndex + 1, 0);
      const startYmd = ymd(startDate);
      const endYmd = ymd(endDate);
      availOverrides = all(
        `SELECT person_id, date, avail FROM availability_override WHERE date BETWEEN ? AND ?`,
        [startYmd, endYmd],
        db
      );
    }
    setAvailabilityOverrides(availOverrides);

    // Reflect changes to training from monthly assignments
    syncTrainingFromMonthly(db);
  }

  function setMonthlyDefault(personId: number, segment: Segment, roleId: number | null) {
    if (!sqlDb) return;
    if (roleId != null) {
      run(`INSERT INTO monthly_default (month, person_id, segment, role_id) VALUES (?,?,?,?)
           ON CONFLICT(month, person_id, segment) DO UPDATE SET role_id=excluded.role_id`,
          [selectedMonth, personId, segment, roleId]);
    } else {
      run(`DELETE FROM monthly_default WHERE month=? AND person_id=? AND segment=?`,
          [selectedMonth, personId, segment]);
    }
  loadMonthlyDefaults(selectedMonth);
  syncTrainingFromMonthly();
  }

  function setWeeklyOverride(personId: number, weekday: number, segment: Segment, roleId: number | null) {
    if (!sqlDb) return;
    if (roleId != null) {
      run(`INSERT INTO monthly_default_day (month, person_id, weekday, segment, role_id) VALUES (?,?,?,?,?)
           ON CONFLICT(month, person_id, weekday, segment) DO UPDATE SET role_id=excluded.role_id`,
          [selectedMonth, personId, weekday, segment, roleId]);
    } else {
      run(`DELETE FROM monthly_default_day WHERE month=? AND person_id=? AND weekday=? AND segment=?`,
          [selectedMonth, personId, weekday, segment]);
    }
  loadMonthlyDefaults(selectedMonth);
  syncTrainingFromMonthly();
  }

  function setMonthlyNote(personId: number, note: string | null) {
    if (!sqlDb) return;
    const text = note?.trim();
    if (text) {
      run(`INSERT INTO monthly_default_note (month, person_id, note) VALUES (?,?,?)
           ON CONFLICT(month, person_id) DO UPDATE SET note=excluded.note`,
          [selectedMonth, personId, text]);
    } else {
      run(`DELETE FROM monthly_default_note WHERE month=? AND person_id=?`,
          [selectedMonth, personId]);
    }
    loadMonthlyDefaults(selectedMonth);
  }

  function setMonthlyDefaultForMonth(month: string, personId: number, segment: Segment, roleId: number | null) {
    if (!sqlDb) return;
    if (roleId != null) {
      run(`INSERT INTO monthly_default (month, person_id, segment, role_id) VALUES (?,?,?,?)
           ON CONFLICT(month, person_id, segment) DO UPDATE SET role_id=excluded.role_id`,
          [month, personId, segment, roleId]);
    } else {
      run(`DELETE FROM monthly_default WHERE month=? AND person_id=? AND segment=?`,
          [month, personId, segment]);
    }
  syncTrainingFromMonthly();
  }

  function copyMonthlyDefaults(fromMonth: string, toMonth: string) {
    if (!sqlDb) return;
    const rows = all(`SELECT person_id, segment, role_id FROM monthly_default WHERE month=?`, [fromMonth]);
    for (const row of rows) {
      run(
        `INSERT INTO monthly_default (month, person_id, segment, role_id) VALUES (?,?,?,?)
         ON CONFLICT(month, person_id, segment) DO UPDATE SET role_id=excluded.role_id`,
        [toMonth, row.person_id, row.segment, row.role_id]
      );
    }
    const orows = all(`SELECT person_id, weekday, segment, role_id FROM monthly_default_day WHERE month=?`, [fromMonth]);
    for (const row of orows) {
      run(
        `INSERT INTO monthly_default_day (month, person_id, weekday, segment, role_id) VALUES (?,?,?,?,?)
         ON CONFLICT(month, person_id, weekday, segment) DO UPDATE SET role_id=excluded.role_id`,
        [toMonth, row.person_id, row.weekday, row.segment, row.role_id]
      );
    }
    const nrows = all(`SELECT person_id, note FROM monthly_default_note WHERE month=?`, [fromMonth]);
    for (const row of nrows) {
      run(
        `INSERT INTO monthly_default_note (month, person_id, note) VALUES (?,?,?)
         ON CONFLICT(month, person_id) DO UPDATE SET note=excluded.note`,
        [toMonth, row.person_id, row.note]
      );
    }
    loadMonthlyDefaults(toMonth);
  syncTrainingFromMonthly();
    setStatus(`Copied monthly defaults from ${fromMonth}.`);
  }

  async function applyMonthlyDefaults(month: string) {
    if (!sqlDb) return;
    const [y,m] = month.split('-').map(n=>parseInt(n,10));
    const days = new Date(y, m, 0).getDate();
    const defaultMap = new Map<string, number>();
    for (const def of monthlyDefaults) {
      defaultMap.set(`${def.person_id}|${def.segment}`, def.role_id);
    }
    const overrideMap = new Map<string, number>();
    for (const ov of monthlyOverrides) {
      overrideMap.set(`${ov.person_id}|${ov.weekday}|${ov.segment}`, ov.role_id);
    }
    let overwriteAll = false;
    let skipAll = false;
    for (const person of people) {
      for (let day=1; day<=days; day++) {
        const d = new Date(y, m-1, day);
        const wdName = weekdayName(d);
        if (wdName === 'Weekend') continue;
        const wdNum = d.getDay(); // 1=Mon..5=Fri
        const avail = availabilityFor(sqlDb, person.id, d);
        for (const seg of segments.map(s => s.name as Segment)) {
          let roleId = overrideMap.get(`${person.id}|${wdNum}|${seg}`);
          if (roleId === undefined) roleId = defaultMap.get(`${person.id}|${seg}`);
          if (roleId == null) continue;
          let ok = false;
          if (seg === 'AM' || seg === 'Early') ok = avail === 'AM' || avail === 'B';
          else if (seg === 'PM') ok = avail === 'PM' || avail === 'B';
          else if (seg === 'Lunch') ok = avail === 'AM' || avail === 'PM' || avail === 'B';
          else ok = avail === 'AM' || avail === 'PM' || avail === 'B';
          if (!ok) continue;
          if (seg !== 'Early' && isSegmentBlockedByTimeOff(person.id, d, seg)) continue;
          const dateStr = ymd(d);
          const existing = all(
            `SELECT role_id FROM assignment WHERE date=? AND person_id=? AND segment=?`,
            [dateStr, person.id, seg]
          );
          if (existing.length) {
            if (skipAll) continue;
            if (!overwriteAll) {
              const action = await new Promise<'overwrite'|'skip'|'overwriteAll'|'skipAll'>(resolve => {
                setConflictPrompt({ person, date: d, segment: seg, resolve });
              });
              if (action === 'skip' || action === 'skipAll') {
                if (action === 'skipAll') skipAll = true;
                continue;
              }
              if (action === 'overwriteAll') overwriteAll = true;
            }
          }
          run(`INSERT OR REPLACE INTO assignment (date, person_id, role_id, segment) VALUES (?,?,?,?)`,
              [dateStr, person.id, roleId, seg]);
        }
      }
    }
    refreshCaches();
    setStatus('Applied monthly defaults.');
  }

  async function exportMonthlyDefaults(month: string) {
    if (!sqlDb) return;
    const headers = [
      'Last Name',
      'First Name',
      ...segments.map(s => `${s.name} Role`),
      'Notes',
      'B/S','Commute','Active',
      'Mon','Tue','Wed','Thu','Fri'
    ];

    const contrastColor = (hex: string) => {
      const c = hex.replace('#','');
      if (c.length !== 6) return '#000';
      const r = parseInt(c.substring(0,2),16);
      const g = parseInt(c.substring(2,4),16);
      const b = parseInt(c.substring(4,6),16);
      const l = 0.299*r + 0.587*g + 0.114*b;
      return l > 186 ? '#000' : '#fff';
    };

    // Ensure the month is interpreted in the local timezone so that
    // toLocaleString displays the correct month. Parsing a date-only
    // string like "2023-09-01" is treated as UTC which can result in the
    // previous month being shown in negative timezones (e.g. "August" for
    // September). By including a time component without a timezone, the
    // date is parsed in the local timezone.
    const monthDate = new Date(month + '-01T00:00:00');
    const titleText = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const escapeHtml = (s: string) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyHtml = people.map((p:any) => {
      const roleTds = segments.map(s => {
        const seg = s.name as Segment;
        const def = monthlyDefaults.find(d => d.person_id===p.id && d.segment===seg);
        const role = roles.find(r => r.id===def?.role_id);
        const group = groups.find(g => g.id === role?.group_id);
        const bg = group?.custom_color || '';
        const color = bg ? contrastColor(bg) : '';
        const style = bg ? ` style="background:${bg};color:${color};"` : '';
        const overrideStrs: string[] = [];
        for (let w = 1; w <= 5; w++) {
          const ov = monthlyOverrides.find(o => o.person_id===p.id && o.weekday===w && o.segment===seg);
          const ovRole = roles.find(r => r.id===ov?.role_id);
          if (ovRole && ovRole.id !== def?.role_id) {
            overrideStrs.push(`${WEEKDAYS[w-1].slice(0,3)}: ${escapeHtml(ovRole.name)}`);
          }
        }
        const overrideHtml = overrideStrs.length ? `<div class="ov">${overrideStrs.join(', ')}</div>` : '';
        return `<td${style}>${escapeHtml(role?.name || '')}${overrideHtml}</td>`;
      }).join('');
      const note = monthlyNotes.find(n => n.person_id === p.id)?.note;
      return `<tr>`+
        `<td>${escapeHtml(p.last_name)}</td>`+
        `<td>${escapeHtml(p.first_name)}</td>`+
        roleTds+
        `<td>${escapeHtml(note || '')}</td>`+
        `<td>${escapeHtml(p.brother_sister || '')}</td>`+
        `<td>${p.commuter ? 'Yes' : 'No'}</td>`+
        `<td>${p.active ? 'Yes' : 'No'}</td>`+
        `<td>${escapeHtml(p.avail_mon)}</td>`+
        `<td>${escapeHtml(p.avail_tue)}</td>`+
        `<td>${escapeHtml(p.avail_wed)}</td>`+
        `<td>${escapeHtml(p.avail_thu)}</td>`+
        `<td>${escapeHtml(p.avail_fri)}</td>`+
        `</tr>`;
    }).join('');

    const style = `body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f7fa;color:#1a1a1a;margin:0;padding:40px;}\n`+
      `h1{text-align:center;font-weight:300;margin-bottom:24px;}\n`+
      `.search{text-align:right;margin-bottom:12px;}\n`+
      `.search input{padding:8px 12px;border:1px solid #cbd5e1;border-radius:4px;}\n`+
      `table{width:100%;border-collapse:collapse;box-shadow:0 2px 4px rgba(0,0,0,0.1);}\n`+
      `th,td{padding:12px 16px;border-bottom:1px solid #e5e7eb;}\n`+
      `th{background:#111827;color:#fff;position:sticky;top:0;cursor:pointer;}\n`+
      `tr:nth-child(even){background:#f9fafb;}\n`+
      `.ov{font-size:0.8em;margin-top:4px;}`;

    const script = `const getCellValue=(tr,idx)=>tr.children[idx].innerText;\n`+
      `const comparer=(idx,asc)=>((a,b)=>((v1,v2)=>v1!==''&&v2!==''&&!isNaN(v1)&&!isNaN(v2)?v1-v2:v1.localeCompare(v2))(`+
      `getCellValue(asc?a:b,idx),getCellValue(asc?b:a,idx)));\n`+
      `document.querySelectorAll('th').forEach(th=>th.addEventListener('click',(()=>{`+
      `const table=th.closest('table');const tbody=table.querySelector('tbody');Array.from(tbody.querySelectorAll('tr'))`+
      `.sort(comparer(Array.from(th.parentNode.children).indexOf(th),this.asc=!this.asc))`+
      `.forEach(tr=>tbody.appendChild(tr));})));\n`+
      `const search=document.getElementById('table-search');search.addEventListener('input',()=>{`+
      `const term=search.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(tr=>{`+
      `tr.style.display=Array.from(tr.children).some(td=>td.textContent.toLowerCase().includes(term))?'':'none';});});`;

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>`+
      `<title>Monthly Defaults - ${escapeHtml(titleText)}</title>`+
      `<style>${style}</style></head><body>`+
      `<h1>Monthly Defaults - ${escapeHtml(titleText)}</h1>`+
      `<div class="search"><label>Search: <input id="table-search" type="search" placeholder="Filter rows"/></label></div>`+
      `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`+
      `<script>${script}<\/script></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-defaults-${month}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Needs
  function getRequiredFor(date: Date, groupId: number, roleId: number, segment: Segment): number {
    const dY = ymd(date);
    const ov = all(`SELECT required FROM needs_override WHERE date=? AND group_id=? AND role_id=? AND segment=?`, [dY, groupId, roleId, segment]);
    if (ov.length) return ov[0].required;
    const bl = all(`SELECT required FROM needs_baseline WHERE group_id=? AND role_id=? AND segment=?`, [groupId, roleId, segment]);
    return bl.length ? bl[0].required : 0;
  }

  function setRequired(date: Date | null, groupId: number, roleId: number, segment: Segment, required: number) {
    if (date) {
      run(`INSERT INTO needs_override (date, group_id, role_id, segment, required) VALUES (?,?,?,?,?)
           ON CONFLICT(date, group_id, role_id, segment) DO UPDATE SET required=excluded.required`,
          [ ymd(date), groupId, roleId, segment, required ]);
    } else {
      run(`INSERT INTO needs_baseline (group_id, role_id, segment, required) VALUES (?,?,?,?)
           ON CONFLICT(group_id, role_id, segment) DO UPDATE SET required=excluded.required`,
          [ groupId, roleId, segment, required ]);
    }
    refreshCaches();
  }

// Export to Shifts XLSX
async function exportShifts() {
    if (!sqlDb) { alert("Open a DB first"); return; }
    const XLSX = await loadXLSX();
    const start = parseYMD(exportStart);
    const end = parseYMD(exportEnd);
    if (end < start) { alert("End before start"); return; }

    const rows: any[] = [];
    let d = new Date(start.getTime());
    while (d <= end) {
      if (weekdayName(d) !== "Weekend") {
        const dYMD = ymd(d);
        const assigns = all(`SELECT a.id, a.person_id, a.role_id, a.segment,
                                    p.first_name, p.last_name, p.work_email,
                                    r.name as role_name, r.code as role_code, r.group_id,
                                    g.name as group_name
                             FROM assignment a
                             JOIN person p ON p.id=a.person_id
                             JOIN role r ON r.id=a.role_id
                             JOIN grp g  ON g.id=r.group_id
                             WHERE a.date=?`, [dYMD]);

        const segMap = segmentTimesForDate(d);
        for (const a of assigns) {
          const seg = segMap[a.segment];
          if (!seg) continue;
          const windows: Array<{ start: Date; end: Date; label: string; group: string }> = [
            { start: seg.start, end: seg.end, label: a.role_name, group: a.group_name },
          ];

          // Apply time-off partial splitting rule
          const intervals = listTimeOffIntervals(a.person_id, d);
          for (const w of windows) {
            const split = subtractIntervals(w.start, w.end, intervals);
            for (const s of split) rows.push(makeShiftRow(a, d, s.start, s.end));
          }
        }
      }
      d = addMinutes(d, 24*60);
    }

    // Build XLSX
    const header = [
      "Member","Work Email","Group","Start Date","Start Time","End Date","End Time","Theme Color","Custom Label","Unpaid Break (minutes)","Notes","Shared"
    ];
    const aoa = [header, ...rows.map(r => [
      r.member,
      r.workEmail,
      r.group,
      r.startDate,
      r.startTime,
      r.endDate,
      r.endTime,
      r.themeColor,
      r.customLabel,
      r.unpaidBreak,
      r.notes,
      r.shared,
    ])];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shifts");

    const blob = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const fileHandle = await (window as any).showSaveFilePicker({
      suggestedName: `teams-shifts-export_${exportStart}_${exportEnd}.xlsx`,
      types: [{ description: "Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
    });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    setStatus(`Exported ${rows.length} rows.`);
  }

  function subtractIntervals(start: Date, end: Date, offs: Array<{start: Date; end: Date}>): Array<{start: Date; end: Date}> {
    // Returns array of non-overlapping sub-intervals of [start,end) with offs removed
    let segments = [{ start, end }];
    for (const off of offs) {
      const next: typeof segments = [];
      for (const s of segments) {
        if (off.end <= s.start || off.start >= s.end) { next.push(s); continue; }
        // overlap exists
        if (off.start > s.start) next.push({ start: s.start, end: new Date(Math.min(off.start.getTime(), s.end.getTime())) });
        if (off.end < s.end) next.push({ start: new Date(Math.max(off.end.getTime(), s.start.getTime())), end: s.end });
      }
      segments = next.filter(x => x.end > x.start);
    }
    return segments.filter(x => x.end > x.start);
  }

  function makeShiftRow(a: any, _date: Date, start: Date, end: Date) {
    const member = `${a.last_name}, ${a.first_name}`; // Last, First
    const workEmail = a.work_email;
    // Group logic: Breakfast forces Dining Room, otherwise from role
    const group = a.segment === "Early" ? "Dining Room" : a.group_name;
    const themeColor = groups.find((g) => g.name === group)?.theme || "";
    const customLabel = a.role_name; // per user: Plain Name
    const unpaidBreak = 0; // per user
    const notes = ""; // per user
    const shared = "2. Not Shared"; // per user

    return {
      member,
      workEmail,
      group,
      startDate: fmtDateMDY(start),
      startTime: fmtTime24(start),
      endDate: fmtDateMDY(end),
      endTime: fmtTime24(end),
      themeColor,
      customLabel,
      unpaidBreak,
      notes,
      shared,
    };
  }

  // UI helpers
  const canEdit = !!sqlDb;
  const canSave = !!sqlDb && (!lockedBy || lockedBy === lockEmail);
  const selectedDateObj = useMemo(()=>parseMDY(selectedDate),[selectedDate]);
  const currentAssignmentsCount = useMemo(() => {
    if (!sqlDb) return 0;
    try {
      return listAssignmentsForDate(selectedDate).length;
    } catch (e) {
      return 0;
    }
  }, [sqlDb, selectedDate]);

  function peopleOptionsForSegment(date: Date, segment: Segment, role: any) {
    const rows = all(`SELECT id, last_name, first_name FROM person WHERE active=1 ORDER BY last_name, first_name`);
    const trained = new Set<number>([
      ...all(`SELECT person_id FROM training WHERE role_id=? AND status='Qualified'`, [role.id]).map((r: any) => r.person_id),
      // Implicit monthly qualification for this role/segment
      ...all(
        `SELECT DISTINCT person_id FROM monthly_default WHERE role_id=? AND segment=?
         UNION
         SELECT DISTINCT person_id FROM monthly_default_day WHERE role_id=? AND segment=?`,
        [role.id, segment, role.id, segment]
      ).map((r: any) => r.person_id),
    ]);

    return rows
      .filter((p: any) => {
        const avail = availabilityFor(sqlDb, p.id, date);
        let availOk: boolean;
        if (segment === "AM" || segment === "Early") {
          availOk = avail === "AM" || avail === "B";
        } else if (segment === "PM") {
          availOk = avail === "PM" || avail === "B";
        } else {
          availOk = avail === "AM" || avail === "PM" || avail === "B";
        }
        if (!availOk) return false;

        if (segment !== "Early" && isSegmentBlockedByTimeOff(p.id, date, segment)) return false;

        return true;
      })
      .map((p: any) => {
        const isTrained = trained.has(p.id);
        const warn = isTrained ? "" : "(Untrained)";
        return {
          id: p.id,
          label: `${p.last_name}, ${p.first_name}${warn ? ` ${warn}` : ""}`,
          blocked: false,
          trained: isTrained,
        };
      });
  }

  function roleListForSegment(segment: Segment) {
    return roles.filter((r) => (r.segments as Segment[]).includes(segment));
  }

  // Removed unused helpers assignmentsByGroupRole and countAssigned

  function RequiredCell({date, group, role, segment}:{date:Date|null; group:any; role:any; segment:Segment}){
    const req = date ? getRequiredFor(date, group.id, role.id, segment) : (all(`SELECT required FROM needs_baseline WHERE group_id=? AND role_id=? AND segment=?`, [group.id, role.id, segment])[0]?.required||0);
    const [val,setVal] = useState<number>(req);
    useEffect(()=>setVal(req),[req]);
    const r = useRequiredCellStyles();
    return (
      <div className={r.row}>
        <Input
          type="number"
          value={String(val)}
          onChange={(_, d)=>setVal(parseInt(d.value||'0',10))}
          className={r.input}
          size="small"
        />
        <Button size="small" appearance="primary" onClick={()=>setRequired(date, group.id, role.id, segment, val)}>
          Save
        </Button>
      </div>
    );
  }
  function BaselineView(){
    const s = useBaselineViewStyles();
    return (
      <div className={s.root}>
        <div className={s.title}>Baseline Needs</div>
        <div className={s.grid}>
          {groups.map((g:any)=> (
            <div key={g.id} className={s.card}>
              <div className={s.subTitle}>{g.name}</div>
              {roles.filter((r)=>r.group_id===g.id).map((r:any)=> (
                <div key={r.id} className={s.roleCard}>
                  <div className={s.subTitle}>{r.name}</div>
                  <div className={s.roleGrid}>
                      {segments.map((seg) => (
                        <div key={seg.name}>
                          <div className={s.label}>{seg.name} Required</div>
                          <RequiredCell date={null} group={g} role={r} segment={seg.name as Segment} />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }


function PeopleEditor(){
  const emptyForm = { active:true, commuter:false, brother_sister:'Brother', avail_mon:'U', avail_tue:'U', avail_wed:'U', avail_thu:'U', avail_fri:'U' };
  const [form,setForm] = useState<any>(emptyForm);
  const [editing,setEditing] = useState<any|null>(null);
  const [qualifications,setQualifications] = useState<Set<number>>(new Set());
  const [showModal,setShowModal] = useState(false);
  const [showBulk,setShowBulk] = useState(false);
  const [bulkAction,setBulkAction] = useState<'add'|'remove'>('add');
  const [bulkPeople,setBulkPeople] = useState<Set<number>>(new Set());
  const [bulkRoles,setBulkRoles] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<PeopleFiltersState>(() => freshPeopleFilters());

  // Query all people, including inactive entries, so they can be edited
  const people = all(`SELECT * FROM person ORDER BY last_name, first_name`);
  const viewPeople = useMemo(() => filterPeopleList(people, filters), [people, filters]);

  useEffect(()=>{
    if(editing){
      const rows = all(`SELECT role_id FROM training WHERE person_id=? AND status='Qualified'`, [editing.id]);
      setQualifications(new Set(rows.map((r:any)=>r.role_id)));
    } else {
      setQualifications(new Set());
    }
  },[editing]);

  function openModal(p?:any){
    if(p){
      setEditing(p);
      setForm(p);
    } else {
      setEditing(null);
      setForm(emptyForm);
      setQualifications(new Set());
    }
    setShowModal(true);
  }
  function closeModal(){
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
    setQualifications(new Set());
  }
  function save(){
    if(editing){
      updatePerson({...editing, ...form});
      saveTraining(editing.id, qualifications);
    } else {
      const id = addPerson(form);
      saveTraining(id, qualifications);
    }
    closeModal();
  }

  function closeBulk(){
    setShowBulk(false);
    setBulkPeople(new Set());
    setBulkRoles(new Set());
    setBulkAction('add');
  }

  function applyBulk(){
    for(const pid of bulkPeople){
      if(bulkAction==='add'){
        for(const rid of bulkRoles){
          run(
            `INSERT INTO training (person_id, role_id, status, source) VALUES (?,?, 'Qualified', 'manual')
             ON CONFLICT(person_id, role_id) DO UPDATE SET status='Qualified', source='manual'`,
            [pid, rid]
          );
        }
      } else {
        for(const rid of bulkRoles){
          run(`DELETE FROM training WHERE person_id=? AND role_id=? AND source='manual'`, [pid, rid]);
        }
      }
    }
    refreshCaches();
    closeBulk();
  }

  const s = usePeopleEditorStyles();

  return (
    <div className={s.root}>
      <div className="w-full">
        <div className={s.header}>
          <div className={s.title}>People</div>
          <div className={s.actions}>
            <Button appearance="secondary" onClick={()=>setShowBulk(true)}>Bulk Edit Qualifications</Button>
            <Button appearance="primary" onClick={()=>openModal()}>Add Person</Button>
          </div>
        </div>

        <div style={{ marginBottom: tokens.spacingVerticalS }}>
          <PeopleFiltersBar state={filters} onChange={(next) => setFilters((s) => ({ ...s, ...next }))} />
        </div>

        <div className={s.tableWrap}>
          <Table aria-label="People table">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Work Email</TableHeaderCell>
                <TableHeaderCell>B/S</TableHeaderCell>
                <TableHeaderCell>Commute</TableHeaderCell>
                <TableHeaderCell>Active</TableHeaderCell>
                <TableHeaderCell>Availability</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewPeople.map(p => (
                <TableRow key={p.id}>
                  <TableCell className={s.cellWrap}><PersonName personId={p.id}>{p.last_name}, {p.first_name}</PersonName></TableCell>
                  <TableCell className={s.cellWrap}>{p.work_email}</TableCell>
                  <TableCell>{p.brother_sister||'-'}</TableCell>
                  <TableCell>{p.commuter?"Yes":"No"}</TableCell>
                  <TableCell>{p.active?"Yes":"No"}</TableCell>
                  <TableCell className={s.cellWrap}>
                    <div className={s.availText}>
                      Mon: {p.avail_mon || 'U'} | Tue: {p.avail_tue || 'U'} | Wed: {p.avail_wed || 'U'} | Thu: {p.avail_thu || 'U'} | Fri: {p.avail_fri || 'U'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="small" onClick={()=>openModal(p)}>Edit</Button>
                      <Button size="small" appearance="secondary" onClick={()=>{ if(confirm('Delete?')) deletePerson(p.id); }}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <Dialog open={showBulk} onOpenChange={(_, d) => setShowBulk(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Bulk Edit Qualifications</DialogTitle>
            <DialogContent>
              <div className={s.formGrid}>
                <div className={s.col6}>
                  <div className={s.smallLabel}>People</div>
                  <Dropdown
                    multiselect
                    selectedOptions={[...bulkPeople].map(String)}
                    onOptionSelect={(_, data) =>
                      setBulkPeople(new Set((data.selectedOptions as string[]).map(Number)))
                    }
                  >
                    {people.map((p: any) => {
                      const label = `${p.last_name}, ${p.first_name}`;
                      return (
                        <Option key={p.id} value={String(p.id)} text={label}>
                          {label}
                        </Option>
                      );
                    })}
                  </Dropdown>
                </div>
                <div className={s.col6}>
                  <div className={s.smallLabel}>Action</div>
                  <Dropdown
                    selectedOptions={[bulkAction]}
                    onOptionSelect={(_, data) =>
                      setBulkAction((data.optionValue ?? data.optionText) as 'add' | 'remove')
                    }
                  >
                    <Option value="add" text="Add">Add</Option>
                    <Option value="remove" text="Remove">Remove</Option>
                  </Dropdown>
                </div>
              </div>
              <div>
                <div className={s.smallLabel}>Roles</div>
                <div className={s.qualGrid}>
                  {roles.map((r: any) => (
                    <Checkbox
                      key={r.id}
                      label={r.name}
                      checked={bulkRoles.has(r.id)}
                      onChange={(_, data) => {
                        const next = new Set(bulkRoles);
                        if (data.checked) next.add(r.id); else next.delete(r.id);
                        setBulkRoles(next);
                      }}
                    />
                  ))}
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeBulk}>Cancel</Button>
              <Button appearance="primary" onClick={applyBulk}>Apply</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={showModal} onOpenChange={(_, d) => setShowModal(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editing ? 'Edit Person' : 'Add Person'}</DialogTitle>
            <DialogContent>
              <div className={s.formGrid}>
                <Input className={s.col3} placeholder="Last Name" value={form.last_name||''} onChange={(_,d)=>setForm({...form,last_name:d.value})} />
                <Input className={s.col3} placeholder="First Name" value={form.first_name||''} onChange={(_,d)=>setForm({...form,first_name:d.value})} />
                <Input className={s.col4} placeholder="Work Email" value={form.work_email||''} onChange={(_,d)=>setForm({...form,work_email:d.value})} />
                <div className={s.col2}>
                  <Dropdown
                    selectedOptions={[form.brother_sister || 'Brother']}
                    onOptionSelect={(_, data)=> setForm({...form, brother_sister: String(data.optionValue ?? data.optionText)})}
                  >
                    <Option value="Brother" text="Brother">Brother</Option>
                    <Option value="Sister" text="Sister">Sister</Option>
                  </Dropdown>
                </div>
                <div className={`${s.col2} ${s.centerRow}`}>
                  <Checkbox label="Commuter" checked={!!form.commuter} onChange={(_,data)=>setForm({...form,commuter:!!data.checked})} />
                </div>
                <div className={`${s.col2} ${s.centerRow}`}>
                  <Checkbox label="Active" checked={form.active!==false} onChange={(_,data)=>setForm({...form,active:!!data.checked})} />
                </div>
                {WEEKDAYS.map((w,idx)=> (
                  <div key={w} className={s.col2}>
                    <div className={s.smallLabel}>{w} Availability</div>
                    <Dropdown
                      selectedOptions={[form[["avail_mon","avail_tue","avail_wed","avail_thu","avail_fri"][idx]]||'U']}
                      onOptionSelect={(_, data)=>{
                        const key = ["avail_mon","avail_tue","avail_wed","avail_thu","avail_fri"][idx] as keyof typeof form;
                        setForm({...form,[key]: String(data.optionValue ?? data.optionText)});
                      }}
                    >
                      <Option value="U" text="Unavailable">Unavailable</Option>
                      <Option value="AM" text="AM">AM</Option>
                      <Option value="PM" text="PM">PM</Option>
                      <Option value="B" text="Both">Both</Option>
                    </Dropdown>
                  </div>
                ))}
              </div>

              <div>
                <div className={s.smallLabel}>Qualified Roles</div>
                <div className={s.qualGrid}>
                  {roles.map((r:any)=>(
                    <Checkbox key={r.id}
                      label={r.name}
                      checked={qualifications.has(r.id)}
                      onChange={(_, data) => {
                        const next = new Set(qualifications);
                        if (data.checked) next.add(r.id); else next.delete(r.id);
                        setQualifications(next);
                      }}
                    />
                  ))}
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeModal}>Close</Button>
              <Button appearance="primary" onClick={save}>{editing ? 'Save Changes' : 'Add Person'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

  function NeedsEditor(){
    const d = selectedDateObj;
    const ds = useNeedsEditorStyles();
    return (
      <Dialog open={showNeedsEditor} onOpenChange={(_, data)=> setShowNeedsEditor(data.open)}>
        <DialogSurface className={ds.surface}>
          <DialogBody>
            <DialogTitle>Needs for {fmtDateMDY(d)}</DialogTitle>
            <DialogContent className={ds.content}>
              <div className={ds.grid}>
                {groups.map((g:any)=> (
                  <div key={g.id} className={ds.card}>
                    <div className={ds.subTitle}>{g.name}</div>
                    {roles.filter((r)=>r.group_id===g.id).map((r:any)=> (
                      <div key={r.id} className={ds.roleCard}>
                        <div className={ds.subTitle}>{r.name}</div>
                        <div className={ds.roleGrid}>
                          {segments.map((seg) => (
                            <div key={seg.name}>
                              <div className={ds.label}>{seg.name} Required</div>
                              <RequiredCell date={d} group={g} role={r} segment={seg.name as Segment} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={()=>setShowNeedsEditor(false)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }
  const sh = useAppShellStyles();

  return (
  <FluentProvider theme={themeName === "dark" ? webDarkTheme : webLightTheme}>
  <ProfileContext.Provider value={{ showProfile: (id: number) => setProfilePersonId(id) }}>
  <div className={sh.shell}>
      <TopBar
        ready={ready}
        sqlDb={sqlDb}
        canSave={canSave}
        createNewDb={createNewDb}
        openDbFromFile={openDbFromFile}
        saveDb={saveDb}
        saveDbAs={saveDbAs}
        status={status}
      />
      <div className={sh.contentRow}>
        <SideRail
          ready={ready}
          sqlDb={sqlDb}
          status={status}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          themeName={themeName}
          setThemeName={setThemeName}
        />
        <main className={sh.main}>
        <div className={sh.mainInner}>
      {!sqlDb && (
        <div className="p-6 text-slate-600">
          <div className="font-semibold mb-2">First run</div>
          <ol className="list-decimal ml-5 space-y-1 text-sm">
            <li>Click <b>New DB</b> to create a local SQLite database (unsaved) or <b>Open DB</b> to load an existing one.</li>
            <li>Use <b>Save As</b> to write the <code>.db</code> file to a shared folder on your LAN. Only one editor at a time.</li>
            <li>Add <b>People</b> in the <b>People</b> tab and set <b>Baseline Needs</b>.</li>
            <li>Assign roles in the <b>Daily Run</b> board. The app will warn on availability and training; time-off blocks assignment.</li>
            <li>Export date range with one row per segment, split for overlaps.</li>
          </ol>
          <div className="mt-4 text-xs text-slate-500">If export fails to load XLSX, your network may block the SheetJS CDN. I can swap to a different CDN if needed.</div>
        </div>
      )}

      {sqlDb && (
        <>
            {activeTab === 'RUN' && (
              <Suspense fallback={<div className="p-4 text-slate-600">Loading Daily Run…</div>}>
                <DailyRunBoard
                  activeRunSegment={activeRunSegment}
                  setActiveRunSegment={setActiveRunSegment}
                  groups={groups}
                  segments={segments}
                  lockEmail={lockEmail}
                  sqlDb={sqlDb}
                  all={all}
                  roleListForSegment={roleListForSegment}
                  selectedDate={selectedDate}
                  selectedDateObj={selectedDateObj}
                  setSelectedDate={setSelectedDate}
                  fmtDateMDY={fmtDateMDY}
                  parseYMD={parseYMD}
                  ymd={ymd}
                  setShowNeedsEditor={setShowNeedsEditor}
                  canEdit={canEdit}
                  peopleOptionsForSegment={peopleOptionsForSegment}
                  getRequiredFor={getRequiredFor}
                  addAssignment={addAssignment}
                  deleteAssignment={deleteAssignment}
                  segmentAdjustments={segmentAdjustments}
                />
              </Suspense>
            )}
          {activeTab === 'PEOPLE' && <PeopleEditor />}
          {activeTab === 'TRAINING' && (
            <Training
              people={people}
              roles={roles}
              groups={groups}
              all={all}
              run={run}
            />
          )}
          {activeTab === 'NEEDS' && <BaselineView />}
          {activeTab === 'EXPORT' && (
            <Suspense fallback={<div className="p-4 text-slate-600">Loading Export Preview…</div>}>
              <ExportPreview
                sqlDb={sqlDb}
                exportStart={exportStart}
                exportEnd={exportEnd}
                setExportStart={setExportStart}
                setExportEnd={setExportEnd}
                exportShifts={exportShifts}
                all={all}
                segmentTimesForDate={segmentTimesForDate}
                listTimeOffIntervals={listTimeOffIntervals}
                subtractIntervals={subtractIntervals}
                groups={groups}
                people={people}
                roles={roles}
              />
            </Suspense>
          )}
          {activeTab === 'MONTHLY' && (
            <MonthlyDefaults
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              copyFromMonth={copyFromMonth}
              setCopyFromMonth={setCopyFromMonth}
              people={people}
              segments={segments}
              monthlyDefaults={monthlyDefaults}
              monthlyOverrides={monthlyOverrides}
              monthlyNotes={monthlyNotes}
              monthlyEditing={monthlyEditing}
              setMonthlyEditing={setMonthlyEditing}
              setMonthlyDefault={setMonthlyDefault}
              setWeeklyOverride={setWeeklyOverride}
              setMonthlyNote={setMonthlyNote}
              copyMonthlyDefaults={copyMonthlyDefaults}
              applyMonthlyDefaults={applyMonthlyDefaults}
              exportMonthlyDefaults={exportMonthlyDefaults}
              roleListForSegment={roleListForSegment}
              groups={groups}
              roles={roles}
              availabilityOverrides={availabilityOverrides}
              getRequiredFor={getRequiredFor}
            />
          )}


          {activeTab === 'HISTORY' && (
            <CrewHistoryView
              sqlDb={sqlDb}
              monthlyDefaults={monthlyDefaults}
              segments={segments}
              people={people}
              roles={roles}
              groups={groups}
              roleListForSegment={roleListForSegment}
              setMonthlyDefaultForMonth={setMonthlyDefaultForMonth}
              all={all}
            />
          )}
          {activeTab === 'ADMIN' && (
            <Suspense fallback={<div className="p-4 text-slate-600">Loading Admin…</div>}>
              <AdminView sqlDb={sqlDb} all={all} run={run} refresh={refreshCaches} segments={segments} />
            </Suspense>
          )}
        </>
      )}

      {showNeedsEditor && <NeedsEditor />}
      {profilePersonId !== null && (
        <PersonProfileModal
          personId={profilePersonId}
          onClose={() => setProfilePersonId(null)}
          all={all}
        />
      )}
      {conflictPrompt && (
        <Dialog open>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Assignment Conflict</DialogTitle>
              <DialogContent>
                {conflictPrompt.person.first_name} {conflictPrompt.person.last_name} is already assigned on {conflictPrompt.date.toLocaleDateString()} for {conflictPrompt.segment}. What would you like to do?
              </DialogContent>
              <DialogActions>
                <Button onClick={() => { conflictPrompt.resolve('overwrite'); setConflictPrompt(null); }}>Overwrite</Button>
                <Button onClick={() => { conflictPrompt.resolve('skip'); setConflictPrompt(null); }}>Skip</Button>
                <Button onClick={() => { conflictPrompt.resolve('overwriteAll'); setConflictPrompt(null); }}>Overwrite All</Button>
                <Button onClick={() => { conflictPrompt.resolve('skipAll'); setConflictPrompt(null); }}>Skip All</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
        </div>
        </main>
      </div>
      {/* CopilotContext: Always rendered to provide context for Edge Copilot */}
      <CopilotContext
        activeTab={activeTab}
        selectedDate={selectedDate}
        activeRunSegment={activeRunSegment}
        peopleCount={people.length}
        assignmentsCount={currentAssignmentsCount}
        statusMessage={status}
      />
  </div>
  </ProfileContext.Provider>
  </FluentProvider>
  );
}
