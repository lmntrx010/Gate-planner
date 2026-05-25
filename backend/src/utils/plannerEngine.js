const fs = require('fs');
const path = require('path');

/**
 * AI Study Planner Engine - Upgraded with Explicit PYQ & Concept Drill Tasks
 * Chronologically distributes topics, implements dependencies, spaced repetition, burnout prevention,
 * and handles adaptive rescheduling.
 */
function generateSchedule(profile, subjectsData) {
  console.log('[Planner Engine] Generating optimized prep roadmap...');

  const startDate = new Date(profile.startDate || new Date().toISOString().split('T')[0]);
  const examDate = new Date(profile.targetExamDate || '2027-02-05');
  
  // Calculate total prep days
  const totalDays = Math.ceil((examDate - startDate) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) {
    throw new Error('Exam date must be after start date!');
  }

  console.log(`[Planner Engine] Total preparation duration: ${totalDays} days.`);

  // 1. Order subjects topologically based on prereqs & weightage
  const subjectPrecedence = [
    'Discrete Mathematics',
    'Engineering Mathematics',
    'C Programming',
    'Data Structure',
    'Algorithm',
    'Digital Logic',
    'Computer Organization and Architecture',
    'Theory of Computation',
    'Compiler Design',
    'Operating System',
    'DBMS',
    'Computer Networks',
    'General Aptitude'
  ];

  const weakSubjectsList = profile.weakSubjects || [];
  const completedTopicsList = profile.completedTopics || [];
  const selectedTopicOrder = new Map((profile.selectedTopics || []).map((topic, index) => [topic.topicId || topic.id, index]));
  const planningOptions = profile.planningOptions || {};
  const subjectPriority = Array.isArray(planningOptions.subjectPriority) ? planningOptions.subjectPriority : [];

  // Group and sort the incoming parsed subjectsData
  const activeSubjects = subjectsData.map(sub => {
    // Add all topics (regular + missing)
    const allTopics = [...sub.topics];
    sub.missingTopics.forEach(m => {
      allTopics.push({
        id: m.id,
        name: m.name,
        estimatedHours: m.estimatedHours,
        difficulty: m.difficulty,
        resourceLink: '',
        learningObjectives: [m.fullDescription],
        recommendedPyqs: 10,
        category: 'Missing GATE',
        tags: ['Missing GATE', 'Advanced']
      });
    });

    if (selectedTopicOrder.size > 0) {
      allTopics.sort((a, b) => {
        const orderA = selectedTopicOrder.has(a.id) ? selectedTopicOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
        const orderB = selectedTopicOrder.has(b.id) ? selectedTopicOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    }

    const isWeak = weakSubjectsList.some(w => sub.subject.toLowerCase().includes(w.toLowerCase()));

    // Filter out already completed topics
    const remainingTopics = allTopics.filter(t => 
      !completedTopicsList.some(comp => comp.toLowerCase() === t.name.toLowerCase())
    );

    return {
      subject: sub.subject,
      weightage: sub.weightage,
      difficulty: sub.difficulty,
      isWeak: isWeak,
      topics: remainingTopics
    };
  });

  // Sort based on precedence index unless the user chose a custom topic sequence.
  if (!profile.selectedTopics || profile.selectedTopics.length === 0) {
    activeSubjects.sort((a, b) => {
      const priorityA = subjectPriority.findIndex(name => String(name).toLowerCase() === a.subject.toLowerCase());
      const priorityB = subjectPriority.findIndex(name => String(name).toLowerCase() === b.subject.toLowerCase());
      if (priorityA !== -1 || priorityB !== -1) {
        return (priorityA === -1 ? 99 : priorityA) - (priorityB === -1 ? 99 : priorityB);
      }
      const idxA = subjectPrecedence.findIndex(s => s.toLowerCase().includes(a.subject.toLowerCase()) || a.subject.toLowerCase().includes(s.toLowerCase()));
      const idxB = subjectPrecedence.findIndex(s => s.toLowerCase().includes(b.subject.toLowerCase()) || b.subject.toLowerCase().includes(s.toLowerCase()));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  }

  // Flatten remaining topics list sequentially
  const taskQueue = [];
  const pushTopicTask = (sub, topic) => {
      // If subject is weak, multiply estimated hours slightly (by 1.2x) for thoroughness
      const estHours = sub.isWeak ? Math.ceil(topic.estimatedHours * 1.2) : topic.estimatedHours;
      taskQueue.push({
        subject: sub.subject,
        topicName: topic.name,
        estimatedHours: estHours,
        difficulty: topic.difficulty,
        resourceLink: topic.resourceLink,
        learningObjectives: topic.learningObjectives,
        recommendedPyqs: topic.recommendedPyqs,
        category: topic.category || 'Core GATE'
      });
  };

  if (planningOptions.strategy === 'parallel') {
    const maxTopics = Math.max(...activeSubjects.map(sub => sub.topics.length), 0);
    for (let i = 0; i < maxTopics; i++) {
      activeSubjects.forEach(sub => {
        if (sub.topics[i]) pushTopicTask(sub, sub.topics[i]);
      });
    }
  } else {
    activeSubjects.forEach(sub => {
      sub.topics.forEach(topic => pushTopicTask(sub, topic));
    });
  }

  // 2. Distribute across calendar days
  const calendar = [];
  let currentDate = new Date(startDate);
  let taskIndex = 0;
  let carryOverHours = 0;
  let activeTask = null;
  let streakDays = 0;
  let consecutiveStudyDays = 0;

  // Study hours mapping
  const hrWeekday = parseFloat(profile.weekdayHours || 3);
  const hrWeekend = parseFloat(profile.weekendHours || 5);

  // Mock test interval
  let mockTestIntervalDays = 30; // default monthly
  if (profile.mockTestFrequency === 'weekly') mockTestIntervalDays = 7;
  if (profile.mockTestFrequency === 'biweekly') mockTestIntervalDays = 14;

  let daysSinceLastMock = 0;
  let activeSubjectName = '';

  for (let d = 0; d < totalDays; d++) {
    const dateString = currentDate.toISOString().split('T')[0];
    let availableHours = isWeekendDay(currentDate) ? hrWeekend : hrWeekday;
    
    const dayTasks = [];
    daysSinceLastMock++;
    consecutiveStudyDays++;

    // Spaced Repetition / Burnout protection:
    // Every 7th day is a "Buffer & Weekly Revision" day to prevent burnout!
    if (consecutiveStudyDays === 7) {
      calendar.push({
        date: dateString,
        dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' }),
        isBuffer: true,
        tasks: [{
          subject: 'General Buffer',
          topicName: 'Buffer & Backlog Clearing Day',
          type: 'buffer',
          duration: availableHours,
          description: 'Catch up on any missed topics, organize short notes, and take a mental rest.',
          completed: false
        }]
      });

      consecutiveStudyDays = 0;
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Schedule Mock Test at regular intervals
    if (daysSinceLastMock >= mockTestIntervalDays && taskIndex > 0) {
      dayTasks.push({
        subject: 'Mock Exam',
        topicName: 'Full-Length / Subject GATE Mock Test',
        type: 'mock_test',
        duration: Math.min(availableHours, 3.5), // GATE mock tests are 3 hours
        description: 'Solve a full or subject-specific GATE Mock test. Simulate real exam conditions.',
        completed: false
      });
      availableHours -= Math.min(availableHours, 3.5);
      daysSinceLastMock = 0;
    }

    // Schedule study tasks if availableHours remain
    while (availableHours > 0.5 && taskIndex < taskQueue.length) {
      if (!activeTask) {
        activeTask = { ...taskQueue[taskIndex] };
        carryOverHours = activeTask.estimatedHours;
        
        // If subject changes, insert a "Formula Revision & Short Notes" session
        if (activeSubjectName !== activeTask.subject && activeSubjectName !== '') {
          dayTasks.push({
            subject: activeSubjectName,
            topicName: `Comprehensive Formula & Short Notes Revision`,
            type: 'formula_revision',
            duration: Math.min(availableHours, 2),
            description: `Active recall and short notes creation for ${activeSubjectName}.`,
            completed: false
          });
          availableHours -= Math.min(availableHours, 2);
          activeSubjectName = activeTask.subject;
          if (availableHours <= 0.5) break;
        } else if (activeSubjectName === '') {
          activeSubjectName = activeTask.subject;
        }
      }

      const hoursToAllocate = Math.min(availableHours, carryOverHours);
      dayTasks.push({
        subject: activeTask.subject,
        topicName: activeTask.topicName,
        type: 'study',
        duration: parseFloat(hoursToAllocate.toFixed(1)),
        difficulty: activeTask.difficulty,
        resourceLink: activeTask.resourceLink,
        learningObjectives: activeTask.learningObjectives,
        recommendedPyqs: activeTask.recommendedPyqs,
        category: activeTask.category,
        completed: false
      });

      carryOverHours -= hoursToAllocate;
      availableHours -= hoursToAllocate;

      if (carryOverHours <= 0) {
        // Dynamic Concept reinforcement exercises immediately upon completing study!
        if (availableHours >= 1.0) {
          dayTasks.push({
            subject: activeTask.subject,
            topicName: `Concept Questions: ${activeTask.topicName}`,
            type: 'concept_questions',
            duration: 1.0,
            description: `Work through core conceptual worksheets and short logic questions on ${activeTask.topicName}.`,
            completed: false
          });
          availableHours -= 1.0;
        }

        // Dynamic GATE past papers grind immediately following concept drills!
        if (availableHours >= 1.5) {
          dayTasks.push({
            subject: activeTask.subject,
            topicName: `PYQ Practice: ${activeTask.topicName}`,
            type: 'pyq',
            duration: 1.5,
            description: `Solve at least ${activeTask.recommendedPyqs} PYQs from GATE 2010-2026. Review video solutions on GFG if stuck.`,
            completed: false
          });
          availableHours -= 1.5;
        }
        
        taskIndex++;
        activeTask = null;
      }
    }

    // If we've run out of topics but still have days left, schedule comprehensive full syllabus revisions!
    if (taskIndex >= taskQueue.length && dayTasks.length === 0) {
      const revisionSubjectName = profile.revisionSubjectName || 'Full Syllabus';
      dayTasks.push({
        subject: revisionSubjectName,
        topicName: `${revisionSubjectName} Revision & PYQs`,
        type: 'revision',
        duration: availableHours,
        description: `Revise ${revisionSubjectName}. Focus on formulas, weak spots, and high-weightage PYQs.`,
        completed: false
      });
    }

    calendar.push({
      date: dateString,
      dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' }),
      isBuffer: false,
      tasks: dayTasks
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`[Planner Engine] Generated schedule containing ${calendar.length} calendar days.`);
  return calendar;
}

function isWeekendDay(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Adaptive Rescheduler Heuristic
 * If a user misses/skips a date, rebalances the entire schedule by pushing incomplete
 * tasks forward, collapsing buffer days, and redistributing topics without shifting the target exam date.
 */
function rebalanceSchedule(profile, calendarData, missedDate, incompleteTaskIds = []) {
  console.log(`[Adaptive Rescheduler] Rebalancing from missed date: ${missedDate}...`);
  
  const rebalanceQueue = [];
  const completedTasksByDate = {};

  calendarData.forEach(day => {
    const isPast = new Date(day.date) <= new Date(missedDate);
    
    day.tasks.forEach(task => {
      if (isPast && task.completed) {
        if (!completedTasksByDate[day.date]) {
          completedTasksByDate[day.date] = [];
        }
        completedTasksByDate[day.date].push(task);
      } else {
        if (task.type !== 'buffer') {
          rebalanceQueue.push({
            subject: task.subject,
            topicName: task.topicName,
            estimatedHours: task.duration,
            difficulty: task.difficulty,
            resourceLink: task.resourceLink,
            learningObjectives: task.learningObjectives,
            recommendedPyqs: task.recommendedPyqs,
            category: task.category || 'Core GATE'
          });
        }
      }
    });
  });

  const rebalanceStart = new Date(missedDate);
  rebalanceStart.setDate(rebalanceStart.getDate() + 1);
  
  const examDate = new Date(profile.targetExamDate || '2027-02-05');
  const remainingDays = Math.ceil((examDate - rebalanceStart) / (1000 * 60 * 60 * 24));

  if (remainingDays <= 0) {
    console.log('[Adaptive Rescheduler] Extreme proximity to exam! Dumping tasks to final day.');
    return calendarData;
  }

  const subProfile = {
    ...profile,
    startDate: rebalanceStart.toISOString().split('T')[0]
  };

  const generatedFutureSchedules = generateSchedule(subProfile, [{
    subject: 'Active Preparation',
    weightage: 10,
    difficulty: 'Intermediate',
    topics: rebalanceQueue,
    missingTopics: []
  }]);

  const newCalendar = [];
  calendarData.forEach(day => {
    const isPast = new Date(day.date) <= new Date(missedDate);
    if (isPast) {
      newCalendar.push({
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        isBuffer: day.isBuffer,
        tasks: completedTasksByDate[day.date] || []
      });
    }
  });

  generatedFutureSchedules.forEach(futureDay => {
    newCalendar.push(futureDay);
  });

  console.log(`[Adaptive Rescheduler] Successfully rebalanced. Total calendar days: ${newCalendar.length}`);
  return newCalendar;
}

module.exports = { generateSchedule, rebalanceSchedule };
