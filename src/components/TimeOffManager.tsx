import * as React from "react";
import { Button, Input, Dropdown, Option, Table, TableHeader, TableHeaderCell, TableRow, TableBody, TableCell, makeStyles, tokens, Textarea, Tooltip, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, DialogTrigger } from "@fluentui/react-components";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

interface TimeOffManagerProps {
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
}

// Prefer a stable, public SheetJS URL to avoid CDN auth issues
const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";
async function loadXLSX(){
  try {
    // @ts-ignore
    const mod = await import(/* @vite-ignore */ XLSX_URL);
    return mod as any;
  } catch (error) {
    throw new Error(
      "Failed to load XLSX library from CDN. Please check your internet connection and try again. " +
      "If the problem persists, this may indicate a CDN service issue."
    );
  }
}

function parseMDY(str: string): Date {
  const [m, d, y] = String(str).split("/").map((s) => parseInt(String(s).trim(), 10));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
function parseTime(s: string): { h: number; m: number } {
  const t = String(s).trim();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return { h: 0, m: 0 };
  let hh = parseInt(m[1], 10) || 0;
  const mm = parseInt(m[2] || "0", 10) || 0;
  const ampm = m[3]?.toUpperCase();
  if (ampm === "AM") { if (hh === 12) hh = 0; }
  if (ampm === "PM") { if (hh !== 12) hh += 12; }
  return { h: hh, m: mm };
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  const d = parseMDY(dateStr);
  const { h, m } = parseTime(timeStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
}

// Excel serial date (days since 1899-12-30) to JS Date
function excelSerialToDate(n: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = Math.round(n * 24 * 60 * 60 * 1000);
  return new Date(epoch.getTime() + ms);
}

function coerceDate(val: any): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === "number" && isFinite(val)) return excelSerialToDate(val);
  const s = String(val).trim();
  // ISO or unambiguous formats
  if (/^\d{4}-\d{2}-\d{2}/.test(s) || /T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // Try M/D/Y
  const d = parseMDY(s);
  return isNaN(d.getTime()) ? null : d;
}

function coerceTimeHM(val: any): { h: number; m: number } | null {
  if (val == null || val === "") return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return { h: val.getHours(), m: val.getMinutes() };
  }
  if (typeof val === "number" && isFinite(val)) {
    // fraction of day
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return { h, m };
  }
  const t = parseTime(String(val));
  return t;
}

function combineCoerced(dateVal: any, timeVal: any, defaultTime: { h: number; m: number } = { h: 0, m: 0 }): Date | null {
  // If dateVal already has time info (string with time or Date with time), prefer it
  if (dateVal instanceof Date) {
    const d = dateVal;
    if (d.getHours() !== 0 || d.getMinutes() !== 0) return d;
  } else if (typeof dateVal === "string" && /\d:\d|T\d{2}:\d{2}/.test(dateVal)) {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d;
  }
  const d = coerceDate(dateVal);
  if (!d) return null;
  const tm = coerceTimeHM(timeVal) ?? defaultTime;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), tm.h, tm.m, 0, 0);
}

function sanitizeEmail(val: any): string {
  const s = String(val ?? '').trim();
  // Extract plain email from formats like "mailto:user@x.com" or "Name <user@x.com>"
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (m ? m[0] : s).toLowerCase();
}

function normalizeHeader(s: string): string {
  return String(s || '')
    .replace(/^\ufeff/, '') // strip BOM
    .replace(/\s+/g, ' ') // collapse spaces
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ''); // remove non-alphanum
}

const useStyles = makeStyles({
  root: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground1 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacingVerticalM },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalM },
  col3: { gridColumn: 'span 3' },
  col4: { gridColumn: 'span 4' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' },
  status: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  tableWrap: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'auto', maxHeight: '40vh' },
});

export default function TimeOffManager({ all, run, refresh }: TimeOffManagerProps){
  const s = useStyles();
  const dialogs = useDialogs();
  const [status, setStatus] = React.useState<string>("");
  const [importSummary, setImportSummary] = React.useState<null | { added: number; updated: number; ignored: number; skipped: number; noEmail: number; badDate: number; matchedByName: number }>(null);

  const people = React.useMemo(() => all(`SELECT id, first_name, last_name, work_email FROM person_active WHERE active=1 ORDER BY last_name, first_name`), [all]);
  const [addPersonId, setAddPersonId] = React.useState<number | null>(people[0]?.id ?? null);
  const [addStartDate, setAddStartDate] = React.useState<string>("");
  const [addStartTime, setAddStartTime] = React.useState<string>("08:00");
  const [addEndDate, setAddEndDate] = React.useState<string>("");
  const [addEndTime, setAddEndTime] = React.useState<string>("17:00");
  const [addReason, setAddReason] = React.useState<string>("");
  const addPersonLabel = React.useMemo(() => {
    if (addPersonId == null) return "Select person";
    const match = people.find((p: any) => p.id === addPersonId);
    return match ? `${match.last_name}, ${match.first_name}` : "";
  }, [addPersonId, people]);
  // Always query fresh so the table updates after changes
  const rows = all(`SELECT t.id, t.person_id, t.start_ts, t.end_ts, t.reason, p.first_name, p.last_name, p.work_email FROM timeoff_active t JOIN person_active p ON p.id=t.person_id ORDER BY t.start_ts DESC LIMIT 200`);

  async function handleImportXlsx(file: File){
    try{
      const XLSX = await loadXLSX();
      let wb: any;
      if (/\.csv$/i.test(file.name) || String(file.type).includes('text/csv')) {
        const text = await file.text();
        wb = XLSX.read(text, { type: 'string' });
      } else {
        const buf = await file.arrayBuffer();
        wb = XLSX.read(buf, { type: 'array', cellDates: true });
      }
      // Pick the sheet that best matches expected headers
      const EXPECTED = ['Member','Work Email','Start Date','Start Time','End Date','End Time','Time Off Reason'];
      const scoreSheet = (ws: any): number => {
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        if (!rows.length) return 0;
        const keys = Object.keys(rows[0] || {});
        const kset = new Set(keys.map((k)=>normalizeHeader(k)));
        let score = 0;
        for (const e of EXPECTED) if (kset.has(normalizeHeader(e))) score++;
        return score;
      };
      let bestSheet = wb.SheetNames[0];
      let bestScore = -1;
      for (const sn of wb.SheetNames){
        const sc = scoreSheet(wb.Sheets[sn]);
        if (sc > bestScore){ bestScore = sc; bestSheet = sn; }
      }
      const ws = wb.Sheets[bestSheet];
      let data: any[] = [];
      try {
        // Detect header row within the sheet
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        let bestRow = -1, bestRowScore = -1;
        for (let i=0;i<rows.length;i++){
          const r = rows[i] || [];
          const kset = new Set((r as any[]).map((c)=>normalizeHeader(String(c))));
          let sc = 0; for (const e of EXPECTED) if (kset.has(normalizeHeader(e))) sc++;
          if (sc > bestRowScore){ bestRowScore = sc; bestRow = i; }
        }
        if (bestRowScore > 0 && bestRow >= 0){
          const headers = (rows[bestRow] as any[]).map((h)=>String(h||''));
          for (let i=bestRow+1;i<rows.length;i++){
            const r = rows[i] || [];
            if (!r.some((v:any)=>String(v).trim()!=='')) continue; // skip blank row
            const obj: any = {};
            for (let c=0;c<headers.length;c++) obj[headers[c]] = r[c] ?? '';
            data.push(obj);
          }
        }
      } catch {}
      if (!data.length){
        // Fallback simple conversion
        data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      }
      if (!data.length){ setStatus('No rows found in the file.'); return; }

      // Build email -> id map
      const emailMap = new Map<string, number>();
      for (const p of people){ emailMap.set(String(p.work_email||'').toLowerCase(), p.id); }

      // Header normalization and column resolver
      const norm = (s: string) => String(s || '')
        .replace(/^\ufeff/, '') // strip BOM
        .replace(/\s+/g, ' ') // collapse spaces
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ''); // remove non-alphanum
      const col = (row: any, names: string[]) => {
        // Build normalized key map once per row
        const keys = Object.keys(row);
        const map = new Map<string,string>();
        for (const k of keys) map.set(norm(k), k);
        for (const n of names){
          const direct = keys.find(h => h.toLowerCase() === String(n).toLowerCase());
          if (direct) return row[direct];
          const nk = map.get(norm(n));
          if (nk) return row[nk];
        }
        return '';
      };

      // Common Teams/Excel header variants
      const EMAIL_HEADERS = ['Work Email','Email','WorkEmail','User email','User Email','UserEmail','Email Address','Email address','UserPrincipalName','UPN','User'];
      const MEMBER_HEADERS = ['Member','Name','Display Name','DisplayName'];
      const START_DATE_HEADERS = ['Start Date','Start date','Start','StartDate','Start Local Date','Start Local Time','Start Date Time','StartDateTime'];
      const START_TIME_HEADERS = ['Start Time','Start time','StartTime','Start Local Time'];
      const END_DATE_HEADERS = ['End Date','End date','End','EndDate','End Local Date','End Local Time','End Date Time','EndDateTime'];
      const END_TIME_HEADERS = ['End Time','End time','EndTime','End Local Time'];
      const REASON_HEADERS = ['Time Off Reason','Time off reason','Reason','Notes','Comment'];

      // Build name -> id map for fallback matching ("Last, First")
      const nameMap = new Map<string, number>();
      for (const p of people){
        const key = `${String(p.last_name||'').trim().toLowerCase()},${String(p.first_name||'').trim().toLowerCase()}`;
        if (!nameMap.has(key)) nameMap.set(key, p.id);
      }

  let added = 0, updated = 0, ignored = 0, skipped = 0, noEmail = 0, badDate = 0, matchedByName = 0;
      for (const r of data){
        let email = sanitizeEmail(col(r, EMAIL_HEADERS));
        let pid = emailMap.get(email);
        if (!pid){
          // Fallback by Member name ("Last, First")
          const member = String(col(r, MEMBER_HEADERS));
          const [lastRaw, firstRaw] = member.split(',');
          if (lastRaw && firstRaw){
            const key = `${lastRaw.trim().toLowerCase()},${firstRaw.trim().toLowerCase()}`;
            const byName = nameMap.get(key);
            if (byName){ pid = byName; matchedByName++; }
          }
        }
        if (!pid){ skipped++; noEmail++; continue; }

        const sdv = col(r, START_DATE_HEADERS);
        const stv = col(r, START_TIME_HEADERS);
        const edv = col(r, END_DATE_HEADERS);
        const etv = col(r, END_TIME_HEADERS);
        const reason = String(col(r, REASON_HEADERS));

        const start = combineCoerced(sdv, stv, { h: 0, m: 0 });
        let end = combineCoerced(edv, etv, { h: 23, m: 59 });
        // Teams all-day ranges often use End Time 00:00 to denote through previous day
        if (end && ((end.getHours() === 0 && end.getMinutes() === 0) || String(etv).trim() === '00:00')){
          const adj = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);
          adj.setDate(adj.getDate() - 1);
          adj.setHours(23, 59, 0, 0);
          end = adj;
        }
        if (!start || !end || !(start instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime())){ skipped++; badDate++; continue; }
        const sIso = start.toISOString();
        const eIso = end.toISOString();
        // Check for exact duplicate timeoff for same person and time window
        const existing = all(`SELECT id, reason FROM timeoff_active WHERE person_id=? AND start_ts=? AND end_ts=? LIMIT 1`, [pid, sIso, eIso]);
        if (existing && existing[0]){
          const ex = existing[0];
          const exReason = String(ex.reason || '');
          const newReason = String(reason || '');
          if (exReason !== newReason){
            run(`UPDATE timeoff SET reason=? WHERE id=?`, [newReason, ex.id]);
            updated++;
          } else {
            ignored++;
          }
        } else {
          run(`INSERT INTO timeoff (person_id, start_ts, end_ts, reason, source) VALUES (?,?,?,?,?)`, [pid, sIso, eIso, reason, 'ImportXLSX']);
          added++;
        }
      }
      refresh();
      setStatus(`Import complete: added ${added}, updated ${updated}, ignored ${ignored}, skipped ${skipped}.`);
      setImportSummary({ added, updated, ignored, skipped, noEmail, badDate, matchedByName });
    }catch(e:any){
      const errorMsg = e?.message || String(e);
      console.error('Time-off import error:', e);
      setStatus(`Time-off import failed: ${errorMsg}`);
    }
  }

  function addManual(){
    if (!addPersonId || !addStartDate || !addEndDate){ setStatus('Please fill person, start and end.'); return; }
    const sdt = combineDateTime(addStartDate, addStartTime||'00:00');
    const edt = combineDateTime(addEndDate, addEndTime||'23:59');
    if (edt <= sdt){ setStatus('End must be after Start.'); return; }
    run(`INSERT INTO timeoff (person_id, start_ts, end_ts, reason, source) VALUES (?,?,?,?,?)`, [addPersonId, sdt.toISOString(), edt.toISOString(), addReason || null, 'Manual']);
    setStatus('Added time-off entry.');
    setAddReason('');
  refresh();
    // Keep person and times for next add
  }

  function downloadSampleCsv(){
    const headers = ['Member','Work Email','Start Date','Start Time','End Date','End Time','Time Off Reason'];
    const example = ['Doe, Jane','jane.doe@example.com','7/15/2025','8:00 AM','7/15/2025','5:00 PM','Vacation'];
    const csv = [headers.join(','), example.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')].join("\r\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeoff-sample.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  async function remove(id: number){
    const confirmed = await dialogs.showConfirm('Are you sure you want to delete this time-off entry?', 'Delete Time Off');
    if (!confirmed) return;
    run(`DELETE FROM timeoff WHERE id=?`, [id]);
    setStatus('Deleted.');
  refresh();
    // trigger refresh by forcing re-render; depends on parent refresh
    // parent refresh updates caches; here the table reads live from DB on render
  }

  return (
    <section className={s.root}>
      <div className={s.header}>
        <h2 style={{ margin: 0 }}>Time Off</h2>
        <div className={s.actions}>
          <input id="toff-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style={{ display: 'none' }} onChange={async (e)=>{ const f=e.target.files?.[0]; if (f) await handleImportXlsx(f); (e.target as HTMLInputElement).value=''; }} />
          <Tooltip content="Import Teams Time-Off XLSX/CSV" relationship="label"><Button onClick={()=>document.getElementById('toff-file')?.click()}>Import Time Off</Button></Tooltip>
          <Tooltip content="Download a sample CSV template" relationship="label"><Button appearance="secondary" onClick={downloadSampleCsv}>Sample CSV</Button></Tooltip>
        </div>
      </div>

      <div className={s.grid}>
        <div className={s.col3}>
          <Dropdown
            placeholder="Select person"
            selectedOptions={addPersonId!=null?[String(addPersonId)]:[]}
            value={addPersonLabel}
            onOptionSelect={(_,d)=>{ const v = d.optionValue ?? d.optionText; setAddPersonId(v?Number(v):null); }}
          >
            {people.map((p:any)=> {
              const label = `${p.last_name}, ${p.first_name}`;
              return (
                <Option key={p.id} value={String(p.id)} text={label}>{label}</Option>
              );
            })}
          </Dropdown>
        </div>
        <div className={s.col3}>
          <Input type="date" value={addStartDate} onChange={(_,d)=>setAddStartDate(d.value)} />
        </div>
        <div className={s.col3}>
          <Input type="time" value={addStartTime} onChange={(_,d)=>setAddStartTime(d.value)} />
        </div>
        <div className={s.col3}>
          <Input type="date" value={addEndDate} onChange={(_,d)=>setAddEndDate(d.value)} />
        </div>
        <div className={s.col3}>
          <Input type="time" value={addEndTime} onChange={(_,d)=>setAddEndTime(d.value)} />
        </div>
        <div className={s.col4}>
          <Textarea placeholder="Reason (optional)" value={addReason} onChange={(_,d)=>setAddReason(d.value)} />
        </div>
        <div className={s.col3}>
          <Button appearance="primary" onClick={addManual}>Add Time Off</Button>
        </div>
      </div>

      <div className={s.status}>{status}</div>

      {importSummary && (
        <Dialog open onOpenChange={(_, d)=>{ if (!d.open) setImportSummary(null); }}>
          <DialogTrigger>
            <span />
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Import Summary</DialogTitle>
              <DialogContent>
                <div style={{ lineHeight: 1.8 }}>
                  <div><b>Added:</b> {importSummary.added}</div>
                  <div><b>Updated:</b> {importSummary.updated}</div>
                  <div><b>Ignored (duplicates):</b> {importSummary.ignored}</div>
                  <div><b>Skipped:</b> {importSummary.skipped}</div>
                  {(importSummary.skipped > 0) && (
                    <div style={{ marginTop: 8, color: tokens.colorNeutralForeground3 }}>
                      Details: no email {importSummary.noEmail}, bad date/time {importSummary.badDate}{importSummary.matchedByName?`, matched by name ${importSummary.matchedByName}`:''}.
                    </div>
                  )}
                </div>
              </DialogContent>
              <DialogActions>
                <Button onClick={()=>setImportSummary(null)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}

      <div className={s.tableWrap}>
        <Table aria-label="Time-off table">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Person</TableHeaderCell>
              <TableHeaderCell>Work Email</TableHeaderCell>
              <TableHeaderCell>Start</TableHeaderCell>
              <TableHeaderCell>End</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r:any)=> (
              <TableRow key={r.id}>
                <TableCell>{`${r.last_name}, ${r.first_name}`}</TableCell>
                <TableCell>{r.work_email}</TableCell>
                <TableCell>{new Date(r.start_ts).toLocaleString()}</TableCell>
                <TableCell>{new Date(r.end_ts).toLocaleString()}</TableCell>
                <TableCell>{r.reason||''}</TableCell>
                <TableCell><Button size="small" appearance="secondary" onClick={()=>remove(r.id)}>Delete</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
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
    </section>
  );
}
