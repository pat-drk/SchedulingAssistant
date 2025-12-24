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
  Text,
} from "@fluentui/react-components";
import type { WeekStartMode } from "../utils/weekCalculation";
import { logger } from "../utils/logger";

interface WeekCalculationSettingsProps {
  open: boolean;
  onClose: () => void;
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
}

export default function WeekCalculationSettings({ open, onClose, all, run }: WeekCalculationSettingsProps) {
  const [mode, setMode] = useState<WeekStartMode>("first_monday");

  useEffect(() => {
    if (open) {
      // Load current setting from database
      try {
        const rows = all(`SELECT value FROM meta WHERE key='week_start_mode'`);
        if (rows.length > 0 && rows[0].value) {
          const value = rows[0].value;
          if (value === 'first_monday' || value === 'first_day') {
            setMode(value);
          }
        }
      } catch (e) {
        logger.error('Failed to load week_start_mode:', e);
      }
    }
  }, [open, all]);

  function handleSave() {
    try {
      run(
        `INSERT INTO meta (key, value) VALUES ('week_start_mode', ?) 
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [mode]
      );
    } catch (e) {
      logger.error('Failed to save week_start_mode:', e);
    }
    onClose();
  }

  const modeLabel = mode === "first_monday" 
    ? "First full workweek (First Monday)" 
    : "Calendar week (First day of month)";

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Week Calculation Settings</DialogTitle>
          <DialogContent>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Text>
                Choose how week numbers are calculated for week-by-week overrides in Monthly Defaults:
              </Text>
              <Dropdown
                selectedOptions={[mode]}
                value={modeLabel}
                onOptionSelect={(_, data) => setMode(data.optionValue as WeekStartMode)}
              >
                <Option value="first_monday" text="First full workweek (First Monday)">
                  First full workweek (First Monday)
                </Option>
                <Option value="first_day" text="Calendar week (First day of month)">
                  Calendar week (First day of month)
                </Option>
              </Dropdown>
              <div style={{ fontSize: "12px", color: "#666", marginTop: "8px" }}>
                {mode === "first_monday" ? (
                  <>
                    <strong>First Monday mode:</strong> Week 1 starts on the first Monday of the month. 
                    Days before the first Monday are not assigned a week number and won't receive week-based overrides.
                  </>
                ) : (
                  <>
                    <strong>First Day mode:</strong> Week 1 starts on the 1st of the month, regardless of the day of the week. 
                    Each week is a 7-day period starting from day 1, 8, 15, 22, and 29.
                  </>
                )}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave}>Save</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
