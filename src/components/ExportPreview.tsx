import React, { useMemo } from "react";
import {
  Button,
  Field,
  Input,
  makeStyles,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  Text,
  tokens,
} from "@fluentui/react-components";

interface ExportPreviewProps {
  sqlDb: any;
  exportStart: string;
  exportEnd: string;
  setExportStart: (v: string) => void;
  setExportEnd: (v: string) => void;
  exportShifts: () => void;
  all: (sql: string, params?: any[]) => any[];
  segmentTimesForDate: (date: Date) => Record<string, { start: Date; end: Date }>;
  segmentTimesForPersonDate: (date: Date, personAssigns: Array<{ segment: string; role_id: number }>) => Record<string, { start: Date; end: Date }>;
  listTimeOffIntervals: (personId: number, date: Date) => Array<{ start: Date; end: Date }>;
  subtractIntervals: (
    start: Date,
    end: Date,
    offs: Array<{ start: Date; end: Date }>
  ) => Array<{ start: Date; end: Date }>;
  groups: any[];
  people: any[];
  roles: any[];
}

const useExportPreviewStyles = makeStyles({
  root: { padding: tokens.spacingHorizontalM },
  controls: {
    display: "flex",
    alignItems: "end",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  spacer: { marginLeft: "auto" },
  tableWrapper: {
    overflow: "auto",
    maxHeight: "60vh",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  rowsText: { color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS },
});

export default function ExportPreview({
  sqlDb,
  exportStart,
  exportEnd,
  setExportStart,
  setExportEnd,
  exportShifts,
  all,
  segmentTimesForDate,
  segmentTimesForPersonDate,
  listTimeOffIntervals,
  subtractIntervals,
  groups,
  people,
  roles,
}: ExportPreviewProps) {
  const s = useExportPreviewStyles();
  function pad2(n: number) {
    return n < 10 ? `0${n}` : `${n}`;
  }
  function fmtDateMDY(d: Date): string {
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const y = d.getFullYear();
    return `${m}/${day}/${y}`;
  }
  function fmtTime24(d: Date): string {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function ymd(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function parseYMD(str: string): Date {
    const [y, m, d] = str.split("-").map((s) => parseInt(s, 10));
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60000);
  }
  function weekdayName(d: Date): string {
    const n = d.getDay();
    switch (n) {
      case 1:
        return "Monday";
      case 2:
        return "Tuesday";
      case 3:
        return "Wednesday";
      case 4:
        return "Thursday";
      case 5:
        return "Friday";
      default:
        return "Weekend";
    }
  }

  const previewRows = useMemo(() => {
    if (!sqlDb) return [] as any[];
    const start = parseYMD(exportStart);
    const end = parseYMD(exportEnd);
    if (end < start) return [] as any[];
    const rows: any[] = [];
    let d = new Date(start.getTime());
    while (d <= end) {
      if (weekdayName(d) !== "Weekend") {
        const dYMD = ymd(d);
        const assigns = all(
          `SELECT a.id, a.person_id, a.role_id, a.segment,
                  p.first_name, p.last_name, p.work_email,
                  r.name as role_name, r.code as role_code, r.group_id,
                  g.name as group_name
           FROM assignment_active a
           JOIN person_active p ON p.id=a.person_id
           JOIN role_active r ON r.id=a.role_id
           JOIN grp_active g  ON g.id=r.group_id
           WHERE a.date=?`,
          [dYMD]
        );

        // Group assignments by person to get per-person segment times
        const assignsByPerson = new Map<number, typeof assigns>();
        for (const a of assigns) {
          const list = assignsByPerson.get(a.person_id) || [];
          list.push(a);
          assignsByPerson.set(a.person_id, list);
        }

        for (const a of assigns) {
          // Calculate segment times specifically for this person's assignments
          const personAssigns = assignsByPerson.get(a.person_id) || [];
          const segMap = segmentTimesForPersonDate(d, personAssigns);
          const seg = segMap[a.segment];
          if (!seg) continue;
          let windows: Array<{ start: Date; end: Date }> = [
            { start: seg.start, end: seg.end },
          ];
          let group = a.group_name;

          const intervals = listTimeOffIntervals(a.person_id, d);
          for (const w of windows) {
            const split = subtractIntervals(w.start, w.end, intervals);
            for (const s of split) {
              rows.push({
                date: fmtDateMDY(d),
                member: `${a.last_name}, ${a.first_name}`,
                email: a.work_email,
                group,
                start: fmtTime24(s.start),
                end: fmtTime24(s.end),
                label: a.role_name,
                color: groups.find((gg) => gg.name === group)?.theme || "",
              });
            }
          }
        }
      }
      d = addMinutes(d, 24 * 60);
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqlDb, exportStart, exportEnd, people.length, roles.length]);

  return (
    <div className={s.root}>
      <div className={s.controls}>
        <Field label="Start">
          <Input type="date" value={exportStart} onChange={(_, d) => setExportStart(d.value)} />
        </Field>
        <Field label="End">
          <Input type="date" value={exportEnd} onChange={(_, d) => setExportEnd(d.value)} />
        </Field>
        <div className={s.spacer} />
        <Button appearance="primary" onClick={exportShifts}>Download XLSX</Button>
      </div>
      <div className={s.tableWrapper}>
        <Table aria-label="Export preview table">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Member</TableHeaderCell>
              <TableHeaderCell>Work Email</TableHeaderCell>
              <TableHeaderCell>Group</TableHeaderCell>
              <TableHeaderCell>Start</TableHeaderCell>
              <TableHeaderCell>End</TableHeaderCell>
              <TableHeaderCell>Custom Label</TableHeaderCell>
              <TableHeaderCell>Theme</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.member}</TableCell>
                <TableCell>{r.email}</TableCell>
                <TableCell>{r.group}</TableCell>
                <TableCell>{r.start}</TableCell>
                <TableCell>{r.end}</TableCell>
                <TableCell>{r.label}</TableCell>
                <TableCell>{r.color}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
  <Text size={200} className={s.rowsText}>Rows: {previewRows.length}</Text>
    </div>
  );
}

