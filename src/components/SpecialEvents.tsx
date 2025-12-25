import React, { useState, useMemo } from "react";
import {
  Button,
  Input,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Badge,
  Dropdown,
  Option,
  Textarea,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Tooltip,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Delete20Regular,
  Edit20Regular,
  Copy20Regular,
  ArrowUp20Regular,
  ArrowDown20Regular,
  MoreHorizontal20Regular,
  Print20Regular,
} from "@fluentui/react-icons";
import PersonName from "./PersonName";
import ConfirmDialog from "./ConfirmDialog";
import AlertDialog from "./AlertDialog";

interface SpecialEventsProps {
  sqlDb: any;
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  people: any[];
  refreshCaches: () => void;
}

interface SpecialEvent {
  id: number;
  name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  created_at: string;
}

interface MenuItem {
  id: number;
  event_id: number;
  name: string;
  kitchen_quota: number;
  waiter_quota: number;
  sort_order: number;
  is_header: number;
  header_color: string | null;
}

interface Assignment {
  id: number;
  event_id: number;
  menu_item_id: number;
  person_id: number;
  role_type: 'kitchen' | 'waiter';
}

// Helper function to determine if a menu item represents a coordinator role
const isCoordinatorRole = (menuItemName: string): boolean => {
  const nameLower = menuItemName.toLowerCase();
  return nameLower.startsWith('coordinat') || nameLower.includes(' coordinat');
};

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalL,
    minHeight: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacingVerticalL,
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  eventsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalXL,
  },
  eventCard: {
    cursor: 'pointer',
    transition: `box-shadow ${tokens.durationNormal} ${tokens.curveEasyEase}`,
    ':hover': {
      boxShadow: tokens.shadow8,
    },
  },
  eventCardHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  eventTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  eventMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  eventActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalS,
  },
  detailView: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  detailTitle: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
  },
  detailMeta: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
  },
  menuTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  menuRow: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  menuRowHeader: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    padding: tokens.spacingVerticalM,
  },
  menuCell: {
    padding: tokens.spacingVerticalS,
    verticalAlign: 'top',
  },
  menuItemName: {
    fontWeight: tokens.fontWeightMedium,
  },
  quotaIndicator: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalXXS,
  },
  assignmentArea: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXXS,
    minHeight: '32px',
    alignItems: 'center',
  },
  personBadge: {
    cursor: 'pointer',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  formFieldFull: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    gridColumn: '1 / -1',
  },
  label: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  tableHeader: {
    backgroundColor: '#003B5C',
    color: '#FFFFFF',
  },
  tableHeaderCell: {
    padding: tokens.spacingVerticalM,
    fontWeight: tokens.fontWeightSemibold,
    color: '#FFFFFF',
  },
  controlButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  emptyState: {
    textAlign: 'center',
    padding: tokens.spacingVerticalXXXL,
    color: tokens.colorNeutralForeground3,
  },
});

export default function SpecialEvents({ sqlDb, all, run, people, refreshCaches }: SpecialEventsProps) {
  const s = useStyles();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showMenuDialog, setShowMenuDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<SpecialEvent> | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<Partial<MenuItem> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'event' | 'menuItem'; id: number } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);

  // Load events
  const events = useMemo(() => {
    if (!sqlDb) return [];
    return all(`SELECT * FROM special_event ORDER BY event_date DESC, created_at DESC`);
  }, [sqlDb, all]);

  // Load menu items for selected event
  const menuItems = useMemo(() => {
    if (!sqlDb || !selectedEventId) return [];
    return all(`SELECT * FROM special_event_menu_item WHERE event_id = ? ORDER BY sort_order`, [selectedEventId]);
  }, [sqlDb, all, selectedEventId]);

  // Load assignments for selected event
  const assignments = useMemo(() => {
    if (!sqlDb || !selectedEventId) return [];
    return all(`SELECT * FROM special_event_assignment WHERE event_id = ?`, [selectedEventId]);
  }, [sqlDb, all, selectedEventId]);

  const selectedEvent = events.find((e: SpecialEvent) => e.id === selectedEventId);

  // Event CRUD
  const handleCreateEvent = () => {
    setEditingEvent({
      name: '',
      event_date: new Date().toISOString().split('T')[0],
      start_time: '16:00',
      end_time: '20:00',
      description: '',
    });
    setShowEventDialog(true);
  };

  const handleEditEvent = (event: SpecialEvent) => {
    setEditingEvent(event);
    setShowEventDialog(true);
  };

  const handleDuplicateEvent = (event: SpecialEvent) => {
    setEditingEvent({
      name: `${event.name} (Copy)`,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      description: event.description,
    });
    setShowEventDialog(true);
  };

  const handleSaveEvent = () => {
    if (!editingEvent?.name || !editingEvent?.event_date) {
      setAlertDialog({ title: 'Validation Error', message: 'Event name and date are required.' });
      return;
    }

    if (editingEvent.id) {
      run(
        `UPDATE special_event SET name=?, event_date=?, start_time=?, end_time=?, description=? WHERE id=?`,
        [editingEvent.name, editingEvent.event_date, editingEvent.start_time, editingEvent.end_time, editingEvent.description, editingEvent.id]
      );
    } else {
      run(
        `INSERT INTO special_event (name, event_date, start_time, end_time, description) VALUES (?, ?, ?, ?, ?)`,
        [editingEvent.name, editingEvent.event_date, editingEvent.start_time, editingEvent.end_time, editingEvent.description]
      );
      if (!selectedEventId) {
        const newId = all(`SELECT last_insert_rowid() as id`)[0]?.id;
        setSelectedEventId(newId);
      }
    }
    refreshCaches();
    setShowEventDialog(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = (id: number) => {
    setConfirmDelete({ type: 'event', id });
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    
    if (confirmDelete.type === 'event') {
      run(`DELETE FROM special_event WHERE id=?`, [confirmDelete.id]);
      if (selectedEventId === confirmDelete.id) {
        setSelectedEventId(null);
      }
    } else if (confirmDelete.type === 'menuItem') {
      run(`DELETE FROM special_event_menu_item WHERE id=?`, [confirmDelete.id]);
    }
    
    refreshCaches();
    setConfirmDelete(null);
  };

  // Menu item CRUD
  const handleCreateMenuItem = () => {
    setEditingMenuItem({
      event_id: selectedEventId!,
      name: '',
      kitchen_quota: 1,
      waiter_quota: 1,
      sort_order: menuItems.length,
      is_header: 0,
      header_color: '#0070C0',
    });
    setShowMenuDialog(true);
  };

  const handleEditMenuItem = (item: MenuItem) => {
    setEditingMenuItem(item);
    setShowMenuDialog(true);
  };

  const handleSaveMenuItem = () => {
    if (!editingMenuItem?.name) {
      setAlertDialog({ title: 'Validation Error', message: 'Menu item name is required.' });
      return;
    }

    if (editingMenuItem.id) {
      run(
        `UPDATE special_event_menu_item SET name=?, kitchen_quota=?, waiter_quota=?, is_header=?, header_color=? WHERE id=?`,
        [editingMenuItem.name, editingMenuItem.kitchen_quota, editingMenuItem.waiter_quota, editingMenuItem.is_header, editingMenuItem.header_color, editingMenuItem.id]
      );
    } else {
      run(
        `INSERT INTO special_event_menu_item (event_id, name, kitchen_quota, waiter_quota, sort_order, is_header, header_color) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [editingMenuItem.event_id, editingMenuItem.name, editingMenuItem.kitchen_quota, editingMenuItem.waiter_quota, editingMenuItem.sort_order, editingMenuItem.is_header, editingMenuItem.header_color]
      );
    }
    
    refreshCaches();
    setShowMenuDialog(false);
    setEditingMenuItem(null);
  };

  const handleMoveMenuItem = (item: MenuItem, direction: 'up' | 'down') => {
    const currentIndex = menuItems.findIndex((m: MenuItem) => m.id === item.id);
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === menuItems.length - 1) return;

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapItem = menuItems[swapIndex];

    run(`UPDATE special_event_menu_item SET sort_order=? WHERE id=?`, [swapItem.sort_order, item.id]);
    run(`UPDATE special_event_menu_item SET sort_order=? WHERE id=?`, [item.sort_order, swapItem.id]);
    
    refreshCaches();
  };

  // Assignment management
  const handleAssignPerson = (menuItemId: number, personId: number, roleType: 'kitchen' | 'waiter') => {
    // Check if already assigned
    const existing = assignments.find(
      (a: Assignment) => a.menu_item_id === menuItemId && a.person_id === personId && a.role_type === roleType
    );
    if (existing) return;

    run(
      `INSERT INTO special_event_assignment (event_id, menu_item_id, person_id, role_type) VALUES (?, ?, ?, ?)`,
      [selectedEventId, menuItemId, personId, roleType]
    );
    refreshCaches();
  };

  const handleRemoveAssignment = (assignmentId: number) => {
    run(`DELETE FROM special_event_assignment WHERE id=?`, [assignmentId]);
    refreshCaches();
  };

  // Get assignments for a specific menu item and role type
  const getAssignments = (menuItemId: number, roleType: 'kitchen' | 'waiter') => {
    return assignments.filter(
      (a: Assignment) => a.menu_item_id === menuItemId && a.role_type === roleType
    );
  };

  // Badge color based on role type and coordinator status
  const getBadgeColor = (roleType: 'kitchen' | 'waiter', isCoordinator: boolean) => {
    if (isCoordinator) {
      return roleType === 'kitchen' ? 'informative' : 'warning'; // Blue for kitchen coord, Gold for waiter coord
    }
    return roleType === 'kitchen' ? 'danger' : 'success'; // Red for kitchen, Cyan for waiter
  };

  // Export to Teams XLSX format
  const handleExport = async () => {
    if (!selectedEvent) return;
    
    try {
      // Load XLSX library
      const XLSX_URL = "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";
      // @ts-ignore
      const XLSX = await import(/* @vite-ignore */ XLSX_URL);
      
      // Helper functions
      const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const fmtDateMDY = (d: Date) => {
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const y = d.getFullYear();
        return `${m}/${day}/${y}`;
      };
      const fmtTime24 = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      
      // Parse event date and times
      const eventDate = new Date(selectedEvent.event_date + 'T00:00:00');
      const [startHour, startMin] = selectedEvent.start_time.split(':').map(Number);
      const [endHour, endMin] = selectedEvent.end_time.split(':').map(Number);
      
      const startDateTime = new Date(eventDate);
      startDateTime.setHours(startHour, startMin, 0, 0);
      
      const endDateTime = new Date(eventDate);
      endDateTime.setHours(endHour, endMin, 0, 0);
      
      // Build rows for XLSX
      const rows: any[] = [];
      
      for (const item of menuItems) {
        // Skip headers
        if (item.is_header) continue;
        
        // Get assignments for this menu item
        const kitchenAssignments = getAssignments(item.id, 'kitchen');
        const waiterAssignments = getAssignments(item.id, 'waiter');
        
        // Add kitchen staff rows
        for (const assignment of kitchenAssignments) {
          const person = people.find(p => p.id === assignment.person_id);
          if (!person) continue;
          
          rows.push({
            member: `${person.last_name}, ${person.first_name}`,
            workEmail: person.work_email || '',
            group: 'Kitchen',
            startDate: fmtDateMDY(startDateTime),
            startTime: fmtTime24(startDateTime),
            endDate: fmtDateMDY(endDateTime),
            endTime: fmtTime24(endDateTime),
            themeColor: '1. DarkPink',
            customLabel: item.name,
            unpaidBreak: 0,
            notes: selectedEvent.name,
            shared: '2. Not Shared',
          });
        }
        
        // Add waiter rows
        for (const assignment of waiterAssignments) {
          const person = people.find(p => p.id === assignment.person_id);
          if (!person) continue;
          
          rows.push({
            member: `${person.last_name}, ${person.first_name}`,
            workEmail: person.work_email || '',
            group: 'Dining Room',
            startDate: fmtDateMDY(startDateTime),
            startTime: fmtTime24(startDateTime),
            endDate: fmtDateMDY(endDateTime),
            endTime: fmtTime24(endDateTime),
            themeColor: '1. DarkYellow',
            customLabel: item.name,
            unpaidBreak: 0,
            notes: selectedEvent.name,
            shared: '2. Not Shared',
          });
        }
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
        suggestedName: `special-event-${selectedEvent.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.xlsx`,
        types: [{ description: "Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
      });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(blob);
      await writable.close();
      
      setAlertDialog({ title: 'Success', message: `Exported ${rows.length} shifts to XLSX file.` });
    } catch (error: any) {
      console.error('Export failed:', error);
      setAlertDialog({ title: 'Export Failed', message: error.message || 'Failed to export XLSX file.' });
    }
  };

  // Print-friendly XLSX export (user-readable layout)
  const handlePrintExport = async () => {
    if (!selectedEvent) return;
    
    try {
      // Load XLSX library
      const XLSX_URL = "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";
      // @ts-ignore
      const XLSX = await import(/* @vite-ignore */ XLSX_URL);
      
      // Helper functions
      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      };
      const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        const h = hours % 12 || 12;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        return `${h}:${minutes.toString().padStart(2, '0')} ${ampm}`;
      };
      
      // Build rows for printer-friendly layout
      const rows: any[] = [];
      
      // Event header row
      rows.push(['Event:', selectedEvent.name]);
      rows.push(['Date:', formatDate(selectedEvent.event_date)]);
      rows.push(['Time:', `${formatTime(selectedEvent.start_time)} - ${formatTime(selectedEvent.end_time)}`]);
      if (selectedEvent.description) {
        rows.push(['Description:', selectedEvent.description]);
      }
      rows.push([]); // empty row
      
      // Table header
      rows.push(['Menu Item', 'Kitchen Staff', 'Waiters']);
      
      for (const item of menuItems) {
        if (item.is_header) {
          // Section header row with background color
          rows.push([item.name, '', '']);
        } else {
          const kitchenAssignments = getAssignments(item.id, 'kitchen');
          const waiterAssignments = getAssignments(item.id, 'waiter');
          
          const kitchenNames = kitchenAssignments.map((a: Assignment) => {
            const person = people.find(p => p.id === a.person_id);
            return person ? `${person.first_name} ${person.last_name}` : '';
          }).filter(Boolean).join(', ');
          
          const waiterNames = waiterAssignments.map((a: Assignment) => {
            const person = people.find(p => p.id === a.person_id);
            return person ? `${person.first_name} ${person.last_name}` : '';
          }).filter(Boolean).join(', ');
          
          rows.push([item.name, kitchenNames || '(none)', waiterNames || '(none)']);
        }
      }
      
      // Build XLSX with a more readable layout
      const ws = XLSX.utils.aoa_to_sheet(rows);
      
      // Apply some styling (column widths)
      const colWidths = [
        { wch: 40 }, // Menu Item
        { wch: 30 }, // Kitchen Staff
        { wch: 30 }, // Waiters
      ];
      ws['!cols'] = colWidths;
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Event Schedule");
      
      const blob = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: `special-event-${selectedEvent.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-print.xlsx`,
        types: [{ description: "Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
      });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(blob);
      await writable.close();
      
      setAlertDialog({ title: 'Success', message: `Exported printer-friendly schedule to XLSX file.` });
    } catch (error: any) {
      console.error('Print export failed:', error);
      setAlertDialog({ title: 'Export Failed', message: error.message || 'Failed to export printer-friendly XLSX file.' });
    }
  };

  // Render event list
  if (!selectedEventId) {
    return (
      <div className={s.root}>
        <div className={s.header}>
          <div className={s.title}>Special Events</div>
          <Button appearance="primary" icon={<Add20Regular />} onClick={handleCreateEvent}>
            New Event
          </Button>
        </div>

        {events.length === 0 ? (
          <div className={s.emptyState}>
            <div style={{ fontSize: tokens.fontSizeBase500, marginBottom: tokens.spacingVerticalM }}>
              No special events yet
            </div>
            <div style={{ marginBottom: tokens.spacingVerticalL }}>
              Create your first event to start planning receptions, dinners, and volunteer events.
            </div>
          </div>
        ) : (
          <div className={s.eventsGrid}>
            {events.map((event: SpecialEvent) => (
              <Card key={event.id} className={s.eventCard} onClick={() => setSelectedEventId(event.id)}>
                <CardHeader
                  header={
                    <div className={s.eventCardHeader}>
                      <div className={s.eventTitle}>{event.name}</div>
                      <div className={s.eventMeta}>
                        {new Date(event.event_date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div className={s.eventMeta}>
                        {event.start_time} - {event.end_time}
                      </div>
                    </div>
                  }
                />
                <div className={s.eventActions} onClick={(e) => e.stopPropagation()}>
                  <Button size="small" icon={<Edit20Regular />} onClick={() => handleEditEvent(event)}>
                    Edit
                  </Button>
                  <Button size="small" icon={<Copy20Regular />} onClick={() => handleDuplicateEvent(event)}>
                    Duplicate
                  </Button>
                  <Button size="small" icon={<Delete20Regular />} onClick={() => handleDeleteEvent(event.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Event Editor Dialog */}
        <Dialog open={showEventDialog} onOpenChange={(_, data) => setShowEventDialog(data.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>{editingEvent?.id ? 'Edit Event' : 'New Event'}</DialogTitle>
              <DialogContent>
                <div className={s.formFieldFull}>
                  <label className={s.label}>Event Name *</label>
                  <Input
                    value={editingEvent?.name || ''}
                    onChange={(_, data) => setEditingEvent({ ...editingEvent, name: data.value })}
                    placeholder="Saturday Reception"
                  />
                </div>
                <div className={s.formRow}>
                  <div className={s.formField}>
                    <label className={s.label}>Event Date *</label>
                    <Input
                      type="date"
                      value={editingEvent?.event_date || ''}
                      onChange={(_, data) => setEditingEvent({ ...editingEvent, event_date: data.value })}
                    />
                  </div>
                </div>
                <div className={s.formRow}>
                  <div className={s.formField}>
                    <label className={s.label}>Start Time</label>
                    <Input
                      type="time"
                      value={editingEvent?.start_time || '16:00'}
                      onChange={(_, data) => setEditingEvent({ ...editingEvent, start_time: data.value })}
                    />
                  </div>
                  <div className={s.formField}>
                    <label className={s.label}>End Time</label>
                    <Input
                      type="time"
                      value={editingEvent?.end_time || '20:00'}
                      onChange={(_, data) => setEditingEvent({ ...editingEvent, end_time: data.value })}
                    />
                  </div>
                </div>
                <div className={s.formFieldFull}>
                  <label className={s.label}>Description (optional)</label>
                  <Textarea
                    value={editingEvent?.description || ''}
                    onChange={(_, data) => setEditingEvent({ ...editingEvent, description: data.value })}
                    placeholder="Event details..."
                    rows={3}
                  />
                </div>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowEventDialog(false)}>Cancel</Button>
                <Button appearance="primary" onClick={handleSaveEvent}>
                  {editingEvent?.id ? 'Save' : 'Create'}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {/* Confirm Delete Dialog */}
        {confirmDelete && (
          <ConfirmDialog
            open={true}
            title="Confirm Delete"
            message={`Are you sure you want to delete this ${confirmDelete.type === 'event' ? 'event' : 'menu item'}? This action cannot be undone.`}
            onConfirm={confirmDeleteAction}
            onCancel={() => setConfirmDelete(null)}
          />
        )}

        {/* Alert Dialog */}
        {alertDialog && (
          <AlertDialog
            open={true}
            title={alertDialog.title}
            message={alertDialog.message}
            onClose={() => setAlertDialog(null)}
          />
        )}
      </div>
    );
  }

  // Render event detail view
  return (
    <div className={s.root}>
      <div className={s.detailView}>
        <div className={s.detailHeader}>
          <div>
            <Button appearance="subtle" onClick={() => setSelectedEventId(null)}>
              ← Back to Events
            </Button>
            <div className={s.detailTitle}>{selectedEvent?.name}</div>
            <div className={s.detailMeta}>
              {selectedEvent && new Date(selectedEvent.event_date).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} • {selectedEvent?.start_time} - {selectedEvent?.end_time}
            </div>
          </div>
          <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
            <Button icon={<Edit20Regular />} onClick={() => selectedEvent && handleEditEvent(selectedEvent)}>
              Edit Event
            </Button>
            <Button icon={<Add20Regular />} onClick={handleCreateMenuItem}>
              Add Menu Item
            </Button>
            <Button appearance="primary" onClick={handleExport}>
              Export to Teams
            </Button>
            <Button icon={<Print20Regular />} onClick={handlePrintExport}>
              Print
            </Button>
          </div>
        </div>

        {menuItems.length === 0 ? (
          <div className={s.emptyState}>
            <div style={{ fontSize: tokens.fontSizeBase400, marginBottom: tokens.spacingVerticalM }}>
              No menu items yet
            </div>
            <div>Add menu items to start building your event schedule.</div>
          </div>
        ) : (
          <table className={s.menuTable}>
            <thead>
              <tr className={`${s.menuRow} ${s.tableHeader}`}>
                <th className={s.tableHeaderCell} style={{ width: '30%' }}>Menu Item</th>
                <th className={s.tableHeaderCell} style={{ width: '30%' }}>Kitchen Staff</th>
                <th className={s.tableHeaderCell} style={{ width: '30%' }}>Waiters</th>
                <th className={s.tableHeaderCell} style={{ width: '10%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map((item: MenuItem, index: number) => {
                if (item.is_header) {
                  return (
                    <tr key={item.id} className={s.menuRow}>
                      <td
                        colSpan={4}
                        className={s.menuRowHeader}
                        style={{ backgroundColor: item.header_color || '#0070C0', color: '#FFFFFF' }}
                      >
                        {item.name}
                        <div style={{ float: 'right' }}>
                          <Button
                            size="small"
                            appearance="subtle"
                            icon={<Edit20Regular />}
                            onClick={() => handleEditMenuItem(item)}
                          />
                          <Button
                            size="small"
                            appearance="subtle"
                            icon={<Delete20Regular />}
                            onClick={() => setConfirmDelete({ type: 'menuItem', id: item.id })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                }

                const kitchenAssignments = getAssignments(item.id, 'kitchen');
                const waiterAssignments = getAssignments(item.id, 'waiter');

                return (
                  <tr key={item.id} className={s.menuRow}>
                    <td className={s.menuCell}>
                      <div className={s.menuItemName}>{item.name}</div>
                    </td>
                    <td className={s.menuCell}>
                      <div className={s.quotaIndicator}>
                        {kitchenAssignments.length} / {item.kitchen_quota}
                      </div>
                      <div className={s.assignmentArea}>
                        {kitchenAssignments.map((a: Assignment) => {
                          const person = people.find(p => p.id === a.person_id);
                          if (!person) return null;
                          const isCoordinator = isCoordinatorRole(item.name);
                          return (
                            <Tooltip key={a.id} content="Click to remove" relationship="label">
                              <Badge
                                className={s.personBadge}
                                color={getBadgeColor('kitchen', isCoordinator)}
                                onClick={() => handleRemoveAssignment(a.id)}
                              >
                                {person.first_name} {person.last_name}
                              </Badge>
                            </Tooltip>
                          );
                        })}
                        {kitchenAssignments.length < item.kitchen_quota && (
                          <Dropdown
                            placeholder="+ Assign"
                            size="small"
                            onOptionSelect={(_, data) => {
                              const personId = parseInt(data.optionValue || '0');
                              if (personId) handleAssignPerson(item.id, personId, 'kitchen');
                            }}
                          >
                            {people
                              .filter(p => p.active)
                              .filter(p => !kitchenAssignments.some((a: Assignment) => a.person_id === p.id))
                              .map(p => (
                                <Option key={p.id} value={String(p.id)}>
                                  {p.last_name}, {p.first_name}
                                </Option>
                              ))}
                          </Dropdown>
                        )}
                      </div>
                    </td>
                    <td className={s.menuCell}>
                      <div className={s.quotaIndicator}>
                        {waiterAssignments.length} / {item.waiter_quota}
                      </div>
                      <div className={s.assignmentArea}>
                        {waiterAssignments.map((a: Assignment) => {
                          const person = people.find(p => p.id === a.person_id);
                          if (!person) return null;
                          const isCoordinator = isCoordinatorRole(item.name);
                          return (
                            <Tooltip key={a.id} content="Click to remove" relationship="label">
                              <Badge
                                className={s.personBadge}
                                color={getBadgeColor('waiter', isCoordinator)}
                                onClick={() => handleRemoveAssignment(a.id)}
                              >
                                {person.first_name} {person.last_name}
                              </Badge>
                            </Tooltip>
                          );
                        })}
                        {waiterAssignments.length < item.waiter_quota && (
                          <Dropdown
                            placeholder="+ Assign"
                            size="small"
                            onOptionSelect={(_, data) => {
                              const personId = parseInt(data.optionValue || '0');
                              if (personId) handleAssignPerson(item.id, personId, 'waiter');
                            }}
                          >
                            {people
                              .filter(p => p.active)
                              .filter(p => !waiterAssignments.some((a: Assignment) => a.person_id === p.id))
                              .map(p => (
                                <Option key={p.id} value={String(p.id)}>
                                  {p.last_name}, {p.first_name}
                                </Option>
                              ))}
                          </Dropdown>
                        )}
                      </div>
                    </td>
                    <td className={s.menuCell}>
                      <div className={s.controlButtons}>
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<ArrowUp20Regular />}
                          onClick={() => handleMoveMenuItem(item, 'up')}
                          disabled={index === 0 || menuItems[index - 1]?.is_header === 1}
                        />
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<ArrowDown20Regular />}
                          onClick={() => handleMoveMenuItem(item, 'down')}
                          disabled={index === menuItems.length - 1}
                        />
                        <Menu>
                          <MenuTrigger disableButtonEnhancement>
                            <Button size="small" appearance="subtle" icon={<MoreHorizontal20Regular />} />
                          </MenuTrigger>
                          <MenuPopover>
                            <MenuList>
                              <MenuItem icon={<Edit20Regular />} onClick={() => handleEditMenuItem(item)}>
                                Edit
                              </MenuItem>
                              <MenuItem
                                icon={<Delete20Regular />}
                                onClick={() => setConfirmDelete({ type: 'menuItem', id: item.id })}
                              >
                                Delete
                              </MenuItem>
                            </MenuList>
                          </MenuPopover>
                        </Menu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Menu Item Dialog */}
      <Dialog open={showMenuDialog} onOpenChange={(_, data) => setShowMenuDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingMenuItem?.id ? 'Edit Menu Item' : 'New Menu Item'}</DialogTitle>
            <DialogContent>
              <div className={s.formFieldFull}>
                <label className={s.label}>Item Name *</label>
                <Input
                  value={editingMenuItem?.name || ''}
                  onChange={(_, data) => setEditingMenuItem({ ...editingMenuItem, name: data.value })}
                  placeholder="Coordinate Smoked BBQ Short Ribs"
                />
              </div>
              <div className={s.formFieldFull}>
                <label>
                  <input
                    type="checkbox"
                    checked={editingMenuItem?.is_header === 1}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, is_header: e.target.checked ? 1 : 0 })}
                  />
                  {' '}This is a section header
                </label>
              </div>
              {editingMenuItem?.is_header === 1 ? (
                <div className={s.formField}>
                  <label className={s.label}>Header Color</label>
                  <Input
                    type="color"
                    value={editingMenuItem?.header_color || '#0070C0'}
                    onChange={(_, data) => setEditingMenuItem({ ...editingMenuItem, header_color: data.value })}
                  />
                </div>
              ) : (
                <div className={s.formRow}>
                  <div className={s.formField}>
                    <label className={s.label}>Kitchen Staff Quota</label>
                    <Input
                      type="number"
                      min={0}
                      value={String(editingMenuItem?.kitchen_quota || 1)}
                      onChange={(_, data) =>
                        setEditingMenuItem({ ...editingMenuItem, kitchen_quota: parseInt(data.value || '1') })
                      }
                    />
                  </div>
                  <div className={s.formField}>
                    <label className={s.label}>Waiter Quota</label>
                    <Input
                      type="number"
                      min={0}
                      value={String(editingMenuItem?.waiter_quota || 1)}
                      onChange={(_, data) =>
                        setEditingMenuItem({ ...editingMenuItem, waiter_quota: parseInt(data.value || '1') })
                      }
                    />
                  </div>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowMenuDialog(false)}>Cancel</Button>
              <Button appearance="primary" onClick={handleSaveMenuItem}>
                {editingMenuItem?.id ? 'Save' : 'Add'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          open={true}
          title="Confirm Delete"
          message={`Are you sure you want to delete this ${confirmDelete.type === 'event' ? 'event' : 'menu item'}? This action cannot be undone.`}
          onConfirm={confirmDeleteAction}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Alert Dialog */}
      {alertDialog && (
        <AlertDialog
          open={true}
          title={alertDialog.title}
          message={alertDialog.message}
          onClose={() => setAlertDialog(null)}
        />
      )}

      {/* Event Editor Dialog */}
      <Dialog open={showEventDialog} onOpenChange={(_, data) => setShowEventDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingEvent?.id ? 'Edit Event' : 'New Event'}</DialogTitle>
            <DialogContent>
              <div className={s.formFieldFull}>
                <label className={s.label}>Event Name *</label>
                <Input
                  value={editingEvent?.name || ''}
                  onChange={(_, data) => setEditingEvent({ ...editingEvent, name: data.value })}
                  placeholder="Saturday Reception"
                />
              </div>
              <div className={s.formRow}>
                <div className={s.formField}>
                  <label className={s.label}>Event Date *</label>
                  <Input
                    type="date"
                    value={editingEvent?.event_date || ''}
                    onChange={(_, data) => setEditingEvent({ ...editingEvent, event_date: data.value })}
                  />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.formField}>
                  <label className={s.label}>Start Time</label>
                  <Input
                    type="time"
                    value={editingEvent?.start_time || '16:00'}
                    onChange={(_, data) => setEditingEvent({ ...editingEvent, start_time: data.value })}
                  />
                </div>
                <div className={s.formField}>
                  <label className={s.label}>End Time</label>
                  <Input
                    type="time"
                    value={editingEvent?.end_time || '20:00'}
                    onChange={(_, data) => setEditingEvent({ ...editingEvent, end_time: data.value })}
                  />
                </div>
              </div>
              <div className={s.formFieldFull}>
                <label className={s.label}>Description (optional)</label>
                <Textarea
                  value={editingEvent?.description || ''}
                  onChange={(_, data) => setEditingEvent({ ...editingEvent, description: data.value })}
                  placeholder="Event details..."
                  rows={3}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowEventDialog(false)}>Cancel</Button>
              <Button appearance="primary" onClick={handleSaveEvent}>
                {editingEvent?.id ? 'Save' : 'Create'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
