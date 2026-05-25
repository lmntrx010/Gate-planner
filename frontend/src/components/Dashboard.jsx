import React from 'react';
import { useApp } from '../context/AppContext';
import { Flame, Award, BookOpen, Clock, Activity, CheckCircle, ChevronRight, Zap, Target } from 'lucide-react';

export default function Dashboard({ onNavigateToTab, onSelectTopic }) {
  const { stats, aiMotivation } = useApp();

  // Circular progress helper
  const renderReadinessRing = (percentage, size = 160, strokeWidth = 14) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Indicator */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#blueGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
          <defs>
            <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute text-center">
          <span className="text-3xl font-extrabold text-white tracking-tighter block font-sans">
            {percentage}%
          </span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            Readiness
          </span>
        </div>
      </div>
    );
  };

  // git-like study activity heatmap mockup
  const renderHeatmap = () => {
    const days = 91; // 13 weeks
    const cells = [];
    
    // Seed cells with varying active levels based on task completion
    for (let i = 0; i < days; i++) {
      let level = 0;
      if (i % 7 === 0) level = 0; // rest days
      else if (i < (stats.syllabusCompletion / 100) * days) {
        level = (i % 3) + 1; // completed days
      } else if (i === Math.floor((stats.syllabusCompletion / 100) * days)) {
        level = 4; // active day
      }
      cells.push(level);
    }

    const getHeatmapColor = (level) => {
      switch (level) {
        case 1: return 'bg-emerald-950 border border-emerald-900/30';
        case 2: return 'bg-emerald-800 shadow-glow-emerald/10 border border-emerald-700/20';
        case 3: return 'bg-emerald-600 shadow-glow-emerald/20';
        case 4: return 'bg-emerald-400 shadow-glow-emerald';
        default: return 'bg-gray-900 border border-gray-800/80';
      }
    };

    return (
      <div className="glass-panel rounded-xl p-5 border border-gray-800 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyber-emerald" /> Study Heatmap
          </h3>
          <span className="text-xs text-gray-500 block mt-1">Consistently commit study hours to maintain exam streaks</span>
        </div>

        <div className="grid grid-flow-col grid-rows-7 gap-1.5 mt-4 overflow-x-auto py-2">
          {cells.map((lvl, index) => (
            <div
              key={index}
              className={`w-3.5 h-3.5 rounded-sm heatmap-cell ${getHeatmapColor(lvl)}`}
              title={`Day ${index + 1}: Study Block Level ${lvl}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
          <span>Less</span>
          <div className="w-2.5 h-2.5 bg-gray-900 rounded-sm" />
          <div className="w-2.5 h-2.5 bg-emerald-950 rounded-sm" />
          <div className="w-2.5 h-2.5 bg-emerald-800 rounded-sm" />
          <div className="w-2.5 h-2.5 bg-emerald-600 rounded-sm" />
          <div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" />
          <span>More</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel rounded-xl p-5 border border-cyber-gold/30 bg-cyber-gold/5">
          <div className="text-[10px] text-cyber-gold font-black uppercase tracking-widest">NITC Self Sponsored Phase 1</div>
          <div className="text-2xl font-extrabold text-white mt-2">Deadline: 10 Jul 2026</div>
          <div className="text-xs text-gray-400 mt-2">
            DBMS, C, Algorithm, DS, Discrete Maths, and Engineering Maths. OS/CN stay manual until Phase 2.
          </div>
          <div className="mt-3 text-sm font-bold text-cyber-primary">
            {stats.phaseSummary?.remainingPhaseOne ?? 0} Phase 1 tasks left
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-cyber-emerald/30 bg-cyber-emerald/5">
          <div className="text-[10px] text-cyber-emerald font-black uppercase tracking-widest">Time Logged</div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div>
              <div className="text-xl font-extrabold text-white">{Math.round((stats.timeSummary?.todayMinutes || 0) / 60 * 10) / 10}h</div>
              <div className="text-[10px] text-gray-500 font-bold uppercase">Today</div>
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">{Math.round((stats.timeSummary?.weekMinutes || 0) / 60 * 10) / 10}h</div>
              <div className="text-[10px] text-gray-500 font-bold uppercase">Week</div>
            </div>
            <div>
              <div className="text-xl font-extrabold text-white">{Math.round((stats.timeSummary?.totalMinutes || 0) / 60 * 10) / 10}h</div>
              <div className="text-[10px] text-gray-500 font-bold uppercase">Total</div>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-cyber-primary/30 bg-cyber-primary/5">
          <div className="text-[10px] text-cyber-primary font-black uppercase tracking-widest">Planned vs Actual</div>
          <div className="mt-4">
            <div className="flex justify-between text-xs font-bold text-gray-400 mb-2">
              <span>Logged</span>
              <span>{Math.round(((stats.timeSummary?.actualMinutes || 0) / Math.max(stats.timeSummary?.plannedMinutes || 1, 1)) * 100)}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-950 border border-gray-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-blue-500"
                style={{ width: `${Math.min(100, Math.round(((stats.timeSummary?.actualMinutes || 0) / Math.max(stats.timeSummary?.plannedMinutes || 1, 1)) * 100))}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-500 mt-2">
              Planned {Math.round((stats.timeSummary?.plannedMinutes || 0) / 60)}h / Actual {Math.round((stats.timeSummary?.actualMinutes || 0) / 60)}h
            </div>
          </div>
        </div>
      </div>

      {/* Upper Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Card 1: Streak */}
        <div className="glass-panel rounded-xl p-5 border border-gray-800 flex items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-cyber-gold/5 rounded-full blur-2xl group-hover:bg-cyber-gold/10 transition duration-300" />
          <div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Preparation Streak</span>
            <div className="text-3xl font-extrabold text-white mt-1 tracking-tight">{stats.streak || 0} Days</div>
            <span className="text-xs text-cyber-gold font-semibold mt-1 block flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-cyber-gold" /> Active Study Track
            </span>
          </div>
          <div className="p-3 bg-cyber-gold/10 border border-cyber-gold/30 rounded-xl animate-pulse-glow shadow-glow-gold">
            <Flame className="w-7 h-7 text-cyber-gold fill-cyber-gold/35" />
          </div>
        </div>

        {/* Card 2: Syllabus Completed */}
        <div className="glass-panel rounded-xl p-5 border border-gray-800 flex items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-cyber-primary/5 rounded-full blur-2xl group-hover:bg-cyber-primary/10 transition duration-300" />
          <div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Syllabus Completion</span>
            <div className="text-3xl font-extrabold text-white mt-1 tracking-tight">{stats.syllabusCompletion || 0}%</div>
            <span className="text-xs text-cyber-primary font-semibold mt-1 block flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" /> GFG topics complete
            </span>
          </div>
          <div className="p-3 bg-cyber-primary/10 border border-cyber-primary/30 rounded-xl">
            <Award className="w-7 h-7 text-cyber-primary" />
          </div>
        </div>

        {/* Card 3: Total Study Hours */}
        <div className="glass-panel rounded-xl p-5 border border-gray-800 flex items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-cyber-emerald/5 rounded-full blur-2xl group-hover:bg-cyber-emerald/10 transition duration-300" />
          <div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Total Hours Logged</span>
            <div className="text-3xl font-extrabold text-white mt-1 tracking-tight">{stats.totalStudyHours || 0} Hours</div>
            <span className="text-xs text-cyber-emerald font-semibold mt-1 block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Effective study time
            </span>
          </div>
          <div className="p-3 bg-cyber-emerald/10 border border-cyber-emerald/30 rounded-xl">
            <Clock className="w-7 h-7 text-cyber-emerald" />
          </div>
        </div>

        {/* Card 4: Estimated Rank / Readiness */}
        <div className="glass-panel rounded-xl p-5 border border-gray-800 flex items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-cyber-accent/5 rounded-full blur-2xl group-hover:bg-cyber-accent/10 transition duration-300" />
          <div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Estimated Rank Factor</span>
            <div className="text-3xl font-extrabold text-white mt-1 tracking-tight">Top {stats.readinessScore > 75 ? '500' : stats.readinessScore > 50 ? '2000' : '5000'}</div>
            <span className="text-xs text-cyber-accent font-semibold mt-1 block flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> Probability prediction
            </span>
          </div>
          <div className="p-3 bg-cyber-accent/10 border border-cyber-accent/30 rounded-xl">
            <Target className="w-7 h-7 text-cyber-accent" />
          </div>
        </div>

      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column 1: Readiness Score circular progress */}
        <div className="glass-panel rounded-xl p-6 border border-gray-800 flex flex-col items-center justify-center gap-6 relative">
          <div className="absolute top-4 left-4">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">GATE Readiness</h3>
            <span className="text-[10px] text-gray-500 block mt-0.5">Unified exam probability index</span>
          </div>
          <div className="mt-6">
            {renderReadinessRing(stats.readinessScore || 0)}
          </div>
          <p className="text-center text-xs text-gray-400 max-w-[200px]">
            Based on completed subjects, notes compiled, and confidence scores across core sections.
          </p>
        </div>

        {/* Column 2: Heatmap */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {renderHeatmap()}

          {/* AI Motivator Card */}
          <div className="glass-panel rounded-xl p-5 border border-cyber-primary/20 bg-gradient-to-r from-blue-950/25 to-violet-950/25 flex items-center gap-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-15 pointer-events-none group-hover:scale-110 transition duration-300">
              <Zap className="w-20 h-20 text-cyber-primary" />
            </div>
            <div className="p-3 bg-cyber-primary/10 border border-cyber-primary/30 rounded-xl">
              <Zap className="w-6 h-6 text-cyber-primary animate-bounce" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5 font-sans tracking-wide">
                AI Planner Insights
              </h4>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                "{aiMotivation.motivationText}"
              </p>
              <div className="text-[10px] text-cyber-gold font-bold uppercase tracking-wider mt-2">
                Challenge: {aiMotivation.streakChallenge}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Subjects progress grid & upcoming tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Subject-wise progress cards */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">Syllabus Breakdown</h3>
              <span className="text-[10px] text-gray-500 block mt-0.5">Progress rates of the 13 core GATE subjects</span>
            </div>
            <button
              onClick={() => onNavigateToTab('subjects')}
              className="text-xs text-cyber-primary font-bold hover:underline flex items-center gap-0.5"
            >
              Detailed view <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2">
            {stats.subjectMetrics && stats.subjectMetrics.map(sub => (
              <div key={sub.subject} className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-3.5">
                <div className="flex justify-between items-start text-xs">
                  <div>
                    <h4 className="font-bold text-white font-sans">{sub.subject}</h4>
                    <span className="text-[10px] text-gray-500 font-bold uppercase">
                      Weightage: {sub.weightage}% - Logged: {sub.loggedHours || 0}h
                    </span>
                  </div>
                  <span className="font-extrabold text-cyber-emerald">{sub.rate}%</span>
                </div>
                
                {/* ProgressBar */}
                <div className="w-full bg-gray-950 h-2 rounded-full mt-2.5 overflow-hidden border border-gray-900">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-violet-500 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${sub.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks column */}
        <div className="glass-panel rounded-xl p-6 border border-gray-800 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-1">Upcoming Milestones</h3>
            <span className="text-[10px] text-gray-500 block mb-4">Your next 5 scheduled tasks</span>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[260px] pr-1">
            {stats.upcomingTasks && stats.upcomingTasks.length === 0 ? (
              <div className="text-center py-12 text-xs text-gray-500 italic">No pending tasks</div>
            ) : (
              stats.upcomingTasks && stats.upcomingTasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => onSelectTopic && onSelectTopic(task.topicName)}
                  className="p-3 bg-gray-950/60 hover:bg-gray-950 rounded-xl border border-gray-900 hover:border-gray-800 cursor-pointer flex items-center justify-between transition"
                >
                  <div className="truncate pr-2">
                    <span className="text-[9px] uppercase font-bold text-cyber-accent block">{task.subject}</span>
                    <span className="text-xs font-bold text-white truncate block">{task.topicName}</span>
                  </div>
                  <span className="bg-cyber-primary/10 text-cyber-primary border border-cyber-primary/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider min-w-[50px] text-center">
                    {task.type}
                  </span>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => onNavigateToTab('calendar')}
            className="w-full py-2.5 bg-cyber-primary hover:bg-blue-600 text-white rounded-lg text-xs font-bold mt-4 tracking-wider transition-all shadow-glow"
          >
            Launch Calendar Planner
          </button>
        </div>

      </div>
    </div>
  );
}
