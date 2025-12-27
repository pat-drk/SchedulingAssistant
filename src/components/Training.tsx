import { useEffect, useState, useMemo } from "react";
import {
  Button,
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Body1,
  Caption1,
  Subtitle2,
  Badge,
  ProgressBar,
  Checkbox,
  Title3,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
} from "@fluentui/react-components";
import { CheckmarkCircle20Regular, Circle20Regular, Warning20Regular, Edit20Regular } from "@fluentui/react-icons";
import { 
  SIX_MONTHS_MS, 
  TWO_MONTHS_MS, 
  REQUIRED_TRAINING_AREAS,
  type RequiredArea,
  isInTrainingPeriod,
  weeksRemainingInTraining,
} from "../utils/trainingConstants";

interface TrainingProps {
  people: any[];
  roles: any[];
  groups: any[];
  all: (sql: string, params?: any[]) => any[];
  run: (sql: string, params?: any[]) => void;
}

const useTrainingStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  filterBar: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  alertsSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  alertsGrid: {
    display: "grid",
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  },
  alertCard: {
    padding: tokens.spacingHorizontalM,
  },
  traineesGrid: {
    display: "grid",
    gap: tokens.spacingHorizontalM,
    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
  },
  traineeCard: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  traineeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalS,
  },
  traineeName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  traineeMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  progressSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  checklistItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} 0`,
    cursor: "pointer",
    borderRadius: tokens.borderRadiusSmall,
    transition: "background-color 0.2s ease",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  checklistIcon: {
    flexShrink: 0,
  },
  checklistText: {
    flex: 1,
  },
  overrideBadge: {
    marginLeft: "auto",
  },
  suggestionsSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  suggestionItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  exportButton: {
    marginLeft: "auto",
  },
  emptyState: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: tokens.spacingVerticalXS,
  },
});

type TraineeData = {
  person: any;
  startDate: Date;
  endDate: Date | null;
  weeksRemaining: number;
  daysRemaining: number;
  isInTraining: boolean;
  completedAreas: Set<RequiredArea>;
  areasProgress: Map<RequiredArea, { lastMonth: string | null; completed: boolean; isOverride: boolean }>;
  completionPercentage: number;
  needsAttention: boolean;
  alertLevel: "danger" | "warning" | "info" | null;
  lastRotationDate: Date | null;
};

export default function Training({ people, roles, groups, all, run }: TrainingProps) {
  const s = useTrainingStyles();
  const [showInactiveTrainees, setShowInactiveTrainees] = useState(false);
  const [trainees, setTrainees] = useState<TraineeData[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<{
    personId: number;
    personName: string;
    area: RequiredArea;
    currentStatus: boolean;
  } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Calculate trainee data
  useEffect(() => {
    const now = new Date();
    const traineeData: TraineeData[] = [];

    // Get all manual overrides
    const overrides = all(
      `SELECT person_id, area, completed FROM training_area_override`,
      []
    );
    const overrideMap = new Map<number, Map<string, boolean>>();
    for (const override of overrides) {
      if (!overrideMap.has(override.person_id)) {
        overrideMap.set(override.person_id, new Map());
      }
      overrideMap.get(override.person_id)!.set(override.area, !!override.completed);
    }

    for (const person of people) {
      if (!person.start_date) continue;

      const startDate = new Date(person.start_date);
      const endDate = person.end_date ? new Date(person.end_date) : null;
      
      // Calculate if person is in first 6 months
      const isInTraining = isInTrainingPeriod(startDate, endDate, now);
      
      if (!isInTraining && !showInactiveTrainees) continue;

      const weeksRemaining = weeksRemainingInTraining(startDate, now);
      const daysRemaining = weeksRemaining * 7;

      // Get all monthly defaults for this person to determine area exposure
      const defaults = all(
        `SELECT md.month, md.segment, r.group_id, g.name as group_name
         FROM monthly_default_active md
         JOIN role_active r ON r.id = md.role_id
         JOIN grp_active g ON g.id = r.group_id
         WHERE md.person_id = ?
         ORDER BY md.month DESC`,
        [person.id]
      );

      // Also check assignment history
      const assignments = all(
        `SELECT DISTINCT strftime('%Y-%m', a.date) as month, r.group_id, g.name as group_name
         FROM assignment_active a
         JOIN role_active r ON r.id = a.role_id
         JOIN grp_active g ON g.id = r.group_id
         WHERE a.person_id = ?
         ORDER BY a.date DESC`,
        [person.id]
      );

      const completedAreas = new Set<RequiredArea>();
      const areasProgress = new Map<RequiredArea, { lastMonth: string | null; completed: boolean; isOverride: boolean }>();

      // Initialize all areas
      for (const area of REQUIRED_TRAINING_AREAS) {
        areasProgress.set(area, { lastMonth: null, completed: false, isOverride: false });
      }

      // Check defaults
      for (const def of defaults) {
        const groupName = def.group_name as string;
        if (REQUIRED_TRAINING_AREAS.includes(groupName as RequiredArea)) {
          const area = groupName as RequiredArea;
          const current = areasProgress.get(area);
          if (!current?.lastMonth || def.month > current.lastMonth) {
            areasProgress.set(area, { lastMonth: def.month, completed: true, isOverride: false });
          }
          completedAreas.add(area);
        }
      }

      // Check assignments
      for (const assign of assignments) {
        const groupName = assign.group_name as string;
        if (REQUIRED_TRAINING_AREAS.includes(groupName as RequiredArea)) {
          const area = groupName as RequiredArea;
          const current = areasProgress.get(area);
          if (!current?.lastMonth || assign.month > current.lastMonth) {
            areasProgress.set(area, { lastMonth: assign.month, completed: true, isOverride: false });
          }
          completedAreas.add(area);
        }
      }

      // Apply manual overrides (these take precedence)
      const personOverrides = overrideMap.get(person.id);
      if (personOverrides) {
        for (const area of REQUIRED_TRAINING_AREAS) {
          if (personOverrides.has(area)) {
            const overrideCompleted = personOverrides.get(area)!;
            const current = areasProgress.get(area);
            areasProgress.set(area, { 
              lastMonth: current?.lastMonth || null, 
              completed: overrideCompleted,
              isOverride: true
            });
            if (overrideCompleted) {
              completedAreas.add(area);
            } else {
              completedAreas.delete(area);
            }
          }
        }
      }

      // Get last rotation date
      let lastRotationDate: Date | null = null;
      if (defaults.length > 0) {
        const lastMonth = defaults[0].month;
        lastRotationDate = new Date(lastMonth + "-01");
      }
      if (assignments.length > 0) {
        const assignDate = new Date(assignments[0].month + "-01");
        if (!lastRotationDate || assignDate > lastRotationDate) {
          lastRotationDate = assignDate;
        }
      }

      const completionPercentage = (completedAreas.size / REQUIRED_TRAINING_AREAS.length) * 100;
      
      // Determine alert level
      let alertLevel: "danger" | "warning" | "info" | null = null;
      let needsAttention = false;

      if (isInTraining) {
        // Critical: 1 month remaining and incomplete areas
        if (weeksRemaining <= 4 && completedAreas.size < REQUIRED_TRAINING_AREAS.length) {
          alertLevel = "danger";
          needsAttention = true;
        }
        // Warning: Approaching 6 months and haven't completed all areas
        else if (weeksRemaining <= 8 && completedAreas.size < REQUIRED_TRAINING_AREAS.length) {
          alertLevel = "warning";
          needsAttention = true;
        }
        // Warning: Haven't rotated in 2+ months
        else if (lastRotationDate) {
          const timeSinceRotation = now.getTime() - lastRotationDate.getTime();
          if (timeSinceRotation >= TWO_MONTHS_MS) {
            alertLevel = "warning";
            needsAttention = true;
          }
        }
      }

      traineeData.push({
        person,
        startDate,
        endDate,
        weeksRemaining,
        daysRemaining,
        isInTraining,
        completedAreas,
        areasProgress,
        completionPercentage,
        needsAttention,
        alertLevel,
        lastRotationDate,
      });
    }

    // Sort: those needing attention first, then by weeks remaining
    traineeData.sort((a, b) => {
      if (a.needsAttention && !b.needsAttention) return -1;
      if (!a.needsAttention && b.needsAttention) return 1;
      if (a.alertLevel === "danger" && b.alertLevel !== "danger") return -1;
      if (a.alertLevel !== "danger" && b.alertLevel === "danger") return 1;
      return a.weeksRemaining - b.weeksRemaining;
    });

    setTrainees(traineeData);
  }, [people, all, showInactiveTrainees, refreshTrigger]);

  // Get trainees needing urgent attention
  const urgentTrainees = useMemo(
    () => trainees.filter((t) => t.isInTraining && t.alertLevel === "danger"),
    [trainees]
  );

  const warningTrainees = useMemo(
    () => trainees.filter((t) => t.isInTraining && t.alertLevel === "warning"),
    [trainees]
  );

  const activeTrainees = useMemo(
    () => trainees.filter((t) => t.isInTraining),
    [trainees]
  );

  // Export function
  const exportReport = () => {
    const lines: string[] = [];
    lines.push("<!DOCTYPE html>");
    lines.push("<html><head>");
    lines.push("<title>Training Progress Report</title>");
    lines.push("<style>");
    lines.push("body { font-family: Arial, sans-serif; padding: 20px; }");
    lines.push("table { border-collapse: collapse; width: 100%; margin-top: 20px; }");
    lines.push("th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }");
    lines.push("th { background-color: #f2f2f2; }");
    lines.push(".complete { color: green; }");
    lines.push(".incomplete { color: red; }");
    lines.push("</style>");
    lines.push("</head><body>");
    lines.push("<h1>Training Progress Report</h1>");
    lines.push(`<p>Generated on ${new Date().toLocaleDateString()}</p>`);
    lines.push(`<p>Total Trainees: ${activeTrainees.length}</p>`);
    
    lines.push("<table>");
    lines.push("<thead><tr>");
    lines.push("<th>Name</th>");
    lines.push("<th>Start Date</th>");
    lines.push("<th>Weeks Remaining</th>");
    lines.push("<th>Completion %</th>");
    lines.push("<th>Dining Room</th>");
    lines.push("<th>Machine Room</th>");
    lines.push("<th>Veggie Room</th>");
    lines.push("<th>Receiving</th>");
    lines.push("</tr></thead><tbody>");

    for (const trainee of activeTrainees) {
      lines.push("<tr>");
      lines.push(`<td>${trainee.person.last_name}, ${trainee.person.first_name}</td>`);
      lines.push(`<td>${trainee.startDate.toLocaleDateString()}</td>`);
      lines.push(`<td>${trainee.weeksRemaining}</td>`);
      lines.push(`<td>${Math.round(trainee.completionPercentage)}%</td>`);
      
      for (const area of REQUIRED_TRAINING_AREAS) {
        const completed = trainee.completedAreas.has(area);
        const className = completed ? "complete" : "incomplete";
        const text = completed ? "✓" : "✗";
        lines.push(`<td class="${className}">${text}</td>`);
      }
      lines.push("</tr>");
    }
    
    lines.push("</tbody></table>");
    lines.push("</body></html>");

    const html = lines.join("\n");
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-report-${new Date().toISOString().split("T")[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get suggested next area for a trainee
  const getSuggestedArea = (trainee: TraineeData): RequiredArea | null => {
    const incomplete = REQUIRED_TRAINING_AREAS.filter((area) => !trainee.completedAreas.has(area));
    if (incomplete.length === 0) return null;
    
    // Prioritize based on weeks remaining
    // If less time, suggest areas not yet started
    return incomplete[0];
  };

  // Handle area click to open confirmation dialog
  const handleAreaClick = (personId: number, personName: string, area: RequiredArea, currentStatus: boolean) => {
    setSelectedOverride({
      personId,
      personName,
      area,
      currentStatus,
    });
    setDialogOpen(true);
  };

  // Handle confirming the override
  const handleConfirmOverride = () => {
    if (!selectedOverride) return;

    const { personId, area, currentStatus } = selectedOverride;
    const newStatus = !currentStatus;
    const completedValue = newStatus ? 1 : 0;

    // Insert or update the override in the database
    run(
      `INSERT INTO training_area_override (person_id, area, completed) 
       VALUES (?, ?, ?) 
       ON CONFLICT(person_id, area) DO UPDATE SET completed = ?, created_at = datetime('now')`,
      [personId, area, completedValue, completedValue]
    );

    // Close dialog and reset state
    setDialogOpen(false);
    setSelectedOverride(null);

    // Trigger re-render to fetch updated data
    setRefreshTrigger(prev => prev + 1);
  };

  // Handle canceling the override
  const handleCancelOverride = () => {
    setDialogOpen(false);
    setSelectedOverride(null);
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.title}>Training Dashboard</div>
        <div className={s.subtitle}>
          Track new members in their first six months and ensure exposure to all four key areas
        </div>
      </div>

      <div className={s.filterBar}>
        <Checkbox
          label="Show completed training periods"
          checked={showInactiveTrainees}
          onChange={(_, data) => setShowInactiveTrainees(!!data.checked)}
        />
        <div style={{ flex: 1 }} />
        <Button appearance="primary" onClick={exportReport} disabled={activeTrainees.length === 0}>
          Export Report
        </Button>
      </div>

      {/* Alerts Section */}
      {(urgentTrainees.length > 0 || warningTrainees.length > 0) && (
        <div className={s.alertsSection}>
          <Subtitle2>Training Alerts</Subtitle2>
          <div className={s.alertsGrid}>
            {urgentTrainees.length > 0 && (
              <Card className={s.alertCard}>
                <CardHeader
                  header={
                    <Badge appearance="filled" color="danger">
                      Urgent Attention Needed
                    </Badge>
                  }
                  description={
                    <Caption1>
                      {urgentTrainees.length} trainee{urgentTrainees.length > 1 ? "s" : ""} with 1 month or less
                      remaining and incomplete areas
                    </Caption1>
                  }
                />
                <Body1>
                  {urgentTrainees.map((t) => (
                    <div key={t.person.id}>
                      {t.person.last_name}, {t.person.first_name} ({t.weeksRemaining} weeks left)
                    </div>
                  ))}
                </Body1>
              </Card>
            )}
            
            {warningTrainees.length > 0 && (
              <Card className={s.alertCard}>
                <CardHeader
                  header={
                    <Badge appearance="filled" color="warning">
                      Needs Attention
                    </Badge>
                  }
                  description={
                    <Caption1>
                      {warningTrainees.length} trainee{warningTrainees.length > 1 ? "s" : ""} approaching deadline or
                      need rotation
                    </Caption1>
                  }
                />
                <Body1>
                  {warningTrainees.slice(0, 5).map((t) => (
                    <div key={t.person.id}>
                      {t.person.last_name}, {t.person.first_name} ({t.weeksRemaining} weeks left)
                    </div>
                  ))}
                  {warningTrainees.length > 5 && <div>...and {warningTrainees.length - 5} more</div>}
                </Body1>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Trainees Grid */}
      {activeTrainees.length === 0 ? (
        <div className={s.emptyState}>
          <Title3>No active trainees</Title3>
          <Caption1>
            Workers will appear here when they have a start date within the last 6 months
          </Caption1>
        </div>
      ) : (
        <>
          <Subtitle2>
            Current Trainees ({activeTrainees.length})
          </Subtitle2>
          <div className={s.traineesGrid}>
            {activeTrainees.map((trainee) => {
              const suggestedArea = getSuggestedArea(trainee);
              
              return (
                <Card key={trainee.person.id} className={s.traineeCard}>
                  <div className={s.traineeHeader}>
                    <div>
                      <div className={s.traineeName}>
                        {trainee.person.last_name}, {trainee.person.first_name}
                      </div>
                      <div className={s.traineeMeta}>
                        Started: {trainee.startDate.toLocaleDateString()}
                      </div>
                      <div className={s.traineeMeta}>
                        {trainee.weeksRemaining} weeks remaining in training period
                      </div>
                    </div>
                    {trainee.alertLevel && (
                      <Badge appearance="filled" color={trainee.alertLevel}>
                        {trainee.alertLevel === "danger" ? "Urgent" : "Warning"}
                      </Badge>
                    )}
                  </div>

                  <div className={s.progressSection}>
                    <Caption1>Training Progress</Caption1>
                    <ProgressBar
                      value={trainee.completionPercentage / 100}
                      color={
                        trainee.completionPercentage === 100
                          ? "success"
                          : trainee.completionPercentage >= 50
                          ? "brand"
                          : "warning"
                      }
                    />
                    <div className={s.statsRow}>
                      <Caption1>
                        {trainee.completedAreas.size} of {REQUIRED_TRAINING_AREAS.length} areas completed
                      </Caption1>
                      <Caption1>{Math.round(trainee.completionPercentage)}%</Caption1>
                    </div>
                  </div>

                  <div className={s.progressSection}>
                    <Caption1>Required Areas</Caption1>
                    {REQUIRED_TRAINING_AREAS.map((area) => {
                      const completed = trainee.completedAreas.has(area);
                      const progress = trainee.areasProgress.get(area);
                      const isOverride = progress?.isOverride || false;
                      return (
                        <div 
                          key={area} 
                          className={s.checklistItem}
                          onClick={() => handleAreaClick(trainee.person.id, `${trainee.person.last_name}, ${trainee.person.first_name}`, area, completed)}
                          title="Click to manually override"
                        >
                          <div className={s.checklistIcon}>
                            {completed ? (
                              <CheckmarkCircle20Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                            ) : (
                              <Circle20Regular style={{ color: tokens.colorNeutralForeground3 }} />
                            )}
                          </div>
                          <div className={s.checklistText}>
                            <Body1>{area}</Body1>
                            {progress?.lastMonth && (
                              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                                Last assigned: {progress.lastMonth}
                              </Caption1>
                            )}
                          </div>
                          {isOverride && (
                            <Badge 
                              appearance="tint" 
                              color="informative"
                              size="small"
                              className={s.overrideBadge}
                              icon={<Edit20Regular />}
                            >
                              Manual
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {suggestedArea && (
                    <div className={s.suggestionsSection}>
                      <Caption1 style={{ fontWeight: tokens.fontWeightSemibold }}>
                        <Warning20Regular style={{ verticalAlign: "middle", marginRight: tokens.spacingHorizontalXS }} />
                        Suggested Next Assignment
                      </Caption1>
                      <Body1>Assign to <strong>{suggestedArea}</strong> to continue training</Body1>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Confirm Training Area Override</DialogTitle>
            <DialogContent>
              {selectedOverride && (
                <div>
                  <Body1>
                    Are you sure you want to mark <strong>{selectedOverride.area}</strong> as{" "}
                    <strong>{selectedOverride.currentStatus ? "incomplete" : "complete"}</strong> for{" "}
                    <strong>{selectedOverride.personName}</strong>?
                  </Body1>
                  <br />
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                    This will override the automatic detection based on monthly defaults and assignments.
                    The manual override will be indicated with a badge.
                  </Caption1>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={handleCancelOverride}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleConfirmOverride}>
                Confirm
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
