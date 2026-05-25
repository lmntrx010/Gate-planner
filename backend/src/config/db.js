const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

const databaseUrl = process.env.DATABASE_URL;
let isPostgres = Boolean(databaseUrl);
let lastConnectionError = null;

let db = null;
let pool = null;

function connectSqlite() {
  const dbPath = path.resolve(__dirname, '..', '..', 'sqlite.db');
  console.log(`[Database] Connecting to SQLite DB at ${dbPath}`);
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('[Database] Connection error:', err);
    } else {
      console.log('[Database] Successfully connected to SQLite database.');
    }
  });
  db.run('PRAGMA foreign_keys = ON');
}

if (isPostgres) {
  console.log('[Database] Connecting to Supabase Postgres via DATABASE_URL...');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
} else {
  connectSqlite();
}

const sqliteSchema = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    salt TEXT,
    name TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user_profile (
    user_id TEXT PRIMARY KEY,
    target_year INTEGER,
    start_date TEXT,
    target_exam_date TEXT,
    weekday_hours REAL,
    weekend_hours REAL,
    preferred_slots TEXT,
    revision_frequency TEXT,
    mock_test_frequency TEXT,
    current_prep_level TEXT,
    completed_topics TEXT,
    weak_subjects TEXT,
    break_preference TEXT,
    user_type TEXT,
    streak_count INTEGER DEFAULT 0,
    last_active_date TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    weightage REAL,
    difficulty TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    subject_id TEXT,
    name TEXT,
    syllabus_matched INTEGER DEFAULT 1,
    category TEXT DEFAULT 'Core GATE',
    estimated_hours INTEGER,
    difficulty TEXT,
    resource_link TEXT,
    learning_objectives TEXT,
    recommended_pyqs INTEGER DEFAULT 8,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS user_topics_metadata (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    topic_id TEXT,
    notes TEXT DEFAULT '',
    is_bookmarked INTEGER DEFAULT 0,
    confidence_score INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
    UNIQUE(user_id, topic_id)
  )`,
  `CREATE TABLE IF NOT EXISTS study_plan (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    date TEXT,
    phase_id TEXT,
    topic_id TEXT,
    learning_item_id TEXT,
    subject TEXT,
    topic_name TEXT,
    task_type TEXT,
    duration REAL,
    planned_minutes INTEGER DEFAULT 0,
    actual_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'planned',
    mode TEXT DEFAULT 'full',
    source TEXT DEFAULT 'catalog',
    difficulty TEXT,
    resource_link TEXT,
    learning_objectives TEXT,
    recommended_pyqs INTEGER,
    description TEXT,
    completed_at TEXT,
    completed INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS learning_items (
    id TEXT PRIMARY KEY,
    subject_id TEXT,
    topic_id TEXT,
    title TEXT,
    provider TEXT,
    duration_minutes INTEGER,
    sequence INTEGER,
    source_url TEXT,
    category TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS topic_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    topic_id TEXT,
    learning_item_id TEXT,
    status TEXT,
    mode TEXT,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS study_phases (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    start_date TEXT,
    end_date TEXT,
    target_label TEXT,
    status TEXT,
    config TEXT,
    created_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS time_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    task_id TEXT,
    subject TEXT,
    topic_name TEXT,
    topic_id TEXT,
    learning_item_id TEXT,
    date TEXT,
    minutes INTEGER,
    note TEXT,
    created_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

const postgresSchema = sqliteSchema.map(sql => sql.replace(/\bREAL\b/g, 'DOUBLE PRECISION'));

function toPostgresQuery(sql, params = []) {
  let index = 0;
  let text = sql.replace(/\?/g, () => `$${++index}`);

  text = text
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
    .replace(/INSERT OR REPLACE INTO\s+user_profile\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i,
      'INSERT INTO user_profile ($1) VALUES ($2) ON CONFLICT (user_id) DO UPDATE SET target_year = EXCLUDED.target_year, start_date = EXCLUDED.start_date, target_exam_date = EXCLUDED.target_exam_date, weekday_hours = EXCLUDED.weekday_hours, weekend_hours = EXCLUDED.weekend_hours, preferred_slots = EXCLUDED.preferred_slots, revision_frequency = EXCLUDED.revision_frequency, mock_test_frequency = EXCLUDED.mock_test_frequency, current_prep_level = EXCLUDED.current_prep_level, completed_topics = EXCLUDED.completed_topics, weak_subjects = EXCLUDED.weak_subjects, break_preference = EXCLUDED.break_preference, user_type = EXCLUDED.user_type, streak_count = EXCLUDED.streak_count, last_active_date = EXCLUDED.last_active_date');

  if (/INSERT INTO users/i.test(text) && !/ON CONFLICT/i.test(text)) {
    text += ' ON CONFLICT (id) DO NOTHING';
  }

  if (/INSERT INTO subjects/i.test(text) && !/ON CONFLICT/i.test(text)) {
    text += ' ON CONFLICT (id) DO NOTHING';
  }

  if (/INSERT INTO topics/i.test(text) && !/ON CONFLICT/i.test(text)) {
    text += ' ON CONFLICT (id) DO NOTHING';
  }

  if (/INSERT INTO study_plan/i.test(text) && !/ON CONFLICT/i.test(text)) {
    text += ' ON CONFLICT (id) DO NOTHING';
  }

  return { text, values: params };
}

async function initDatabase() {
  if (isPostgres) {
    try {
      for (const sql of postgresSchema) {
        await pool.query(sql);
      }
      await pool.query('ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS completed_at TEXT');
      await pool.query('ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS phase_id TEXT');
      await pool.query('ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS topic_id TEXT');
      await pool.query('ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS learning_item_id TEXT');
      await pool.query('ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS planned_minutes INTEGER DEFAULT 0');
      await pool.query('ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS actual_minutes INTEGER DEFAULT 0');
      await pool.query("ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned'");
      await pool.query("ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'full'");
      await pool.query("ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'catalog'");
      console.log('[Database] Supabase Postgres schema initialization complete.');
      return;
    } catch (err) {
      lastConnectionError = {
        code: err.code || null,
        message: err.message
      };
      console.error('[Database] Supabase Postgres unavailable. Falling back to local SQLite for this run:', err.message);
      await pool.end().catch(() => {});
      pool = null;
      isPostgres = false;
      connectSqlite();
    }
  }

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      let pending = sqliteSchema.length;
      sqliteSchema.forEach(sql => {
        db.run(sql, (err) => {
          if (err) {
            reject(err);
            return;
          }
          pending -= 1;
          if (pending === 0) {
            console.log('[Database] SQLite schema initialization complete.');
            resolve();
          }
        });
      });
    });
  });
}

function dbRun(sql, params = []) {
  if (isPostgres) {
    const query = toPostgresQuery(sql, params);
    return pool.query(query.text, query.values);
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function dbAll(sql, params = []) {
  if (isPostgres) {
    const query = toPostgresQuery(sql, params);
    const result = await pool.query(query.text, query.values);
    return result.rows;
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function dbGet(sql, params = []) {
  if (isPostgres) {
    const rows = await dbAll(sql, params);
    return rows[0];
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getDatabaseDiagnostics() {
  let databaseHost = null;
  if (databaseUrl) {
    try {
      databaseHost = new URL(databaseUrl).host;
    } catch (err) {
      databaseHost = 'invalid-url';
    }
  }

  return {
    hasDatabaseUrl: Boolean(databaseUrl),
    databaseHost,
    postgresAttempted: Boolean(databaseUrl),
    postgresActive: isPostgres,
    fallbackReason: lastConnectionError
  };
}

module.exports = {
  db,
  pool,
  get isPostgres() {
    return isPostgres;
  },
  initDatabase,
  dbRun,
  dbAll,
  dbGet,
  getDatabaseDiagnostics
};
