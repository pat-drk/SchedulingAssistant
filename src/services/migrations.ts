type Database = any; // loose type to avoid dependency on sql.js types at build time
import { GROUPS, ROLE_SEED } from '../config/domain';

export type Migration = (db: Database) => void;

export const migrate3RenameBuffetToDiningRoom: Migration = (db) => {
  db.run(`UPDATE grp SET name='Dining Room' WHERE name='Buffet';`);
  db.run(
    `UPDATE role SET code='DR', name=REPLACE(name,'Buffet','Dining Room') WHERE group_id=(SELECT id FROM grp WHERE name='Dining Room') AND segments<>'["Lunch"]';`
  );
};

export const migrate4AddSegments: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS segment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      ordering INTEGER NOT NULL UNIQUE
    );`);
  db.run(`INSERT INTO segment (name, start_time, end_time, ordering) VALUES
      ('Early','06:20','07:20',0),
      ('AM','08:00','11:00',1),
      ('Lunch','11:00','13:00',2),
      ('PM','14:00','17:00',3)
    ON CONFLICT(name) DO NOTHING;`);
};

export const migrate5AddGroupTheme: Migration = (db) => {
  try {
    db.run(`ALTER TABLE grp RENAME COLUMN theme_color TO theme;`);
  } catch {}
  try {
    db.run(`ALTER TABLE grp ADD COLUMN custom_color TEXT;`);
  } catch {}
};

export const migrate11AddTrainingSource: Migration = (db) => {
  try {
    const info = db.exec(`PRAGMA table_info(training);`);
    const hasSource = Array.isArray(info) && info[0]?.values?.some((r: any[]) => r[1] === 'source');
    if (!hasSource) {
      db.run(`CREATE TABLE training_new (
        person_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        status TEXT CHECK(status IN ('Not trained','In training','Qualified')) NOT NULL DEFAULT 'Not trained',
        source TEXT CHECK(source IN ('manual','monthly')) NOT NULL DEFAULT 'manual',
        PRIMARY KEY (person_id, role_id),
        FOREIGN KEY (person_id) REFERENCES person(id),
        FOREIGN KEY (role_id) REFERENCES role(id)
      );`);
      db.run(`INSERT INTO training_new (person_id, role_id, status, source)
              SELECT person_id, role_id, status, 'manual' AS source FROM training;`);
      db.run(`DROP TABLE training;`);
      db.run(`ALTER TABLE training_new RENAME TO training;`);
    }
  } catch (e) {
    console.error('migrate11AddTrainingSource failed:', e);
    throw e;
  }
};

// 12. Add table for monthly default notes
export const migrate12AddMonthlyNotes: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS monthly_default_note (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      note TEXT,
      UNIQUE(month, person_id),
      FOREIGN KEY (person_id) REFERENCES person(id)
    );`);
};

export const migrate13AddAvailabilityOverride: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS availability_override (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      avail TEXT CHECK(avail IN ('U','AM','PM','B')) NOT NULL,
      UNIQUE(person_id, date),
      FOREIGN KEY (person_id) REFERENCES person(id)
    );`);
};

export const migrate14AddSegmentAdjustment: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS segment_adjustment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condition_segment TEXT NOT NULL,
      target_segment TEXT NOT NULL,
      target_field TEXT CHECK(target_field IN ('start','end')) NOT NULL,
      baseline TEXT CHECK(baseline IN ('condition.start','condition.end','target.start','target.end')) NOT NULL,
      offset_minutes INTEGER NOT NULL DEFAULT 0
    );`);
  db.run(`INSERT INTO segment_adjustment (condition_segment,target_segment,target_field,baseline,offset_minutes) VALUES
      ('Lunch','AM','end','condition.start',0),
      ('Lunch','PM','start','condition.end',60),
      ('Early','PM','end','target.end',-60)
    `);
};

export const migrate15AddSegmentAdjustmentRole: Migration = (db) => {
  try {
    db.run(`ALTER TABLE segment_adjustment ADD COLUMN condition_role_id INTEGER REFERENCES role(id);`);
  } catch {}
};

export const migrate16AddCompetency: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS competency (
      person_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating BETWEEN 1 AND 5) NOT NULL,
      PRIMARY KEY (person_id, role_id),
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);
};

export const migrate17AddPersonQuality: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS person_quality (
      person_id INTEGER PRIMARY KEY,
      work_capabilities INTEGER CHECK(work_capabilities BETWEEN 1 AND 5),
      work_habits INTEGER CHECK(work_habits BETWEEN 1 AND 5),
      spirituality INTEGER CHECK(spirituality BETWEEN 1 AND 5),
      dealings_with_others INTEGER CHECK(dealings_with_others BETWEEN 1 AND 5),
      health INTEGER CHECK(health BETWEEN 1 AND 5),
      dress_grooming INTEGER CHECK(dress_grooming BETWEEN 1 AND 5),
      attitude_safety INTEGER CHECK(attitude_safety BETWEEN 1 AND 5),
      response_counsel INTEGER CHECK(response_counsel BETWEEN 1 AND 5),
      training_ability INTEGER CHECK(training_ability BETWEEN 1 AND 5),
      potential_future_use INTEGER CHECK(potential_future_use BETWEEN 1 AND 5),
      FOREIGN KEY (person_id) REFERENCES person(id)
    );`);
};

// 18. Add skill catalog and person_skill ratings
export const migrate18AddSkillCatalog: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS skill (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  group_id INTEGER REFERENCES grp(id)
    );`);
  db.run(`CREATE TABLE IF NOT EXISTS person_skill (
      person_id INTEGER NOT NULL,
      skill_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating BETWEEN 1 AND 5) NOT NULL,
      PRIMARY KEY (person_id, skill_id),
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (skill_id) REFERENCES skill(id)
    );`);
  // Optional order table to let admins manage display order
  db.run(`CREATE TABLE IF NOT EXISTS skill_order (
      skill_id INTEGER PRIMARY KEY,
      ordering INTEGER NOT NULL UNIQUE,
      FOREIGN KEY (skill_id) REFERENCES skill(id)
    );`);
};

// 19. Add group assignment to skills for export grouping
export const migrate19AddSkillGroupId: Migration = (db) => {
  try {
    db.run(`ALTER TABLE skill ADD COLUMN group_id INTEGER REFERENCES grp(id);`);
  } catch {}
};

// 20. Add start_date and end_date to person table
export const migrate20AddPersonDates: Migration = (db) => {
  try {
    db.run(`ALTER TABLE person ADD COLUMN start_date TEXT;`);
  } catch {}
  try {
    db.run(`ALTER TABLE person ADD COLUMN end_date TEXT;`);
  } catch {}
};

// 21. Create training_rotation table
export const migrate21AddTrainingRotation: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS training_rotation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    area TEXT CHECK(area IN ('Dining Room','Machine Room','Veggie Room','Receiving')) NOT NULL,
    start_month TEXT NOT NULL,
    end_month TEXT,
    completed INTEGER DEFAULT 0,
    notes TEXT,
    UNIQUE(person_id, area, start_month),
    FOREIGN KEY (person_id) REFERENCES person(id)
  );`);
};

// 22. Create monthly_default_week table
export const migrate22AddMonthlyDefaultWeek: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS monthly_default_week (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    person_id INTEGER NOT NULL,
    week_number INTEGER CHECK(week_number BETWEEN 1 AND 5) NOT NULL,
    segment TEXT NOT NULL,
    role_id INTEGER,
    UNIQUE(month, person_id, week_number, segment),
    FOREIGN KEY (person_id) REFERENCES person(id),
    FOREIGN KEY (role_id) REFERENCES role(id)
  );`);
};

// 23. Create training_area_override table for manual overrides
export const migrate23AddTrainingAreaOverride: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS training_area_override (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    area TEXT NOT NULL,
    completed INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(person_id, area),
    FOREIGN KEY (person_id) REFERENCES person(id)
  );`);
};

// 24. Add sync version tracking to meta table
export const migrate24AddSyncVersion: Migration = (db) => {
  try {
    // Initialize sync_version if it doesn't exist
    db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('sync_version', '0');`);
  } catch (e) {
    console.error('migrate24AddSyncVersion failed:', e);
  }
};

// 25. Add week_start_mode setting to meta table
export const migrate25AddWeekStartMode: Migration = (db) => {
  try {
    // Initialize week_start_mode to 'first_monday' as default
    db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('week_start_mode', 'first_monday');`);
  } catch (e) {
    console.error('migrate25AddWeekStartMode failed:', e);
  }
};

// 26. Add multi-condition support for segment adjustments
export const migrate26AddMultiConditionSegmentAdjustments: Migration = (db) => {
  try {
    console.log('Starting migration 26 - Add multi-condition segment adjustments');
    
    // 1. Create the new segment_adjustment_condition table
    db.run(`CREATE TABLE IF NOT EXISTS segment_adjustment_condition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adjustment_id INTEGER NOT NULL,
      condition_segment TEXT NOT NULL,
      condition_role_id INTEGER,
      FOREIGN KEY (adjustment_id) REFERENCES segment_adjustment(id) ON DELETE CASCADE,
      FOREIGN KEY (condition_role_id) REFERENCES role(id)
    );`);
    
    // 2. Check if logic_operator column already exists
    const tableInfo = db.exec(`PRAGMA table_info(segment_adjustment);`);
    const hasLogicOperator = tableInfo[0]?.values?.some((row: any[]) => row[1] === 'logic_operator');
    
    if (!hasLogicOperator) {
      // Add logic_operator column without NOT NULL constraint initially
      db.run(`ALTER TABLE segment_adjustment ADD COLUMN logic_operator TEXT DEFAULT 'AND';`);
      
      // Update existing rows to have 'AND' as the default
      db.run(`UPDATE segment_adjustment SET logic_operator = 'AND' WHERE logic_operator IS NULL;`);
    }
    
    // 3. Migrate existing data from segment_adjustment to segment_adjustment_condition
    // Get all existing adjustments
    const existingAdjustments = db.exec(`SELECT id, condition_segment, condition_role_id FROM segment_adjustment;`);
    
    if (existingAdjustments && existingAdjustments[0] && existingAdjustments[0].values) {
      for (const row of existingAdjustments[0].values) {
        const [adjustmentId, conditionSegment, conditionRoleId] = row;
        
        // Check if this adjustment already has conditions in the new table
        const existingConditions = db.exec(
          `SELECT COUNT(*) FROM segment_adjustment_condition WHERE adjustment_id = ?;`,
          [adjustmentId]
        );
        const conditionCount = existingConditions[0]?.values?.[0]?.[0] || 0;
        
        // Only migrate if no conditions exist yet
        if (conditionCount === 0 && conditionSegment) {
          db.run(
            `INSERT INTO segment_adjustment_condition (adjustment_id, condition_segment, condition_role_id) VALUES (?, ?, ?);`,
            [adjustmentId, conditionSegment, conditionRoleId]
          );
        }
      }
    }
    
    console.log('Migration 26 complete');
  } catch (e) {
    console.error('migrate26AddMultiConditionSegmentAdjustments failed:', e);
    throw e;
  }
};

// 27. Add time_off_block_threshold setting to meta table
export const migrate27AddTimeOffThreshold: Migration = (db) => {
  try {
    // Initialize time_off_block_threshold to 50% as default
    db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('time_off_block_threshold', '50');`);
    console.log('Migration 27 complete - added time_off_block_threshold setting');
  } catch (e) {
    console.error('migrate27AddTimeOffThreshold failed:', e);
  }
};

// 28. Add department_event table for crew-wide events (meetings, training, etc.)
export const migrate28AddDepartmentEvent: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS department_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    group_id INTEGER,
    role_id INTEGER,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES grp(id),
    FOREIGN KEY (role_id) REFERENCES role(id)
  );`);
  console.log('Migration 28 complete - added department_event table');
};

export const migrate6AddExportGroup: Migration = (db) => {
  db.run(`CREATE TABLE IF NOT EXISTS export_group (
      group_id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      color TEXT NOT NULL,
      column_group TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES grp(id)
    );`);
  const seed = [
    { name: 'Veggie Room', code: 'VEG', color: 'FFD8E4BC', column_group: 'kitchen1' },
    { name: 'Bakery', code: 'BKRY', color: 'FFEAD1DC', column_group: 'kitchen1' },
    { name: 'Main Course', code: 'MC', color: 'FFF4CCCC', column_group: 'kitchen2' },
    { name: 'Receiving', code: 'RCVG', color: 'FFBDD7EE', column_group: 'kitchen2' },
    { name: 'Prepack', code: 'PREPACK', color: 'FFCCE5FF', column_group: 'kitchen2' },
    { name: 'Office', code: 'OFF', color: 'FFFFF2CC', column_group: 'kitchen2' },
    { name: 'Dining Room', code: 'DR', color: 'FFFFF2CC', column_group: 'dining' },
    { name: 'Machine Room', code: 'MR', color: 'FFD9D2E9', column_group: 'dining' },
  ];
  for (const s of seed) {
    const gidRows = db.exec(`SELECT id FROM grp WHERE name=?`, [s.name]);
    const gid = gidRows[0]?.values?.[0]?.[0];
    if (gid !== undefined) {
      db.run(
        `INSERT INTO export_group (group_id, code, color, column_group) VALUES (?,?,?,?) ON CONFLICT(group_id) DO NOTHING;`,
        [gid, s.code, s.color, s.column_group]
      );
    }
  }
};

export const migrate7SegmentRefs: Migration = (_db) => {
  // Skip this migration - we'll handle it in migration 8
  console.log('Migration 7 skipped - will be handled by migration 8');
};

// COMPLETELY REWRITTEN MIGRATION 8
export const migrate8FixSegmentConstraints: Migration = (db) => {
  console.log('Starting migration 8 - Fix segment constraints');
  
  // Clean up any old temporary tables from failed migrations
  const tempTables = ['assignment_old', 'monthly_default_old', 'monthly_default_day_old', 
                      'needs_baseline_old', 'needs_override_old',
                      'assignment_temp', 'monthly_default_temp', 'monthly_default_day_temp',
                      'needs_baseline_temp', 'needs_override_temp'];
  
  for (const tempTable of tempTables) {
    try {
      db.run(`DROP TABLE IF EXISTS ${tempTable};`);
    } catch (e) {
      console.log(`Could not drop ${tempTable}:`, e);
    }
  }

  // Function to check if a table needs migration
  const needsMigration = (tableName: string): boolean => {
    try {
      const sqlInfo = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}';`);
      const tableSql = sqlInfo[0]?.values?.[0]?.[0] as string || '';
      
      // Check for old-style column definitions or CHECK constraints
      if (tableSql.includes('CHECK(segment IN') || 
          tableSql.includes('CHECK (segment IN') ||
          tableSql.includes('am_role_id') ||
          tableSql.includes('lunch_role_id') ||
          tableSql.includes('pm_role_id') ||
          tableSql.includes('early_role_id')) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 1. Fix assignment table
  if (needsMigration('assignment')) {
    console.log('Migrating assignment table...');
    try {
      // Check if it's the old column structure
      const info = db.exec(`PRAGMA table_info(assignment);`);
      const columns = info[0]?.values?.map((r: any[]) => String(r[1])) || [];
      
      if (columns.includes('am_role_id') || columns.includes('lunch_role_id') || columns.includes('pm_role_id')) {
        // Old structure with separate columns - not handling this case as it should have been migrated already
        console.log('Assignment table has old structure - skipping');
      } else {
        // New structure but with CHECK constraint - rebuild without constraint
        db.run(`CREATE TABLE assignment_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          person_id INTEGER NOT NULL,
          role_id INTEGER NOT NULL,
          segment TEXT NOT NULL,
          FOREIGN KEY (person_id) REFERENCES person(id),
          FOREIGN KEY (role_id) REFERENCES role(id)
        );`);
        
        // Copy data excluding the id column (it will be auto-generated)
        db.run(`INSERT INTO assignment_new (date, person_id, role_id, segment) 
                SELECT date, person_id, role_id, segment FROM assignment;`);
        db.run(`DROP TABLE assignment;`);
        db.run(`ALTER TABLE assignment_new RENAME TO assignment;`);
      }
    } catch (e) {
      console.error('Error migrating assignment table:', e);
    }
  }

  // 2. Fix monthly_default table
  if (needsMigration('monthly_default')) {
    console.log('Migrating monthly_default table...');
    try {
      const info = db.exec(`PRAGMA table_info(monthly_default);`);
      const columns = info[0]?.values?.map((r: any[]) => String(r[1])) || [];
      
      if (columns.includes('am_role_id')) {
        // Old structure - need to transform data
        console.log('Transforming old monthly_default structure...');
        
        db.run(`CREATE TABLE monthly_default_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL,
          person_id INTEGER NOT NULL,
          segment TEXT NOT NULL,
          role_id INTEGER NOT NULL,
          UNIQUE(month, person_id, segment),
          FOREIGN KEY (person_id) REFERENCES person(id),
          FOREIGN KEY (role_id) REFERENCES role(id)
        );`);
        
        // Get all old data
        const hasEarly = columns.includes('early_role_id');
        let selectCols = 'month, person_id, am_role_id, lunch_role_id, pm_role_id';
        if (hasEarly) selectCols += ', early_role_id';
        
        const oldData = db.exec(`SELECT ${selectCols} FROM monthly_default;`);
        const rows = oldData[0]?.values || [];
        
        for (const row of rows) {
          const [month, personId, am, lunch, pm, early] = row as any[];
          if (am != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_new (month, person_id, segment, role_id) VALUES (?,?,?,?)`, 
                   [month, personId, 'AM', am]);
          }
          if (lunch != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_new (month, person_id, segment, role_id) VALUES (?,?,?,?)`, 
                   [month, personId, 'Lunch', lunch]);
          }
          if (pm != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_new (month, person_id, segment, role_id) VALUES (?,?,?,?)`, 
                   [month, personId, 'PM', pm]);
          }
          if (hasEarly && early != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_new (month, person_id, segment, role_id) VALUES (?,?,?,?)`, 
                   [month, personId, 'Early', early]);
          }
        }
        
        db.run(`DROP TABLE monthly_default;`);
        db.run(`ALTER TABLE monthly_default_new RENAME TO monthly_default;`);
      } else {
        // New structure but with CHECK constraint
        db.run(`CREATE TABLE monthly_default_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL,
          person_id INTEGER NOT NULL,
          segment TEXT NOT NULL,
          role_id INTEGER NOT NULL,
          UNIQUE(month, person_id, segment),
          FOREIGN KEY (person_id) REFERENCES person(id),
          FOREIGN KEY (role_id) REFERENCES role(id)
        );`);
        
        // Copy data excluding the id column (it will be auto-generated)
        db.run(`INSERT INTO monthly_default_new (month, person_id, segment, role_id) 
                SELECT month, person_id, segment, role_id FROM monthly_default;`);
        db.run(`DROP TABLE monthly_default;`);
        db.run(`ALTER TABLE monthly_default_new RENAME TO monthly_default;`);
      }
    } catch (e) {
      console.error('Error migrating monthly_default table:', e);
    }
  }

  // 3. Fix monthly_default_day table
  if (needsMigration('monthly_default_day')) {
    console.log('Migrating monthly_default_day table...');
    try {
      const info = db.exec(`PRAGMA table_info(monthly_default_day);`);
      const columns = info[0]?.values?.map((r: any[]) => String(r[1])) || [];
      
      if (columns.includes('am_role_id')) {
        // Old structure - need to transform data
        console.log('Transforming old monthly_default_day structure...');
        
        db.run(`CREATE TABLE monthly_default_day_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL,
          person_id INTEGER NOT NULL,
          weekday INTEGER NOT NULL,
          segment TEXT NOT NULL,
          role_id INTEGER NOT NULL,
          UNIQUE(month, person_id, weekday, segment),
          FOREIGN KEY (person_id) REFERENCES person(id),
          FOREIGN KEY (role_id) REFERENCES role(id)
        );`);
        
        // Get all old data
        const hasEarly = columns.includes('early_role_id');
        let selectCols = 'month, person_id, weekday, am_role_id, lunch_role_id, pm_role_id';
        if (hasEarly) selectCols += ', early_role_id';
        
        const oldData = db.exec(`SELECT ${selectCols} FROM monthly_default_day;`);
        const rows = oldData[0]?.values || [];
        
        for (const row of rows) {
          const [month, personId, weekday, am, lunch, pm, early] = row as any[];
          if (am != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_day_new (month, person_id, weekday, segment, role_id) VALUES (?,?,?,?,?)`, 
                   [month, personId, weekday, 'AM', am]);
          }
          if (lunch != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_day_new (month, person_id, weekday, segment, role_id) VALUES (?,?,?,?,?)`, 
                   [month, personId, weekday, 'Lunch', lunch]);
          }
          if (pm != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_day_new (month, person_id, weekday, segment, role_id) VALUES (?,?,?,?,?)`, 
                   [month, personId, weekday, 'PM', pm]);
          }
          if (hasEarly && early != null) {
            db.run(`INSERT OR IGNORE INTO monthly_default_day_new (month, person_id, weekday, segment, role_id) VALUES (?,?,?,?,?)`, 
                   [month, personId, weekday, 'Early', early]);
          }
        }
        
        db.run(`DROP TABLE monthly_default_day;`);
        db.run(`ALTER TABLE monthly_default_day_new RENAME TO monthly_default_day;`);
      } else {
        // New structure but with CHECK constraint
        db.run(`CREATE TABLE monthly_default_day_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL,
          person_id INTEGER NOT NULL,
          weekday INTEGER NOT NULL,
          segment TEXT NOT NULL,
          role_id INTEGER NOT NULL,
          UNIQUE(month, person_id, weekday, segment),
          FOREIGN KEY (person_id) REFERENCES person(id),
          FOREIGN KEY (role_id) REFERENCES role(id)
        );`);
        
        // Copy data excluding the id column (it will be auto-generated)
        db.run(`INSERT INTO monthly_default_day_new (month, person_id, weekday, segment, role_id) 
                SELECT month, person_id, weekday, segment, role_id FROM monthly_default_day;`);
        db.run(`DROP TABLE monthly_default_day;`);
        db.run(`ALTER TABLE monthly_default_day_new RENAME TO monthly_default_day;`);
      }
    } catch (e) {
      console.error('Error migrating monthly_default_day table:', e);
    }
  }

  // 4. Fix needs_baseline table
  if (needsMigration('needs_baseline')) {
    console.log('Migrating needs_baseline table...');
    try {
      db.run(`CREATE TABLE needs_baseline_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        segment TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        UNIQUE(group_id, role_id, segment)
      );`);
      
      // Copy data excluding the id column (it will be auto-generated)
      db.run(`INSERT INTO needs_baseline_new (group_id, role_id, segment, required) 
              SELECT group_id, role_id, segment, required FROM needs_baseline;`);
      db.run(`DROP TABLE needs_baseline;`);
      db.run(`ALTER TABLE needs_baseline_new RENAME TO needs_baseline;`);
    } catch (e) {
      console.error('Error migrating needs_baseline table:', e);
    }
  }

  // 5. Fix needs_override table
  if (needsMigration('needs_override')) {
    console.log('Migrating needs_override table...');
    try {
      db.run(`CREATE TABLE needs_override_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        group_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        segment TEXT NOT NULL,
        required INTEGER NOT NULL,
        UNIQUE(date, group_id, role_id, segment)
      );`);
      
      // Copy data excluding the id column (it will be auto-generated)
      db.run(`INSERT INTO needs_override_new (date, group_id, role_id, segment, required) 
              SELECT date, group_id, role_id, segment, required FROM needs_override;`);
      db.run(`DROP TABLE needs_override;`);
      db.run(`ALTER TABLE needs_override_new RENAME TO needs_override;`);
    } catch (e) {
      console.error('Error migrating needs_override table:', e);
    }
  }

  console.log('Migration 8 complete');
};

// 10. Backfill missing group colors/themes from config defaults for older DBs
export const migrate10BackfillGroupCustomColor: Migration = (db) => {
  try {
    // Ensure columns exist (defensive)
    try { db.run(`ALTER TABLE grp ADD COLUMN custom_color TEXT;`); } catch {}
    try { db.run(`ALTER TABLE grp ADD COLUMN theme TEXT;`); } catch {}

    // Get existing groups
    const res = db.exec(`SELECT id, name, theme, custom_color FROM grp;`);
    const rows: Array<{ id: number; name: string; theme: string | null; custom_color: string | null }> =
      (res[0]?.values || []).map((v: any[]) => ({ id: Number(v[0]), name: String(v[1]), theme: v[2] ?? null, custom_color: v[3] ?? null }));

    for (const g of rows) {
      const cfg = GROUPS[g.name as keyof typeof GROUPS];
      if (!cfg) continue;
      const nextTheme = g.theme ?? cfg.theme;
      const nextColor = g.custom_color ?? cfg.color;
      // Only write if something is missing to avoid clobbering user customizations
      if (g.theme == null || g.custom_color == null) {
        db.run(`UPDATE grp SET theme = COALESCE(theme, ?), custom_color = COALESCE(custom_color, ?) WHERE id = ?;`, [nextTheme, nextColor, g.id]);
      }
    }
  } catch (e) {
    console.error('migrate10BackfillGroupCustomColor failed:', e);
  }
};

/**
 * Migration 29: Add sync tracking columns and triggers for 3-way merge support
 * 
 * Adds to user-data tables:
 * - sync_id: UUID for globally unique record identity across merges
 * - modified_at: ISO timestamp of last modification
 * - modified_by: Email of user who made the change
 * - deleted_at: Soft-delete timestamp (null = not deleted)
 * 
 * Adds triggers to auto-update modified_at on INSERT/UPDATE
 * 
 * Adds meta entries:
 * - sync_uuid: Unique identifier for this database lineage
 * - last_checkpoint: Timestamp of last solo-user checkpoint
 */
export const migrate29AddSyncTracking: Migration = (db) => {
  // Tables that need sync tracking (user-data tables, not config/reference tables)
  const userDataTables = [
    'person',
    'assignment',
    'training',
    'training_rotation',
    'training_area_override',
    'monthly_default',
    'monthly_default_day',
    'monthly_default_week',
    'monthly_default_note',
    'timeoff',
    'availability_override',
    'needs_baseline',
    'needs_override',
    'competency',
    'person_quality',
    'person_skill',
    'department_event',
  ];

  // Generate a UUID for sync_id default values
  const generateUUID = () => {
    // Simple UUID v4 generator for SQLite
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  for (const table of userDataTables) {
    try {
      // Check if table exists
      const tableExists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}';`);
      if (!tableExists[0]?.values?.length) {
        console.log(`[migrate29] Table ${table} does not exist, skipping`);
        continue;
      }

      // Get existing columns
      const tableInfo = db.exec(`PRAGMA table_info(${table});`);
      const existingColumns = new Set((tableInfo[0]?.values || []).map((row: any[]) => row[1]));

      // Add sync_id column if missing
      if (!existingColumns.has('sync_id')) {
        db.run(`ALTER TABLE ${table} ADD COLUMN sync_id TEXT;`);
        // Backfill existing rows with UUIDs
        const rows = db.exec(`SELECT rowid FROM ${table};`);
        for (const row of (rows[0]?.values || [])) {
          db.run(`UPDATE ${table} SET sync_id = ? WHERE rowid = ?;`, [generateUUID(), row[0]]);
        }
        console.log(`[migrate29] Added sync_id to ${table}`);
      }

      // Add modified_at column if missing
      if (!existingColumns.has('modified_at')) {
        db.run(`ALTER TABLE ${table} ADD COLUMN modified_at TEXT;`);
        // Backfill with current timestamp
        db.run(`UPDATE ${table} SET modified_at = datetime('now') WHERE modified_at IS NULL;`);
        console.log(`[migrate29] Added modified_at to ${table}`);
      }

      // Add modified_by column if missing
      if (!existingColumns.has('modified_by')) {
        db.run(`ALTER TABLE ${table} ADD COLUMN modified_by TEXT;`);
        console.log(`[migrate29] Added modified_by to ${table}`);
      }

      // Add deleted_at column if missing
      if (!existingColumns.has('deleted_at')) {
        db.run(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT;`);
        console.log(`[migrate29] Added deleted_at to ${table}`);
      }

      // Create trigger for INSERT to set sync_id and modified_at
      // Uses SQLite's hex(randomblob(16)) for UUID generation
      try {
        db.run(`DROP TRIGGER IF EXISTS ${table}_insert_sync;`);
        db.run(`
          CREATE TRIGGER ${table}_insert_sync
          AFTER INSERT ON ${table}
          FOR EACH ROW
          WHEN NEW.sync_id IS NULL OR NEW.modified_at IS NULL
          BEGIN
            UPDATE ${table} SET 
              sync_id = COALESCE(NEW.sync_id, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
              modified_at = COALESCE(NEW.modified_at, datetime('now'))
            WHERE rowid = NEW.rowid;
          END;
        `);
      } catch (e) {
        console.warn(`[migrate29] Could not create insert trigger for ${table}:`, e);
      }

      // Create trigger for UPDATE to set modified_at
      try {
        db.run(`DROP TRIGGER IF EXISTS ${table}_update_sync;`);
        db.run(`
          CREATE TRIGGER ${table}_update_sync
          AFTER UPDATE ON ${table}
          FOR EACH ROW
          WHEN NEW.modified_at = OLD.modified_at OR NEW.modified_at IS NULL
          BEGIN
            UPDATE ${table} SET modified_at = datetime('now') WHERE rowid = NEW.rowid;
          END;
        `);
      } catch (e) {
        console.warn(`[migrate29] Could not create update trigger for ${table}:`, e);
      }

      // Create BEFORE DELETE trigger to convert hard deletes to soft deletes
      // This prevents data loss during merge - deletions are tracked via deleted_at
      try {
        db.run(`DROP TRIGGER IF EXISTS ${table}_soft_delete;`);
        db.run(`
          CREATE TRIGGER ${table}_soft_delete
          BEFORE DELETE ON ${table}
          FOR EACH ROW
          WHEN OLD.deleted_at IS NULL
          BEGIN
            UPDATE ${table} SET deleted_at = datetime('now'), modified_at = datetime('now') WHERE rowid = OLD.rowid;
            SELECT RAISE(IGNORE);
          END;
        `);
      } catch (e) {
        console.warn(`[migrate29] Could not create soft delete trigger for ${table}:`, e);
      }

    } catch (e) {
      console.error(`[migrate29] Error processing table ${table}:`, e);
      // Continue with other tables
    }
  }

  // Add sync_uuid to meta table (unique identifier for this database lineage)
  try {
    const existingUuid = db.exec(`SELECT value FROM meta WHERE key = 'sync_uuid';`);
    if (!existingUuid[0]?.values?.length) {
      const dbUuid = generateUUID();
      db.run(`INSERT INTO meta (key, value) VALUES ('sync_uuid', ?);`, [dbUuid]);
      console.log(`[migrate29] Created sync_uuid: ${dbUuid}`);
    }
  } catch (e) {
    console.error('[migrate29] Error creating sync_uuid:', e);
  }

  // Add last_checkpoint to meta table (for solo-user checkpoint detection)
  try {
    db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('last_checkpoint', datetime('now'));`);
    console.log('[migrate29] Initialized last_checkpoint');
  } catch (e) {
    console.error('[migrate29] Error creating last_checkpoint:', e);
  }

  console.log('[migrate29] Sync tracking migration complete');
};

/**
 * Migration 30: Fix soft-delete constraints, improve triggers, add _active views
 * 
 * 1. Rebuild training, monthly_default, needs_baseline with partial unique indexes
 *    (allows re-adding records after soft delete)
 * 2. Update all triggers to use millisecond precision and set modified_by
 * 3. Add deleted_at indexes for view performance
 * 4. Create _active views for all synced tables (excludes soft-deleted rows)
 */
export const migrate30SoftDeleteAndViews: Migration = (db) => {
  console.log('[migrate30] Starting soft-delete constraints and views migration');

  // Tables that have sync tracking
  const syncedTables = [
    'person',
    'assignment',
    'training',
    'training_rotation',
    'training_area_override',
    'monthly_default',
    'monthly_default_day',
    'monthly_default_week',
    'monthly_default_note',
    'timeoff',
    'availability_override',
    'needs_baseline',
    'needs_override',
    'competency',
    'person_quality',
    'person_skill',
    'department_event',
  ];

  // Column lists for each table's _active view (explicit, excluding deleted_at)
  const tableColumns: Record<string, string> = {
    person: 'id, first_name, last_name, work_email, brother_sister, commuter, active, avail_mon, avail_tue, avail_wed, avail_thu, avail_fri, start_date, end_date, sync_id, modified_at, modified_by',
    assignment: 'id, date, person_id, role_id, segment, sync_id, modified_at, modified_by',
    training: 'id, person_id, role_id, status, source, sync_id, modified_at, modified_by',
    training_rotation: 'id, person_id, area, start_month, end_month, completed, notes, sync_id, modified_at, modified_by',
    training_area_override: 'id, person_id, area, completed, created_at, sync_id, modified_at, modified_by',
    monthly_default: 'id, month, person_id, segment, role_id, sync_id, modified_at, modified_by',
    monthly_default_day: 'id, month, person_id, weekday, segment, role_id, sync_id, modified_at, modified_by',
    monthly_default_week: 'id, month, person_id, week_number, segment, role_id, sync_id, modified_at, modified_by',
    monthly_default_note: 'id, month, person_id, note, sync_id, modified_at, modified_by',
    timeoff: 'id, person_id, start_ts, end_ts, reason, source, sync_id, modified_at, modified_by',
    availability_override: 'id, person_id, date, avail, sync_id, modified_at, modified_by',
    needs_baseline: 'id, group_id, role_id, segment, required, sync_id, modified_at, modified_by',
    needs_override: 'id, date, group_id, role_id, segment, required, sync_id, modified_at, modified_by',
    competency: 'person_id, role_id, rating, sync_id, modified_at, modified_by',
    person_quality: 'person_id, work_capabilities, work_habits, spirituality, dealings_with_others, health, dress_grooming, attitude_safety, response_counsel, training_ability, potential_future_use, sync_id, modified_at, modified_by',
    person_skill: 'person_id, skill_id, rating, sync_id, modified_at, modified_by',
    department_event: 'id, title, date, start_time, end_time, group_id, role_id, description, created_at, sync_id, modified_at, modified_by',
  };

  // ========================================
  // PART A: Disable FK checks during rebuild
  // ========================================
  db.run(`PRAGMA foreign_keys=OFF;`);

  // ========================================
  // PART B: Rebuild training table (composite PK → id PK + partial unique)
  // ========================================
  try {
    console.log('[migrate30] Rebuilding training table...');
    db.run(`CREATE TABLE training_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('Not trained','In training','Qualified')) NOT NULL DEFAULT 'Not trained',
      source TEXT CHECK(source IN ('manual','monthly')) NOT NULL DEFAULT 'manual',
      sync_id TEXT,
      modified_at TEXT,
      modified_by TEXT,
      deleted_at TEXT,
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);
    db.run(`INSERT INTO training_new (person_id, role_id, status, source, sync_id, modified_at, modified_by, deleted_at)
      SELECT person_id, role_id, status, source, sync_id, modified_at, modified_by, deleted_at FROM training;`);
    db.run(`DROP TABLE training;`);
    db.run(`ALTER TABLE training_new RENAME TO training;`);
    db.run(`CREATE UNIQUE INDEX training_active_unique ON training(person_id, role_id) WHERE deleted_at IS NULL;`);
    console.log('[migrate30] training table rebuilt with partial unique index');
  } catch (e) {
    console.error('[migrate30] Error rebuilding training table:', e);
  }

  // ========================================
  // PART C: Rebuild monthly_default table (remove inline UNIQUE)
  // ========================================
  try {
    console.log('[migrate30] Rebuilding monthly_default table...');
    db.run(`CREATE TABLE monthly_default_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      segment TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      sync_id TEXT,
      modified_at TEXT,
      modified_by TEXT,
      deleted_at TEXT,
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);
    db.run(`INSERT INTO monthly_default_new (id, month, person_id, segment, role_id, sync_id, modified_at, modified_by, deleted_at)
      SELECT id, month, person_id, segment, role_id, sync_id, modified_at, modified_by, deleted_at FROM monthly_default;`);
    db.run(`DROP TABLE monthly_default;`);
    db.run(`ALTER TABLE monthly_default_new RENAME TO monthly_default;`);
    db.run(`CREATE UNIQUE INDEX monthly_default_active_unique ON monthly_default(month, person_id, segment) WHERE deleted_at IS NULL;`);
    console.log('[migrate30] monthly_default table rebuilt with partial unique index');
  } catch (e) {
    console.error('[migrate30] Error rebuilding monthly_default table:', e);
  }

  // ========================================
  // PART D: Rebuild needs_baseline table (remove inline UNIQUE)
  // ========================================
  try {
    console.log('[migrate30] Rebuilding needs_baseline table...');
    db.run(`CREATE TABLE needs_baseline_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      segment TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      sync_id TEXT,
      modified_at TEXT,
      modified_by TEXT,
      deleted_at TEXT
    );`);
    db.run(`INSERT INTO needs_baseline_new (id, group_id, role_id, segment, required, sync_id, modified_at, modified_by, deleted_at)
      SELECT id, group_id, role_id, segment, required, sync_id, modified_at, modified_by, deleted_at FROM needs_baseline;`);
    db.run(`DROP TABLE needs_baseline;`);
    db.run(`ALTER TABLE needs_baseline_new RENAME TO needs_baseline;`);
    db.run(`CREATE UNIQUE INDEX needs_baseline_active_unique ON needs_baseline(group_id, role_id, segment) WHERE deleted_at IS NULL;`);
    console.log('[migrate30] needs_baseline table rebuilt with partial unique index');
  } catch (e) {
    console.error('[migrate30] Error rebuilding needs_baseline table:', e);
  }

  // ========================================
  // PART E: Re-enable FK checks
  // ========================================
  db.run(`PRAGMA foreign_keys=ON;`);

  // ========================================
  // PART F: Update triggers for ALL synced tables
  // ========================================
  for (const table of syncedTables) {
    try {
      // Drop existing triggers
      db.run(`DROP TRIGGER IF EXISTS ${table}_insert_sync;`);
      db.run(`DROP TRIGGER IF EXISTS ${table}_update_sync;`);
      db.run(`DROP TRIGGER IF EXISTS ${table}_soft_delete;`);

      // INSERT trigger: set sync_id, modified_at, modified_by
      db.run(`
        CREATE TRIGGER ${table}_insert_sync
        AFTER INSERT ON ${table}
        FOR EACH ROW
        WHEN NEW.sync_id IS NULL
        BEGIN
          UPDATE ${table} SET 
            sync_id = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
            modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now'),
            modified_by = COALESCE(NEW.modified_by, (SELECT value FROM meta WHERE key = 'user_email'), 'system')
          WHERE rowid = NEW.rowid;
        END;
      `);

      // UPDATE trigger: set modified_at, modified_by
      db.run(`
        CREATE TRIGGER ${table}_update_sync
        AFTER UPDATE ON ${table}
        FOR EACH ROW
        WHEN NEW.modified_at = OLD.modified_at OR NEW.modified_at IS NULL
        BEGIN
          UPDATE ${table} SET 
            modified_at = strftime('%Y-%m-%d %H:%M:%f', 'now'),
            modified_by = COALESCE((SELECT value FROM meta WHERE key = 'user_email'), 'system')
          WHERE rowid = NEW.rowid;
        END;
      `);

      // BEFORE DELETE trigger: convert to soft delete with modified_by
      db.run(`
        CREATE TRIGGER ${table}_soft_delete
        BEFORE DELETE ON ${table}
        FOR EACH ROW
        WHEN OLD.deleted_at IS NULL
        BEGIN
          UPDATE ${table} SET 
            deleted_at = strftime('%Y-%m-%d %H:%M:%f', 'now'),
            modified_by = COALESCE((SELECT value FROM meta WHERE key = 'user_email'), 'system')
          WHERE rowid = OLD.rowid;
          SELECT RAISE(IGNORE);
        END;
      `);

      console.log(`[migrate30] Updated triggers for ${table}`);
    } catch (e) {
      console.warn(`[migrate30] Could not update triggers for ${table}:`, e);
    }
  }

  // ========================================
  // PART G: Add deleted_at indexes for all synced tables
  // ========================================
  for (const table of syncedTables) {
    try {
      db.run(`DROP INDEX IF EXISTS ${table}_deleted_at_idx;`);
      db.run(`CREATE INDEX ${table}_deleted_at_idx ON ${table}(deleted_at);`);
    } catch (e) {
      console.warn(`[migrate30] Could not create deleted_at index for ${table}:`, e);
    }
  }

  // ========================================
  // PART H: Create _active views for all synced tables
  // ========================================
  for (const table of syncedTables) {
    const columns = tableColumns[table];
    if (!columns) {
      console.warn(`[migrate30] No column list defined for ${table}, skipping view`);
      continue;
    }
    try {
      db.run(`DROP VIEW IF EXISTS ${table}_active;`);
      db.run(`CREATE VIEW ${table}_active AS SELECT ${columns} FROM ${table} WHERE deleted_at IS NULL;`);
      console.log(`[migrate30] Created ${table}_active view`);
    } catch (e) {
      console.warn(`[migrate30] Could not create ${table}_active view:`, e);
    }
  }

  console.log('[migrate30] Soft-delete constraints and views migration complete');
};

const migrations: Record<number, Migration> = {
  1: (db) => {
    db.run(`PRAGMA journal_mode=WAL;`);
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
    db.run(`CREATE TABLE IF NOT EXISTS person (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      work_email TEXT NOT NULL UNIQUE,
      brother_sister TEXT CHECK(brother_sister IN ('Brother','Sister')),
      commuter INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      avail_mon TEXT CHECK(avail_mon IN ('U','AM','PM','B')) DEFAULT 'U',
      avail_tue TEXT CHECK(avail_tue IN ('U','AM','PM','B')) DEFAULT 'U',
      avail_wed TEXT CHECK(avail_wed IN ('U','AM','PM','B')) DEFAULT 'U',
      avail_thu TEXT CHECK(avail_thu IN ('U','AM','PM','B')) DEFAULT 'U',
      avail_fri TEXT CHECK(avail_fri IN ('U','AM','PM','B')) DEFAULT 'U',
      start_date TEXT,
      end_date TEXT
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS grp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      theme TEXT,
      custom_color TEXT
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS role (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      segments TEXT NOT NULL,
      UNIQUE(code, name, group_id),
      FOREIGN KEY (group_id) REFERENCES grp(id)
    );`);

    // Seed initial groups and roles
    for (const [name, cfg] of Object.entries(GROUPS)) {
      db.run(
        `INSERT INTO grp (name, theme, custom_color) VALUES (?,?,?) ON CONFLICT(name) DO NOTHING;`,
        [name, cfg.theme, cfg.color]
      );
    }
    for (const r of ROLE_SEED) {
      const gidRows = db.exec(`SELECT id FROM grp WHERE name=?`, [r.group]);
      const gid = gidRows[0]?.values?.[0]?.[0];
      if (gid !== undefined) {
        db.run(
          `INSERT INTO role (code, name, group_id, segments) VALUES (?,?,?,?) ON CONFLICT(code, name, group_id) DO NOTHING;`,
          [r.code, r.name, gid, JSON.stringify(r.segments)]
        );
      }
    }

    db.run(`CREATE TABLE IF NOT EXISTS training (
      person_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('Not trained','In training','Qualified')) NOT NULL DEFAULT 'Not trained',
      source TEXT CHECK(source IN ('manual','monthly')) NOT NULL DEFAULT 'manual',
      PRIMARY KEY (person_id, role_id),
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);

    // Create tables WITHOUT segment CHECK constraints
    db.run(`CREATE TABLE IF NOT EXISTS assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      segment TEXT NOT NULL,
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS monthly_default (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      segment TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      UNIQUE(month, person_id, segment),
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS needs_baseline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      segment TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      UNIQUE(group_id, role_id, segment)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS needs_override (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      segment TEXT NOT NULL,
      required INTEGER NOT NULL,
      UNIQUE(date, group_id, role_id, segment)
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS timeoff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      start_ts TEXT NOT NULL,
      end_ts TEXT NOT NULL,
      reason TEXT,
      source TEXT DEFAULT 'TeamsImport',
      FOREIGN KEY (person_id) REFERENCES person(id)
    );`);
  },
  2: (db) => {
    // Ensure training table has 'source' column
    try {
      const info = db.exec(`PRAGMA table_info(training);`);
      const hasSource = Array.isArray(info) && info[0]?.values?.some((r: any[]) => r[1] === 'source');
      if (!hasSource) {
        // Recreate training with source column
        db.run(`CREATE TABLE training_new (
          person_id INTEGER NOT NULL,
          role_id INTEGER NOT NULL,
          status TEXT CHECK(status IN ('Not trained','In training','Qualified')) NOT NULL DEFAULT 'Not trained',
          source TEXT CHECK(source IN ('manual','monthly')) NOT NULL DEFAULT 'manual',
          PRIMARY KEY (person_id, role_id),
          FOREIGN KEY (person_id) REFERENCES person(id),
          FOREIGN KEY (role_id) REFERENCES role(id)
        );`);
        db.run(`INSERT INTO training_new (person_id, role_id, status, source)
                SELECT person_id, role_id, status, 'manual' AS source FROM training;`);
        db.run(`DROP TABLE training;`);
        db.run(`ALTER TABLE training_new RENAME TO training;`);
      }
    } catch {}

    db.run(`CREATE TABLE IF NOT EXISTS monthly_default_day (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      person_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      segment TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      UNIQUE(month, person_id, weekday, segment),
      FOREIGN KEY (person_id) REFERENCES person(id),
      FOREIGN KEY (role_id) REFERENCES role(id)
    );`);
  },
  3: migrate3RenameBuffetToDiningRoom,
  4: migrate4AddSegments,
  5: migrate5AddGroupTheme,
  6: migrate6AddExportGroup,
  7: migrate7SegmentRefs,
  8: migrate8FixSegmentConstraints,
  9: migrate8FixSegmentConstraints, // Run the same migration again as 9 to fix failed migration 8
  10: migrate10BackfillGroupCustomColor,
  11: migrate11AddTrainingSource,
  12: migrate12AddMonthlyNotes,
  13: migrate13AddAvailabilityOverride,
  14: migrate14AddSegmentAdjustment,
  15: migrate15AddSegmentAdjustmentRole,
  16: migrate16AddCompetency,
  17: migrate17AddPersonQuality,
  18: migrate18AddSkillCatalog,
  19: migrate19AddSkillGroupId,
  20: migrate20AddPersonDates,
  21: migrate21AddTrainingRotation,
  22: migrate22AddMonthlyDefaultWeek,
  23: migrate23AddTrainingAreaOverride,
  24: migrate24AddSyncVersion,
  25: migrate25AddWeekStartMode,
  26: migrate26AddMultiConditionSegmentAdjustments,
  27: migrate27AddTimeOffThreshold,
  28: migrate28AddDepartmentEvent,
  29: migrate29AddSyncTracking,
  30: migrate30SoftDeleteAndViews,
};

export function addMigration(version: number, fn: Migration) {
  migrations[version] = fn;
}

/**
 * Ensure critical schema elements exist, regardless of migration version.
 * This fixes databases where the version was set but the migration failed.
 */
export function ensureSchemaIntegrity(db: Database) {
  try {
    // Ensure segment_adjustment_condition table exists
    const tables = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='segment_adjustment_condition';`);
    if (!tables[0]?.values?.length) {
      console.log('[SchemaIntegrity] Creating missing segment_adjustment_condition table');
      db.run(`CREATE TABLE IF NOT EXISTS segment_adjustment_condition (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adjustment_id INTEGER NOT NULL,
        condition_segment TEXT NOT NULL,
        condition_role_id INTEGER,
        FOREIGN KEY (adjustment_id) REFERENCES segment_adjustment(id) ON DELETE CASCADE,
        FOREIGN KEY (condition_role_id) REFERENCES role(id)
      );`);
    }
    
    // Ensure logic_operator column exists in segment_adjustment
    const tableInfo = db.exec(`PRAGMA table_info(segment_adjustment);`);
    const hasLogicOperator = tableInfo[0]?.values?.some((row: any[]) => row[1] === 'logic_operator');
    if (!hasLogicOperator) {
      console.log('[SchemaIntegrity] Adding missing logic_operator column');
      db.run(`ALTER TABLE segment_adjustment ADD COLUMN logic_operator TEXT DEFAULT 'AND';`);
      db.run(`UPDATE segment_adjustment SET logic_operator = 'AND' WHERE logic_operator IS NULL;`);
    }
    
    // Migrate any adjustments that don't have corresponding conditions
    const adjustmentsWithoutConditions = db.exec(`
      SELECT sa.id, sa.condition_segment, sa.condition_role_id 
      FROM segment_adjustment sa
      LEFT JOIN segment_adjustment_condition sac ON sa.id = sac.adjustment_id
      WHERE sac.id IS NULL AND sa.condition_segment IS NOT NULL AND sa.condition_segment != ''
    ;`);
    
    if (adjustmentsWithoutConditions[0]?.values?.length) {
      console.log(`[SchemaIntegrity] Migrating ${adjustmentsWithoutConditions[0].values.length} adjustments to condition table`);
      for (const row of adjustmentsWithoutConditions[0].values) {
        const [adjustmentId, conditionSegment, conditionRoleId] = row;
        db.run(
          `INSERT INTO segment_adjustment_condition (adjustment_id, condition_segment, condition_role_id) VALUES (?, ?, ?);`,
          [adjustmentId, conditionSegment, conditionRoleId]
        );
      }
    }
    
    console.log('[SchemaIntegrity] Schema integrity check complete');
  } catch (e) {
    console.error('[SchemaIntegrity] Error ensuring schema integrity:', e);
  }
}

export function applyMigrations(db: Database) {
  let current = 0;
  try {
    const rows = db.exec(`SELECT value FROM meta WHERE key='schema_version'`);
    if (rows && rows[0] && rows[0].values[0] && rows[0].values[0][0]) {
      current = parseInt(String(rows[0].values[0][0])) || 0;
    }
  } catch {
    // meta table may not exist yet
  }

  const versions = Object.keys(migrations).map(Number).sort((a, b) => a - b);
  for (const v of versions) {
    if (v > current) {
      console.log(`Applying migration ${v}...`);
      try {
        migrations[v](db);
        db.run(
          `INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
          [String(v)]
        );
        console.log(`Migration ${v} completed successfully`);
        current = v;
      } catch (e) {
        console.error(`Migration ${v} failed:`, e);
        throw e;
      }
    }
  }
  
  // Always ensure schema integrity after migrations
  // This fixes databases where the version was set but migrations failed
  ensureSchemaIntegrity(db);
}

export default migrations;
