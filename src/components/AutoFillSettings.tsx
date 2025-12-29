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

// Load group priorities from database
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

interface AutoFillPrioritySettingsProps {
  open: boolean;
  onClose: () => void;
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
  groups: any[];
}

export function AutoFillPrioritySettings({ open, onClose, all, run, groups }: AutoFillPrioritySettingsProps) {
  const [rules, setRules] = useState<AutoFillRule[]>([]);
  const [groupPriorities, setGroupPriorities] = useState<AutoFillGroupPriority[]>([]);

  useEffect(() => {
    if (open) {
      setRules(loadAutoFillRules(all));
      setGroupPriorities(loadGroupPriorities(all, groups));
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

  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const newGroups = [...groupPriorities];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newGroups.length) return;
    [newGroups[index], newGroups[newIndex]] = [newGroups[newIndex], newGroups[index]];
    // Update priorities
    newGroups.forEach((g, i) => g.priority = i + 1);
    setGroupPriorities(newGroups);
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
    
    // Save group priorities
    for (const gp of groupPriorities) {
      run(
        `INSERT INTO autofill_group_priority (group_id, priority) VALUES (?, ?)
         ON CONFLICT(group_id) DO UPDATE SET priority = excluded.priority`,
        [gp.groupId, gp.priority]
      );
    }
    
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '500px' }}>
        <DialogBody>
          <DialogTitle>Auto-Fill Priority Settings</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}>
              <Text weight="semibold">Priority Rules</Text>
              <Text size={200}>Drag or use arrows to reorder. Higher priority rules are applied first.</Text>
              
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
              
              <Text weight="semibold">Group Pull Priority</Text>
              <Text size={200}>When pulling from overstaffed groups, groups higher in this list are tried first.</Text>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
                {groupPriorities.map((gp, idx) => (
                  <div 
                    key={gp.groupId} 
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
                        onClick={() => moveGroup(idx, 'up')}
                      />
                      <Button 
                        size="small" 
                        appearance="subtle" 
                        icon={<ArrowDown20Regular />}
                        disabled={idx === groupPriorities.length - 1}
                        onClick={() => moveGroup(idx, 'down')}
                      />
                    </div>
                    <Text style={{ flex: 1 }}>{gp.groupName}</Text>
                  </div>
                ))}
              </div>
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
