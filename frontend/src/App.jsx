import React, { useState } from 'react';
import { useApp, AppProvider } from './context/AppContext';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import DependencyGraph from './components/DependencyGraph';
import TopicDetails from './components/TopicDetails';
import Pomodoro from './components/Pomodoro';
import Auth from './components/Auth';
import { Flame, Award, BookOpen, Clock, Layers, Zap, Download, Calendar as CalendarIcon, LogOut } from 'lucide-react';


function MainAppLayout() {
  const { activeTab, setActiveTab, profile, loading, subjects, setPomodoro, userToken, userName, logout, API_BASE } = useApp();
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // If session token is missing, show secure login/signup panel
  if (!userToken) {
    return <Auth />;
  }

  // If loading user state
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest animate-pulse">Initializing GATE Core State...</p>
        </div>
      </div>
    );
  }

  // If user profile is not set up, show Onboarding Flow
  if (!profile || !profile.onboardingCompleted) {
    return <Onboarding />;
  }

  // Authenticated file export handler
  const handleExport = async (format) => {
    setExportDropdownOpen(false);
    try {
      const res = await fetch(`${API_BASE}/export/${format}`, {
        headers: {
          'Authorization': userToken
        }
      });
      if (!res.ok) throw new Error('Export file download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gate_study_planner_${userName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export study plan:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-64 bg-gray-950/80 border-b md:border-b-0 md:border-r border-gray-900 flex flex-col justify-between py-4 md:py-6 px-4 shrink-0 backdrop-blur-lg z-20">
        <div className="space-y-4 md:space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center shadow-glow">
              <Zap className="w-4 h-4 text-white fill-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-widest uppercase font-sans">GATEPlanner</h1>
              <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest block">CS Hinglish SaaS</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="grid grid-cols-2 gap-2 md:block md:space-y-1.5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Award },
              { id: 'calendar', label: 'Calendar Plan', icon: CalendarIcon },
              { id: 'graph', label: 'Dependency Graph', icon: Layers },
              { id: 'subjects', label: 'Syllabus Core', icon: BookOpen }
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-center md:justify-start gap-2 md:gap-3 py-3 px-3 md:px-4 rounded-xl text-[11px] md:text-xs font-bold transition duration-200 ${
                    active 
                      ? 'bg-blue-500 text-white shadow-glow' 
                      : 'text-gray-400 hover:text-gray-300 hover:bg-gray-900/30'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" /> {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Floating Widgets Trigger & User Info */}
        <div className="space-y-3 md:space-y-4 border-t border-gray-900 pt-4 md:pt-6 mt-4 md:mt-0">
          <button
            onClick={() => setPomodoro(prev => ({ ...prev, isOpen: true }))}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition shadow-glow-emerald"
          >
            <Clock className="w-4.5 h-4.5" /> Pomodoro Timer
          </button>

          {/* Scoped Profile Card & Logout */}
          <div className="flex items-center justify-between gap-3 px-2 pt-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/35 flex items-center justify-center text-blue-400 text-xs font-black">
                {userName ? userName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white leading-tight truncate max-w-[100px]" title={userName}>
                  {userName || 'GATE Aspirant'}
                </div>
                <span className="text-[9px] text-gray-500 uppercase font-semibold">Target {profile.targetYear || 2027}</span>
              </div>
            </div>
            
            <button
              onClick={logout}
              title="Sign Out of Session"
              className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white transition duration-200"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 bg-black overflow-y-auto px-3 sm:px-4 md:px-6 py-5 md:py-8 relative">
        
        {/* HEADER BAR */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8 pb-4 border-b border-gray-900">
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-extrabold text-white tracking-wide font-sans">
              {activeTab === 'dashboard' && 'Milestones Dashboard'}
              {activeTab === 'calendar' && 'Notion Calendar Plan'}
              {activeTab === 'graph' && 'Dependency Flow Mapping'}
              {activeTab === 'subjects' && 'GATE Syllabus Progress'}
            </h2>
            <span className="text-xs text-gray-500 block mt-0.5">Prepare with structured GeeksforGeeks resources</span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto">
            
            {/* EXPORTS SYSTEM */}
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="flex items-center gap-1.5 py-2 px-3 sm:px-4 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs font-bold text-gray-300 transition"
              >
                <Download className="w-4 h-4" /> Export Plan
              </button>

              {exportDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-950 border border-gray-900 rounded-xl shadow-glass z-50 overflow-hidden divide-y divide-gray-900">
                  <button
                    onClick={() => handleExport('ics')}
                    className="w-full text-left py-3 px-4 text-xs font-bold text-gray-300 hover:bg-gray-900 transition flex items-center gap-2"
                  >
                    <CalendarIcon className="w-4 h-4 text-blue-400" /> ICS Google Calendar
                  </button>

                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left py-3 px-4 text-xs font-bold text-gray-300 hover:bg-gray-900 transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-emerald-400" /> Excel Spreadsheet (CSV)
                  </button>
                  
                  <button
                    onClick={() => {
                      setExportDropdownOpen(false);
                      window.print();
                    }}
                    className="w-full text-left py-3 px-4 text-xs font-bold text-gray-300 hover:bg-gray-900 transition flex items-center gap-2"
                  >
                    <Award className="w-4 h-4 text-amber-400" /> Print Booklet (PDF)
                  </button>
                </div>
              )}
            </div>

            {/* Streak Counter */}
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl py-2 px-4 text-xs font-extrabold text-amber-400 shadow-glow-gold">
              <Flame className="w-4 h-4 fill-amber-400 text-amber-400" /> {profile.streakCount || 0}
            </div>

          </div>
        </header>

        {/* ACTIVE TAB CONTAINER */}
        <div className="flex-1">
          {activeTab === 'dashboard' && (
            <Dashboard 
              onNavigateToTab={(tab) => setActiveTab(tab)} 
              onSelectTopic={(name) => setSelectedTopic(name)} 
            />
          )}
          {activeTab === 'calendar' && (
            <Calendar onSelectTopic={(name) => setSelectedTopic(name)} />
          )}
          {activeTab === 'graph' && (
            <DependencyGraph />
          )}
          
          {/* SYLLABUS DIRECT VIEW */}
          {activeTab === 'subjects' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {subjects.map(sub => (
                <div key={sub.id} className="glass-panel rounded-xl p-5 border border-gray-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-extrabold text-white font-sans">{sub.name}</h3>
                      <span className="text-[10px] text-gray-500 font-bold uppercase block mt-1">Difficulty: {sub.difficulty} / Weightage: {sub.weightage}%</span>
                    </div>
                    <span className="text-sm font-extrabold text-emerald-400">{sub.completionRate}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-950 h-2 rounded-full mt-4 overflow-hidden border border-gray-900">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-violet-500 h-full rounded-full"
                      style={{ width: `${sub.completionRate}%` }}
                    />
                  </div>

                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_BASE}/topics/${sub.id}`, {
                          headers: {
                            'Authorization': userToken
                          }
                        });
                        const list = await res.json();
                        if (list.length > 0) {
                          setSelectedTopic(list[0].name);
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="w-full py-2.5 bg-gray-950 hover:bg-gray-900 border border-gray-900 hover:border-gray-800 text-gray-400 hover:text-white rounded-lg text-xs font-bold mt-4 transition"
                  >
                    Explore Chapter Topics
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MODAL POPUPS */}
        {selectedTopic && (
          <TopicDetails 
            topicName={selectedTopic} 
            onClose={() => setSelectedTopic(null)} 
          />
        )}

        <Pomodoro />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppLayout />
    </AppProvider>
  );
}
