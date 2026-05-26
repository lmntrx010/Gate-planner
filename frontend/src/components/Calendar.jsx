import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Calendar as CalendarIcon, Clock, Link, CheckSquare, Square, ChevronLeft, ChevronRight, RefreshCw, Award, Check, X, Plus, Timer, Wand2 } from 'lucide-react';

export default function Calendar({ onSelectTopic }) {
  const {
    calendar,
    subjects,
    authFetch,
    API_BASE,
    toggleTaskComplete,
    dragReschedule,
    adaptiveReschedule,
    fetchLearningItems,
    fetchCalendarSuggestions,
    addCalendarTask,
    suggestWeeklyPlan,
    applyWeeklyPlan,
    logTaskTime,
    rebuildPhasePlan
  } = useApp();
  const [view, setView] = useState('week'); // month, week, agenda
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [hoveredTask, setHoveredTask] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [completionDraft, setCompletionDraft] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [subjectTopics, setSubjectTopics] = useState([]);
  const [learningItems, setLearningItems] = useState([]);
  const [calendarSuggestions, setCalendarSuggestions] = useState([]);
  const [logDraft, setLogDraft] = useState(null);
  const [phaseTargetDate, setPhaseTargetDate] = useState('2027-02-06');
  const [planningDraft, setPlanningDraft] = useState(null);
  const [weeklyDraft, setWeeklyDraft] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState('');

  // Group task lists into blocks of 7 days (weeks) for easy navigation
  const weeks = [];
  if (calendar && calendar.length > 0) {
    for (let i = 0; i < calendar.length; i += 7) {
      weeks.push(calendar.slice(i, i + 7));
    }
  }

  const currentWeek = weeks[currentWeekIndex] || [];
  const addDaysLocal = (dateString, days) => {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  const getWeekStart = (dateString = new Date().toISOString().split('T')[0]) => {
    const date = new Date(`${dateString}T00:00:00`);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date.toISOString().split('T')[0];
  };

  const buildWeekDays = (weekStart) => Array.from({ length: 7 }, (_, index) => {
    const date = addDaysLocal(weekStart, index);
    const day = new Date(`${date}T00:00:00`).getDay();
    return {
      date,
      hours: day === 0 || day === 6 ? 6 : 3,
      tasks: [],
      bulkText: '',
      draft: {
        subject: subjects[0]?.name || '',
        title: '',
        plannedMinutes: 60,
        mode: 'full',
        source: 'custom'
      }
    };
  });

  const handleNextWeek = () => {
    setCurrentWeekIndex(prev => Math.min(prev + 1, weeks.length - 1));
  };

  const handlePrevWeek = () => {
    setCurrentWeekIndex(prev => Math.max(prev - 1, 0));
  };

  const handleHoverStart = (e, task) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPosition({
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 10
    });
    setHoveredTask(task);
  };

  const handleHoverEnd = () => {
    setHoveredTask(null);
  };

  const getSubjectColor = (subject) => {
    const sub = (subject || '').toLowerCase();
    if (sub.includes('math')) return 'border-violet-500/30 bg-violet-950/20 text-violet-300';
    if (sub.includes('programming') || sub.includes('structure')) return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300';
    if (sub.includes('alg')) return 'border-amber-500/30 bg-amber-950/20 text-amber-300';
    if (sub.includes('networks')) return 'border-blue-500/30 bg-blue-950/20 text-blue-300';
    if (sub.includes('operating')) return 'border-cyan-500/30 bg-cyan-950/20 text-cyan-300';
    if (sub.includes('dbms')) return 'border-teal-500/30 bg-teal-950/20 text-teal-300';
    if (sub.includes('theory') || sub.includes('compiler')) return 'border-fuchsia-500/30 bg-fuchsia-950/20 text-fuchsia-300';
    if (sub.includes('aptitude')) return 'border-rose-500/30 bg-rose-950/20 text-rose-300';
    return 'border-gray-700 bg-gray-900/50 text-gray-300';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDrop = async (e, targetDate) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      await dragReschedule(taskId, targetDate);
    }
  };

  const openCompletionDraft = (task, scheduledDate) => {
    setCompletionDraft({
      task,
      completedDate: task.completedAt || scheduledDate || new Date().toISOString().split('T')[0]
    });
  };

  const loadSubjectOptions = async (subjectId) => {
    if (!subjectId) return;
    try {
      const topicsRes = await authFetch(`${API_BASE}/topics/${subjectId}`);
      const topics = await topicsRes.json();
      setSubjectTopics(topics);
      setLearningItems(await fetchLearningItems(subjectId));
    } catch (err) {
      console.error('Failed to load subject options:', err);
      setSubjectTopics([]);
      setLearningItems([]);
    }
  };

  const openAddDraft = async (date) => {
    const firstSubjectId = subjects[0]?.id || '';
    setCalendarSuggestions(await fetchCalendarSuggestions(date, 7));
    setAddDraft({
      date,
      subjectId: firstSubjectId,
      source: 'topic',
      topicId: '',
      learningItemId: '',
      mode: 'full',
      plannedMinutes: 60,
      title: '',
      markComplete: false
    });
    if (firstSubjectId) await loadSubjectOptions(firstSubjectId);
  };

  const applySuggestion = async (suggestion) => {
    await loadSubjectOptions(suggestion.subjectId);
    setAddDraft(prev => ({
      ...prev,
      date: suggestion.date,
      subjectId: suggestion.subjectId,
      source: suggestion.source,
      topicId: suggestion.topicId || '',
      learningItemId: suggestion.learningItemId || '',
      mode: suggestion.mode || 'full',
      plannedMinutes: suggestion.plannedMinutes || 60,
      title: suggestion.source === 'custom' ? suggestion.title : '',
      markComplete: false
    }));
  };

  const submitAddDraft = async () => {
    if (!addDraft) return;
    await addCalendarTask(addDraft);
    setAddDraft(null);
  };

  const submitLogDraft = async () => {
    if (!logDraft) return;
    await logTaskTime(logDraft);
    setLogDraft(null);
  };

  const submitCompletionDraft = async () => {
    if (!completionDraft) return;
    await toggleTaskComplete(completionDraft.task.id, true, completionDraft.completedDate);
    setCompletionDraft(null);
  };

  const openPlanningDraft = (phase) => {
    const names = subjects.map(subject => subject.name);
    setPlanningDraft({
      phase,
      targetDate: phaseTargetDate,
      strategy: 'sequential',
      primarySubject: names[0] || '',
      secondarySubject: names[1] || names[0] || '',
      weekdayHours: 3,
      weekendHours: 6
    });
  };

  const openWeeklyDraft = () => {
    const weekStart = getWeekStart(currentWeek[0]?.date);
    setWeeklyDraft({
      weekStart,
      aiPrompt: '',
      replaceAuto: true,
      days: buildWeekDays(weekStart)
    });
    setWeeklyError('');
  };

  const parseDurationToMinutes = (text) => {
    const value = String(text || '').trim().toLowerCase();
    if (!value) return 60;
    const colon = value.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (colon) {
      const first = parseInt(colon[1], 10);
      const second = parseInt(colon[2], 10);
      return Math.max(5, first * 60 + second);
    }
    const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
    const minutes = value.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/);
    const total = Math.round((hours ? parseFloat(hours[1]) * 60 : 0) + (minutes ? parseInt(minutes[1], 10) : 0));
    if (total > 0) return total;
    const plain = value.match(/\b(\d{2,3})\b/);
    return plain ? Math.max(5, parseInt(plain[1], 10)) : 60;
  };

  const parseBulkTopics = (text, subject) => {
    const lines = String(text || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);
    const tasks = [];

    lines.forEach(line => {
      const withoutIndex = line.replace(/^\s*(?:\d+[\).\-\s]+|[-*]\s+)/, '').trim();
      const durationMatch = withoutIndex.match(/(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)(?:\s*\d+\s*(?:m|min|mins|minute|minutes))?|\d+\s*(?:m|min|mins|minute|minutes))\s*$/i);
      const plannedMinutes = parseDurationToMinutes(durationMatch?.[1] || '');
      const title = (durationMatch ? withoutIndex.slice(0, durationMatch.index) : withoutIndex)
        .replace(/\s*[-|–—,:]\s*$/, '')
        .trim();

      if (title) {
        tasks.push({
          subject: subject || subjects[0]?.name || 'Weekly Study',
          title,
          plannedMinutes,
          mode: 'full',
          source: 'custom',
          topicId: '',
          learningItemId: ''
        });
      }
    });

    return tasks;
  };

  const addBulkTopicsToDay = (date) => {
    updateWeeklyDay(date, day => {
      const parsed = parseBulkTopics(day.bulkText, day.draft.subject);
      if (parsed.length === 0) return day;
      return {
        ...day,
        tasks: [...day.tasks, ...parsed],
        bulkText: ''
      };
    });
  };

  const updateWeeklyDay = (date, updater) => {
    setWeeklyDraft(prev => ({
      ...prev,
      days: prev.days.map(day => day.date === date ? updater(day) : day)
    }));
  };

  const addWeeklyManualTask = (date) => {
    updateWeeklyDay(date, day => {
      if (!day.draft.title.trim()) return day;
      return {
        ...day,
        tasks: [...day.tasks, {
          subject: day.draft.subject || subjects[0]?.name || 'Weekly Study',
          title: day.draft.title.trim(),
          plannedMinutes: parseInt(day.draft.plannedMinutes || '60', 10),
          mode: day.draft.mode || 'full',
          source: 'custom',
          topicId: '',
          learningItemId: ''
        }],
        draft: { ...day.draft, title: '', plannedMinutes: 60 }
      };
    });
  };

  const generateWeeklyAiPlan = async () => {
    if (!weeklyDraft) return;
    setWeeklyLoading(true);
    setWeeklyError('');
    const dailyHours = Object.fromEntries(weeklyDraft.days.map(day => [day.date, Number(day.hours || 0)]));
    const result = await suggestWeeklyPlan({
      weekStart: weeklyDraft.weekStart,
      dailyHours,
      prompt: weeklyDraft.aiPrompt
    });
    setWeeklyLoading(false);
    if (!result?.success) {
      setWeeklyError(result?.error || 'Could not generate weekly suggestions.');
      return;
    }
    setWeeklyDraft(prev => ({
      ...prev,
      days: prev.days.map(day => ({
        ...day,
        tasks: result.plan.days.find(entry => entry.date === day.date)?.tasks || []
      }))
    }));
  };

  const saveWeeklyPlan = async () => {
    if (!weeklyDraft) return;
    setWeeklyLoading(true);
    setWeeklyError('');
    const result = await applyWeeklyPlan({
      weekStart: weeklyDraft.weekStart,
      replaceAuto: weeklyDraft.replaceAuto,
      days: weeklyDraft.days.map(day => ({ date: day.date, tasks: day.tasks }))
    });
    setWeeklyLoading(false);
    if (!result?.success) {
      setWeeklyError(result?.error || 'Could not save weekly plan.');
      return;
    }
    setWeeklyDraft(null);
  };

  const submitPlanningDraft = async () => {
    if (!planningDraft) return;
    const priority = [
      planningDraft.primarySubject,
      planningDraft.secondarySubject,
      ...subjects.map(subject => subject.name)
    ].filter(Boolean);
    const uniquePriority = [...new Set(priority)];
    const planningOptions = {
      strategy: planningDraft.strategy,
      maxSubjectsPerDay: planningDraft.strategy === 'parallel' ? 2 : 1,
      parallelSubjects: planningDraft.strategy === 'parallel'
        ? [planningDraft.primarySubject, planningDraft.secondarySubject].filter(Boolean)
        : [],
      subjectPriority: uniquePriority,
      weekdayMinutes: Math.round(Number(planningDraft.weekdayHours || 3) * 60),
      weekendMinutes: Math.round(Number(planningDraft.weekendHours || 6) * 60)
    };

    await rebuildPhasePlan({
      phase: planningDraft.phase,
      targetDate: planningDraft.phase === 'phase2' ? planningDraft.targetDate : undefined,
      planningOptions
    });
    setPlanningDraft(null);
  };

  const toggleTaskButton = (e, task, scheduledDate) => {
    e.stopPropagation();
    if (task.completed) {
      toggleTaskComplete(task.id, false);
      return;
    }
    openCompletionDraft(task, scheduledDate);
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header Control */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gray-900/40 p-3 sm:p-4 rounded-xl border border-gray-800/80 backdrop-blur-md">
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <CalendarIcon className="text-cyber-primary w-6 h-6" />
          <h2 className="text-xl font-bold text-white tracking-wide font-sans">Prep Calendar</h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
          {/* View Toggles */}
          <div className="grid grid-cols-3 sm:flex bg-gray-950 rounded-lg p-1 border border-gray-900 w-full sm:w-auto">
            {['week', 'month', 'agenda'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`py-1.5 px-2 sm:px-4 rounded-md text-xs font-semibold uppercase tracking-wider transition duration-200 ${
                  view === v 
                    ? 'bg-cyber-primary text-white shadow-glow' 
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Navigation */}
          {view === 'week' && (
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <button 
                onClick={handlePrevWeek}
                disabled={currentWeekIndex === 0}
                className="p-2 rounded-lg border border-gray-800 bg-gray-950 text-gray-400 hover:text-gray-300 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-gray-300">
                Week {currentWeekIndex + 1} of {weeks.length}
              </span>
              <button 
                onClick={handleNextWeek}
                disabled={currentWeekIndex === weeks.length - 1}
                className="p-2 rounded-lg border border-gray-800 bg-gray-950 text-gray-400 hover:text-gray-300 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Adaptive Reschedule Alert Toggle */}
          <button
            onClick={() => {
              const todayStr = new Date().toISOString().split('T')[0];
              adaptiveReschedule(todayStr);
            }}
            className="flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-lg bg-cyber-rose/10 border border-cyber-rose/30 text-cyber-rose text-xs font-semibold hover:bg-cyber-rose/25 transition-all shadow-glow-rose duration-300"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rebalance Backlogs
          </button>

          <button
            onClick={() => openPlanningDraft('nitc_phase1')}
            className="flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-lg bg-cyber-emerald/10 border border-cyber-emerald/30 text-cyber-emerald text-xs font-semibold hover:bg-cyber-emerald/25 transition-all shadow-glow-emerald duration-300"
          >
            <Award className="w-3.5 h-3.5" /> NITC Phase 1
          </button>

          <button
            onClick={openWeeklyDraft}
            className="flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-lg bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary text-xs font-semibold hover:bg-cyber-primary/20 transition-all shadow-glow duration-300"
          >
            <Wand2 className="w-3.5 h-3.5" /> Prepare Week
          </button>

          <div className="grid grid-cols-[1fr_auto] sm:flex sm:items-center gap-2">
            <input
              type="date"
              value={phaseTargetDate}
              onChange={(e) => setPhaseTargetDate(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-xs text-gray-300 min-w-0"
            />
            <button
              onClick={() => openPlanningDraft('phase2')}
              className="flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-lg bg-gray-950 border border-gray-800 text-gray-300 text-xs font-semibold hover:border-cyber-primary transition whitespace-nowrap"
            >
              Compile Remaining
            </button>
          </div>
        </div>
      </div>

      {/* WEEK VIEW */}
      {view === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 md:gap-4">
          {currentWeek.map(day => (
            <div 
              key={day.date}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day.date)}
              className={`glass-panel rounded-xl p-4 min-h-[350px] border flex flex-col transition-all duration-300 ${
                day.isBuffer ? 'border-cyber-gold/20 bg-cyber-gold/[0.02]' : 'border-gray-800'
              }`}
            >
              {/* Day Header */}
              <div className="border-b border-gray-800/80 pb-2 mb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-bold text-cyber-primary">{day.dayOfWeek.substring(0, 3)}</span>
                    <div className="text-lg font-extrabold text-white mt-0.5">{day.date.substring(8, 10)}</div>
                    <span className="text-[10px] text-gray-500 font-medium">{day.date.substring(0, 7)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddDraft(day.date)}
                    className="p-1.5 rounded-lg bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary hover:bg-cyber-primary/20"
                    title="Add topic to this day"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-gray-500 font-bold">
                  {Math.round(day.tasks.reduce((sum, task) => sum + (task.plannedMinutes || task.duration * 60 || 0), 0) / 60 * 10) / 10}h planned /
                  {' '}{Math.round(day.tasks.reduce((sum, task) => sum + (task.actualMinutes || 0), 0) / 60 * 10) / 10}h logged
                </div>
              </div>

              {/* Tasks List */}
              <div className="flex-1 space-y-2">
                {day.tasks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-500">No study tasks</div>
                ) : (
                  day.tasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onMouseEnter={(e) => handleDragStart && handleHoverStart(e, task)}
                      onMouseLeave={handleHoverEnd}
                      onClick={() => onSelectTopic && onSelectTopic(task.topicName)}
                      className={`p-3 rounded-lg border text-left cursor-grab active:cursor-grabbing transition duration-200 ${getSubjectColor(task.subject)}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[9px] font-bold tracking-wider uppercase opacity-80">{task.subject}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskButton(e, task, day.date);
                          }}
                          className="opacity-70 hover:opacity-100 transition"
                        >
                          {task.completed ? (
                            <CheckSquare className="w-3.5 h-3.5 text-cyber-emerald fill-cyber-emerald/10" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-gray-500" />
                          )}
                        </button>
                      </div>
                      
                      <div className={`text-xs font-bold mt-1 line-clamp-2 ${task.completed ? 'line-through opacity-50' : 'text-gray-100'}`}>
                        {task.topicName}
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-[10px] opacity-75 font-semibold">
                        <Clock className="w-3 h-3 text-cyber-primary" /> {task.duration}h
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogDraft({
                              taskId: task.id,
                              date: day.date,
                              minutes: task.actualMinutes || task.plannedMinutes || Math.round((task.duration || 1) * 60),
                              note: '',
                              markComplete: false,
                              mode: task.mode || 'full'
                            });
                          }}
                          className="px-2 py-1 rounded border border-gray-700 bg-gray-950/40 text-[9px] text-gray-300 hover:text-white"
                        >
                          Log
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskComplete(task.id, true, day.date, Math.round((task.plannedMinutes || task.duration * 60 || 60) * 0.35), 'skim');
                          }}
                          className="px-2 py-1 rounded border border-cyber-gold/40 bg-cyber-gold/10 text-[9px] text-cyber-gold hover:bg-cyber-gold/20"
                        >
                          Skim
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MONTH VIEW */}
      {view === 'month' && (
        <div className="glass-panel rounded-xl p-3 sm:p-6 border border-gray-800">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendar.map((day, idx) => {
              const hasCompleted = day.tasks.some(t => t.completed);
              const allCompleted = day.tasks.length > 0 && day.tasks.every(t => t.completed);
              
              let cellBg = 'bg-gray-950 border-gray-900 text-gray-500';
              if (day.tasks.length > 0) {
                if (allCompleted) {
                  cellBg = 'bg-cyber-emerald/15 border-cyber-emerald/30 text-cyber-emerald shadow-glow-emerald';
                } else if (hasCompleted) {
                  cellBg = 'bg-cyber-primary/10 border-cyber-primary/20 text-cyber-primary';
                } else {
                  cellBg = 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700';
                }
              }
              if (day.isBuffer) {
                cellBg = 'bg-cyber-gold/10 border-cyber-gold/20 text-cyber-gold';
              }

              return (
                <div
                  key={day.date}
                  onClick={() => {
                    setView('week');
                    setCurrentWeekIndex(Math.floor(idx / 7));
                  }}
                  className={`h-14 sm:h-16 rounded-lg sm:rounded-xl border flex flex-col justify-between p-1.5 sm:p-2 text-left cursor-pointer transition duration-300 ${cellBg}`}
                >
                  <span className="text-[10px] font-bold">{day.date.substring(8, 10)}</span>
                  <div className="flex items-center justify-between text-[9px] font-bold opacity-80">
                    <span>{day.tasks.length} tasks</span>
                    {day.tasks.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-cyber-primary" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AGENDA VIEW */}
      {view === 'agenda' && (
        <div className="glass-panel rounded-xl border border-gray-800 divide-y divide-gray-800/80 max-h-[600px] overflow-y-auto pr-2">
          {calendar.map(day => (
            <div key={day.date} className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-gray-900/20 transition duration-150">
              <div className="md:w-1/4">
                <span className="text-xs uppercase tracking-widest font-bold text-cyber-primary">{day.dayOfWeek}</span>
                <div className="text-sm font-extrabold text-white mt-0.5">{day.date}</div>
                {day.isBuffer && (
                  <span className="inline-block mt-1 bg-cyber-gold/20 text-cyber-gold border border-cyber-gold/30 rounded-md py-0.5 px-2 text-[10px] font-bold">
                    Buffer Day
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-3">
                {day.tasks.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No tasks scheduled for this day</p>
                ) : (
                  day.tasks.map(task => (
                    <div 
                      key={task.id}
                      onClick={() => onSelectTopic && onSelectTopic(task.topicName)}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-950/50 border border-gray-900 hover:border-gray-800 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskButton(e, task, day.date);
                          }}
                          className="text-gray-500 hover:text-white transition"
                        >
                          {task.completed ? (
                            <CheckSquare className="w-5 h-5 text-cyber-emerald" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-700" />
                          )}
                        </button>

                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-cyber-primary">{task.subject}</span>
                          <h4 className={`text-sm font-bold ${task.completed ? 'line-through text-gray-500' : 'text-white'}`}>{task.topicName}</h4>
                          {task.description && (
                            <p className="text-xs text-gray-400 mt-1">{task.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-bold">
                        <span className="bg-gray-900 border border-gray-800 px-2 py-1 rounded text-gray-400 text-[10px] uppercase tracking-wide">
                          {task.type}
                        </span>
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <Clock className="w-3.5 h-3.5 text-cyber-primary" /> {task.duration}h
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FLOAT HOVER CARD DETAILS */}
      {hoveredTask && (
        <div 
          style={{ 
            position: 'absolute', 
            left: `${hoverPosition.x}px`, 
            top: `${hoverPosition.y}px`, 
            zIndex: 999 
          }}
          className="hidden sm:block w-80 glass-panel border border-cyber-primary/30 p-4 rounded-xl shadow-glass transform -translate-x-1/2 pointer-events-none"
        >
          <div className="flex justify-between items-start">
            <span className="bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/30 rounded py-0.5 px-2 text-[9px] uppercase tracking-widest font-extrabold">
              {hoveredTask.subject}
            </span>
            {hoveredTask.difficulty && (
              <span className="text-[10px] text-cyber-rose font-bold">{hoveredTask.difficulty}</span>
            )}
          </div>

          <h3 className="text-sm font-extrabold text-white mt-2 font-sans tracking-wide leading-tight">{hoveredTask.topicName}</h3>
          
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 border-t border-gray-800/80 pt-3">
            <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-cyber-primary" /> {hoveredTask.duration} Hours</div>
            {hoveredTask.recommendedPyqs > 0 && (
              <div className="flex items-center gap-1"><Award className="w-3.5 h-3.5 text-cyber-emerald" /> {hoveredTask.recommendedPyqs} PYQs</div>
            )}
          </div>

          {hoveredTask.learningObjectives && hoveredTask.learningObjectives.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Objectives:</span>
              <ul className="text-[11px] text-gray-300 mt-1 list-disc pl-4 space-y-1">
                {hoveredTask.learningObjectives.slice(0, 2).map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          )}

          {hoveredTask.resourceLink && (
            <div className="mt-3 flex items-center gap-1 text-[10px] text-cyber-primary font-bold">
              <Link className="w-3 h-3" /> GeeksforGeeks Lesson Link Available
            </div>
          )}
        </div>
      )}

      {addDraft && (
        <div className="fixed inset-0 z-[1000] bg-cyber-bg/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl glass-panel border border-cyber-primary/30 rounded-xl p-4 sm:p-5 space-y-4 my-4 sm:my-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">Add Topic To {addDraft.date}</h3>
              <button onClick={() => setAddDraft(null)} className="p-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {calendarSuggestions.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3 space-y-3 max-h-60 overflow-y-auto">
                <div className="text-[10px] font-black uppercase tracking-widest text-cyber-emerald">Suggested Next Topics</div>
                {calendarSuggestions.map(day => (
                  <div key={day.date} className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold">
                      <span>{day.date}</span>
                      <span>{Math.round(day.remainingMinutes / 60 * 10) / 10}h free</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {day.suggestions.map(suggestion => (
                        <button
                          key={`${day.date}_${suggestion.learningItemId || suggestion.topicId}`}
                          type="button"
                          onClick={() => applySuggestion(suggestion)}
                          className="text-left rounded-lg border border-gray-800 bg-gray-900/70 p-2 hover:border-cyber-primary transition"
                        >
                          <div className="text-[9px] text-cyber-primary font-black uppercase tracking-wider">{suggestion.subject}</div>
                          <div className="text-xs text-white font-bold line-clamp-2 mt-1">{suggestion.title}</div>
                          <div className="mt-1 text-[10px] text-gray-500">
                            {Math.round((suggestion.plannedMinutes || 0) / 60 * 10) / 10}h · {suggestion.source}
                            {!suggestion.fitsToday && <span className="text-cyber-gold"> · split later</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Subject</label>
                <select
                  value={addDraft.subjectId}
                  onChange={async (e) => {
                    const subjectId = e.target.value;
                    setAddDraft(prev => ({ ...prev, subjectId, topicId: '', learningItemId: '' }));
                    await loadSubjectOptions(subjectId);
                  }}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                >
                  {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Source</label>
                <select
                  value={addDraft.source}
                  onChange={(e) => setAddDraft(prev => ({ ...prev, source: e.target.value, topicId: '', learningItemId: '' }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                >
                  <option value="topic">GATE Topic</option>
                  <option value="video">Video Lesson</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {addDraft.source === 'topic' && (
              <select
                value={addDraft.topicId}
                onChange={(e) => {
                  const topic = subjectTopics.find(item => item.id === e.target.value);
                  setAddDraft(prev => ({ ...prev, topicId: e.target.value, plannedMinutes: (topic?.estimatedHours || 1) * 60 }));
                }}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
              >
                <option value="">Select topic</option>
                {subjectTopics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
              </select>
            )}

            {addDraft.source === 'video' && (
              <select
                value={addDraft.learningItemId}
                onChange={(e) => {
                  const item = learningItems.find(entry => entry.id === e.target.value);
                  setAddDraft(prev => ({ ...prev, learningItemId: e.target.value, topicId: item?.topicId || '', plannedMinutes: item?.durationMinutes || 60 }));
                }}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
              >
                <option value="">Select video lesson</option>
                {learningItems.map(item => <option key={item.id} value={item.id}>{item.sequence}. {item.title}</option>)}
              </select>
            )}

            {addDraft.source === 'custom' && (
              <input
                value={addDraft.title}
                onChange={(e) => setAddDraft(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Custom task title"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Mode</label>
                <select
                  value={addDraft.mode}
                  onChange={(e) => setAddDraft(prev => ({ ...prev, mode: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                >
                  <option value="full">Full Study</option>
                  <option value="skim">Skim</option>
                  <option value="revision">Revision</option>
                  <option value="pyq">PYQ</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Planned Minutes</label>
                <input
                  type="number"
                  min="5"
                  value={addDraft.plannedMinutes}
                  onChange={(e) => setAddDraft(prev => ({ ...prev, plannedMinutes: parseInt(e.target.value || '0') }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/70 p-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(addDraft.markComplete)}
                onChange={(e) => setAddDraft(prev => ({ ...prev, markComplete: e.target.checked }))}
                className="accent-cyber-emerald"
              />
              Already completed this on {addDraft.date}
            </label>

            {addDraft.markComplete && (
              <p className="text-[11px] text-gray-500">
                If this topic appears later in the calendar, that future copy will be replaced with the next unfinished topic automatically.
              </p>
            )}

            <button
              type="button"
              onClick={submitAddDraft}
              className="w-full py-3 rounded-lg bg-cyber-primary hover:bg-blue-600 text-white font-bold"
            >
              Add To Calendar
            </button>
          </div>
        </div>
      )}

      {logDraft && (
        <div className="fixed inset-0 z-[1000] bg-cyber-bg/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md glass-panel border border-cyber-emerald/30 rounded-xl p-4 sm:p-5 space-y-4 my-4 sm:my-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2"><Timer className="w-5 h-5 text-cyber-emerald" /> Log Study Time</h3>
              <button onClick={() => setLogDraft(null)} className="p-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <input
              type="number"
              min="1"
              value={logDraft.minutes}
              onChange={(e) => setLogDraft(prev => ({ ...prev, minutes: parseInt(e.target.value || '0') }))}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
            />
            <textarea
              value={logDraft.note}
              onChange={(e) => setLogDraft(prev => ({ ...prev, note: e.target.value }))}
              placeholder="What did you finish?"
              className="w-full h-24 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
            />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={logDraft.markComplete}
                onChange={(e) => setLogDraft(prev => ({ ...prev, markComplete: e.target.checked }))}
              />
              Mark task complete
            </label>
            <button
              type="button"
              onClick={submitLogDraft}
              className="w-full py-3 rounded-lg bg-cyber-emerald hover:bg-emerald-600 text-white font-bold"
            >
              Save Time Log
            </button>
          </div>
        </div>
      )}

      {planningDraft && (
        <div className="fixed inset-0 z-[1000] bg-cyber-bg/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl glass-panel border border-cyber-emerald/30 rounded-xl p-4 sm:p-5 space-y-4 my-4 sm:my-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] text-cyber-emerald font-black uppercase tracking-widest">
                  {planningDraft.phase === 'nitc_phase1' ? 'NITC Phase 1 Planner' : 'Remaining Plan Planner'}
                </div>
                <h3 className="text-lg font-extrabold text-white mt-1">Choose Study Flow</h3>
              </div>
              <button onClick={() => setPlanningDraft(null)} className="p-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Weekday Hours</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={planningDraft.weekdayHours}
                  onChange={(e) => setPlanningDraft(prev => ({ ...prev, weekdayHours: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Weekend Hours</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={planningDraft.weekendHours}
                  onChange={(e) => setPlanningDraft(prev => ({ ...prev, weekendHours: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Daily Flow</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['sequential', 'One subject/day'],
                  ['parallel', 'Two subjects/day']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPlanningDraft(prev => ({ ...prev, strategy: value }))}
                    className={`py-3 rounded-lg border text-sm font-bold transition ${
                      planningDraft.strategy === value
                        ? 'border-cyber-emerald bg-cyber-emerald/15 text-cyber-emerald'
                        : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Start With</label>
                <select
                  value={planningDraft.primarySubject}
                  onChange={(e) => setPlanningDraft(prev => ({ ...prev, primarySubject: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                >
                  {subjects.map(subject => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
                </select>
              </div>
              <div className={planningDraft.strategy === 'parallel' ? '' : 'opacity-50'}>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Parallel With</label>
                <select
                  value={planningDraft.secondarySubject}
                  disabled={planningDraft.strategy !== 'parallel'}
                  onChange={(e) => setPlanningDraft(prev => ({ ...prev, secondarySubject: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white disabled:cursor-not-allowed"
                >
                  {subjects.map(subject => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
                </select>
              </div>
            </div>

            {planningDraft.phase === 'phase2' && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Target Date</label>
                <input
                  type="date"
                  value={planningDraft.targetDate}
                  onChange={(e) => setPlanningDraft(prev => ({ ...prev, targetDate: e.target.value }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                />
              </div>
            )}

            <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-400">
              Auto-planning will cap generated work at {planningDraft.weekdayHours || 3}h on weekdays and {planningDraft.weekendHours || 6}h on weekends. Manual extra topics and logged extra time will still stay.
            </div>

            <button
              type="button"
              onClick={submitPlanningDraft}
              className="w-full py-3 rounded-lg bg-cyber-emerald hover:bg-emerald-600 text-white font-bold"
            >
              Generate Plan
            </button>
          </div>
        </div>
      )}

      {weeklyDraft && (
        <div className="fixed inset-0 z-[1000] bg-cyber-bg/80 backdrop-blur-md flex items-start justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-5xl glass-panel border border-cyber-primary/30 rounded-xl p-4 sm:p-5 space-y-4 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] text-cyber-primary font-black uppercase tracking-widest">Weekly Preparation</div>
                <h3 className="text-lg font-extrabold text-white mt-1">Plan This Week</h3>
              </div>
              <button onClick={() => setWeeklyDraft(null)} className="p-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Week Start</label>
                <input
                  type="date"
                  value={weeklyDraft.weekStart}
                  onChange={(e) => setWeeklyDraft(prev => ({ ...prev, weekStart: e.target.value, days: buildWeekDays(e.target.value) }))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">AI Instruction</label>
                <textarea
                  value={weeklyDraft.aiPrompt}
                  onChange={(e) => setWeeklyDraft(prev => ({ ...prev, aiPrompt: e.target.value }))}
                  placeholder="Example: Mon Tue Algorithm videos, Wed DS, Thu Fri DBMS, Sat Sun mix Discrete Maths revision and PYQs. Keep each day within my hours."
                  className="w-full h-24 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {weeklyDraft.days.map(day => (
                <div key={day.date} className="rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-3">
                  <div>
                    <div className="text-[10px] text-cyber-primary font-black uppercase tracking-wider">
                      {new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-sm text-white font-bold">{day.date.substring(5)}</div>
                  </div>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={day.hours}
                    onChange={(e) => updateWeeklyDay(day.date, current => ({ ...current, hours: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white"
                  />
                  <div className="space-y-2">
                    {day.tasks.map((task, index) => (
                      <div key={`${day.date}_${index}`} className="rounded-lg border border-gray-800 bg-gray-900/70 p-2">
                        <div className="text-[9px] text-cyber-emerald font-black uppercase">{task.subject}</div>
                        <input
                          value={task.title}
                          onChange={(e) => updateWeeklyDay(day.date, current => ({
                            ...current,
                            tasks: current.tasks.map((item, i) => i === index ? { ...item, title: e.target.value } : item)
                          }))}
                          className="w-full bg-transparent text-xs text-white font-bold outline-none mt-1"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="number"
                            min="15"
                            value={task.plannedMinutes}
                            onChange={(e) => updateWeeklyDay(day.date, current => ({
                              ...current,
                              tasks: current.tasks.map((item, i) => i === index ? { ...item, plannedMinutes: parseInt(e.target.value || '0') } : item)
                            }))}
                            className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-[10px] text-white"
                          />
                          <button
                            type="button"
                            onClick={() => updateWeeklyDay(day.date, current => ({
                              ...current,
                              tasks: current.tasks.filter((_, i) => i !== index)
                            }))}
                            className="text-[10px] text-cyber-rose hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <select
                    value={day.draft.subject}
                    onChange={(e) => updateWeeklyDay(day.date, current => ({ ...current, draft: { ...current.draft, subject: e.target.value } }))}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white"
                  >
                    {subjects.map(subject => <option key={subject.id} value={subject.name}>{subject.name}</option>)}
                  </select>
                  <input
                    value={day.draft.title}
                    onChange={(e) => updateWeeklyDay(day.date, current => ({ ...current, draft: { ...current.draft, title: e.target.value } }))}
                    placeholder="Topic/video"
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white"
                  />
                  <textarea
                    value={day.bulkText}
                    onChange={(e) => updateWeeklyDay(day.date, current => ({ ...current, bulkText: e.target.value }))}
                    placeholder={'Paste topics + lengths\nL06 Time Complexity 2:33:30\nSorting Techniques - 2h 08m'}
                    className="w-full h-24 bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => addBulkTopicsToDay(day.date)}
                    className="w-full rounded-lg border border-cyber-emerald/30 bg-cyber-emerald/10 py-2 text-[10px] font-bold text-cyber-emerald hover:bg-cyber-emerald/20"
                  >
                    Parse Pasted List
                  </button>
                  <button
                    type="button"
                    onClick={() => addWeeklyManualTask(day.date)}
                    className="w-full rounded-lg border border-cyber-primary/30 bg-cyber-primary/10 py-2 text-[10px] font-bold text-cyber-primary hover:bg-cyber-primary/20"
                  >
                    Add Item
                  </button>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={weeklyDraft.replaceAuto}
                onChange={(e) => setWeeklyDraft(prev => ({ ...prev, replaceAuto: e.target.checked }))}
                className="accent-cyber-primary"
              />
              Replace unfinished auto-planned tasks in this week
            </label>

            {weeklyError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{weeklyError}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={generateWeeklyAiPlan}
                disabled={weeklyLoading}
                className="py-3 rounded-lg bg-cyber-primary hover:bg-blue-600 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" /> {weeklyLoading ? 'Generating...' : 'Ask Gemini To Plan'}
              </button>
              <button
                type="button"
                onClick={saveWeeklyPlan}
                disabled={weeklyLoading}
                className="py-3 rounded-lg bg-cyber-emerald hover:bg-emerald-600 disabled:opacity-50 text-white font-bold"
              >
                Save Week To Calendar
              </button>
            </div>
          </div>
        </div>
      )}

      {completionDraft && (
        <div className="fixed inset-0 z-[1000] bg-cyber-bg/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="glass-panel border border-gray-800 rounded-xl p-4 sm:p-5 w-full max-w-md shadow-glass my-4 sm:my-0 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] text-cyber-primary font-black uppercase tracking-widest">Mark Completed</div>
                <h3 className="text-lg text-white font-extrabold mt-1 leading-tight">{completionDraft.task.topicName}</h3>
                <p className="text-xs text-gray-500 mt-1">{completionDraft.task.subject}</p>
              </div>
              <button
                type="button"
                onClick={() => setCompletionDraft(null)}
                className="p-2 rounded-lg border border-gray-800 text-gray-500 hover:text-white hover:border-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Finished On</label>
              <input
                type="date"
                value={completionDraft.completedDate}
                onChange={(e) => setCompletionDraft(prev => ({ ...prev, completedDate: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
              />
              <p className="text-[11px] text-gray-500 mt-2">
                This can be a past date. The task will move to that calendar day and count as completed there.
              </p>
            </div>

            <button
              type="button"
              onClick={submitCompletionDraft}
              className="w-full mt-5 flex items-center justify-center gap-2 py-3 rounded-lg bg-cyber-emerald hover:bg-emerald-600 text-white text-sm font-bold transition shadow-glow-emerald"
            >
              <Check className="w-4 h-4" /> Save Completion Date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
