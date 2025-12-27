import React, { useEffect, useState } from "react";
import type { SegmentRow } from "../services/segments";
import { Button, Field, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Dropdown, Option, Checkbox, Text, makeStyles, tokens } from "@fluentui/react-components";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

interface RoleEditorProps {
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
  segments: SegmentRow[];
}

const useRoleEditorStyles = makeStyles({
  section: { display: "flex", flexDirection: "column", rowGap: tokens.spacingHorizontalS },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  tableWrap: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflow: "auto",
    maxHeight: "40vh",
    width: "100%",
    boxShadow: tokens.shadow2,
  },
  row: { display: "flex", columnGap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  rightAlign: { textAlign: 'right' },
  actionsRow: { display: 'flex', gap: tokens.spacingHorizontalS, justifyContent: 'flex-end' },
});

export default function RoleEditor({ all, run, refresh, segments }: RoleEditorProps) {
  const [roles, setRoles] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const dialogs = useDialogs();

  function load() {
    setRoles(
      all(`SELECT r.id,r.code,r.name,r.group_id,r.segments,g.name as group_name FROM role_active r JOIN grp_active g ON g.id=r.group_id ORDER BY g.name,r.name`)
        .map((r: any) => ({ ...r, segs: new Set<string>(JSON.parse(r.segments)) }))
    );
    setGroups(all(`SELECT id,name FROM grp_active ORDER BY name`));
  }

  useEffect(load, []);

  function startAdd() {
    setEditing({ id: null, code: "", name: "", group_id: groups[0]?.id || 0, segs: new Set<string>() });
    setFormVisible(true);
  }

  function startEdit(r: any) {
    setEditing({ ...r, segs: new Set<string>(r.segs) });
    setFormVisible(true);
  }

  function toggleSeg(seg: string) {
    if (!editing) return;
    const s = new Set(editing.segs);
    if (s.has(seg)) s.delete(seg); else s.add(seg);
    setEditing({ ...editing, segs: s });
  }

  function save() {
    if (!editing) return;
    const segArr = Array.from(editing.segs);
    if (!editing.code.trim() || !editing.name.trim()) {
      dialogs.showAlert("Code and name are required", "Validation Error");
      return;
    }
    if (!segArr.length) {
      dialogs.showAlert("Select at least one segment", "Validation Error");
      return;
    }
    if (editing.id) {
      run(`UPDATE role SET code=?, name=?, group_id=?, segments=? WHERE id=?`, [editing.code, editing.name, editing.group_id, JSON.stringify(segArr), editing.id]);
    } else {
      run(`INSERT INTO role (code,name,group_id,segments) VALUES (?,?,?,?)`, [editing.code, editing.name, editing.group_id, JSON.stringify(segArr)]);
    }
    load();
    refresh();
    setFormVisible(false);
    setEditing(null);
  }

  function cancel() {
    setFormVisible(false);
    setEditing(null);
  }

  async function remove(id: number) {
    const confirmed = await dialogs.showConfirm("Are you sure you want to delete this role?", "Delete Role");
    if (!confirmed) return;
    run(`DELETE FROM role WHERE id=?`, [id]);
    load();
    refresh();
  }

  const s = useRoleEditorStyles();
  return (
    <div className={s.section}>
      <div className={s.header}>
        <Text weight="semibold">Roles</Text>
        <Button appearance="primary" onClick={startAdd}>Add Role</Button>
      </div>

      <div className={s.tableWrap}>
        <Table aria-label="Roles table">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Group</TableHeaderCell>
              <TableHeaderCell>Segments</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.group_name}</TableCell>
                <TableCell>{Array.from(r.segs).join(", ")}</TableCell>
                <TableCell className={s.rightAlign}>
                  <div className={s.actionsRow}>
                    <Button size="small" onClick={() => startEdit(r)}>Edit</Button>
                    <Button size="small" appearance="secondary" onClick={() => remove(r.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {formVisible && editing && (
        <div className={s.section}>
          <Field label="Code" required>
            <Input value={editing.code} onChange={(_, d) => setEditing({ ...editing, code: d.value })} />
          </Field>
          <Field label="Name" required>
            <Input value={editing.name} onChange={(_, d) => setEditing({ ...editing, name: d.value })} />
          </Field>
          <Field label="Group">
            <Dropdown
              key={`role-group-${editing?.id ?? 'new'}-${groups.map((g:any)=>`${g.id}:${g.name}`).join(',')}-${editing.group_id}`}
              selectedOptions={editing.group_id != null ? [String(editing.group_id)] : []}
              value={(() => {
                const group = groups.find((g:any) => g.id === editing.group_id);
                return group ? group.name : "";
              })()}
              onOptionSelect={(_, data) => {
                const v = Number(data.optionValue ?? data.optionText);
                setEditing({ ...editing, group_id: v });
              }}
            >
              {groups.map((g: any) => (
                <Option key={g.id} value={String(g.id)} text={g.name}>
                  {g.name}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <div className={s.row}>
            {segments.map((s) => (
              <Checkbox key={s.name} label={s.name} checked={editing.segs.has(s.name)} onChange={() => toggleSeg(s.name)} />
            ))}
          </div>
          <div className={s.row}>
            <Button appearance="primary" onClick={save}>Save</Button>
            <Button onClick={cancel}>Cancel</Button>
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
