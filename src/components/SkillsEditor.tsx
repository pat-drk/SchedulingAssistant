import React from "react";
import { Button, Input, Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell, makeStyles, tokens, Dropdown, Option, Label } from "@fluentui/react-components";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

interface SkillsEditorProps {
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
}

type SkillRow = { id: number; code: string; name: string; active: number; ordering: number | null; group_id: number | null; group_name: string | null };
type GroupRow = { id: number; name: string };

const useSkillsEditorStyles = makeStyles({
  root: { display: 'grid', gap: tokens.spacingVerticalS },
  row: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' },
  tableWrap: { overflow: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge },
  code: { width: '140px' },
  name: { minWidth: '240px', flex: 1 },
  groupSel: { width: '220px' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS },
  header: { fontWeight: tokens.fontWeightSemibold },
});

export default function SkillsEditor({ all, run, refresh }: SkillsEditorProps) {
  const s = useSkillsEditorStyles();
  const dialogs = useDialogs();

  const [rows, setRows] = React.useState<SkillRow[]>([]);
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [groups, setGroups] = React.useState<GroupRow[]>([]);
  const [groupId, setGroupId] = React.useState<number | "">("");
  const addGroupLabel = React.useMemo(() => {
    if (groupId === "") return "Select group";
    const match = groups.find((g) => g.id === Number(groupId));
    return match ? match.name : "";
  }, [groupId, groups]);
  const canAdd = React.useMemo(() => {
    return code.trim().length > 0 && name.trim().length > 0 && groupId !== "";
  }, [code, name, groupId]);

  const load = React.useCallback(() => {
    const res = all(`SELECT s.id, s.code, s.name, s.active, o.ordering, s.group_id, g.name AS group_name
                     FROM skill s
                     LEFT JOIN skill_order o ON o.skill_id=s.id
                     LEFT JOIN grp g ON g.id=s.group_id
                     ORDER BY COALESCE(o.ordering, 9999), s.name`);
    const list: SkillRow[] = (res || []).map((r: any) => ({
      id: Number(r.id), code: String(r.code), name: String(r.name), active: Number(r.active ?? 1), ordering: r.ordering ?? null,
      group_id: r.group_id ?? null, group_name: r.group_name ?? null,
    }));
    setRows(list);
  const g = all(`SELECT id, name FROM grp ORDER BY name`);
    const gList: GroupRow[] = (g || []).map((x: any) => ({ id: Number(x.id), name: String(x.name) }));
    setGroups(gList);
    if (gList.length && groupId === "") setGroupId(gList[0].id);
  }, [all, groupId]);

  React.useEffect(() => { load(); }, [load]);

  function addSkill() {
    const c = code.trim();
    const n = name.trim();
    const gid = groupId === "" ? null : Number(groupId);
    if (!c || !n || gid == null) return;
    run(`INSERT INTO skill (code, name, active, group_id) VALUES (?,?,1,?)`, [c, n, gid]);
    setCode("");
    setName("");
    load();
    refresh();
  }

  function removeSkill(id: number) {
    // Soft delete by deactivating to avoid breaking references
    run(`UPDATE skill SET active=0 WHERE id=?`, [id]);
    load();
    refresh();
  }

  function reactivateSkill(id: number) {
    run(`UPDATE skill SET active=1 WHERE id=?`, [id]);
    load();
    refresh();
  }

  async function deleteSkill(id: number) {
    const confirmed = await dialogs.showConfirm(
      'This will permanently delete this skill. This cannot be undone.',
      'Delete Skill'
    );
    if (!confirmed) return;
    // Only allow delete when there are no references
    const c = all(`SELECT COUNT(1) AS c FROM person_skill WHERE skill_id=?`, [id]);
    const count = Number(c?.[0]?.c ?? 0);
    if (count > 0) {
      dialogs.showAlert('Cannot delete: this skill has ratings. Deactivate instead.', 'Cannot Delete');
      return;
    }
    run(`DELETE FROM skill_order WHERE skill_id=?`, [id]);
    run(`DELETE FROM skill WHERE id=?`, [id]);
    load();
    refresh();
  }

  function setRowGroup(id: number, newGroupId: number | "") {
    const gid = newGroupId === "" ? null : Number(newGroupId);
    run(`UPDATE skill SET group_id=? WHERE id=?`, [gid, id]);
    load();
    refresh();
  }

  function move(id: number, dir: -1 | 1) {
    const ordered = rows.slice().sort((a,b) => (a.ordering ?? 9999) - (b.ordering ?? 9999) || a.name.localeCompare(b.name));
    const idx = ordered.findIndex(r => r.id === id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= ordered.length) return;
    const [item] = ordered.splice(idx, 1);
    ordered.splice(newIdx, 0, item);
    // Two-pass write to avoid UNIQUE collisions on ordering
    const TEMP_BASE = 1000000;
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      run(
        `INSERT INTO skill_order (skill_id, ordering) VALUES (?,?)
         ON CONFLICT(skill_id) DO UPDATE SET ordering=excluded.ordering`,
        [r.id, TEMP_BASE + i]
      );
    }
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      run(
        `INSERT INTO skill_order (skill_id, ordering) VALUES (?,?)
         ON CONFLICT(skill_id) DO UPDATE SET ordering=excluded.ordering`,
        [r.id, i + 1]
      );
    }
    load();
    refresh();
  }

  return (
    <div className={s.root}>
      <div className={s.row}>
        <Label className={s.header}>Add Skill</Label>
      </div>
      <div className={s.row}>
        <Input className={s.code} placeholder="Code" value={code} onChange={(_,d)=>setCode(d.value)} />
        <Input className={s.name} placeholder="Name" value={name} onChange={(_,d)=>setName(d.value)} />
        <Dropdown className={s.groupSel}
          selectedOptions={groupId === "" ? [""] : [String(groupId)]}
          value={addGroupLabel}
          onOptionSelect={(_, data) => {
            const val = data.optionValue ? parseInt(String(data.optionValue)) : "";
            setGroupId(val as any);
          }}
        >
          <Option value="" text="Select group">Select group</Option>
          {groups.map(g => (
            <Option key={g.id} value={String(g.id)} text={g.name}>{g.name}</Option>
          ))}
        </Dropdown>
  <Button appearance="primary" onClick={addSkill} disabled={!canAdd}>Add</Button>
      </div>
      <div className={s.tableWrap}>
        <Table size="small" aria-label="Skills">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Group</TableHeaderCell>
              <TableHeaderCell>Active</TableHeaderCell>
              <TableHeaderCell>Order</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  <Dropdown
                    className={s.groupSel}
                    selectedOptions={r.group_id == null ? [""] : [String(r.group_id)]}
                    value={r.group_id == null ? "Unassigned" : (groups.find((g) => g.id === r.group_id)?.name || "")}
                    onOptionSelect={(_, data) => {
                      const val = data.optionValue ? parseInt(String(data.optionValue)) : "";
                      setRowGroup(r.id, val as any);
                    }}
                  >
                    <Option value="" text="Unassigned">Unassigned</Option>
                    {groups.map(g => (
                      <Option key={g.id} value={String(g.id)} text={g.name}>{g.name}</Option>
                    ))}
                  </Dropdown>
                </TableCell>
                <TableCell>{r.active ? 'Yes' : 'No'}</TableCell>
                <TableCell className={s.actions}>
                  <Button size="small" onClick={() => move(r.id, -1)}>Up</Button>
                  <Button size="small" onClick={() => move(r.id, 1)}>Down</Button>
                </TableCell>
                <TableCell>
                  {r.active ? (
                    <Button appearance="subtle" onClick={() => removeSkill(r.id)}>Deactivate</Button>
                  ) : (
                    <Button appearance="subtle" onClick={() => reactivateSkill(r.id)}>Activate</Button>
                  )}
                  <Button appearance="subtle" onClick={() => deleteSkill(r.id)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
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
