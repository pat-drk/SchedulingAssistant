import React, { useEffect, useState } from "react";
import { Button, Input, Field, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens, Toolbar, ToolbarButton, ToolbarDivider } from "@fluentui/react-components";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

interface GroupEditorProps {
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
}

const useGroupEditorStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
  },
  headerBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableWrap: {
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow4,
    overflow: 'auto',
    maxHeight: '40vh',
    width: '100%',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
  },
  actionRow: {
    display: 'flex',
    columnGap: tokens.spacingHorizontalS,
  },
});

export default function GroupEditor({ all, run, refresh }: GroupEditorProps) {
  const styles = useGroupEditorStyles();
  const empty = { name: "", theme: "", custom_color: "" };
  const [groups, setGroups] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState(empty);
  const dialogs = useDialogs();

  function load() {
    setGroups(all(`SELECT id,name,theme,custom_color FROM grp ORDER BY name`));
  }

  useEffect(load, []);

  function startAdd() {
    setEditing(null);
    setForm(empty);
    setFormVisible(true);
  }

  function startEdit(g: any) {
    setEditing(g);
    setForm({ name: g.name, theme: g.theme || "", custom_color: g.custom_color || "" });
    setFormVisible(true);
  }

  function save() {
    if (!form.name.trim()) {
      dialogs.showAlert("Name is required", "Validation Error");
      return;
    }
    if (editing) {
      run(`UPDATE grp SET name=?, theme=?, custom_color=? WHERE id=?`, [form.name, form.theme || null, form.custom_color || null, editing.id]);
    } else {
      run(`INSERT INTO grp (name, theme, custom_color) VALUES (?,?,?)`, [form.name, form.theme || null, form.custom_color || null]);
    }
    load();
    refresh();
    setFormVisible(false);
    setEditing(null);
    setForm(empty);
  }

  function cancel() {
    setFormVisible(false);
    setEditing(null);
    setForm(empty);
  }

  async function remove(id: number) {
    const confirmed = await dialogs.showConfirm("Are you sure you want to delete this group? This will also delete all associated roles.", "Delete Group");
    if (!confirmed) return;
    run(`DELETE FROM role WHERE group_id=?`, [id]);
    run(`DELETE FROM grp WHERE id=?`, [id]);
    load();
    refresh();
  }

  return (
    <div className={styles.root}>
      <div className={styles.headerBar}>
        <Toolbar aria-label="Group actions" size="small" style={{ width: '100%' }}>
          <Text weight="semibold">Groups</Text>
          <div style={{ flex: 1 }} />
          <ToolbarButton appearance="primary" onClick={startAdd}>Add Group</ToolbarButton>
        </Toolbar>
      </div>

      <div className={styles.tableWrap}>
        <Table aria-label="Groups table">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Theme</TableHeaderCell>
              <TableHeaderCell>Color</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g: any) => (
              <TableRow key={g.id}>
                <TableCell>{g.name}</TableCell>
                <TableCell>{g.theme || ""}</TableCell>
                <TableCell>{g.custom_color || ""}</TableCell>
                <TableCell style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Button size="small" onClick={() => startEdit(g)}>Edit</Button>
                    <Button size="small" appearance="secondary" onClick={() => remove(g.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {formVisible && (
        <div className={styles.formSection}>
          <Field label="Name" required>
            <Input value={form.name} onChange={(_, d) => setForm({ ...form, name: d.value })} />
          </Field>
          <Field label="Theme">
            <Input value={form.theme} onChange={(_, d) => setForm({ ...form, theme: d.value })} />
          </Field>
          <Field label="Custom Color">
            <Input value={form.custom_color} onChange={(_, d) => setForm({ ...form, custom_color: d.value })} />
          </Field>
          <div className={styles.actionRow}>
            <Toolbar aria-label="Form actions" size="small">
              <ToolbarButton appearance="primary" onClick={save}>Save</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton onClick={cancel}>Cancel</ToolbarButton>
            </Toolbar>
          </div>
        </div>
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
    </div>
  );
}
