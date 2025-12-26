import * as React from "react";
import {
  Button,
  Input,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  makeStyles,
  tokens,
  Textarea,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Label,
  Text,
  Badge,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Delete20Regular,
  Edit20Regular,
  CalendarMonth20Regular,
} from "@fluentui/react-icons";
import SmartSelect from "./controls/SmartSelect";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

interface DepartmentEventManagerProps {
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
}

interface DepartmentEvent {
  id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  group_id: number | null;
  role_id: number | null;
  description: string | null;
  group_name?: string;
  role_name?: string;
}

interface Group {
  id: number;
  name: string;
}

interface Role {
  id: number;
  name: string;
  group_id: number;
}

const useStyles = makeStyles({
  root: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacingVerticalM,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  tableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: "auto",
    maxHeight: "40vh",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  formField: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  fullWidth: {
    gridColumn: "span 2",
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
  },
  emptyState: {
    padding: tokens.spacingVerticalL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  eventBadge: {
    marginLeft: tokens.spacingHorizontalS,
  },
});

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

const formatTime = (timeStr: string) => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
};

export default function DepartmentEventManager({ all, run, refresh }: DepartmentEventManagerProps) {
  const s = useStyles();
  const dialogs = useDialogs();

  const [showDialog, setShowDialog] = React.useState(false);
  const [editingEvent, setEditingEvent] = React.useState<DepartmentEvent | null>(null);

  // Form state
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("08:00");
  const [endTime, setEndTime] = React.useState("09:00");
  const [groupId, setGroupId] = React.useState<number | null>(null);
  const [roleId, setRoleId] = React.useState<number | null>(null);
  const [description, setDescription] = React.useState("");

  // Data
  const events = React.useMemo(() => {
    return all(`
      SELECT de.*, g.name as group_name, r.name as role_name
      FROM department_event de
      LEFT JOIN grp g ON g.id = de.group_id
      LEFT JOIN role r ON r.id = de.role_id
      ORDER BY de.date DESC, de.start_time ASC
    `) as DepartmentEvent[];
  }, [all]);

  const groups = React.useMemo(() => {
    return all(`SELECT id, name FROM grp ORDER BY name`) as Group[];
  }, [all]);

  const roles = React.useMemo(() => {
    return all(`SELECT id, name, group_id FROM role ORDER BY name`) as Role[];
  }, [all]);

  const rolesForGroup = React.useMemo(() => {
    if (!groupId) return [];
    return roles.filter((r) => r.group_id === groupId);
  }, [roles, groupId]);

  const resetForm = () => {
    setTitle("");
    setDate("");
    setStartTime("08:00");
    setEndTime("09:00");
    setGroupId(null);
    setRoleId(null);
    setDescription("");
    setEditingEvent(null);
  };

  const openAddDialog = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEditDialog = (event: DepartmentEvent) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDate(event.date);
    setStartTime(event.start_time);
    setEndTime(event.end_time);
    setGroupId(event.group_id);
    setRoleId(event.role_id);
    setDescription(event.description || "");
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!title.trim() || !date || !startTime || !endTime) {
      dialogs.showAlert("Please fill in all required fields (Title, Date, Start Time, End Time).", "Missing Fields");
      return;
    }

    if (startTime >= endTime) {
      dialogs.showAlert("End time must be after start time.", "Invalid Time Range");
      return;
    }

    if (editingEvent) {
      // Update existing event
      run(
        `UPDATE department_event SET title=?, date=?, start_time=?, end_time=?, group_id=?, role_id=?, description=? WHERE id=?`,
        [title.trim(), date, startTime, endTime, groupId, roleId, description.trim() || null, editingEvent.id]
      );
    } else {
      // Insert new event
      run(
        `INSERT INTO department_event (title, date, start_time, end_time, group_id, role_id, description) VALUES (?,?,?,?,?,?,?)`,
        [title.trim(), date, startTime, endTime, groupId, roleId, description.trim() || null]
      );

      // Auto-assign all active crew to this event
      const newEventRows = all(`SELECT id FROM department_event WHERE date=? AND title=? ORDER BY id DESC LIMIT 1`, [date, title.trim()]);
      if (newEventRows.length > 0) {
        const eventId = newEventRows[0].id;
        const activePeople = all(`SELECT id FROM person WHERE active=1`);
        
        // Create assignments for all active people
        // Use the event title as the segment name
        for (const person of activePeople) {
          // Check if assignment already exists
          const existing = all(
            `SELECT id FROM assignment WHERE date=? AND person_id=? AND segment=?`,
            [date, person.id, title.trim()]
          );
          if (existing.length === 0) {
            run(
              `INSERT INTO assignment (date, person_id, role_id, segment) VALUES (?,?,?,?)`,
              [date, person.id, roleId, title.trim()]
            );
          }
        }
      }
    }

    refresh();
    setShowDialog(false);
    resetForm();
  };

  const handleDelete = async (event: DepartmentEvent) => {
    const confirmed = await dialogs.showConfirm(
      `Delete "${event.title}" on ${formatDate(event.date)}? This will also remove all crew assignments for this event.`,
      "Delete Event"
    );
    if (confirmed) {
      // Delete assignments for this event
      run(`DELETE FROM assignment WHERE date=? AND segment=?`, [event.date, event.title]);
      // Delete the event
      run(`DELETE FROM department_event WHERE id=?`, [event.id]);
      refresh();
    }
  };

  // When group changes, reset role if it's not in the new group
  React.useEffect(() => {
    if (roleId && groupId) {
      const roleExists = roles.find((r) => r.id === roleId && r.group_id === groupId);
      if (!roleExists) {
        setRoleId(null);
      }
    }
  }, [groupId, roleId, roles]);

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.headerTitle}>
          <CalendarMonth20Regular />
          <Text weight="semibold">Department Events</Text>
          <Badge appearance="filled" color="informative" className={s.eventBadge}>
            {events.length}
          </Badge>
        </div>
        <Button appearance="primary" icon={<Add20Regular />} onClick={openAddDialog}>
          Add Event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className={s.emptyState}>
          <Text>No department events scheduled. Click "Add Event" to create one.</Text>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Time</TableHeaderCell>
                <TableHeaderCell>Group</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.title}</TableCell>
                  <TableCell>{formatDate(event.date)}</TableCell>
                  <TableCell>
                    {formatTime(event.start_time)} - {formatTime(event.end_time)}
                  </TableCell>
                  <TableCell>{event.group_name || "—"}</TableCell>
                  <TableCell>{event.role_name || event.group_name || "—"}</TableCell>
                  <TableCell>
                    <div className={s.actions}>
                      <Button
                        appearance="subtle"
                        icon={<Edit20Regular />}
                        size="small"
                        onClick={() => openEditDialog(event)}
                      />
                      <Button
                        appearance="subtle"
                        icon={<Delete20Regular />}
                        size="small"
                        onClick={() => handleDelete(event)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(_, d) => { if (!d.open) { setShowDialog(false); resetForm(); } }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingEvent ? "Edit Event" : "Add Department Event"}</DialogTitle>
            <DialogContent>
              <div className={s.formGrid}>
                <div className={`${s.formField} ${s.fullWidth}`}>
                  <Label required>Event Title</Label>
                  <Input
                    value={title}
                    onChange={(_, d) => setTitle(d.value)}
                    placeholder="e.g., Department Meeting, Safety Training"
                  />
                </div>

                <div className={s.formField}>
                  <Label required>Date</Label>
                  <Input type="date" value={date} onChange={(_, d) => setDate(d.value)} />
                </div>

                <div className={s.formField}>
                  {/* Spacer */}
                </div>

                <div className={s.formField}>
                  <Label required>Start Time</Label>
                  <Input type="time" value={startTime} onChange={(_, d) => setStartTime(d.value)} />
                </div>

                <div className={s.formField}>
                  <Label required>End Time</Label>
                  <Input type="time" value={endTime} onChange={(_, d) => setEndTime(d.value)} />
                </div>

                <div className={s.formField}>
                  <Label>Group (for export)</Label>
                  <SmartSelect
                    options={[
                      { value: "", label: "— Select Group —" },
                      ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                    ]}
                    value={groupId ? String(groupId) : null}
                    onChange={(v) => setGroupId(v ? Number(v) : null)}
                    placeholder="Select group..."
                  />
                </div>

                <div className={s.formField}>
                  <Label>Role (optional)</Label>
                  <SmartSelect
                    options={[
                      { value: "", label: `— Default: ${groupId ? groups.find(g => g.id === groupId)?.name || 'Group Name' : 'Select Group First'} —` },
                      ...rolesForGroup.map((r) => ({ value: String(r.id), label: r.name })),
                    ]}
                    value={roleId ? String(roleId) : null}
                    onChange={(v) => setRoleId(v ? Number(v) : null)}
                    placeholder="Select role..."
                    disabled={!groupId}
                  />
                </div>

                <div className={`${s.formField} ${s.fullWidth}`}>
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(_, d) => setDescription(d.value)}
                    placeholder="Optional notes about this event..."
                    rows={2}
                  />
                </div>
              </div>

              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                When created, all active crew members will be automatically assigned to this event.
                Regular shifts will be adjusted to accommodate the event time.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setShowDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleSave}>
                {editingEvent ? "Save Changes" : "Create Event"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Confirm Dialog */}
      {dialogs.confirmState && (
        <ConfirmDialog
          open
          title={dialogs.confirmState.options.title || "Confirm"}
          message={dialogs.confirmState.options.message}
          onConfirm={() => dialogs.handleConfirm(true)}
          onCancel={() => dialogs.handleConfirm(false)}
        />
      )}

      {/* Alert Dialog */}
      {dialogs.alertState && (
        <Dialog open onOpenChange={() => dialogs.closeAlert()}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>{dialogs.alertState.title}</DialogTitle>
              <DialogContent>{dialogs.alertState.message}</DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={dialogs.closeAlert}>OK</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}
