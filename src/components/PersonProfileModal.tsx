import React from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  Button,
  makeStyles,
  Divider,
  tokens,
} from "@fluentui/react-components";

interface PersonProfileModalProps {
  personId: number;
  onClose: () => void;
  all: (sql: string, params?: any[]) => any[];
}

const useStyles = makeStyles({
  body: {
    maxHeight: "60vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  sectionTitle: {
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
  },
  cell: { fontSize: tokens.fontSizeBase300 },
  list: { marginTop: tokens.spacingVerticalXS, paddingLeft: tokens.spacingHorizontalL },
  trainingList: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  trainingRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  divider: { margin: `${tokens.spacingVerticalM} 0` },
});

function fmtAvail(v: string) {
  switch (v) {
    case "AM":
      return "AM";
    case "PM":
      return "PM";
    case "B":
      return "Both";
    case "U":
    default:
      return "Unknown";
  }
}

export default function PersonProfileModal({ personId, onClose, all }: PersonProfileModalProps) {
  const s = useStyles();

  const person = all('SELECT * FROM person_active WHERE id=?', [personId])[0];

  const trainings = all(
    'SELECT r.name, t.status FROM training_active t JOIN role_active r ON r.id=t.role_id WHERE t.person_id=? ORDER BY r.name',
    [personId]
  );

  const [showAllDefaults, setShowAllDefaults] = React.useState(false);

  const defaults = all(
    'SELECT md.month, md.segment, r.name as role_name, g.name as group_name ' +
    'FROM monthly_default_active md ' +
    'JOIN role_active r ON r.id=md.role_id ' +
    'JOIN grp_active g ON g.id=r.group_id ' +
    'WHERE md.person_id=? ORDER BY md.month DESC, md.segment',
    [personId]
  );

  const defaultsByMonth = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of defaults) {
      (map[d.month] ||= []).push(d);
    }
    return map;
  }, [defaults]);

  const monthKeys = Object.keys(defaultsByMonth).sort((a, b) => b.localeCompare(a));
  const shownMonths = showAllDefaults ? monthKeys : monthKeys.slice(0, 3);

  function fmtMonth(m: string) {
    const [y, mo] = m.split('-').map((n) => parseInt(n, 10));
    return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  const nowIso = new Date().toISOString();
  const timeOff = all(
    'SELECT start_ts, end_ts, reason FROM timeoff_active WHERE person_id=? AND end_ts>=? ORDER BY start_ts ASC',
    [personId, nowIso]
  );

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface aria-describedby={undefined}>
        <DialogTitle>{person.first_name} {person.last_name}</DialogTitle>
        <DialogBody className={s.body}>
          <div>
            <div className={s.sectionTitle}>Info</div>
            <div className={s.grid}>
              <div className={s.cell}><b>Email:</b> {person.work_email}</div>
              <div className={s.cell}><b>Status:</b> {person.active ? "Active" : "Inactive"}</div>
              <div className={s.cell}><b>Brother/Sister:</b> {person.brother_sister || "-"}</div>
              <div className={s.cell}><b>Commuter:</b> {person.commuter ? "Yes" : "No"}</div>
            </div>
          </div>
          <Divider className={s.divider} />
          <div>
            <div className={s.sectionTitle}>Availability</div>
            <div className={s.grid}>
              <div className={s.cell}><b>Mon:</b> {fmtAvail(person.avail_mon)}</div>
              <div className={s.cell}><b>Tue:</b> {fmtAvail(person.avail_tue)}</div>
              <div className={s.cell}><b>Wed:</b> {fmtAvail(person.avail_wed)}</div>
              <div className={s.cell}><b>Thu:</b> {fmtAvail(person.avail_thu)}</div>
              <div className={s.cell}><b>Fri:</b> {fmtAvail(person.avail_fri)}</div>
            </div>
          </div>
          <Divider className={s.divider} />
          <div>
            <div className={s.sectionTitle}>Training</div>
            {trainings.length === 0 && <div className={s.cell}>No training records.</div>}
            {trainings.length > 0 && (
              <div className={s.trainingList}>
                {trainings.map((t: any, idx: number) => (
                  <div key={idx} className={s.trainingRow}>
                    <span className={s.cell}>{t.name}</span>
                    <span className={s.cell}>{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Divider className={s.divider} />
          <div>
            <div className={s.sectionTitle}>Monthly Defaults</div>
            {shownMonths.map((m) => (
              <div key={m}>
                <div className={s.cell}><b>{fmtMonth(m)}</b></div>
                <ul className={s.list}>
                  {defaultsByMonth[m].map((d: any, idx: number) => (
                    <li key={idx} className={s.cell}>
                      {d.segment} — {d.group_name} / {d.role_name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {monthKeys.length > 3 && (
              <Button appearance="subtle" onClick={() => setShowAllDefaults(!showAllDefaults)}>
                {showAllDefaults ? 'Show Less' : 'Show More'}
              </Button>
            )}
          </div>
          <Divider className={s.divider} />
          <div>
            <div className={s.sectionTitle}>Upcoming Time Off</div>
            <ul className={s.list}>
              {timeOff.map((t: any, idx: number) => (
                <li key={idx} className={s.cell}>
                  {new Date(t.start_ts).toLocaleString()} — {new Date(t.end_ts).toLocaleString()} {t.reason ? `— ${t.reason}` : ''}
                </li>
              ))}
              {timeOff.length === 0 && <div className={s.cell}>No upcoming time off.</div>}
            </ul>
          </div>
        </DialogBody>
        <DialogActions>
          <Button appearance="primary" onClick={onClose}>Close</Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
