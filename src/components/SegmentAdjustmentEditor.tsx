import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Field,
  Input,
  Dropdown,
  Option,
  Table,
  TableHeader,
  TableHeaderCell,
  TableRow,
  TableBody,
  TableCell,
  Text,
  makeStyles,
  tokens,
  Badge,
  ToggleButton,
} from "@fluentui/react-components";
import { Delete20Regular } from "@fluentui/react-icons";
import type { SegmentRow } from "../services/segments";
import type { SegmentAdjustmentRow, SegmentAdjustmentCondition } from "../services/segmentAdjustments";
import { listSegmentAdjustmentConditions } from "../services/segmentAdjustments";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import { useDialogs } from "../hooks/useDialogs";

interface Props {
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  refresh: () => void;
  segments: SegmentRow[];
  db: any; // SQLite database for querying conditions
}

const baselineOpts = [
  { value: "condition.start", label: "Condition Start" },
  { value: "condition.end", label: "Condition End" },
  { value: "target.start", label: "Target Start" },
  { value: "target.end", label: "Target End" },
];

const mins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

const useSegmentAdjustmentStyles = makeStyles({
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
  row: { display: "flex", columnGap: tokens.spacingHorizontalS },
  flex1: { flex: 1 },
  actionsRow: { display: "flex", gap: tokens.spacingHorizontalS, justifyContent: "flex-end" },
  number: { width: "12ch" },
  previewWrap: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS, marginTop: tokens.spacingVerticalS },
  timeline: { position: "relative", height: 8, background: tokens.colorNeutralBackground5, borderRadius: tokens.borderRadiusSmall },
  condBar: { position: "absolute", top: 0, bottom: 0, background: tokens.colorNeutralForeground3, opacity: 0.3 },
  targetBar: { position: "absolute", top: 0, bottom: 0, background: tokens.colorNeutralForeground2, opacity: 0.4 },
  adjustedBar: { position: "absolute", top: 0, bottom: 0, background: tokens.colorBrandBackground },
  conditionSection: { 
    display: "flex", 
    flexDirection: "column", 
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  conditionRow: { 
    display: "flex", 
    alignItems: "flex-end",
    gap: tokens.spacingHorizontalS 
  },
  conditionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: tokens.spacingVerticalXS,
  },
  logicToggle: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  conditionDescription: {
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase300,
  },
  conditionBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
  },
});

export default function SegmentAdjustmentEditor({ all, run, refresh, segments, db }: Props) {
  interface Condition {
    condition_segment: string;
    condition_role_id: number | null;
  }
  
  const empty: Omit<SegmentAdjustmentRow, "id"> = {
    condition_segment: "",
    condition_role_id: null,
    target_segment: "",
    target_field: "start",
    baseline: "condition.start",
    offset_minutes: 0,
    logic_operator: "AND",
  };
  
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<typeof empty>(empty);
  const [conditions, setConditions] = useState<Condition[]>([{ condition_segment: "", condition_role_id: null }]);
  const [logicOperator, setLogicOperator] = useState<'AND' | 'OR'>('AND');
  const [roles, setRoles] = useState<any[]>([]);
  const [adjustmentConditions, setAdjustmentConditions] = useState<Map<number, SegmentAdjustmentCondition[]>>(new Map());
  const dialogs = useDialogs();
  
  const baselineLabel = useMemo(() => {
    const match = baselineOpts.find((o) => o.value === form.baseline);
    return match ? match.label : "";
  }, [form.baseline]);

  // Build preview based on first condition for visualization
  const firstCondSeg = segments.find((s) => s.name === conditions[0]?.condition_segment);
  const targetSeg = segments.find((s) => s.name === form.target_segment);
  
  let preview: {
    conditionSegments: { start: number; end: number; name: string }[];
    targetStart: number;
    targetEnd: number;
    newStart: number;
    newEnd: number;
  } | null = null;
  
  if (targetSeg) {
    const targetStart = mins(targetSeg.start_time);
    const targetEnd = mins(targetSeg.end_time);
    
    const conditionSegments = conditions
      .map(c => {
        const seg = segments.find(s => s.name === c.condition_segment);
        return seg ? {
          start: mins(seg.start_time),
          end: mins(seg.end_time),
          name: seg.name
        } : null;
      })
      .filter(Boolean) as { start: number; end: number; name: string }[];
    
    if (firstCondSeg && conditionSegments.length > 0) {
      const condStart = mins(firstCondSeg.start_time);
      const condEnd = mins(firstCondSeg.end_time);
      
      let base: number | null = null;
      switch (form.baseline) {
        case "condition.start":
          base = condStart;
          break;
        case "condition.end":
          base = condEnd;
          break;
        case "target.start":
          base = targetStart;
          break;
        case "target.end":
          base = targetEnd;
          break;
      }
      
      if (base != null) {
        const adj = base + form.offset_minutes;
        let newStart = targetStart;
        let newEnd = targetEnd;
        if (form.target_field === "start") newStart = adj;
        else newEnd = adj;
        preview = { conditionSegments, targetStart, targetEnd, newStart, newEnd };
      }
    }
  }

  function load() {
    const adjRows = all(`SELECT id,condition_segment,condition_role_id,target_segment,target_field,baseline,offset_minutes,COALESCE(logic_operator,'AND') as logic_operator FROM segment_adjustment`);
    setRows(adjRows);
    setRoles(all(`SELECT id,name FROM role ORDER BY name`));
    
    // Load conditions for each adjustment
    const condMap = new Map<number, SegmentAdjustmentCondition[]>();
    for (const row of adjRows) {
      try {
        const conds = listSegmentAdjustmentConditions(db, row.id);
        if (conds.length > 0) {
          condMap.set(row.id, conds);
        }
      } catch (e) {
        console.error('Error loading conditions for adjustment', row.id, e);
      }
    }
    setAdjustmentConditions(condMap);
  }
  
  useEffect(load, [all, db]);

  function startAdd() {
    setEditing(null);
    setForm(empty);
    setConditions([{ condition_segment: "", condition_role_id: null }]);
    setLogicOperator('AND');
    setFormVisible(true);
  }

  function startEdit(r: any) {
    setEditing(r);
    setForm({
      condition_segment: r.condition_segment || "",
      condition_role_id: r.condition_role_id ?? null,
      target_segment: r.target_segment,
      target_field: r.target_field,
      baseline: r.baseline,
      offset_minutes: r.offset_minutes,
      logic_operator: r.logic_operator || 'AND',
    });
    
    // Load conditions for this adjustment
    const existingConditions = adjustmentConditions.get(r.id);
    if (existingConditions && existingConditions.length > 0) {
      setConditions(existingConditions.map(c => ({
        condition_segment: c.condition_segment,
        condition_role_id: c.condition_role_id
      })));
    } else {
      // Fall back to old single condition from main table
      setConditions([{
        condition_segment: r.condition_segment || "",
        condition_role_id: r.condition_role_id ?? null
      }]);
    }
    
    setLogicOperator(r.logic_operator || 'AND');
    setFormVisible(true);
  }

  function save() {
    // Validate at least one condition exists
    const validConditions = conditions.filter(c => c.condition_segment);
    if (validConditions.length === 0) {
      dialogs.showAlert("At least one condition is required", "Validation Error");
      return;
    }
    
    if (!form.target_segment) {
      dialogs.showAlert("Target segment is required", "Validation Error");
      return;
    }
    
    // Use first condition for backward compatibility fields
    const firstCondition = validConditions[0];
    
    const params = [
      firstCondition.condition_segment,
      firstCondition.condition_role_id,
      form.target_segment,
      form.target_field,
      form.baseline,
      form.offset_minutes,
      logicOperator,
    ];
    
    let adjustmentId: number;
    
    if (editing) {
      run(
        `UPDATE segment_adjustment SET condition_segment=?, condition_role_id=?, target_segment=?, target_field=?, baseline=?, offset_minutes=?, logic_operator=? WHERE id=?`,
        [...params, editing.id]
      );
      adjustmentId = editing.id;
      
      // Delete existing conditions
      run(`DELETE FROM segment_adjustment_condition WHERE adjustment_id=?`, [adjustmentId]);
    } else {
      run(
        `INSERT INTO segment_adjustment (condition_segment,condition_role_id,target_segment,target_field,baseline,offset_minutes,logic_operator) VALUES (?,?,?,?,?,?,?)`,
        params
      );
      
      // Get the last inserted ID
      const result = all(`SELECT last_insert_rowid() as id`);
      adjustmentId = result[0]?.id;
    }
    
    // Insert all conditions into the condition table
    for (const cond of validConditions) {
      run(
        `INSERT INTO segment_adjustment_condition (adjustment_id, condition_segment, condition_role_id) VALUES (?, ?, ?)`,
        [adjustmentId, cond.condition_segment, cond.condition_role_id]
      );
    }
    
    load();
    refresh();
    cancel();
  }

  function cancel() {
    setFormVisible(false);
    setEditing(null);
    setForm(empty);
    setConditions([{ condition_segment: "", condition_role_id: null }]);
    setLogicOperator('AND');
  }

  async function remove(id: number) {
    const confirmed = await dialogs.showConfirm("Are you sure you want to delete this adjustment?", "Delete Adjustment");
    if (!confirmed) return;
    run(`DELETE FROM segment_adjustment WHERE id=?`, [id]);
    run(`DELETE FROM segment_adjustment_condition WHERE adjustment_id=?`, [id]);
    load();
    refresh();
  }
  
  function addCondition() {
    setConditions([...conditions, { condition_segment: "", condition_role_id: null }]);
  }
  
  function removeCondition(index: number) {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  }
  
  function updateCondition(index: number, field: 'condition_segment' | 'condition_role_id', value: any) {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  }
  
  // Build description text for a rule
  function buildRuleDescription(adjustment: any, conds: SegmentAdjustmentCondition[]): string {
    if (!conds || conds.length === 0) {
      // Fallback to old format
      const roleText = adjustment.condition_role_id 
        ? ` (${roles.find(r => r.id === adjustment.condition_role_id)?.name || ''})`
        : '';
      return `When ${adjustment.condition_segment}${roleText} is scheduled`;
    }
    
    if (conds.length === 1) {
      const roleText = conds[0].condition_role_id
        ? ` (${roles.find(r => r.id === conds[0].condition_role_id)?.name || ''})`
        : '';
      return `When ${conds[0].condition_segment}${roleText} is scheduled`;
    }
    
    const operator = adjustment.logic_operator || 'AND';
    const condTexts = conds.map(c => {
      const roleText = c.condition_role_id
        ? ` (${roles.find(r => r.id === c.condition_role_id)?.name || ''})`
        : '';
      return `${c.condition_segment}${roleText}`;
    });
    
    if (operator === 'AND') {
      return `When ${condTexts.join(' AND ')} are scheduled`;
    } else {
      return `When ${condTexts.join(' OR ')} is scheduled`;
    }
  }

  const s = useSegmentAdjustmentStyles();

  return (
    <div className={s.section}>
      <div className={s.header}>
        <Text weight="semibold">Segment Adjustments</Text>
        <Button appearance="primary" onClick={startAdd}>
          Add Adjustment
        </Button>
      </div>
      <div className={s.tableWrap}>
        <Table aria-label="Segment adjustments">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Conditions</TableHeaderCell>
              <TableHeaderCell>Target</TableHeaderCell>
              <TableHeaderCell>Field</TableHeaderCell>
              <TableHeaderCell>Baseline</TableHeaderCell>
              <TableHeaderCell>Offset (min)</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => {
              const conds = adjustmentConditions.get(r.id) || [];
              const description = buildRuleDescription(r, conds);
              const logicOp = r.logic_operator || 'AND';
              
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS }}>
                      {description}
                      {conds.length > 1 && (
                        <Badge appearance="outline" color={logicOp === 'AND' ? 'informative' : 'warning'}>
                          {logicOp}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.target_segment}</TableCell>
                  <TableCell>{r.target_field}</TableCell>
                  <TableCell>{r.baseline}</TableCell>
                  <TableCell>{r.offset_minutes}</TableCell>
                  <TableCell>
                    <div className={s.actionsRow}>
                      <Button size="small" onClick={() => startEdit(r)}>
                        Edit
                      </Button>
                      <Button size="small" appearance="secondary" onClick={() => remove(r.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {formVisible && (
        <div className={s.section}>
          {/* Conditions Section */}
          <div className={s.conditionSection}>
            <div className={s.conditionHeader}>
              <Text weight="semibold">Conditions</Text>
              {conditions.length > 1 && (
                <div className={s.logicToggle}>
                  <Text size={200}>Logic:</Text>
                  <ToggleButton
                    checked={logicOperator === 'AND'}
                    onClick={() => setLogicOperator(logicOperator === 'AND' ? 'OR' : 'AND')}
                    appearance="outline"
                    size="small"
                  >
                    {logicOperator}
                  </ToggleButton>
                </div>
              )}
            </div>
            
            {conditions.map((cond, idx) => (
              <div key={idx} className={s.conditionRow}>
                <Field label={`Segment ${idx + 1}`} className={s.flex1}>
                  <Dropdown
                    selectedOptions={[cond.condition_segment]}
                    value={cond.condition_segment}
                    onOptionSelect={(_, d) => updateCondition(idx, 'condition_segment', d.optionValue || '')}
                  >
                    {segments.map((sg) => (
                      <Option key={sg.name} value={sg.name} text={sg.name}>
                        {sg.name}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                
                <Field label={`Role ${idx + 1}`} className={s.flex1}>
                  <Dropdown
                    selectedOptions={[cond.condition_role_id == null ? "" : String(cond.condition_role_id)]}
                    value={
                      cond.condition_role_id == null
                        ? "Any"
                        : roles.find(r => r.id === cond.condition_role_id)?.name || ""
                    }
                    onOptionSelect={(_, d) => 
                      updateCondition(idx, 'condition_role_id', d.optionValue ? Number(d.optionValue) : null)
                    }
                  >
                    <Option value="" text="Any">
                      Any
                    </Option>
                    {roles.map((ro: any) => (
                      <Option key={ro.id} value={String(ro.id)} text={ro.name}>
                        {ro.name}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                
                {conditions.length > 1 && (
                  <Button
                    icon={<Delete20Regular />}
                    appearance="subtle"
                    onClick={() => removeCondition(idx)}
                    aria-label="Remove condition"
                  />
                )}
              </div>
            ))}
            
            <Button appearance="subtle" onClick={addCondition} size="small">
              + Add Condition
            </Button>
            
            {/* Description preview */}
            {conditions.some(c => c.condition_segment) && (
              <div className={s.conditionDescription}>
                <Text size={200}>
                  {conditions.filter(c => c.condition_segment).length === 1
                    ? `When ${conditions.find(c => c.condition_segment)?.condition_segment}${
                        conditions.find(c => c.condition_segment)?.condition_role_id
                          ? ` (${roles.find(r => r.id === conditions.find(c => c.condition_segment)?.condition_role_id)?.name})`
                          : ''
                      } is scheduled`
                    : conditions.filter(c => c.condition_segment).length > 1
                    ? `When ${conditions
                        .filter(c => c.condition_segment)
                        .map(c => {
                          const roleText = c.condition_role_id
                            ? ` (${roles.find(r => r.id === c.condition_role_id)?.name})`
                            : '';
                          return `${c.condition_segment}${roleText}`;
                        })
                        .join(` ${logicOperator} `)} ${logicOperator === 'AND' ? 'are' : 'is'} scheduled`
                    : 'Select condition segments'}
                  {form.target_segment && `, adjust ${form.target_segment}'s ${form.target_field} time`}
                </Text>
              </div>
            )}
          </div>
          
          {/* Target and Adjustment Settings */}
          <div className={s.row}>
            <Field label="Target Segment" className={s.flex1}>
              <Dropdown
                selectedOptions={[form.target_segment]}
                value={form.target_segment}
                onOptionSelect={(_, d) => setForm({ ...form, target_segment: d.optionValue || '' })}
              >
                {segments.map((sg) => (
                  <Option key={sg.name} value={sg.name} text={sg.name}>
                    {sg.name}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Field" className={s.flex1}>
              <Dropdown
                selectedOptions={[form.target_field]}
                value={form.target_field}
                onOptionSelect={(_, d) =>
                  setForm({ ...form, target_field: d.optionValue as "start" | "end" })
                }
              >
                <Option value="start" text="start">
                  start
                </Option>
                <Option value="end" text="end">
                  end
                </Option>
              </Dropdown>
            </Field>
          </div>
          
          <div className={s.row}>
            <Field label="Baseline" className={s.flex1}>
              <Dropdown
                selectedOptions={[form.baseline]}
                value={baselineLabel}
                onOptionSelect={(_, d) =>
                  setForm({ ...form, baseline: d.optionValue as SegmentAdjustmentRow["baseline"] })
                }
              >
                {baselineOpts.map((o) => (
                  <Option key={o.value} value={o.value} text={o.label}>
                    {o.label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Offset Minutes" className={s.number}>
              <Input
                type="number"
                value={String(form.offset_minutes)}
                onChange={(_, d) =>
                  setForm({ ...form, offset_minutes: Number(d.value || 0) })
                }
              />
            </Field>
          </div>
          
          {preview && (
            <div className={s.previewWrap}>
              <Text size={200}>Preview</Text>
              <div className={s.timeline}>
                {/* Show all condition segments */}
                {preview.conditionSegments.map((cond, idx) => (
                  <div
                    key={idx}
                    className={s.condBar}
                    style={{
                      left: `${(cond.start / (24 * 60)) * 100}%`,
                      width: `${((cond.end - cond.start) / (24 * 60)) * 100}%`,
                      opacity: 0.3 - idx * 0.05,
                    }}
                  />
                ))}
                <div
                  className={s.targetBar}
                  style={{
                    left: `${(preview.targetStart / (24 * 60)) * 100}%`,
                    width: `${((preview.targetEnd - preview.targetStart) / (24 * 60)) * 100}%`,
                  }}
                />
                <div
                  className={s.adjustedBar}
                  style={{
                    left: `${(preview.newStart / (24 * 60)) * 100}%`,
                    width: `${((preview.newEnd - preview.newStart) / (24 * 60)) * 100}%`,
                  }}
                />
              </div>
              <Text size={200}>
                {form.target_segment}: {fmt(preview.targetStart)}-{fmt(preview.targetEnd)} → {fmt(preview.newStart)}-{fmt(preview.newEnd)}
              </Text>
            </div>
          )}
          <div className={s.row}>
            <Button appearance="primary" onClick={save}>
              Save
            </Button>
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
