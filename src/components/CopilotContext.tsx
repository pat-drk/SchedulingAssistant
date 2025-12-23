import * as React from "react";
import { makeStyles } from "@fluentui/react-components";

const useStyles = makeStyles({
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
  },
});

interface CopilotContextProps {
  activeTab?: string;
  selectedDate?: string;
  activeRunSegment?: string;
  peopleCount?: number;
  assignmentsCount?: number;
  statusMessage?: string;
}

/**
 * CopilotContext Component
 * Renders hidden semantic content that Edge Copilot can read to understand the application state.
 * This component is always rendered (even in non-Edge browsers) to ensure context is available
 * if users manually open Copilot.
 */
export default function CopilotContext({
  activeTab = "Unknown",
  selectedDate = "Not selected",
  activeRunSegment = "Not selected",
  peopleCount = 0,
  assignmentsCount = 0,
  statusMessage = "",
}: CopilotContextProps) {
  const styles = useStyles();
  
  return (
    <div
      className={styles.visuallyHidden}
      aria-hidden="true"
    >
      {/* Dynamic Application State */}
      <div id="app-state">
        <h1>Scheduling Assistant - Current Application State</h1>
        <p>Current View: {activeTab}</p>
        <p>Selected Date: {selectedDate}</p>
        <p>Active Segment: {activeRunSegment}</p>
        <p>Total People Loaded: {peopleCount}</p>
        <p>Assignments in Current View: {assignmentsCount}</p>
        {statusMessage && <p>Status: {statusMessage}</p>}
      </div>

      {/* Complete Documentation Content */}
      <div id="full-documentation">
        <h1>SCHEDULING ASSISTANT - COMPLETE USER DOCUMENTATION</h1>

        <h2>1. GETTING STARTED</h2>
        <p>
          This application is a Teams Shifts Scheduling Assistant that helps manage staff schedules.
        </p>
        <ul>
          <li>First run: Click "New DB" to create a local SQLite database or "Open DB" to load an existing one.</li>
          <li>Use "Save As" to write the .db file to a shared folder. Only one editor at a time.</li>
          <li>Add People in the People tab and set Baseline Needs.</li>
          <li>Assign roles in the Daily Run board. The app warns on availability and training issues.</li>
          <li>Export date range to Microsoft Teams Shifts format.</li>
        </ul>

        <h2>2. NAVIGATION TABS</h2>
        <ul>
          <li>Daily Run (📅): Daily scheduling and segment switching. This is where you assign people to roles for each day.</li>
          <li>People (👥): Staff roster and availability profiles. Manage who is available and when.</li>
          <li>Training (📚): Qualification and training matrix. Track who is trained for which roles.</li>
          <li>Baseline (📋): Standard staffing requirements. Set how many people you need for each role.</li>
          <li>Export (📤): Teams XLSX generation. Export schedules to import into Microsoft Teams.</li>
          <li>Monthly Defaults: Set recurring monthly assignment patterns.</li>
          <li>History: View historical crew assignments.</li>
          <li>Admin: Administrative settings and configuration.</li>
        </ul>

        <h2>3. TOP BAR CONTROLS</h2>
        <ul>
          <li>New DB: Start a fresh database in memory (unsaved until you save)</li>
          <li>Open DB: Load an existing .db file from disk</li>
          <li>Save: Commit changes to the currently open file</li>
          <li>Save As: Save to a new file location</li>
          <li>Help: Open the documentation</li>
        </ul>

        <h2>4. DAILY RUN BOARD</h2>
        <p>The Daily Run Board is the main scheduling interface:</p>
        <ul>
          <li>Use the date picker to select which day to schedule</li>
          <li>Switch between segments (Early, AM, Lunch, PM) using the segment tabs</li>
          <li>Each group (Dining Room, Kitchen, etc.) shows roles that need to be filled</li>
          <li>Click on a role card to assign people</li>
          <li>People are filtered by availability and training status</li>
          <li>Warnings appear for untrained assignments or scheduling conflicts</li>
          <li>The "Needs" button shows required staffing levels</li>
        </ul>

        <h2>5. PEOPLE MANAGEMENT</h2>
        <p>In the People tab you can:</p>
        <ul>
          <li>Add new staff members with their contact info</li>
          <li>Set Start Date (required for trainee tracking)</li>
          <li>Set End Date when a person leaves the organization</li>
          <li>Set whether they are a Brother or Sister</li>
          <li>Mark if they are a Commuter</li>
          <li>Set their weekly availability pattern (AM, PM, Both, or Unavailable for each weekday)</li>
          <li>Assign role qualifications/training</li>
        </ul>

        <h2>6. TRAINING MATRIX</h2>
        <p>The Training tab shows:</p>
        <ul>
          <li>Trainee Dashboard: Track new employees in their first 6 months</li>
          <li>Training Status Cards with progress bars for each trainee</li>
          <li>Training areas: Dining Room, Machine Room, Veggie Room, Receiving</li>
          <li>Click on training areas to manually override completion status</li>
          <li>Overridden areas show a "Manual" badge</li>
          <li>Training Alerts for at-risk trainees approaching 6-month mark</li>
          <li>Suggested Assignments recommend next training area</li>
          <li>Export Training Progress Report as HTML</li>
          <li>Role qualifications matrix showing who is qualified for each role</li>
          <li>Bulk edit qualifications for multiple people</li>
        </ul>

        <h2>7. BASELINE NEEDS</h2>
        <p>Set the default staffing requirements:</p>
        <ul>
          <li>For each group and role, specify how many people are needed</li>
          <li>These are the baseline numbers used when no override is set</li>
          <li>You can override these for specific dates in the Daily Run view</li>
        </ul>

        <h2>8. EXPORT TO TEAMS</h2>
        <p>The Export tab allows you to:</p>
        <ul>
          <li>Select a date range to export</li>
          <li>Preview the shifts that will be generated</li>
          <li>Export to XLSX format compatible with Microsoft Teams Shifts import</li>
          <li>Each assignment becomes a shift with proper start/end times</li>
        </ul>

        <h2>9. MONTHLY DEFAULTS</h2>
        <p>Set recurring patterns:</p>
        <ul>
          <li>Assign people to default roles for each segment</li>
          <li>These patterns repeat each month</li>
          <li>You can set day-of-week overrides (e.g., different assignment on Mondays)</li>
          <li>You can set week-by-week overrides for specific weeks of the month</li>
          <li>Use "Trainees only" filter to focus on new employees</li>
          <li>Trainee rows show badges and tooltips with incomplete training areas</li>
          <li>Copy patterns from previous months</li>
          <li>Apply monthly defaults to generate actual assignments</li>
        </ul>

        <h2>10. SEGMENTS AND TIMING</h2>
        <p>The app uses configurable segments:</p>
        <ul>
          <li>Early: Early morning shift (e.g., 6:00 AM - 8:00 AM)</li>
          <li>AM: Morning segment (e.g., 8:00 AM - 12:00 PM)</li>
          <li>Lunch: Midday segment (e.g., 11:30 AM - 1:30 PM)</li>
          <li>PM: Afternoon segment (e.g., 12:00 PM - 5:00 PM)</li>
        </ul>
        <p>Segment times can be configured in Admin settings.</p>

        <h2>11. AVAILABILITY CODES</h2>
        <ul>
          <li>U: Unavailable</li>
          <li>AM: Available mornings only</li>
          <li>PM: Available afternoons only</li>
          <li>B: Both (available all day)</li>
        </ul>

        <h2>12. TIME OFF</h2>
        <ul>
          <li>Time off blocks prevent assignments during those periods</li>
          <li>Partial overlaps will split shifts around the time off</li>
          <li>Time off can be imported from CSV</li>
        </ul>

        <h2>13. MULTI-USER SYNC</h2>
        <ul>
          <li>Multiple users can edit the database simultaneously</li>
          <li>When you open a file, enter your email to identify your changes</li>
          <li>Changes from other users are automatically merged in the background (every 30 seconds)</li>
          <li>If conflicts are detected (same field edited by multiple users), a dialog helps you resolve them</li>
          <li>The sync indicator shows current sync state and who else is editing</li>
          <li>No more waiting for locks - true collaborative editing</li>
        </ul>

        <h2>14. TRAINEE TRACKING SYSTEM</h2>
        <ul>
          <li>New employees in their first 6 months are tracked as trainees</li>
          <li>Set the Start Date in a person's profile to enable trainee tracking</li>
          <li>Training areas: Dining Room, Machine Room, Veggie Room, Receiving</li>
          <li>Training Status Cards show progress for each trainee</li>
          <li>Training Alerts warn about at-risk trainees approaching their 6-month mark</li>
          <li>Suggested Assignments recommend which area to assign trainees next</li>
          <li>Export Training Progress Report as HTML summary</li>
          <li>Manually override training area completion by clicking on the area item</li>
          <li>Overridden areas show a "Manual" badge</li>
        </ul>

        <h2>15. TROUBLESHOOTING</h2>
        <ul>
          <li>If export fails, check if your network blocks the SheetJS CDN</li>
          <li>If the database won't open, ensure it's a valid SQLite file</li>
          <li>If sync conflicts appear, choose "Keep Yours", "Keep Theirs", or "Keep Both"</li>
          <li>If trainee doesn't appear in dashboard, check that Start Date is set</li>
          <li>Email prompt appears each time you open a file - this is normal for sync identification</li>
          <li>Refresh the page if the app becomes unresponsive</li>
        </ul>

        <h2>16. AI ACTIONS MENU</h2>
        <p>Click the AI Actions button (sparkle icon) for helpful prompts:</p>
        <ul>
          <li>Help me understand this view: Explains the current page and features</li>
          <li>How do I make an assignment?: Step-by-step guidance for assigning roles</li>
          <li>How do I navigate the app?: Navigation help between sections</li>
          <li>Something isn't working: Troubleshooting assistance</li>
          <li>What can I do here?: Lists available features on current page</li>
        </ul>

        <h2>17. KEYBOARD SHORTCUTS</h2>
        <ul>
          <li>Ctrl+Shift+. (or Cmd+Shift+. on Mac): Open Edge Copilot sidebar</li>
          <li>Standard browser shortcuts work normally</li>
        </ul>

        <h2>18. GROUPS AND ROLES</h2>
        <p>Groups organize roles:</p>
        <ul>
          <li>Dining Room: Front of house roles</li>
          <li>Kitchen: Back of house roles</li>
        </ul>
        <p>Each group has multiple roles with specific staffing needs. Roles can be configured to appear in specific segments only.</p>

        <h2>APPLICATION PURPOSE</h2>
        <p>
          This is a specialized staff scheduling application designed for managing daily assignments
          across multiple time segments. It helps coordinators assign staff to various roles while
          respecting availability constraints, training requirements, and time-off requests. The app
          exports schedules to Microsoft Teams Shifts format for easy integration with the Teams platform.
        </p>

        <h2>KEY FEATURES SUMMARY</h2>
        <ul>
          <li>Multi-user sync: Multiple users can edit simultaneously with automatic conflict resolution</li>
          <li>Multi-segment scheduling: Manage Early, AM, Lunch, and PM shifts</li>
          <li>Trainee tracking: 6-month rotation management across training areas with progress tracking</li>
          <li>Training tracking: Ensure staff are qualified for assigned roles with manual override capability</li>
          <li>Availability management: Track when staff are available (AM, PM, Both, or Unavailable)</li>
          <li>Time-off integration: Import and respect time-off requests</li>
          <li>Conflict detection: Warns about scheduling conflicts and availability issues</li>
          <li>Monthly templates: Set default assignments with weekday and week-by-week overrides</li>
          <li>AI Actions menu: Tutorial and troubleshooting prompts to help navigate the app</li>
          <li>Teams export: Generate XLSX files for Microsoft Teams Shifts import</li>
          <li>Local database: All data stored locally in SQLite for privacy and control</li>
        </ul>
      </div>
    </div>
  );
}
