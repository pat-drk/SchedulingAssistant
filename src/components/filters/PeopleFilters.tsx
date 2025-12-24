import React from "react";
import { Input, Checkbox, Dropdown, Option, makeStyles, tokens, Label, Button } from "@fluentui/react-components";

export type Gender = "" | "Brother" | "Sister";
export type Enrollment = "full-time" | "commuter" | string;

export interface PeopleFiltersState {
  text: string;
  activeOnly: boolean;
  gender: Gender; // Brother/Sister
  enrollment: Set<Enrollment>; // empty means all
  availDays: Set<1 | 2 | 3 | 4 | 5>; // ISO weekday 1-5
  availMode: "any" | "all" | "only"; // any of selected days, all of them, or only those days
}

export const defaultPeopleFilters: PeopleFiltersState = {
  text: "",
  activeOnly: false,
  gender: "",
  enrollment: new Set<Enrollment>(),
  availDays: new Set<1 | 2 | 3 | 4 | 5>(),
  availMode: "any",
};

const genderLabel = (gender: Gender) => {
  switch (gender) {
    case "Brother":
      return "Brother";
    case "Sister":
      return "Sister";
    default:
      return "All";
  }
};

const availModeLabels: Record<PeopleFiltersState["availMode"], string> = {
  any: "Any selected days",
  all: "All selected days",
  only: "Only selected days",
};

export function freshPeopleFilters(overrides: Partial<PeopleFiltersState> = {}): PeopleFiltersState {
  return {
    text: "",
    activeOnly: false,
    gender: "",
    enrollment: new Set<Enrollment>(),
    availDays: new Set<1 | 2 | 3 | 4 | 5>(),
    availMode: "any",
    ...overrides,
  };
}

// Serialize filters for localStorage
function serializeFilters(state: PeopleFiltersState): string {
  return JSON.stringify({
    text: state.text,
    activeOnly: state.activeOnly,
    gender: state.gender,
    enrollment: [...state.enrollment],
    availDays: [...state.availDays],
    availMode: state.availMode,
  });
}

// Deserialize filters from localStorage
function deserializeFilters(json: string): PeopleFiltersState | null {
  try {
    const data = JSON.parse(json);
    return {
      text: data.text ?? "",
      activeOnly: data.activeOnly ?? false,
      gender: data.gender ?? "",
      enrollment: new Set(data.enrollment ?? []),
      availDays: new Set(data.availDays ?? []),
      availMode: data.availMode ?? "any",
    };
  } catch {
    return null;
  }
}

// Hook to persist filters to localStorage
export function usePersistentFilters(storageKey: string): [PeopleFiltersState, (next: Partial<PeopleFiltersState>) => void] {
  const [filters, setFiltersInternal] = React.useState<PeopleFiltersState>(() => {
    if (typeof window === "undefined") return freshPeopleFilters();
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = deserializeFilters(stored);
      if (parsed) return parsed;
    }
    return freshPeopleFilters();
  });

  const setFilters = React.useCallback((next: Partial<PeopleFiltersState>) => {
    setFiltersInternal((prev) => {
      const updated = { ...prev, ...next };
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, serializeFilters(updated));
      }
      return updated;
    });
  }, [storageKey]);

  return [filters, setFilters];
}

export function filterPeopleList<T extends Record<string, any>>(people: T[], state: PeopleFiltersState): T[] {
  const low = state.text.trim().toLowerCase();
  const days = [1, 2, 3, 4, 5] as const; // Mon..Fri
  const dayKey: Record<number, keyof T> = {
    1: "avail_mon" as keyof T,
    2: "avail_tue" as keyof T,
    3: "avail_wed" as keyof T,
    4: "avail_thu" as keyof T,
    5: "avail_fri" as keyof T,
  };

  return people
    // Active
    .filter((p) => !state.activeOnly || Boolean((p as any).active))
    // Gender
    .filter((p) => (state.gender ? String((p as any).brother_sister || "") === state.gender : true))
    // Enrollment (empty set -> no restriction)
    .filter((p) => {
      if (!state.enrollment || state.enrollment.size === 0) return true;
      const enroll: Enrollment = (p as any).commuter ? "commuter" : "full-time";
      return state.enrollment.has(enroll);
    })
    // Availability day filter
    .filter((p) => {
      const selected = state.availDays || new Set<number>();
      if (selected.size === 0) return true;
      const isAvail = (val: any) => String(val || "U").toUpperCase() !== "U"; // AM/PM/B count as available
      const personAvail = new Set<number>();
      for (const d of days) {
        const v = (p as any)[dayKey[d] as any];
        if (isAvail(v)) personAvail.add(d);
      }
      if (state.availMode === "all") {
        // All selected days must be available
        for (const d of selected) if (!personAvail.has(d)) return false;
        return true;
      }
      if (state.availMode === "only") {
        // Available on exactly the selected days
        for (const d of selected) if (!personAvail.has(d)) return false;
        return personAvail.size === selected.size;
      }
      // any
      for (const d of selected) if (personAvail.has(d)) return true;
      return false;
    })
    // Text search
    .filter((p) => {
      if (!low) return true;
      const hay = [
        (p as any).first_name,
        (p as any).last_name,
        (p as any).email,
        (p as any).brother_sister,
        (p as any).commuter ? "commuter" : "",
        (p as any).active ? "active" : "",
        (p as any).avail_mon,
        (p as any).avail_tue,
        (p as any).avail_wed,
        (p as any).avail_thu,
        (p as any).avail_fri,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(low);
    });
}

const useStyles = makeStyles({
  bar: { display: "grid", gap: tokens.spacingVerticalS, width: "100%" },
  topRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
  grow: { flex: 1, minWidth: "240px" },
  field: { width: "100%" },
  advanced: {
    display: "grid",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusLarge,
  },
  group: { display: "grid", gap: tokens.spacingHorizontalXS },
  row: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
});

export function PeopleFiltersBar({
  state,
  onChange,
  showText = true,
  showActive = true,
  showGender = true,
  showEnrollment = true,
  showAvailability = true,
  textPlaceholder = "Filter people...",
}: {
  state: PeopleFiltersState;
  onChange: (next: Partial<PeopleFiltersState>) => void;
  showText?: boolean;
  showActive?: boolean;
  showGender?: boolean;
  showEnrollment?: boolean;
  showAvailability?: boolean;
  textPlaceholder?: string;
}) {
  const s = useStyles();
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  return (
    <div className={s.bar}>
      <div className={s.topRow}>
        {showText && (
          <Input
            className={s.grow}
            placeholder={textPlaceholder}
            value={state.text}
            onChange={(_, d) => onChange({ text: d.value })}
          />
        )}
        {showActive && (
          <Checkbox
            label="Active only"
            checked={state.activeOnly}
            onChange={(_, d) => onChange({ activeOnly: !!d.checked })}
          />
        )}
        {(showGender || showEnrollment || showAvailability) && (
          <Button onClick={() => setShowAdvanced((v) => !v)} appearance="secondary">
            {showAdvanced ? "Hide filters" : "More filters"}
          </Button>
        )}
      </div>
      {showAdvanced && (
        <div className={s.advanced}>
          {showGender && (
            <div className={s.group}>
              <Label>Gender</Label>
              <Dropdown
                className={s.field}
                placeholder="All"
                selectedOptions={state.gender ? [state.gender] : []}
                value={genderLabel(state.gender)}
                onOptionSelect={(_, data) => onChange({ gender: (data.optionValue as Gender) || "" })}
              >
                <Option value="" text="All">All</Option>
                <Option value="Brother" text="Brother">Brother</Option>
                <Option value="Sister" text="Sister">Sister</Option>
              </Dropdown>
            </div>
          )}
          {showEnrollment && (
            <div className={s.group}>
              <Label>Enrollment</Label>
              <div className={s.row}>
                <Checkbox
                  label="Full-Time"
                  checked={state.enrollment?.has("full-time")}
                  onChange={(_, d) => {
                    const next = new Set(state.enrollment || []);
                    if (d.checked) next.add("full-time"); else next.delete("full-time");
                    onChange({ enrollment: next });
                  }}
                />
                <Checkbox
                  label="Commuter"
                  checked={state.enrollment?.has("commuter")}
                  onChange={(_, d) => {
                    const next = new Set(state.enrollment || []);
                    if (d.checked) next.add("commuter"); else next.delete("commuter");
                    onChange({ enrollment: next });
                  }}
                />
              </div>
            </div>
          )}
          {showAvailability && (
            <div className={s.group}>
              <Label>Availability</Label>
              <Dropdown
                className={s.field}
                selectedOptions={[state.availMode]}
                value={availModeLabels[state.availMode]}
                onOptionSelect={(_, data) => onChange({ availMode: (data.optionValue as "any" | "all" | "only") || "any" })}
              >
                <Option value="any" text="Any selected days">Any selected days</Option>
                <Option value="all" text="All selected days">All selected days</Option>
                <Option value="only" text="Only selected days">Only selected days</Option>
              </Dropdown>
              <div className={s.row}>
                {[
                  { key: 1 as const, label: "Mon" },
                  { key: 2 as const, label: "Tue" },
                  { key: 3 as const, label: "Wed" },
                  { key: 4 as const, label: "Thu" },
                  { key: 5 as const, label: "Fri" },
                ].map((d) => (
                  <Checkbox
                    key={d.key}
                    label={d.label}
                    checked={state.availDays?.has(d.key)}
                    onChange={(_, data) => {
                      const next = new Set(state.availDays || []);
                      if (data.checked) next.add(d.key); else next.delete(d.key);
                      onChange({ availDays: next });
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PeopleFiltersBar;
