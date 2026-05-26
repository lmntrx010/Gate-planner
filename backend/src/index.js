require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const dbConfig = require('./config/db');
const { initDatabase, dbRun, dbAll, dbGet } = dbConfig;
const { scrapeGfgResources } = require('./utils/scraper');
const { matchSyllabus } = require('./utils/syllabusMatcher');
const { generateSchedule, rebalanceSchedule } = require('./utils/plannerEngine');
const { exportToCSV, exportToICS } = require('./utils/exportSystem');
const learningItemsData = require('./data/learningItems.json');

const app = express();
const PORT = process.env.PORT || 5000;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const supabase = supabaseUrl && supabaseAnonKey && !supabaseAnonKey.startsWith('PASTE_')
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await dbGet('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      database: dbConfig.isPostgres ? 'supabase-postgres' : 'sqlite-fallback',
      diagnostics: dbConfig.getDatabaseDiagnostics()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      database: dbConfig.isPostgres ? 'supabase-postgres' : 'sqlite-fallback',
      diagnostics: dbConfig.getDatabaseDiagnostics(),
      message: err.message
    });
  }
});

// ==========================================
// CRYPTOGRAPHY SECURE AUTH HELPERS
// ==========================================

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// ==========================================
// BOOTSTRAP DATABASE & CATALOG SEEDING
// ==========================================

async function migrateUsersTable() {
  if (dbConfig.isPostgres) return;

  const columns = await dbAll('PRAGMA table_info(users)');
  const existingColumns = new Set(columns.map(col => col.name));
  const migrations = [
    ['email', 'TEXT'],
    ['password_hash', 'TEXT'],
    ['salt', 'TEXT'],
    ['name', 'TEXT'],
    ['created_at', 'TEXT']
  ];

  for (const [column, type] of migrations) {
    if (!existingColumns.has(column)) {
      await dbRun(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
    }
  }
}

async function migrateStudyPlanTable() {
  if (dbConfig.isPostgres) return;

  const columns = await dbAll('PRAGMA table_info(study_plan)');
  const existingColumns = new Set(columns.map(col => col.name));

  const migrations = [
    ['user_id', 'TEXT'],
    ['completed_at', 'TEXT'],
    ['phase_id', 'TEXT'],
    ['topic_id', 'TEXT'],
    ['learning_item_id', 'TEXT'],
    ['planned_minutes', 'INTEGER DEFAULT 0'],
    ['actual_minutes', 'INTEGER DEFAULT 0'],
    ['status', "TEXT DEFAULT 'planned'"],
    ['mode', "TEXT DEFAULT 'full'"],
    ['source', "TEXT DEFAULT 'catalog'"]
  ];

  for (const [column, type] of migrations) {
    if (!existingColumns.has(column)) {
      await dbRun(`ALTER TABLE study_plan ADD COLUMN ${column} ${type}`);
    }
  }
}

async function bootstrap() {
  try {
    await initDatabase();
    await migrateUsersTable();
    await migrateStudyPlanTable();

    await dbRun(
      `INSERT OR IGNORE INTO users (id, email, password_hash, salt, name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'local_demo_user',
        'local.demo@gateplanner.test',
        '',
        '',
        'Local Demo User',
        new Date().toISOString()
      ]
    );
    
    // Seed default subjects and topics catalog if table is empty
    const subjectsCount = await dbGet('SELECT COUNT(*) as count FROM subjects');
    
    if (subjectsCount.count === 0) {
      console.log('[Bootstrap] Static Catalog is empty. Seeding GFG subjects & topics reference data...');
      
      const scraped = scrapeGfgResources();
      const matched = matchSyllabus(scraped);
      
      for (const sub of matched) {
        const subId = sub.subject.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        await dbRun(
          'INSERT OR IGNORE INTO subjects (id, name, weightage, difficulty) VALUES (?, ?, ?, ?)',
          [subId, sub.subject, sub.weightage, sub.difficulty]
        );

        // Seed regular topics reference
        for (const topic of sub.topics) {
          const topicId = topic.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          await dbRun(
            `INSERT OR IGNORE INTO topics (
              id, subject_id, name, syllabus_matched, category, 
              estimated_hours, difficulty, resource_link, learning_objectives, recommended_pyqs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              topicId,
              subId,
              topic.name,
              topic.syllabusMatched ? 1 : 0,
              topic.category,
              topic.estimatedHours,
              topic.difficulty,
              topic.resourceLink,
              JSON.stringify(topic.learningObjectives),
              topic.recommendedPyqs
            ]
          );
        }

        // Seed missing topics reference
        for (const missing of sub.missingTopics) {
          const missingId = missing.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          await dbRun(
            `INSERT OR IGNORE INTO topics (
              id, subject_id, name, syllabus_matched, category, 
              estimated_hours, difficulty, resource_link, learning_objectives, recommended_pyqs
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              missingId,
              subId,
              missing.name,
              1,
              missing.category,
              missing.estimatedHours,
              missing.difficulty,
              '',
              JSON.stringify([missing.fullDescription]),
              10
            ]
          );
        }
      }
      console.log('[Bootstrap] Seeding complete! Static reference data loaded.');
    }

    await syncCatalogEstimates();
    await seedLearningItems();
  } catch (err) {
    console.error('[Bootstrap] Bootstrapping failed:', err);
  }
}

// ==========================================
// SECURE USER AUTHENTICATION API ROUTES
// ==========================================

// 1. POST Signup
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please supply a name, email, and password.' });
  }

  try {
    const existing = await dbGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: 'An account already exists with this email address.' });
    }

    const userId = 'user_' + crypto.randomBytes(8).toString('hex');
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    const dateStr = new Date().toISOString();

    await dbRun(
      'INSERT INTO users (id, email, password_hash, salt, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, email.toLowerCase(), hash, salt, name, dateStr]
    );

    res.json({
      success: true,
      token: userId,
      name: name,
      email: email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please supply email and password.' });
  }

  try {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const calculatedHash = hashPassword(password, user.salt);
    if (calculatedHash !== user.password_hash) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    res.json({
      success: true,
      token: user.id,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SCRAMBLED AUTH EXTRACTIONS (PER USER MAPPING)
// ==========================================

const getAuthUser = (req) => {
  return req.userId || 'local_demo_user';
};

async function ensureUserExists(userId) {
  await dbRun(
    `INSERT OR IGNORE INTO users (id, email, password_hash, salt, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      `${userId}@gateplanner.local`,
      '',
      '',
      userId === 'local_demo_user' ? 'Local Demo User' : 'GATE Planner User',
      new Date().toISOString()
    ]
  );
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function toSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function plannedMinutesForMode(baseMinutes, mode) {
  if (mode === 'skim') return Math.max(15, Math.round(baseMinutes * 0.35));
  if (mode === 'revision') return Math.max(30, Math.round(baseMinutes * 0.5));
  if (mode === 'pyq') return Math.max(45, Math.round(baseMinutes * 0.6));
  return Math.max(15, Math.round(baseMinutes || 60));
}

function isWeekendDate(dateString) {
  const [year, month, date] = dateString.split('-').map(Number);
  const day = new Date(year, month - 1, date).getDay();
  return day === 0 || day === 6;
}

async function getCatalogMaps() {
  const subjects = await dbAll('SELECT * FROM subjects');
  const topics = await dbAll('SELECT * FROM topics');
  return { subjects, topics };
}

function findSubject(subjects, subjectName) {
  const wanted = String(subjectName || '').toLowerCase();
  return subjects.find(sub =>
    sub.name.toLowerCase() === wanted ||
    sub.name.toLowerCase().includes(wanted) ||
    wanted.includes(sub.name.toLowerCase())
  );
}

function findTopic(topics, subjectId, topicName) {
  const scoped = topics.filter(topic => topic.subject_id === subjectId);
  const wanted = String(topicName || '').toLowerCase();
  return scoped.find(topic =>
    topic.name.toLowerCase() === wanted ||
    topic.name.toLowerCase().includes(wanted.split(/\s+/)[0] || wanted) ||
    wanted.includes(topic.name.toLowerCase().split(/\s+/)[0] || topic.name.toLowerCase())
  ) || scoped[0];
}

function filterSubjectsByTopicIds(subjectsData, selectedTopics) {
  const selectedTopicOrder = new Map((selectedTopics || []).map((t, index) => [t.topicId || t.id, index]));
  const selectedTopicIds = new Set(selectedTopicOrder.keys());

  if (selectedTopicIds.size === 0) return subjectsData;

  return subjectsData
    .map(sub => ({
      ...sub,
      topics: sub.topics
        .filter(topic => selectedTopicIds.has(topic.id))
        .sort((a, b) => selectedTopicOrder.get(a.id) - selectedTopicOrder.get(b.id)),
      missingTopics: sub.missingTopics
        .filter(topic => selectedTopicIds.has(topic.id))
        .sort((a, b) => selectedTopicOrder.get(a.id) - selectedTopicOrder.get(b.id))
    }))
    .filter(sub => sub.topics.length > 0 || sub.missingTopics.length > 0)
    .sort((a, b) => {
      const firstA = [...a.topics, ...a.missingTopics][0]?.id;
      const firstB = [...b.topics, ...b.missingTopics][0]?.id;
      return selectedTopicOrder.get(firstA) - selectedTopicOrder.get(firstB);
    });
}

function generateRoadmapSchedule(profile, subjectsData) {
  if (!Array.isArray(profile.subjectPlans) || profile.subjectPlans.length === 0) {
    const selectedSubjectsData = filterSubjectsByTopicIds(subjectsData, profile.selectedTopics || []);
    return generateSchedule(profile, selectedSubjectsData);
  }

  const calendar = [];
  profile.subjectPlans.forEach(plan => {
    const segmentStartDate = plan.startDate || profile.startDate;
    const endDate = plan.endDate || profile.targetExamDate;
    if (!segmentStartDate || !endDate || new Date(`${endDate}T00:00:00`) < new Date(`${segmentStartDate}T00:00:00`)) {
      return;
    }

    const segmentProfile = {
      ...profile,
      startDate: segmentStartDate,
      targetExamDate: addDays(endDate, 1),
      selectedTopics: plan.topics || [],
      revisionSubjectName: plan.subject
    };
    const segmentSubjects = filterSubjectsByTopicIds(subjectsData, plan.topics || []);
    calendar.push(...generateSchedule(segmentProfile, segmentSubjects));
  });

  return calendar;
}

async function syncCatalogEstimates() {
  const matched = matchSyllabus(scrapeGfgResources());

  for (const sub of matched) {
    const subId = sub.subject.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await dbRun(
      `INSERT INTO subjects (id, name, weightage, difficulty)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         weightage = excluded.weightage,
         difficulty = excluded.difficulty`,
      [subId, sub.subject, sub.weightage, sub.difficulty]
    );

    const allTopics = [
      ...sub.topics.map(topic => ({ ...topic, syllabusMatched: topic.syllabusMatched ? 1 : 0 })),
      ...sub.missingTopics.map(topic => ({
        name: topic.name,
        syllabusMatched: 1,
        category: topic.category,
        estimatedHours: topic.estimatedHours,
        difficulty: topic.difficulty,
        resourceLink: '',
        learningObjectives: [topic.fullDescription],
        recommendedPyqs: 10
      }))
    ];

    for (const topic of allTopics) {
      const topicId = topic.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await dbRun(
        `INSERT INTO topics (
          id, subject_id, name, syllabus_matched, category,
          estimated_hours, difficulty, resource_link, learning_objectives, recommended_pyqs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject_id = excluded.subject_id,
          name = excluded.name,
          syllabus_matched = excluded.syllabus_matched,
          category = excluded.category,
          estimated_hours = excluded.estimated_hours,
          difficulty = excluded.difficulty,
          resource_link = excluded.resource_link,
          learning_objectives = excluded.learning_objectives,
          recommended_pyqs = excluded.recommended_pyqs`,
        [
          topicId,
          subId,
          topic.name,
          topic.syllabusMatched,
          topic.category,
          topic.estimatedHours,
          topic.difficulty,
          topic.resourceLink || '',
          JSON.stringify(topic.learningObjectives || []),
          topic.recommendedPyqs || 8
        ]
      );
    }
  }
}

async function seedLearningItems() {
  const { subjects, topics } = await getCatalogMaps();

  for (const item of learningItemsData) {
    const subject = findSubject(subjects, item.subject);
    if (!subject) continue;

    const topic = findTopic(topics, subject.id, item.topic);
    await dbRun(
      `INSERT INTO learning_items (
        id, subject_id, topic_id, title, provider, duration_minutes, sequence, source_url, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subject_id = excluded.subject_id,
        topic_id = excluded.topic_id,
        title = excluded.title,
        provider = excluded.provider,
        duration_minutes = excluded.duration_minutes,
        sequence = excluded.sequence,
        source_url = excluded.source_url,
        category = excluded.category`,
      [
        item.id,
        subject.id,
        topic?.id || null,
        item.title,
        item.provider,
        item.durationMinutes,
        item.sequence,
        item.sourceUrl || '',
        item.category || 'Video Lesson'
      ]
    );
  }
}

async function insertStudyTask(userId, date, task) {
  const taskId = task.id || `${userId}_${date}_${toSlug(task.subject)}_${toSlug(task.topicName)}_${toSlug(task.mode || task.type)}_${crypto.randomBytes(3).toString('hex')}`;
  const plannedMinutes = task.plannedMinutes ?? Math.round((task.duration || 1) * 60);
  await dbRun(
    `INSERT INTO study_plan (
      id, user_id, date, phase_id, topic_id, learning_item_id, subject, topic_name, task_type, duration,
      planned_minutes, actual_minutes, status, mode, source, difficulty, resource_link,
      learning_objectives, recommended_pyqs, description, completed_at, completed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      phase_id = excluded.phase_id,
      topic_id = excluded.topic_id,
      learning_item_id = excluded.learning_item_id,
      subject = excluded.subject,
      topic_name = excluded.topic_name,
      task_type = excluded.task_type,
      duration = excluded.duration,
      planned_minutes = excluded.planned_minutes,
      status = excluded.status,
      mode = excluded.mode,
      source = excluded.source,
      description = excluded.description`,
    [
      taskId,
      userId,
      date,
      task.phaseId || '',
      task.topicId || '',
      task.learningItemId || '',
      task.subject,
      task.topicName,
      task.type || 'study',
      parseFloat((plannedMinutes / 60).toFixed(2)),
      plannedMinutes,
      task.actualMinutes || 0,
      task.status || 'planned',
      task.mode || 'full',
      task.source || 'catalog',
      task.difficulty || '',
      task.resourceLink || '',
      JSON.stringify(task.learningObjectives || []),
      task.recommendedPyqs || 0,
      task.description || '',
      task.completedAt || null,
      task.completed ? 1 : 0
    ]
  );
  return taskId;
}

function normalizePlanningOptions(options = {}, defaults = {}) {
  const subjectPriority = Array.isArray(options.subjectPriority)
    ? options.subjectPriority.filter(Boolean)
    : [];
  const parallelSubjects = Array.isArray(options.parallelSubjects)
    ? options.parallelSubjects.filter(Boolean)
    : [];
  const strategy = options.strategy === 'parallel' ? 'parallel' : 'sequential';
  const maxSubjectsPerDay = strategy === 'parallel'
    ? Math.min(3, Math.max(2, parseInt(options.maxSubjectsPerDay || parallelSubjects.length || 2, 10)))
    : 1;

  return {
    strategy,
    subjectPriority,
    parallelSubjects,
    maxSubjectsPerDay,
    weekdayMinutes: Math.max(60, parseInt(options.weekdayMinutes || defaults.weekdayMinutes || 180, 10)),
    weekendMinutes: Math.max(60, parseInt(options.weekendMinutes || defaults.weekendMinutes || 360, 10))
  };
}

function subjectRank(subject, planningOptions) {
  const wanted = String(subject || '').toLowerCase();
  const priority = [
    ...(planningOptions.parallelSubjects || []),
    ...(planningOptions.subjectPriority || [])
  ];
  const index = priority.findIndex(name => {
    const value = String(name || '').toLowerCase();
    return value === wanted || value.includes(wanted) || wanted.includes(value);
  });
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function orderQueueBySubjectPreference(queue, planningOptions) {
  return queue
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const rankA = subjectRank(a.task.subject, planningOptions);
      const rankB = subjectRank(b.task.subject, planningOptions);
      if (rankA !== rankB) return rankA - rankB;
      if (a.task.subject !== b.task.subject) return String(a.task.subject).localeCompare(String(b.task.subject));
      return a.index - b.index;
    })
    .map(entry => entry.task);
}

async function scheduleTaskChunk({ userId, task, phaseId, date, chunk, totalParts, part }) {
  const splitTitle = totalParts > 1
    ? `${task.topicName} (${part}/${totalParts})`
    : task.topicName;

  await insertStudyTask(userId, date, {
    ...task,
    phaseId,
    topicName: splitTitle,
    plannedMinutes: chunk,
    description: totalParts > 1
      ? `${task.description || ''} Split automatically to respect daily study capacity.`.trim()
      : task.description
  });
}

async function scheduleSequentialQueue({ userId, queue, phaseId, slots, weekdayMinutes, weekendMinutes }) {
  let scheduled = 0;
  let overflow = 0;
  let slotIndex = 0;

  for (const task of queue) {
    let minutesLeft = Math.max(15, task.plannedMinutes || 60);
    const maxDaily = Math.max(15, Math.max(weekdayMinutes, weekendMinutes));
    const totalParts = Math.max(1, Math.ceil(minutesLeft / maxDaily));
    let part = 1;

    while (minutesLeft > 0) {
      const slot = slots[slotIndex];
      if (!slot) {
        overflow += 1;
        break;
      }

      if (slot.remaining < 15) {
        slotIndex += 1;
        continue;
      }

      const chunk = Math.min(minutesLeft, slot.remaining);
      await scheduleTaskChunk({ userId, task, phaseId, date: slot.date, chunk, totalParts, part });

      scheduled += 1;
      minutesLeft -= chunk;
      slot.remaining -= chunk;
      part += 1;

      if (slot.remaining < 15) {
        slotIndex += 1;
      }
    }
  }

  return { scheduled, overflow };
}

async function scheduleParallelQueue({ userId, queue, phaseId, slots, planningOptions, weekdayMinutes, weekendMinutes }) {
  let scheduled = 0;
  let overflow = 0;
  const maxDaily = Math.max(15, Math.max(weekdayMinutes, weekendMinutes));
  const priority = [];
  const queueBySubject = new Map();

  for (const task of queue) {
    if (!queueBySubject.has(task.subject)) {
      queueBySubject.set(task.subject, []);
      priority.push(task.subject);
    }
    queueBySubject.get(task.subject).push({
      task: { ...task },
      minutesLeft: Math.max(15, task.plannedMinutes || 60),
      part: 1,
      totalParts: Math.max(1, Math.ceil(Math.max(15, task.plannedMinutes || 60) / maxDaily))
    });
  }

  priority.sort((a, b) => {
    const rankA = subjectRank(a, planningOptions);
    const rankB = subjectRank(b, planningOptions);
    if (rankA !== rankB) return rankA - rankB;
    return String(a).localeCompare(String(b));
  });

  for (const slot of slots) {
    if ([...queueBySubject.values()].every(items => items.length === 0)) break;

    const activeSubjects = priority
      .filter(subject => (queueBySubject.get(subject) || []).length > 0)
      .slice(0, planningOptions.maxSubjectsPerDay);

    if (activeSubjects.length === 0) continue;

    const baseShare = Math.floor(slot.remaining / activeSubjects.length);
    const allocations = activeSubjects.map((subject, index) => ({
      subject,
      minutes: index === activeSubjects.length - 1
        ? slot.remaining - (baseShare * (activeSubjects.length - 1))
        : baseShare
    }));

    for (const allocation of allocations) {
      let available = allocation.minutes;
      const subjectQueue = queueBySubject.get(allocation.subject) || [];

      while (available >= 15 && subjectQueue.length > 0) {
        const active = subjectQueue[0];
        const chunk = Math.min(available, active.minutesLeft);
        await scheduleTaskChunk({
          userId,
          task: active.task,
          phaseId,
          date: slot.date,
          chunk,
          totalParts: active.totalParts,
          part: active.part
        });

        scheduled += 1;
        available -= chunk;
        slot.remaining -= chunk;
        active.minutesLeft -= chunk;
        active.part += 1;

        if (active.minutesLeft <= 0) {
          subjectQueue.shift();
        }
      }
    }
  }

  for (const items of queueBySubject.values()) {
    overflow += items.length;
  }

  return { scheduled, overflow };
}

async function scheduleQueueWithDailyCapacity({ userId, queue, phaseId, startDate, endDate, weekdayMinutes, weekendMinutes, planningOptions = {} }) {
  const normalizedOptions = normalizePlanningOptions(planningOptions, { weekdayMinutes, weekendMinutes });
  const effectiveWeekdayMinutes = normalizedOptions.weekdayMinutes;
  const effectiveWeekendMinutes = normalizedOptions.weekendMinutes;
  const orderedQueue = orderQueueBySubjectPreference(queue, normalizedOptions);
  const slots = [];

  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    slots.push({
      date: cursor,
      remaining: isWeekendDate(cursor) ? effectiveWeekendMinutes : effectiveWeekdayMinutes
    });
  }

  if (normalizedOptions.strategy === 'parallel') {
    return scheduleParallelQueue({
      userId,
      queue: orderedQueue,
      phaseId,
      slots,
      planningOptions: normalizedOptions,
      weekdayMinutes: effectiveWeekdayMinutes,
      weekendMinutes: effectiveWeekendMinutes
    });
  }

  return scheduleSequentialQueue({
    userId,
    queue: orderedQueue,
    phaseId,
    slots,
    weekdayMinutes: effectiveWeekdayMinutes,
    weekendMinutes: effectiveWeekendMinutes
  });
}

async function upsertTopicProgress(userId, task, status, mode) {
  if (!task.topic_id && !task.learning_item_id && !task.topicId && !task.learningItemId) return;
  const topicId = task.topic_id || task.topicId || '';
  const learningItemId = task.learning_item_id || task.learningItemId || '';
  const progressId = `${userId}_${topicId || learningItemId}`;
  await dbRun(
    `INSERT INTO topic_progress (id, user_id, topic_id, learning_item_id, status, mode, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       mode = excluded.mode,
       updated_at = excluded.updated_at`,
    [progressId, userId, topicId, learningItemId, status, mode || 'full', new Date().toISOString()]
  );
}

async function getNextUnfinishedCandidate(userId) {
  const { subjects, topics } = await getCatalogMaps();
  const subjectById = new Map(subjects.map(subject => [subject.id, subject]));
  const topicById = new Map(topics.map(topic => [topic.id, topic]));
  const existing = await dbAll('SELECT topic_id, learning_item_id FROM study_plan WHERE user_id = ?', [userId]);
  const progress = await dbAll(
    `SELECT topic_id, learning_item_id FROM topic_progress
     WHERE user_id = ? AND status IN ('completed', 'skimmed')`,
    [userId]
  );
  const scheduledTopicIds = new Set(existing.map(row => row.topic_id).filter(Boolean));
  const scheduledItemIds = new Set(existing.map(row => row.learning_item_id).filter(Boolean));
  const completedTopicIds = new Set(progress.map(row => row.topic_id).filter(Boolean));
  const completedItemIds = new Set(progress.map(row => row.learning_item_id).filter(Boolean));
  const subjectPriority = ['Algorithm', 'Data Structure', 'Discrete Mathematics', 'DBMS', 'C Programming', 'Engineering Mathematics', 'Operating System', 'Computer Networks'];
  const candidates = [];

  const learningItems = await dbAll('SELECT * FROM learning_items ORDER BY subject_id ASC, sequence ASC');
  learningItems.forEach(item => {
    if (scheduledItemIds.has(item.id) || completedItemIds.has(item.id)) return;
    const subject = subjectById.get(item.subject_id);
    if (!subject) return;
    candidates.push({
      subject: subject.name,
      topicName: item.title,
      topicId: item.topic_id || '',
      learningItemId: item.id,
      plannedMinutes: item.duration_minutes || 60,
      type: item.category?.toLowerCase().includes('pyq') ? 'pyq' : 'study',
      mode: item.category?.toLowerCase().includes('pyq') ? 'pyq' : 'full',
      source: 'video',
      description: `${item.provider} - ${item.category || 'Video Lesson'}`
    });
  });

  topics.forEach(topic => {
    if (scheduledTopicIds.has(topic.id) || completedTopicIds.has(topic.id)) return;
    const subject = subjectById.get(topic.subject_id);
    if (!subject) return;
    candidates.push({
      subject: subject.name,
      topicName: topic.name,
      topicId: topic.id,
      learningItemId: '',
      plannedMinutes: Math.max(45, (topic.estimated_hours || 1) * 60),
      type: 'study',
      mode: 'full',
      source: 'catalog',
      difficulty: topic.difficulty,
      resourceLink: topic.resource_link || '',
      learningObjectives: JSON.parse(topic.learning_objectives || '[]'),
      recommendedPyqs: topic.recommended_pyqs || 0,
      description: `Auto-filled because you completed another planned topic early.`
    });
  });

  candidates.sort((a, b) => {
    const rankA = subjectPriority.findIndex(name => name.toLowerCase() === a.subject.toLowerCase());
    const rankB = subjectPriority.findIndex(name => name.toLowerCase() === b.subject.toLowerCase());
    if (rankA !== rankB) return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.topicName.localeCompare(b.topicName);
  });

  return candidates[0] || null;
}

async function refillDateWithNextTopic(userId, date, preferredMinutes = 60, phaseId = '') {
  const profile = await dbGet('SELECT weekday_hours, weekend_hours FROM user_profile WHERE user_id = ?', [userId]);
  const capacity = isWeekendDate(date)
    ? Math.max(60, Math.round(parseFloat(profile?.weekend_hours || 6) * 60))
    : Math.max(60, Math.round(parseFloat(profile?.weekday_hours || 3) * 60));
  const rows = await dbAll('SELECT planned_minutes, duration FROM study_plan WHERE user_id = ? AND date = ? AND completed = 0', [userId, date]);
  const planned = rows.reduce((sum, row) => sum + (row.planned_minutes || Math.round((row.duration || 0) * 60)), 0);
  const available = Math.max(0, capacity - planned);
  const minutes = Math.max(15, Math.min(preferredMinutes || available || 60, available || preferredMinutes || 60));
  if (minutes < 15) return null;

  const candidate = await getNextUnfinishedCandidate(userId);
  if (!candidate) return null;

  return insertStudyTask(userId, date, {
    ...candidate,
    phaseId,
    plannedMinutes: Math.min(candidate.plannedMinutes || minutes, minutes),
    topicName: (candidate.plannedMinutes || minutes) > minutes
      ? `${candidate.topicName} (auto-fill part)`
      : candidate.topicName
  });
}

async function removeFutureDuplicatesAndRefill(userId, task, completedDate, originalDate) {
  const topicId = task.topic_id || task.topicId || '';
  const learningItemId = task.learning_item_id || task.learningItemId || '';
  if (!topicId && !learningItemId) return [];

  const conditions = [];
  const params = [userId, completedDate, task.id || ''];
  if (topicId) {
    conditions.push('topic_id = ?');
    params.push(topicId);
  }
  if (learningItemId) {
    conditions.push('learning_item_id = ?');
    params.push(learningItemId);
  }

  const duplicateRows = await dbAll(
    `SELECT * FROM study_plan
     WHERE user_id = ?
       AND completed = 0
       AND date >= ?
       AND id <> ?
       AND (${conditions.join(' OR ')})`,
    params
  );
  const refillTargets = [];

  if (originalDate && originalDate > completedDate) {
    refillTargets.push({
      date: originalDate,
      minutes: task.planned_minutes || Math.round((task.duration || 1) * 60),
      phaseId: task.phase_id || ''
    });
  }

  for (const duplicate of duplicateRows) {
    refillTargets.push({
      date: duplicate.date,
      minutes: duplicate.planned_minutes || Math.round((duplicate.duration || 1) * 60),
      phaseId: duplicate.phase_id || ''
    });
  }

  if (duplicateRows.length > 0) {
    await dbRun(
      `DELETE FROM study_plan
       WHERE user_id = ?
         AND completed = 0
         AND date >= ?
         AND id <> ?
         AND (${conditions.join(' OR ')})`,
      params
    );
  }

  const refilled = [];
  for (const target of refillTargets) {
    const id = await refillDateWithNextTopic(userId, target.date, target.minutes, target.phaseId);
    if (id) refilled.push({ date: target.date, taskId: id });
  }

  return refilled;
}

async function createNitcPhaseOnePlan(userId, rawPlanningOptions = {}) {
  const startDate = '2026-05-25';
  const endDate = '2026-07-10';
  const phaseId = `${userId}_nitc_phase1`;
  const includedSubjects = ['DBMS', 'C Programming', 'Algorithm', 'Discrete Mathematics', 'Data Structure', 'Engineering Mathematics'];
  const { subjects, topics } = await getCatalogMaps();
  const learningItems = await dbAll('SELECT * FROM learning_items ORDER BY sequence ASC');
  const profile = await dbGet('SELECT weekday_hours, weekend_hours FROM user_profile WHERE user_id = ?', [userId]);
  const weekdayMinutes = Math.max(60, Math.round(parseFloat(profile?.weekday_hours || 3) * 60));
  const weekendMinutes = Math.max(60, Math.round(parseFloat(profile?.weekend_hours || 6) * 60));
  const planningOptions = normalizePlanningOptions(rawPlanningOptions, { weekdayMinutes, weekendMinutes });

  await dbRun(
    `INSERT INTO study_phases (id, user_id, name, start_date, end_date, target_label, status, config, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       target_label = excluded.target_label,
       status = excluded.status,
       config = excluded.config`,
    [
      phaseId,
      userId,
      'NITC Self Sponsored Phase 1',
      startDate,
      endDate,
      'NITC self-sponsored deadline',
      'active',
      JSON.stringify({ includedSubjects, excludedSubjects: ['Operating System', 'Computer Networks'], planningOptions }),
      new Date().toISOString()
    ]
  );

  await dbRun(
    `DELETE FROM study_plan
     WHERE user_id = ?
       AND completed = 0
       AND date >= ?
       AND date <= ?
       AND (phase_id = ? OR phase_id IS NULL OR phase_id = '' OR source IN ('catalog', 'video'))`,
    [userId, startDate, endDate, phaseId]
  );

  const queue = [];
  const pushCatalogTopics = (subjectName) => {
    const subject = findSubject(subjects, subjectName);
    if (!subject) return;
    topics
      .filter(topic => topic.subject_id === subject.id)
      .sort((a, b) => (a.name > b.name ? 1 : -1))
      .forEach(topic => {
        const minutes = Math.max(45, (topic.estimated_hours || 4) * 60);
        queue.push({
          subject: subject.name,
          topicName: topic.name,
          topicId: topic.id,
          plannedMinutes: minutes,
          type: 'study',
          mode: 'full',
          source: 'catalog',
          difficulty: topic.difficulty,
          description: `Study ${topic.name} for ${subject.name}.`
        });
        queue.push({
          subject: subject.name,
          topicName: `PYQ Practice: ${topic.name}`,
          topicId: topic.id,
          plannedMinutes: Math.min(90, Math.max(45, Math.round(minutes * 0.25))),
          type: 'pyq',
          mode: 'pyq',
          source: 'catalog',
          description: `Solve GATE PYQs for ${topic.name}.`
        });
      });
  };

  pushCatalogTopics('DBMS');
  pushCatalogTopics('C Programming');

  learningItems
    .filter(item => findSubject(subjects, 'Algorithm')?.id === item.subject_id)
    .forEach(item => queue.push({
      subject: 'Algorithm',
      topicName: item.title,
      topicId: item.topic_id,
      learningItemId: item.id,
      plannedMinutes: item.duration_minutes,
      type: item.category?.toLowerCase().includes('pyq') ? 'pyq' : 'study',
      mode: 'full',
      source: 'video',
      description: `${item.provider} - mapped to ${item.category || 'Video Lesson'}`
    }));

  learningItems
    .filter(item => findSubject(subjects, 'Discrete Mathematics')?.id === item.subject_id)
    .forEach(item => queue.push({
      subject: 'Discrete Mathematics',
      topicName: item.title,
      topicId: item.topic_id,
      learningItemId: item.id,
      plannedMinutes: item.duration_minutes,
      type: item.category?.toLowerCase().includes('pyq') ? 'pyq' : 'study',
      mode: 'full',
      source: 'video',
      description: `${item.provider} - mapped to ${item.category || 'Video Lesson'}`
    }));

  pushCatalogTopics('Data Structure');
  pushCatalogTopics('Engineering Mathematics');

  const result = await scheduleQueueWithDailyCapacity({
    userId,
    queue,
    phaseId,
    startDate,
    endDate,
    weekdayMinutes,
    weekendMinutes,
    planningOptions
  });

  return { phaseId, queued: queue.length, scheduled: result.scheduled, overflow: result.overflow, startDate, endDate, planningOptions };
}

app.use('/api', async (req, res, next) => {
  if (!supabase) {
    req.userId = 'local_demo_user';
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized session.' });
  }

  if (token.startsWith('user_') || token === 'local_demo_user') {
    req.userId = token;
    await ensureUserExists(req.userId);
    return next();
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  req.userId = data.user.id;
  await ensureUserExists(req.userId);
  next();
});

// ==========================================
// DYNAMIC USER-SCOPED STUDY PLANNER ROUTES
// ==========================================

// 3. GET User Profile
app.get('/api/profile', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const profile = await dbGet('SELECT * FROM user_profile WHERE user_id = ?', [userId]);
    if (!profile) {
      return res.json({ onboardingCompleted: false });
    }
    
    res.json({
      onboardingCompleted: true,
      targetYear: profile.target_year,
      startDate: profile.start_date,
      targetExamDate: profile.target_exam_date,
      weekdayHours: profile.weekday_hours,
      weekendHours: profile.weekend_hours,
      preferredSlots: JSON.parse(profile.preferred_slots || '[]'),
      revisionFrequency: profile.revision_frequency,
      mockTestFrequency: profile.mock_test_frequency,
      currentPrepLevel: profile.current_prep_level,
      completedTopics: JSON.parse(profile.completed_topics || '[]'),
      weakSubjects: JSON.parse(profile.weak_subjects || '[]'),
      breakPreference: profile.break_preference,
      userType: profile.user_type,
      streakCount: profile.streak_count,
      lastActiveDate: profile.last_active_date
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/onboarding', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    await dbRun('DELETE FROM study_plan WHERE user_id = ?', [userId]);
    await dbRun('DELETE FROM user_profile WHERE user_id = ?', [userId]);
    res.json({ success: true, message: 'Planner setup cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST Onboarding Profile & Generate Schedule
app.post('/api/onboarding', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const profile = req.body;
  
  try {
    await ensureUserExists(userId);

    // 1. Save or Update User details
    await dbRun(
      `INSERT INTO user_profile (
        user_id, target_year, start_date, target_exam_date, weekday_hours, weekend_hours,
        preferred_slots, revision_frequency, mock_test_frequency, current_prep_level,
        completed_topics, weak_subjects, break_preference, user_type, streak_count, last_active_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT streak_count FROM user_profile WHERE user_id = ?), 0), (SELECT last_active_date FROM user_profile WHERE user_id = ?))
      ON CONFLICT(user_id) DO UPDATE SET
        target_year = excluded.target_year,
        start_date = excluded.start_date,
        target_exam_date = excluded.target_exam_date,
        weekday_hours = excluded.weekday_hours,
        weekend_hours = excluded.weekend_hours,
        preferred_slots = excluded.preferred_slots,
        revision_frequency = excluded.revision_frequency,
        mock_test_frequency = excluded.mock_test_frequency,
        current_prep_level = excluded.current_prep_level,
        completed_topics = excluded.completed_topics,
        weak_subjects = excluded.weak_subjects,
        break_preference = excluded.break_preference,
        user_type = excluded.user_type,
        streak_count = excluded.streak_count,
        last_active_date = excluded.last_active_date`,
      [
        userId,
        parseInt(profile.targetYear || 2027),
        profile.startDate,
        profile.targetExamDate,
        parseFloat(profile.weekdayHours),
        parseFloat(profile.weekendHours),
        JSON.stringify(profile.preferredSlots || []),
        profile.revisionFrequency,
        profile.mockTestFrequency,
        profile.currentPrepLevel,
        JSON.stringify(profile.completedTopics || []),
        JSON.stringify(profile.weakSubjects || []),
        profile.breakPreference,
        profile.userType,
        userId,
        userId
      ]
    );

    // 2. Fetch all subjects/topics catalog reference
    const subjects = await dbAll('SELECT * FROM subjects');
    const topics = await dbAll('SELECT * FROM topics');

    const formattedSubjectsData = subjects.map(sub => {
      const subTopics = topics.filter(t => t.subject_id === sub.id && t.category !== 'Missing GATE');
      const missingTopics = topics.filter(t => t.subject_id === sub.id && t.category === 'Missing GATE');
      
      return {
        id: sub.id,
        subject: sub.name,
        weightage: sub.weightage,
        difficulty: sub.difficulty,
        topics: subTopics.map(t => ({
          id: t.id,
          name: t.name,
          estimatedHours: t.estimated_hours,
          difficulty: t.difficulty,
          resourceLink: t.resource_link,
          learningObjectives: JSON.parse(t.learning_objectives || '[]'),
          recommendedPyqs: t.recommended_pyqs,
          category: t.category
        })),
        missingTopics: missingTopics.map(t => ({
          id: t.id,
          name: t.name,
          fullDescription: JSON.parse(t.learning_objectives || '[""]')[0],
          estimatedHours: t.estimated_hours,
          difficulty: t.difficulty,
          category: t.category
        }))
      };
    });

    // 3. Generate Calendar Schedule
    const calendar = generateRoadmapSchedule(profile, formattedSubjectsData);

    // 4. Clear old study plan for this specific user, and insert new generated plan
    await dbRun('DELETE FROM study_plan WHERE user_id = ?', [userId]);
    
    for (const day of calendar) {
      for (const task of day.tasks) {
        const taskId = `${userId}_${day.date}_${task.subject.replace(/[^a-z0-9]/ig, '')}_${task.topicName.replace(/[^a-z0-9]/ig, '')}`;
        await dbRun(
          `INSERT OR IGNORE INTO study_plan (
            id, user_id, date, subject, topic_name, task_type, duration, 
            difficulty, resource_link, learning_objectives, recommended_pyqs, description, completed_at, completed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId,
            userId,
            day.date,
            task.subject,
            task.topicName,
            task.type,
            task.duration,
            task.difficulty || '',
            task.resourceLink || '',
            JSON.stringify(task.learningObjectives || []),
            task.recommendedPyqs || 0,
            task.description || '',
            null,
            0
          ]
        );
      }
      if (day.tasks.length === 0) {
        const taskId = `${userId}_${day.date}_rest`;
        await dbRun(
          `INSERT OR IGNORE INTO study_plan (id, user_id, date, subject, topic_name, task_type, duration, completed_at, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [taskId, userId, day.date, 'General Buffer', 'Rest / Buffer Block', 'buffer', 0, null, 0]
        );
      }
    }

    res.json({ success: true, message: 'Prep calendar generated successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4b. GET Full Catalog for Onboarding Topic Selection
app.get('/api/catalog', async (req, res) => {
  try {
    const subjects = await dbAll('SELECT * FROM subjects ORDER BY name ASC');
    const topics = await dbAll('SELECT * FROM topics ORDER BY name ASC');

    res.json(subjects.map(sub => ({
      id: sub.id,
      name: sub.name,
      weightage: sub.weightage,
      difficulty: sub.difficulty,
      topics: topics
        .filter(topic => topic.subject_id === sub.id)
        .map(topic => ({
          id: topic.id,
          name: topic.name,
          category: topic.category,
          estimatedHours: topic.estimated_hours,
          difficulty: topic.difficulty
        }))
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET Subjects list with User-Specific Completion Rates
app.get('/api/subjects', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const subjects = await dbAll('SELECT * FROM subjects');
    const topics = await dbAll('SELECT * FROM topics');
    
    const profile = await dbGet('SELECT completed_topics FROM user_profile WHERE user_id = ?', [userId]);
    const completedList = JSON.parse((profile && profile.completed_topics) || '[]');

    const results = subjects.map(sub => {
      const subTopics = topics.filter(t => t.subject_id === sub.id);
      const totalTopicsCount = subTopics.length;
      
      const completedCount = subTopics.filter(t => 
        completedList.some(comp => comp.toLowerCase() === t.name.toLowerCase())
      ).length;

      const completionRate = totalTopicsCount > 0 ? Math.round((completedCount / totalTopicsCount) * 100) : 0;

      return {
        id: sub.id,
        name: sub.name,
        weightage: sub.weightage,
        difficulty: sub.difficulty,
        totalTopics: totalTopicsCount,
        completedTopicsCount: completedCount,
        completionRate: completionRate
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET Topics under a Subject (Merged with User-Specific Metadata)
app.get('/api/topics/:subjectId', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { subjectId } = req.params;
  try {
    const topics = await dbAll('SELECT * FROM topics WHERE subject_id = ?', [subjectId]);
    const userMeta = await dbAll('SELECT * FROM user_topics_metadata WHERE user_id = ?', [userId]);

    const parsedTopics = topics.map(t => {
      const meta = userMeta.find(m => m.topic_id === t.id);
      return {
        id: t.id,
        name: t.name,
        syllabusMatched: t.syllabus_matched === 1,
        category: t.category,
        estimatedHours: t.estimated_hours,
        difficulty: t.difficulty,
        resourceLink: t.resource_link,
        learningObjectives: JSON.parse(t.learning_objectives || '[]'),
        recommendedPyqs: t.recommended_pyqs,
        notes: meta ? meta.notes : '',
        isBookmarked: meta ? meta.is_bookmarked === 1 : false,
        confidenceScore: meta ? meta.confidence_score : 0
      };
    });
    res.json(parsedTopics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST Save Notes for a Topic
app.post('/api/topics/:id/notes', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { id } = req.params;
  const { notes } = req.body;
  
  try {
    const metaId = `${userId}_${id}`;
    await dbRun(
      `INSERT INTO user_topics_metadata (id, user_id, topic_id, notes) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, topic_id) DO UPDATE SET notes = excluded.notes`,
      [metaId, userId, id, notes]
    );
    res.json({ success: true, message: 'Notes saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. POST Toggle Bookmark for a Topic
app.post('/api/topics/:id/bookmark', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { id } = req.params;
  try {
    const meta = await dbGet('SELECT is_bookmarked FROM user_topics_metadata WHERE user_id = ? AND topic_id = ?', [userId, id]);
    const newState = meta && meta.is_bookmarked === 1 ? 0 : 1;
    const metaId = `${userId}_${id}`;
    
    await dbRun(
      `INSERT INTO user_topics_metadata (id, user_id, topic_id, is_bookmarked) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, topic_id) DO UPDATE SET is_bookmarked = excluded.is_bookmarked`,
      [metaId, userId, id, newState]
    );
    res.json({ success: true, isBookmarked: newState === 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. POST Save Confidence Rating for a Topic
app.post('/api/topics/:id/confidence', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { id } = req.params;
  const { score } = req.body; // 0 to 100
  
  try {
    const metaId = `${userId}_${id}`;
    await dbRun(
      `INSERT INTO user_topics_metadata (id, user_id, topic_id, confidence_score) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, topic_id) DO UPDATE SET confidence_score = excluded.confidence_score`,
      [metaId, userId, id, score]
    );
    
    // If confidence score is high (>= 80), automatically tag it as completed!
    if (score >= 80) {
      const topic = await dbGet('SELECT name FROM topics WHERE id = ?', [id]);
      const profile = await dbGet('SELECT completed_topics FROM user_profile WHERE user_id = ?', [userId]);
      if (profile && topic) {
        const completed = JSON.parse(profile.completed_topics || '[]');
        if (!completed.includes(topic.name)) {
          completed.push(topic.name);
          await dbRun('UPDATE user_profile SET completed_topics = ? WHERE user_id = ?', [JSON.stringify(completed), userId]);
        }
      }
    }
    
    res.json({ success: true, message: 'Confidence rating updated!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET Calendar Events
app.get('/api/calendar', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const dbTasks = await dbAll('SELECT * FROM study_plan WHERE user_id = ? ORDER BY date ASC', [userId]);
    
    // Group tasks by date
    const daysMap = {};
    dbTasks.forEach(task => {
      if (!daysMap[task.date]) {
        daysMap[task.date] = {
          date: task.date,
          dayOfWeek: new Date(task.date).toLocaleDateString('en-US', { weekday: 'long' }),
          isBuffer: task.task_type === 'buffer',
          tasks: []
        };
      }
      if (task.task_type !== 'buffer' || task.topic_name !== 'Rest / Buffer Block') {
        daysMap[task.date].tasks.push({
          id: task.id,
          phaseId: task.phase_id,
          topicId: task.topic_id,
          learningItemId: task.learning_item_id,
          subject: task.subject,
          topicName: task.topic_name,
          type: task.task_type,
          duration: task.duration,
          plannedMinutes: task.planned_minutes || Math.round((task.duration || 0) * 60),
          actualMinutes: task.actual_minutes || 0,
          status: task.status || (task.completed === 1 ? 'completed' : 'planned'),
          mode: task.mode || 'full',
          source: task.source || 'catalog',
          difficulty: task.difficulty,
          resourceLink: task.resource_link,
          learningObjectives: JSON.parse(task.learning_objectives || '[]'),
          recommendedPyqs: task.recommended_pyqs,
          description: task.description,
          completedAt: task.completed_at,
          completed: task.completed === 1
        });
      }
    });

    res.json(Object.values(daysMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. POST Toggle Task Completion
app.post('/api/calendar/toggle-complete', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { taskId, completed, completedDate, actualMinutes, mode } = req.body;
  try {
    const finishDate = completedDate || new Date().toISOString().split('T')[0];
    const task = await dbGet('SELECT * FROM study_plan WHERE id = ? AND user_id = ?', [taskId, userId]);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    let refilled = [];

    if (completed) {
      const originalDate = task.date;
      const minutes = actualMinutes || task.actual_minutes || task.planned_minutes || Math.round((task.duration || 0) * 60);
      await dbRun(
        'UPDATE study_plan SET completed = ?, completed_at = ?, date = ?, status = ?, mode = ?, actual_minutes = ? WHERE id = ? AND user_id = ?',
        [1, finishDate, finishDate, mode === 'skim' ? 'skimmed' : 'completed', mode || task.mode || 'full', minutes, taskId, userId]
      );
      await upsertTopicProgress(userId, task, mode === 'skim' ? 'skimmed' : 'completed', mode || task.mode || 'full');
      refilled = await removeFutureDuplicatesAndRefill(userId, task, finishDate, originalDate);

      const profile = await dbGet('SELECT completed_topics FROM user_profile WHERE user_id = ?', [userId]);
      if (profile && task.task_type === 'study') {
        const completedTopics = JSON.parse(profile.completed_topics || '[]');
        if (!completedTopics.some(topic => topic.toLowerCase() === task.topic_name.toLowerCase())) {
          completedTopics.push(task.topic_name);
          await dbRun('UPDATE user_profile SET completed_topics = ? WHERE user_id = ?', [JSON.stringify(completedTopics), userId]);
        }
      }
    } else {
      await dbRun(
        'UPDATE study_plan SET completed = ?, completed_at = ?, status = ? WHERE id = ? AND user_id = ?',
        [0, null, 'planned', taskId, userId]
      );
    }
    
    // Dynamic Streaks logic
    const user = await dbGet('SELECT streak_count, last_active_date FROM user_profile WHERE user_id = ?', [userId]);
    let currentStreak = user ? user.streak_count : 0;
    const todayStr = finishDate;

    if (completed) {
      if (user && user.last_active_date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (user.last_active_date === yesterdayStr) {
          currentStreak += 1;
        } else if (user.last_active_date !== todayStr) {
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
      }
      await dbRun('UPDATE user_profile SET streak_count = ?, last_active_date = ? WHERE user_id = ?', [currentStreak, todayStr, userId]);
    }

    res.json({ success: true, streak: currentStreak, refilled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. POST Custom Reschedule (Drag & Drop or Adaptive Rebalance)
app.post('/api/calendar/reschedule', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { type, taskId, newDate, missedDate } = req.body;
  
  try {
    const profile = await dbGet('SELECT * FROM user_profile WHERE user_id = ?', [userId]);
    if (!profile) return res.status(400).json({ error: 'User profile not set.' });
    
    // Format profile camelCase for the planner rebalancer
    const plannerProfile = {
      targetYear: profile.target_year,
      startDate: profile.start_date,
      targetExamDate: profile.target_exam_date,
      weekdayHours: profile.weekday_hours,
      weekendHours: profile.weekend_hours,
      preferredSlots: JSON.parse(profile.preferred_slots || '[]'),
      revisionFrequency: profile.revision_frequency,
      mockTestFrequency: profile.mock_test_frequency,
      currentPrepLevel: profile.current_prep_level,
      completedTopics: JSON.parse(profile.completed_topics || '[]'),
      weakSubjects: JSON.parse(profile.weak_subjects || '[]'),
      breakPreference: profile.break_preference,
      userType: profile.user_type
    };

    if (type === 'drag') {
      // Direct drag and drop: move the single task to a new date
      await dbRun('UPDATE study_plan SET date = ? WHERE id = ? AND user_id = ?', [newDate, taskId, userId]);
      console.log(`[Drag] Shifted task ${taskId} to date ${newDate} for user ${userId}`);
      return res.json({ success: true });
    } else if (type === 'rebalance') {
      // Full AI future rebalancing triggered by missed tasks
      const allTasks = await dbAll('SELECT * FROM study_plan WHERE user_id = ?', [userId]);
      
      const daysMap = {};
      
      allTasks.forEach(task => {
        if (!daysMap[task.date]) {
          daysMap[task.date] = { date: task.date, isBuffer: task.task_type === 'buffer', tasks: [] };
        }
        daysMap[task.date].tasks.push({
          subject: task.subject,
          topicName: task.topic_name,
          type: task.task_type,
          duration: task.duration,
          difficulty: task.difficulty,
          resourceLink: task.resource_link,
          learningObjectives: JSON.parse(task.learning_objectives || '[]'),
          recommendedPyqs: task.recommended_pyqs,
          completed: task.completed === 1
        });
      });

      const rebalanced = rebalanceSchedule(plannerProfile, Object.values(daysMap), missedDate);

      // Re-seed study plan with new balances
      await dbRun('DELETE FROM study_plan WHERE user_id = ?', [userId]);
      
      for (const day of rebalanced) {
        for (const task of day.tasks) {
          const id = `${userId}_${day.date}_${task.subject.replace(/[^a-z0-9]/ig, '')}_${task.topicName.replace(/[^a-z0-9]/ig, '')}`;
          await dbRun(
            `INSERT OR IGNORE INTO study_plan (
              id, user_id, date, subject, topic_name, task_type, duration, 
              difficulty, resource_link, learning_objectives, recommended_pyqs, completed_at, completed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              userId,
              day.date,
              task.subject,
              task.topicName,
              task.type,
              task.duration,
              task.difficulty || '',
              task.resourceLink || '',
              JSON.stringify(task.learningObjectives || []),
              task.recommendedPyqs || 0,
              task.completedAt || null,
              task.completed ? 1 : 0
            ]
          );
        }
        if (day.tasks.length === 0) {
          const id = `${userId}_${day.date}_rest`;
          await dbRun(
            `INSERT OR IGNORE INTO study_plan (id, user_id, date, subject, topic_name, task_type, duration, completed_at, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, userId, day.date, 'General Buffer', 'Rest / Buffer Block', 'buffer', 0, null, 0]
          );
        }
      }

      return res.json({ success: true, message: 'Adaptive schedule rebalancing completed successfully!' });
    }
    
    res.status(400).json({ error: 'Invalid reschedule operation' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/learning-items', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { subjectId } = req.query;
  try {
    const params = [];
    let sql = `SELECT li.*, s.name as subject_name, t.name as topic_name
      FROM learning_items li
      LEFT JOIN subjects s ON s.id = li.subject_id
      LEFT JOIN topics t ON t.id = li.topic_id`;
    if (subjectId) {
      sql += ' WHERE li.subject_id = ?';
      params.push(subjectId);
    }
    sql += ' ORDER BY li.sequence ASC';

    const items = await dbAll(sql, params);
    res.json(items.map(item => ({
      id: item.id,
      subjectId: item.subject_id,
      subject: item.subject_name,
      topicId: item.topic_id,
      topic: item.topic_name,
      title: item.title,
      provider: item.provider,
      durationMinutes: item.duration_minutes,
      sequence: item.sequence,
      sourceUrl: item.source_url,
      category: item.category
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/learning-items', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { subjectId, topicId, title, provider, durationMinutes, sourceUrl, category } = req.body;
  if (!subjectId || !title) {
    return res.status(400).json({ error: 'subjectId and title are required.' });
  }

  try {
    const itemId = `custom_${userId}_${toSlug(title)}_${crypto.randomBytes(3).toString('hex')}`;
    const maxRow = await dbGet('SELECT MAX(sequence) as maxSeq FROM learning_items WHERE subject_id = ?', [subjectId]);
    await dbRun(
      `INSERT INTO learning_items (id, subject_id, topic_id, title, provider, duration_minutes, sequence, source_url, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        subjectId,
        topicId || '',
        title,
        provider || 'Custom',
        parseInt(durationMinutes || 60),
        (maxRow?.maxSeq || 9000) + 1,
        sourceUrl || '',
        category || 'Custom'
      ]
    );
    res.json({ success: true, id: itemId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calendar/suggestions', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const startDate = req.query.date || new Date().toISOString().split('T')[0];
  const days = Math.min(14, Math.max(1, parseInt(req.query.days || '7', 10)));
  const subjectPriority = [
    'Algorithm',
    'Data Structure',
    'Discrete Mathematics',
    'DBMS',
    'C Programming',
    'Engineering Mathematics',
    'Operating System',
    'Computer Networks'
  ];

  try {
    const profile = await dbGet('SELECT weekday_hours, weekend_hours FROM user_profile WHERE user_id = ?', [userId]);
    const weekdayMinutes = Math.max(60, Math.round(parseFloat(profile?.weekday_hours || 3) * 60));
    const weekendMinutes = Math.max(60, Math.round(parseFloat(profile?.weekend_hours || 6) * 60));
    const { subjects, topics } = await getCatalogMaps();
    const subjectById = new Map(subjects.map(subject => [subject.id, subject]));
    const topicById = new Map(topics.map(topic => [topic.id, topic]));

    const existing = await dbAll(
      `SELECT date, topic_id, learning_item_id, planned_minutes, duration, completed
       FROM study_plan
       WHERE user_id = ? AND date >= ?`,
      [userId, startDate]
    );
    const completedProgress = await dbAll(
      `SELECT topic_id, learning_item_id
       FROM topic_progress
       WHERE user_id = ? AND status IN ('completed', 'skimmed')`,
      [userId]
    );

    const scheduledTopicIds = new Set(existing.map(row => row.topic_id).filter(Boolean));
    const scheduledItemIds = new Set(existing.map(row => row.learning_item_id).filter(Boolean));
    const completedTopicIds = new Set(completedProgress.map(row => row.topic_id).filter(Boolean));
    const completedItemIds = new Set(completedProgress.map(row => row.learning_item_id).filter(Boolean));
    const plannedByDate = new Map();
    existing.forEach(row => {
      const minutes = row.planned_minutes || Math.round((row.duration || 0) * 60);
      plannedByDate.set(row.date, (plannedByDate.get(row.date) || 0) + minutes);
    });

    const learningItems = await dbAll('SELECT * FROM learning_items ORDER BY subject_id ASC, sequence ASC');
    const candidates = [];

    learningItems.forEach(item => {
      if (scheduledItemIds.has(item.id) || completedItemIds.has(item.id)) return;
      const subject = subjectById.get(item.subject_id);
      const topic = topicById.get(item.topic_id);
      if (!subject) return;
      candidates.push({
        subjectId: subject.id,
        subject: subject.name,
        topicId: item.topic_id || '',
        learningItemId: item.id,
        title: item.title,
        source: 'video',
        mode: item.category?.toLowerCase().includes('pyq') ? 'pyq' : 'full',
        plannedMinutes: item.duration_minutes || 60,
        topicName: topic?.name || item.category || 'Video Lesson'
      });
    });

    topics.forEach(topic => {
      if (scheduledTopicIds.has(topic.id) || completedTopicIds.has(topic.id)) return;
      const subject = subjectById.get(topic.subject_id);
      if (!subject) return;
      candidates.push({
        subjectId: subject.id,
        subject: subject.name,
        topicId: topic.id,
        learningItemId: '',
        title: topic.name,
        source: 'topic',
        mode: 'full',
        plannedMinutes: Math.max(45, (topic.estimated_hours || 1) * 60),
        topicName: topic.name
      });
    });

    candidates.sort((a, b) => {
      const rankA = subjectPriority.findIndex(name => name.toLowerCase() === a.subject.toLowerCase());
      const rankB = subjectPriority.findIndex(name => name.toLowerCase() === b.subject.toLowerCase());
      if (rankA !== rankB) return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      return a.title.localeCompare(b.title);
    });

    const usedCandidateKeys = new Set();
    const results = [];

    for (let offset = 0; offset < days; offset++) {
      const date = addDays(startDate, offset);
      const capacity = isWeekendDate(date) ? weekendMinutes : weekdayMinutes;
      const planned = plannedByDate.get(date) || 0;
      const remainingMinutes = Math.max(0, capacity - planned);
      const suggestions = [];

      for (const candidate of candidates) {
        const key = candidate.learningItemId || candidate.topicId;
        if (!key || usedCandidateKeys.has(key)) continue;
        suggestions.push({
          ...candidate,
          date,
          fitsToday: candidate.plannedMinutes <= Math.max(remainingMinutes, 15)
        });
        usedCandidateKeys.add(key);
        if (suggestions.length >= 4) break;
      }

      results.push({
        date,
        capacityMinutes: capacity,
        plannedMinutes: planned,
        remainingMinutes,
        suggestions
      });
    }

    res.json({ days: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function weekDatesFrom(startDate) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
}

function coerceWeeklyPlan(rawPlan, weekDates) {
  const byDate = new Map((rawPlan.days || []).map(day => [day.date, day]));
  return {
    days: weekDates.map(date => {
      const day = byDate.get(date) || { date, tasks: [] };
      return {
        date,
        tasks: (day.tasks || []).slice(0, 8).map(task => ({
          subject: String(task.subject || '').slice(0, 80),
          title: String(task.title || task.topicName || 'Study task').slice(0, 220),
          mode: ['full', 'skim', 'revision', 'pyq', 'custom'].includes(task.mode) ? task.mode : 'full',
          plannedMinutes: Math.max(15, Math.min(360, parseInt(task.plannedMinutes || task.durationMinutes || 60, 10))),
          source: ['topic', 'video', 'custom'].includes(task.source) ? task.source : 'custom',
          topicId: task.topicId || '',
          learningItemId: task.learningItemId || ''
        }))
      };
    })
  };
}

app.post('/api/calendar/weekly-ai-suggest', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });
  if (!geminiApiKey) return res.status(400).json({ error: 'GEMINI_API_KEY is not set on the backend.' });

  const { weekStart, dailyHours = {}, prompt = '' } = req.body || {};
  if (!weekStart) return res.status(400).json({ error: 'weekStart is required.' });

  try {
    const weekDates = weekDatesFrom(weekStart);
    const { subjects, topics } = await getCatalogMaps();
    const learningItems = await dbAll('SELECT * FROM learning_items ORDER BY subject_id ASC, sequence ASC LIMIT 160');
    const subjectById = new Map(subjects.map(subject => [subject.id, subject]));
    const compactTopics = topics.slice(0, 220).map(topic => ({
      id: topic.id,
      subject: subjectById.get(topic.subject_id)?.name || '',
      title: topic.name,
      minutes: Math.max(45, (topic.estimated_hours || 1) * 60)
    }));
    const compactVideos = learningItems.map(item => ({
      id: item.id,
      subject: subjectById.get(item.subject_id)?.name || '',
      topicId: item.topic_id || '',
      title: item.title,
      minutes: item.duration_minutes || 60
    }));

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        days: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING' },
              tasks: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    subject: { type: 'STRING' },
                    title: { type: 'STRING' },
                    mode: { type: 'STRING', enum: ['full', 'skim', 'revision', 'pyq', 'custom'] },
                    plannedMinutes: { type: 'INTEGER' },
                    source: { type: 'STRING', enum: ['topic', 'video', 'custom'] },
                    topicId: { type: 'STRING' },
                    learningItemId: { type: 'STRING' }
                  },
                  required: ['subject', 'title', 'mode', 'plannedMinutes', 'source', 'topicId', 'learningItemId']
                }
              }
            },
            required: ['date', 'tasks']
          }
        }
      },
      required: ['days']
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'Create a realistic 7-day GATE CS study plan. Respect each day capacity. Prefer provided video/topic IDs when matching. Return JSON only.'
          }]
        },
        generationConfig: {
          temperature: 0.2,
          response_mime_type: 'application/json',
          response_schema: responseSchema
        },
        contents: [{
          role: 'user',
          parts: [{
            text: JSON.stringify({
              weekDates,
              dailyHours,
              userInstruction: prompt,
              subjects: subjects.map(subject => subject.name),
              topics: compactTopics,
              videos: compactVideos
            })
          }]
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data.error?.message || 'Gemini planning request failed.' });
    }

    const content = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '{}';
    const parsed = JSON.parse(content);
    res.json({ success: true, plan: coerceWeeklyPlan(parsed, weekDates) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/apply-week-plan', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { weekStart, days = [], replaceAuto = true } = req.body || {};
  if (!weekStart || !Array.isArray(days)) return res.status(400).json({ error: 'weekStart and days are required.' });

  try {
    const weekDates = weekDatesFrom(weekStart);
    const weekEnd = weekDates[6];
    const { subjects } = await getCatalogMaps();
    const subjectByName = new Map(subjects.map(subject => [subject.name.toLowerCase(), subject]));

    if (replaceAuto) {
      await dbRun(
        `DELETE FROM study_plan
         WHERE user_id = ?
           AND date >= ?
           AND date <= ?
           AND completed = 0
           AND source IN ('catalog', 'video', 'ai_weekly')`,
        [userId, weekStart, weekEnd]
      );
    }

    let inserted = 0;
    for (const day of days) {
      if (!weekDates.includes(day.date)) continue;
      for (const task of day.tasks || []) {
        const subject = subjectByName.get(String(task.subject || '').toLowerCase());
        const topic = task.topicId ? await dbGet('SELECT * FROM topics WHERE id = ?', [task.topicId]) : null;
        const item = task.learningItemId ? await dbGet('SELECT * FROM learning_items WHERE id = ?', [task.learningItemId]) : null;
        const subjectName = subject?.name || task.subject || 'Weekly Study';
        await insertStudyTask(userId, day.date, {
          phaseId: day.date <= '2026-07-10' ? `${userId}_nitc_phase1` : `${userId}_phase2`,
          topicId: topic?.id || item?.topic_id || task.topicId || '',
          learningItemId: item?.id || task.learningItemId || '',
          subject: subjectName,
          topicName: task.title || item?.title || topic?.name || 'Weekly Study Task',
          type: task.mode === 'revision' ? 'revision' : task.mode === 'pyq' ? 'pyq' : 'study',
          plannedMinutes: plannedMinutesForMode(parseInt(task.plannedMinutes || 60, 10), task.mode || 'full'),
          mode: task.mode || 'full',
          source: 'ai_weekly',
          difficulty: topic?.difficulty || '',
          resourceLink: topic?.resource_link || item?.source_url || '',
          description: 'Added from weekly preparation planner.'
        });
        inserted += 1;
      }
    }

    res.json({ success: true, inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/add-task', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { date, subjectId, topicId, learningItemId, mode = 'full', plannedMinutes, title, markComplete = false, actualMinutes } = req.body;
  if (!date || !subjectId) {
    return res.status(400).json({ error: 'date and subjectId are required.' });
  }

  try {
    const subject = await dbGet('SELECT * FROM subjects WHERE id = ?', [subjectId]);
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const topic = topicId ? await dbGet('SELECT * FROM topics WHERE id = ?', [topicId]) : null;
    const item = learningItemId ? await dbGet('SELECT * FROM learning_items WHERE id = ?', [learningItemId]) : null;
    const baseMinutes = parseInt(plannedMinutes || item?.duration_minutes || ((topic?.estimated_hours || 1) * 60) || 60);
    const finalMinutes = plannedMinutesForMode(baseMinutes, mode);
    const taskPayload = {
      phaseId: date <= '2026-07-10' ? `${userId}_nitc_phase1` : `${userId}_phase2`,
      topicId: topic?.id || item?.topic_id || '',
      learningItemId: item?.id || '',
      subject: subject.name,
      topicName: title || item?.title || topic?.name || 'Custom Study Task',
      type: mode === 'revision' ? 'revision' : mode === 'pyq' ? 'pyq' : 'study',
      plannedMinutes: finalMinutes,
      mode,
      source: item ? 'video' : 'manual',
      difficulty: topic?.difficulty || '',
      resourceLink: topic?.resource_link || item?.source_url || '',
      description: item ? `${item.provider} - ${item.category}` : `Manually added ${mode} task.`,
      status: markComplete ? (mode === 'skim' ? 'skimmed' : 'completed') : 'planned',
      actualMinutes: markComplete ? parseInt(actualMinutes || finalMinutes) : 0,
      completedAt: markComplete ? date : null,
      completed: markComplete
    };
    const taskId = await insertStudyTask(userId, date, taskPayload);
    let refilled = [];

    if (markComplete) {
      const insertedTask = {
        id: taskId,
        phase_id: taskPayload.phaseId,
        topic_id: taskPayload.topicId,
        learning_item_id: taskPayload.learningItemId,
        topic_name: taskPayload.topicName,
        duration: finalMinutes / 60,
        planned_minutes: finalMinutes
      };
      await upsertTopicProgress(userId, insertedTask, mode === 'skim' ? 'skimmed' : 'completed', mode || 'full');
      refilled = await removeFutureDuplicatesAndRefill(userId, insertedTask, date, date);
    }

    res.json({ success: true, taskId, refilled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/rebuild-phase', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { phase = 'nitc_phase1', targetDate, planningOptions: rawPlanningOptions = {} } = req.body || {};
  try {
    if (phase === 'nitc_phase1') {
      const result = await createNitcPhaseOnePlan(userId, rawPlanningOptions);
      return res.json({ success: true, ...result });
    }

    const startDate = '2026-07-11';
    const endDate = targetDate || '2027-02-06';
    const phaseId = `${userId}_phase2`;
    const completedRows = await dbAll('SELECT topic_id, learning_item_id, topic_name FROM study_plan WHERE user_id = ? AND completed = 1', [userId]);
    const completedTopicIds = new Set(completedRows.map(row => row.topic_id).filter(Boolean));
    const completedItemIds = new Set(completedRows.map(row => row.learning_item_id).filter(Boolean));
    const { subjects, topics } = await getCatalogMaps();
    const learningItems = await dbAll('SELECT * FROM learning_items ORDER BY sequence ASC');
    const profile = await dbGet('SELECT weekday_hours, weekend_hours FROM user_profile WHERE user_id = ?', [userId]);
    const weekdayMinutes = Math.max(60, Math.round(parseFloat(profile?.weekday_hours || 3) * 60));
    const weekendMinutes = Math.max(60, Math.round(parseFloat(profile?.weekend_hours || 6) * 60));
    const planningOptions = normalizePlanningOptions(rawPlanningOptions, { weekdayMinutes, weekendMinutes });

    await dbRun(
      `INSERT INTO study_phases (id, user_id, name, start_date, end_date, target_label, status, config, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET end_date = excluded.end_date, status = excluded.status, config = excluded.config`,
      [phaseId, userId, 'Post NITC Remaining Plan', startDate, endDate, 'GATE remaining syllabus', 'active', JSON.stringify({ rebuiltAfter: '2026-07-10', planningOptions }), new Date().toISOString()]
    );
    await dbRun('DELETE FROM study_plan WHERE user_id = ? AND phase_id = ? AND completed = 0', [userId, phaseId]);

    const queue = [];
    topics.forEach(topic => {
      if (completedTopicIds.has(topic.id)) return;
      const subject = subjects.find(sub => sub.id === topic.subject_id);
      if (!subject) return;
      queue.push({
        subject: subject.name,
        topicName: topic.name,
        topicId: topic.id,
        plannedMinutes: Math.max(45, (topic.estimated_hours || 4) * 60),
        type: 'study',
        mode: 'full',
        source: 'catalog',
        difficulty: topic.difficulty,
        description: `Remaining GATE topic after NITC phase.`
      });
    });
    learningItems.forEach(item => {
      if (completedItemIds.has(item.id)) return;
      const subject = subjects.find(sub => sub.id === item.subject_id);
      queue.push({
        subject: subject?.name || 'Video Course',
        topicName: item.title,
        topicId: item.topic_id,
        learningItemId: item.id,
        plannedMinutes: item.duration_minutes,
        type: item.category?.toLowerCase().includes('pyq') ? 'pyq' : 'study',
        mode: 'full',
        source: 'video',
        description: `${item.provider} - ${item.category}`
      });
    });

    const result = await scheduleQueueWithDailyCapacity({
      userId,
      queue,
      phaseId,
      startDate,
      endDate,
      weekdayMinutes,
      weekendMinutes,
      planningOptions
    });

    res.json({ success: true, phaseId, queued: queue.length, scheduled: result.scheduled, overflow: result.overflow, startDate, endDate, planningOptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/time-logs', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const { taskId, date, minutes, note, markComplete, mode } = req.body;
  if (!taskId || !minutes) return res.status(400).json({ error: 'taskId and minutes are required.' });

  try {
    const task = await dbGet('SELECT * FROM study_plan WHERE id = ? AND user_id = ?', [taskId, userId]);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    const logDate = date || new Date().toISOString().split('T')[0];
    const logId = `${userId}_${taskId}_${Date.now()}`;
    const logMinutes = parseInt(minutes);

    await dbRun(
      `INSERT INTO time_logs (id, user_id, task_id, subject, topic_name, topic_id, learning_item_id, date, minutes, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [logId, userId, taskId, task.subject, task.topic_name, task.topic_id || '', task.learning_item_id || '', logDate, logMinutes, note || '', new Date().toISOString()]
    );
    await dbRun(
      `UPDATE study_plan SET actual_minutes = COALESCE(actual_minutes, 0) + ?, status = ?, mode = ?
       WHERE id = ? AND user_id = ?`,
      [logMinutes, markComplete ? (mode === 'skim' ? 'skimmed' : 'completed') : 'in_progress', mode || task.mode || 'full', taskId, userId]
    );

    if (markComplete) {
      await dbRun('UPDATE study_plan SET completed = 1, completed_at = ? WHERE id = ? AND user_id = ?', [logDate, taskId, userId]);
      await upsertTopicProgress(userId, task, mode === 'skim' ? 'skimmed' : 'completed', mode || task.mode || 'full');
    }

    res.json({ success: true, id: logId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/time-logs/summary', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const logs = await dbAll('SELECT * FROM time_logs WHERE user_id = ? ORDER BY date DESC', [userId]);
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(`${today}T00:00:00`);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const bySubject = {};
    logs.forEach(log => {
      bySubject[log.subject] = (bySubject[log.subject] || 0) + (log.minutes || 0);
    });
    res.json({
      todayMinutes: logs.filter(log => log.date === today).reduce((sum, log) => sum + log.minutes, 0),
      weekMinutes: logs.filter(log => log.date >= weekStartStr).reduce((sum, log) => sum + log.minutes, 0),
      totalMinutes: logs.reduce((sum, log) => sum + log.minutes, 0),
      bySubject: Object.entries(bySubject).map(([subject, minutes]) => ({ subject, minutes }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. GET Dashboard Stats and Analytics
app.get('/api/dashboard/stats', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const user = await dbGet('SELECT * FROM user_profile WHERE user_id = ?', [userId]);
    if (!user) {
      return res.status(400).json({ error: 'Profile not found. Onboarding required.' });
    }

    const allTasks = await dbAll('SELECT * FROM study_plan WHERE user_id = ?', [userId]);
    const topics = await dbAll('SELECT * FROM topics');
    const timeLogs = await dbAll('SELECT * FROM time_logs WHERE user_id = ?', [userId]);
    const phases = await dbAll('SELECT * FROM study_phases WHERE user_id = ? ORDER BY start_date ASC', [userId]);

    const totalTasksCount = allTasks.filter(t => t.task_type !== 'buffer').length;
    const completedTasksCount = allTasks.filter(t => t.task_type !== 'buffer' && t.completed === 1).length;

    // Overall syllabus metrics
    const syllabusComp = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
    
    // Calculated readiness score based on user specific confidence levels
    const confidenceRows = await dbAll('SELECT confidence_score FROM user_topics_metadata WHERE user_id = ? AND confidence_score > 0', [userId]);
    let totalScore = 0;
    let counts = 0;
    
    confidenceRows.forEach(row => {
      totalScore += row.confidence_score;
      counts++;
    });

    const averageConfidence = counts > 0 ? Math.round(totalScore / counts) : 40;
    const estimatedReadiness = Math.round((syllabusComp * 0.6) + (averageConfidence * 0.4));

    // Calculate subject-wise completion rates
    const subjects = await dbAll('SELECT * FROM subjects');
    const completedList = JSON.parse(user.completed_topics || '[]');

    const subjectMetrics = subjects.map(sub => {
      const subTopics = topics.filter(t => t.subject_id === sub.id);
      const totalCount = subTopics.length;
      const loggedMinutes = timeLogs
        .filter(log => log.subject === sub.name)
        .reduce((sum, log) => sum + (log.minutes || 0), 0);
      
      const compCount = subTopics.filter(t => 
        completedList.some(comp => comp.toLowerCase() === t.name.toLowerCase())
      ).length;

      return {
        subject: sub.name,
        weightage: sub.weightage,
        total: totalCount,
        completed: compCount,
        rate: totalCount > 0 ? Math.round((compCount / totalCount) * 100) : 0,
        loggedHours: parseFloat((loggedMinutes / 60).toFixed(1))
      };
    });

    // Upcoming critical tasks (limit 5)
    const upcomingTasks = allTasks
      .filter(t => t.completed === 0 && t.task_type !== 'buffer')
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        date: t.date,
        subject: t.subject,
        topicName: t.topic_name,
        type: t.task_type,
        duration: t.duration
      }));

    const mockTrends = [
      { date: '2026-03-15', score: 45 },
      { date: '2026-04-15', score: 58 },
      { date: '2026-05-15', score: 68 }
    ];

    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(`${today}T00:00:00`);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const todayMinutes = timeLogs.filter(log => log.date === today).reduce((sum, log) => sum + (log.minutes || 0), 0);
    const weekMinutes = timeLogs.filter(log => log.date >= weekStartStr).reduce((sum, log) => sum + (log.minutes || 0), 0);
    const totalLoggedMinutes = timeLogs.reduce((sum, log) => sum + (log.minutes || 0), 0);
    const plannedMinutes = allTasks.reduce((sum, task) => sum + (task.planned_minutes || Math.round((task.duration || 0) * 60)), 0);
    const remainingPhaseOne = allTasks.filter(task =>
      task.phase_id === `${userId}_nitc_phase1` && task.completed !== 1 && task.task_type !== 'buffer'
    ).length;

    res.json({
      streak: user.streak_count,
      syllabusCompletion: syllabusComp,
      readinessScore: Math.min(estimatedReadiness, 100),
      totalStudyHours: Math.round(totalLoggedMinutes / 60),
      timeSummary: {
        todayMinutes,
        weekMinutes,
        totalMinutes: totalLoggedMinutes,
        plannedMinutes,
        actualMinutes: totalLoggedMinutes
      },
      phaseSummary: {
        phaseOneDeadline: '2026-07-10',
        activePhase: phases.find(phase => phase.status === 'active') || null,
        remainingPhaseOne
      },
      subjectMetrics,
      upcomingTasks,
      mockTrends
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. GET Export CSV
app.get('/api/export/csv', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const dbTasks = await dbAll('SELECT * FROM study_plan WHERE user_id = ? ORDER BY date ASC', [userId]);
    
    const daysMap = {};
    dbTasks.forEach(task => {
      if (!daysMap[task.date]) {
        daysMap[task.date] = { date: task.date, dayOfWeek: new Date(task.date).toLocaleDateString('en-US', { weekday: 'long' }), tasks: [] };
      }
      daysMap[task.date].tasks.push({
        subject: task.subject,
        topicName: task.topic_name,
        type: task.task_type,
        duration: task.duration,
        difficulty: task.difficulty,
        resourceLink: task.resource_link,
        completed: task.completed === 1
      });
    });

    const csvContent = exportToCSV(Object.values(daysMap));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=gate_study_planner_${userId}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. GET Export ICS Calendar Feed
app.get('/api/export/ics', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  try {
    const dbTasks = await dbAll('SELECT * FROM study_plan WHERE user_id = ? ORDER BY date ASC', [userId]);
    
    const daysMap = {};
    dbTasks.forEach(task => {
      if (!daysMap[task.date]) {
        daysMap[task.date] = { date: task.date, tasks: [] };
      }
      if (task.task_type !== 'buffer') {
        daysMap[task.date].tasks.push({
          subject: task.subject,
          topicName: task.topic_name,
          type: task.task_type,
          duration: task.duration,
          difficulty: task.difficulty,
          resourceLink: task.resource_link,
          learningObjectives: JSON.parse(task.learning_objectives || '[]'),
          recommendedPyqs: task.recommended_pyqs
        });
      }
    });

    const icsContent = exportToICS(Object.values(daysMap));
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename=gate_schedule_${userId}.ics`);
    res.send(icsContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. GET Dynamic AI Motivation Card
app.get('/api/ai/motivation', async (req, res) => {
  const userId = getAuthUser(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized session.' });

  const motivationalQuotes = [
    "Your preparation is building a future where complex systems are trivial. Keep coding!",
    "Success in GATE is a steady build. One pointer arithmetic question at a time.",
    "Decidability is provable; your success is too. Keep solving those Turing machines!",
    "Pipelining hazards are easily resolved with enough forwarding. Resolve your doubts today!",
    "ACID transactions keep your database intact. Keep your daily schedule ACID compliant!",
    "Shortest paths in graph theory are optimal. Your consistent planner is your shortest path to a top 100 rank."
  ];

  try {
    const stats = await dbGet('SELECT streak_count FROM user_profile WHERE user_id = ?', [userId]);
    const streak = stats ? stats.streak_count : 0;
    
    const index = streak % motivationalQuotes.length;
    res.json({
      motivationText: motivationalQuotes[index],
      streakChallenge: streak > 0 ? `Amazing ${streak}-day streak! Complete today's tasks to lock in another day.` : "Start today to set off a glowing study streak!"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start listening and seed database
app.listen(PORT, async () => {
  console.log(`[Server] Express API server running on port ${PORT}...`);
  await bootstrap();
});
