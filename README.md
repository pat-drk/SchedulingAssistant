# NewScheduler

## Migrations

Opening an older database will automatically rename Buffet AM/PM roles to Dining Room, while the Lunch "Buffet Supervisor" role remains unchanged.

## Adjusting scheduling parameters

Administrative settings are available directly in the application and are saved to the active SQLite database immediately. To change scheduling behaviour without editing code:

1. Load or create a database and open the **Admin** tab. 
2. Use the **Segments** panel to add or edit time segments. Start and end times must be entered in `HH:MM` format and the list is ordered by the numeric *Order* field.
3. Manage **Groups** and **Roles** with the corresponding panels. Each form validates required fields and will prompt before deleting records.
4. Configure **Export Groups** to control export codes, colors and column groupings for each group.
5. Use **Segment Adjustments** to define conditional time offsets. Rules can shift the start or end of a segment when another segment has assignments. Each rule can optionally require a specific role in the condition segment, and the editor includes a visual preview showing how the rule will change segment times. Default rules are included for Lunch and Early shifts.

All changes are written to the database immediately using the built in SQL helpers, so reopening the database will reflect the updates without further code changes.

