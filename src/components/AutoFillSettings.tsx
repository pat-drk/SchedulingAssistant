import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Dropdown,
  Option,
  Switch,
  Text,
  tokens,
  Divider,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
} from "@fluentui/react-components";
import { ArrowUp20Regular, ArrowDown20Regular } from "@fluentui/react-icons";

const STORAGE_KEY = "autoFillPriority";

export function getAutoFillPriority(): string {
  if (typeof localStorage === "undefined") return "trained";
  return localStorage.getItem(STORAGE_KEY) || "trained";
}

interface AutoFillSettingsProps {
  open: boolean;
  onClose: () => void;
}

export default function AutoFillSettings({ open, onClose }: AutoFillSettingsProps) {
  const [priority, setPriority] = useState<string>(() => getAutoFillPriority());

  function handleSave() {
    try {
      localStorage.setItem(STORAGE_KEY, priority);
    } catch {}
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Auto-Fill Priority</DialogTitle>
          <DialogContent>
            <Dropdown
              selectedOptions={[priority]}
              value={priority === "alphabetical" ? "Alphabetical" : "Trained first"}
              onOptionSelect={(_, data) => setPriority(String(data.optionValue))}
            >
              <Option value="trained" text="Trained first">
                Trained first
              </Option>
              <Option value="alphabetical" text="Alphabetical">
                Alphabetical
              </Option>
            </Dropdown>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={handleSave}>Save</Button>
            <Button onClick={onClose}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// Type definitions for autofill priority rules
export interface AutoFillRule {
  key: string;
  label: string;
  enabled: boolean;
  priority: number;
}

export interface AutoFillGroupPriority {
  groupId: number;
  groupName: string;
  priority: number;
}

// Per-target-group source priority matrix
export interface GroupSourcePriority {
  targetGroupId: number;
  targetGroupName: string;
  sources: Array<{ groupId: number; groupName: string; priority: number }>;
}

// Default rules
const DEFAULT_RULES: AutoFillRule[] = [
  { key: 'prefer_trained', label: 'Prefer trained over untrained', enabled: true, priority: 1 },
  { key: 'pull_overstaffed_first', label: 'Pull from overstaffed groups first', enabled: true, priority: 2 },
  { key: 'respect_segment_availability', label: 'Respect segment availability', enabled: true, priority: 3 },
  { key: 'exclude_high_timeoff_overlap', label: 'Exclude high time-off overlap', enabled: true, priority: 4 },
];

// Load autofill rules from database
export function loadAutoFillRules(all: (sql: string, params?: any[]) => any[]): AutoFillRule[] {
  try {
    const rows = all(`SELECT rule_key, enabled, priority FROM autofill_priority ORDER BY priority`);
    if (rows.length === 0) return [...DEFAULT_RULES];
    
    return rows.map((r: any) => {
      const defaultRule = DEFAULT_RULES.find(d => d.key === r.rule_key);
      return {
        key: r.rule_key,
        label: defaultRule?.label || r.rule_key,
        enabled: Boolean(r.enabled),
        priority: r.priority,
      };
    });
  } catch {
    return [...DEFAULT_RULES];
  }
}

// Load group priorities from database (legacy - kept for compatibility)
export function loadGroupPriorities(all: (sql: string, params?: any[]) => any[], groups: any[]): AutoFillGroupPriority[] {
  try {
    const rows = all(`SELECT group_id, priority FROM autofill_group_priority ORDER BY priority`);
    const priorityMap = new Map(rows.map((r: any) => [r.group_id, r.priority]));
    
    return groups.map((g: any, idx: number) => ({
      groupId: g.id,
      groupName: g.name,
      priority: priorityMap.get(g.id) ?? idx + 1,
    })).sort((a, b) => a.priority - b.priority);
  } catch {
    return groups.map((g: any, idx: number) => ({
      groupId: g.id,
      groupName: g.name,
      priority: idx + 1,
    }));
  }
}

// Load per-target-group source priorities from database
export function loadGroupSourcePriorities(all: (sql: string, params?: any[]) => any[], groups: any[]): GroupSourcePriority[] {
  try {
    const rows = all(`SELECT target_group_id, source_group_id, priority FROM autofill_group_source_priority ORDER BY target_group_id, priority`);
    
    // Build a map: targetGroupId -> Map<sourceGroupId, priority>
    const priorityMap = new Map<number, Map<number, number>>();
    for (const r of rows) {
      let sourceMap = priorityMap.get(r.target_group_id);
      if (!sourceMap) {
        sourceMap = new Map();
        priorityMap.set(r.target_group_id, sourceMap);
      }
      sourceMap.set(r.source_group_id, r.priority);
    }
    
    // For each group, create a source priority list
    return groups.map((targetGroup: any) => {
      const sourceMap = priorityMap.get(targetGroup.id);
      const sources = groups.map((sourceGroup: any, idx: number) => ({
        groupId: sourceGroup.id,
        groupName: sourceGroup.name,
        priority: sourceMap?.get(sourceGroup.id) ?? (sourceGroup.id === targetGroup.id ? 1 : idx + 2),
      })).sort((a, b) => a.priority - b.priority);
      
      return {
        targetGroupId: targetGroup.id,
        targetGroupName: targetGroup.name,
        sources,
      };
    });
  } catch {
    // Default: each group prioritizes itself first, then others in order
    return groups.map((targetGroup: any) => ({
      targetGroupId: targetGroup.id,
      targetGroupName: targetGroup.name,
      sources: groups.map((sourceGroup: any, idx: number) => ({
        groupId: sourceGroup.id,
        groupName: sourceGroup.name,
        priority: sourceGroup.id === targetGroup.id ? 1 : idx + 2,
      })).sort((a, b) => a.priority - b.priority),
    }));
  }
}

interface AutoFillPrioritySettingsProps {
  open: boolean;
  onClose: () => void;
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  groups: any[];
}

export function AutoFillPrioritySettings({ open, onClose, all, run, groups }: AutoFillPrioritySettingsProps) {
  const [rules, setRules] = useState<AutoFillRule[]>([]);
  const [groupSourcePriorities, setGroupSourcePriorities] = useState<GroupSourcePriority[]>([]);

  useEffect(() => {
    if (open) {
      setRules(loadAutoFillRules(all));
      setGroupSourcePriorities(loadGroupSourcePriorities(all, groups));
    }
  }, [open, all, groups]);

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const newRules = [...rules];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newRules.length) return;
    [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
    // Update priorities
    newRules.forEach((r, i) => r.priority = i + 1);
    setRules(newRules);
  };

  const toggleRule = (index: number) => {
    const newRules = [...rules];
    newRules[index].enabled = !newRules[index].enabled;
    setRules(newRules);
  };

  const moveSource = (targetIndex: number, sourceIndex: number, direction: 'up' | 'down') => {
    const newPriorities = [...groupSourcePriorities];
    const sources = [...newPriorities[targetIndex].sources];
    const newSourceIndex = direction === 'up' ? sourceIndex - 1 : sourceIndex + 1;
    if (newSourceIndex < 0 || newSourceIndex >= sources.length) return;
    [sources[sourceIndex], sources[newSourceIndex]] = [sources[newSourceIndex], sources[sourceIndex]];
    // Update priorities
    sources.forEach((s, i) => s.priority = i + 1);
    newPriorities[targetIndex] = { ...newPriorities[targetIndex], sources };
    setGroupSourcePriorities(newPriorities);
  };

  const handleSave = () => {
    // Save rules
    for (const rule of rules) {
      run(
        `INSERT INTO autofill_priority (rule_key, enabled, priority) VALUES (?, ?, ?)
         ON CONFLICT(rule_key) DO UPDATE SET enabled = excluded.enabled, priority = excluded.priority`,
        [rule.key, rule.enabled ? 1 : 0, rule.priority]
      );
    }
    
    // Save per-target-group source priorities
    for (const targetPriority of groupSourcePriorities) {
      for (const source of targetPriority.sources) {
        run(
          `INSERT INTO autofill_group_source_priority (target_group_id, source_group_id, priority) VALUES (?, ?, ?)
           ON CONFLICT(target_group_id, source_group_id) DO UPDATE SET priority = excluded.priority`,
          [targetPriority.targetGroupId, source.groupId, source.priority]
        );
      }
    }
    
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '550px', maxHeight: '80vh' }}>
        <DialogBody>
          <DialogTitle>Auto-Fill Priority Settings</DialogTitle>
          <DialogContent style={{ overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}>
              <Text weight="semibold">Priority Rules</Text>
              <Text size={200}>Higher priority rules are applied first.</Text>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS }}>
                {rules.map((rule, idx) => (
                  <div 
                    key={rule.key} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: tokens.spacingHorizontalS,
                      padding: tokens.spacingHorizontalS,
                      backgroundColor: tokens.colorNeutralBackground2,
                      borderRadius: tokens.borderRadiusMedium,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <Button 
                        size="small" 
                        appearance="subtle" 
                        icon={<ArrowUp20Regular />}
                        disabled={idx === 0}
                        onClick={() => moveRule(idx, 'up')}
                      />
                      <Button 
                        size="small" 
                        appearance="subtle" 
                        icon={<ArrowDown20Regular />}
                        disabled={idx === rules.length - 1}
                        onClick={() => moveRule(idx, 'down')}
                      />
                    </div>
                    <Switch 
                      checked={rule.enabled} 
                      onChange={() => toggleRule(idx)}
                    />
                    <Text style={{ flex: 1 }}>{rule.label}</Text>
                  </div>
                ))}
              </div>
              
              <Divider style={{ margin: `${tokens.spacingVerticalM} 0` }} />
              
              <Text weight="semibold">Group Pull Priority (per target group)</Text>
              <Text size={200}>When filling gaps in a group, people are pulled from source groups in the order shown. The target group's own people are tried first by default.</Text>
              
              <Accordion multiple collapsible>
                {groupSourcePriorities.map((targetPriority, targetIdx) => (
                  <AccordionItem key={targetPriority.targetGroupId} value={String(targetPriority.targetGroupId)}>
                    <AccordionHeader>
                      <Text weight="semibold">{targetPriority.targetGroupName}</Text>
                    </AccordionHeader>
                    <AccordionPanel>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, paddingLeft: tokens.spacingHorizontalS }}>
                        {targetPriority.sources.map((source, sourceIdx) => (
                          <div 
                            key={source.groupId} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: tokens.spacingHorizontalS,
                              padding: tokens.spacingHorizontalXS,
                              backgroundColor: source.groupId === targetPriority.targetGroupId 
                                ? tokens.colorBrandBackground2 
                                : tokens.colorNeutralBackground3,
                              borderRadius: tokens.borderRadiusSmall,
                            }}
                          >
                            <Text size={200} style={{ width: '20px', color: tokens.colorNeutralForeground3 }}>
                              {sourceIdx + 1}.
                            </Text>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <Button 
                                size="small" 
                                appearance="subtle" 
                                icon={<ArrowUp20Regular />}
                                disabled={sourceIdx === 0}
                                onClick={() => moveSource(targetIdx, sourceIdx, 'up')}
                              />
                              <Button 
                                size="small" 
                                appearance="subtle" 
                                icon={<ArrowDown20Regular />}
                                disabled={sourceIdx === targetPriority.sources.length - 1}
                                onClick={() => moveSource(targetIdx, sourceIdx, 'down')}
                              />
                            </div>
                            <Text size={300} style={{ flex: 1 }}>
                              {source.groupName}
                              {source.groupId === targetPriority.targetGroupId && (
                                <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: tokens.spacingHorizontalXS }}>
                                  (same group)
                                </Text>
                              )}
                            </Text>
                          </div>
                        ))}
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave}>Save</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
