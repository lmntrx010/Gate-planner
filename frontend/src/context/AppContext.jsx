import React, { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext();

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';


export function AppProvider({ children }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profile, setProfile] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [stats, setStats] = useState({
    streak: 0,
    syllabusCompletion: 0,
    readinessScore: 0,
    totalStudyHours: 0,
    subjectMetrics: [],
    upcomingTasks: [],
    mockTrends: []
  });
  const [loading, setLoading] = useState(true);
  const [aiMotivation, setAiMotivation] = useState({ motivationText: '', streakChallenge: '' });

  // Session Authentication State
  const [userToken, setUserToken] = useState(localStorage.getItem('gate_user_token') || null);
  const [userName, setUserName] = useState(localStorage.getItem('gate_user_name') || null);
  const [userEmail, setUserEmail] = useState(localStorage.getItem('gate_user_email') || null);

  // Floating Pomodoro State
  const [pomodoro, setPomodoro] = useState({
    isOpen: false,
    isActive: false,
    mode: 'focus', // focus, shortBreak, longBreak
    timeLeft: 25 * 60,
    totalSessions: 0
  });

  // Authenticated API request helper
  const authFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (userToken) {
      headers['Authorization'] = userToken;
    }

    const res = await fetch(url, {
      ...options,
      headers
    });

    if (res.status === 401) {
      console.warn('[AppContext] Session expired or unauthorized. Logging out.');
      logout();
      throw new Error('Unauthorized');
    }

    return res;
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (data.success && data.token) {
        localStorage.setItem('gate_user_token', data.token);
        localStorage.setItem('gate_user_name', data.name);
        localStorage.setItem('gate_user_email', data.email);
        setUserToken(data.token);
        setUserName(data.name);
        setUserEmail(data.email);
        return { success: true };
      } else {
        return { error: data.error || 'Invalid credentials' };
      }
    } catch (err) {
      console.error('Login failed:', err);
      return { error: 'Failed to connect to authentication server.' };
    } finally {
      setLoading(false);
    }
  };

  const signup = async (name, email, password) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      
      if (data.success && data.token) {
        localStorage.setItem('gate_user_token', data.token);
        localStorage.setItem('gate_user_name', data.name);
        localStorage.setItem('gate_user_email', data.email);
        setUserToken(data.token);
        setUserName(data.name);
        setUserEmail(data.email);
        return { success: true };
      } else {
        return { error: data.error || 'Registration failed' };
      }
    } catch (err) {
      console.error('Signup failed:', err);
      return { error: 'Failed to connect to authentication server.' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('gate_user_token');
    localStorage.removeItem('gate_user_name');
    localStorage.removeItem('gate_user_email');
    setUserToken(null);
    setUserName(null);
    setUserEmail(null);
    setProfile(null);
    setSubjects([]);
    setCalendar([]);
    setStats({
      streak: 0,
      syllabusCompletion: 0,
      readinessScore: 0,
      totalStudyHours: 0,
      subjectMetrics: [],
      upcomingTasks: [],
      mockTrends: []
    });
  };

  const fetchProfile = async () => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/profile`);
      const data = await res.json();
      setProfile(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
    }
  };

  const fetchSubjects = async () => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/subjects`);
      const data = await res.json();
      setSubjects(data);
    } catch (err) {
      console.error('Failed to fetch subjects:', err);
    }
  };

  const fetchCalendar = async () => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/calendar`);
      const data = await res.json();
      setCalendar(data);
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
    }
  };

  const fetchDashboardStats = async () => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/dashboard/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    }
  };

  const fetchAiMotivation = async () => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/ai/motivation`);
      const data = await res.json();
      setAiMotivation(data);
    } catch (err) {
      console.error('Failed to fetch AI motivation:', err);
    }
  };

  const submitOnboarding = async (formData) => {
    if (!userToken) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/onboarding`, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      const result = await res.json();
      if (result.success) {
        await fetchProfile();
        await fetchCalendar();
        await fetchSubjects();
        await fetchDashboardStats();
        await fetchAiMotivation();
        setActiveTab('dashboard');
      }
      return result;
    } catch (err) {
      console.error('Onboarding failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskComplete = async (taskId, completed, completedDate, actualMinutes, mode) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/calendar/toggle-complete`, {
        method: 'POST',
        body: JSON.stringify({ taskId, completed, completedDate, actualMinutes, mode })
      });
      const data = await res.json();
      if (data.success) {
        await fetchCalendar();
        await fetchDashboardStats();
        await fetchAiMotivation();
      }
    } catch (err) {
      console.error('Failed to toggle task completion:', err);
    }
  };

  const saveTopicNotes = async (topicId, notes) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/topics/${topicId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
      return await res.json();
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  const toggleTopicBookmark = async (topicId) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/topics/${topicId}/bookmark`, {
        method: 'POST'
      });
      return await res.json();
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  };

  const updateTopicConfidence = async (topicId, score) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/topics/${topicId}/confidence`, {
        method: 'POST',
        body: JSON.stringify({ score })
      });
      const data = await res.json();
      await fetchSubjects();
      await fetchDashboardStats();
      return data;
    } catch (err) {
      console.error('Failed to save confidence rating:', err);
    }
  };

  const adaptiveReschedule = async (missedDate) => {
    if (!userToken) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/calendar/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ type: 'rebalance', missedDate })
      });
      const data = await res.json();
      if (data.success) {
        await fetchCalendar();
        await fetchDashboardStats();
        await fetchAiMotivation();
      }
      return data;
    } catch (err) {
      console.error('Adaptive reschedule failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const dragReschedule = async (taskId, newDate) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/calendar/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ type: 'drag', taskId, newDate })
      });
      const data = await res.json();
      if (data.success) {
        // Optimistically move task
        setCalendar(prev => {
          let movingTask = null;
          // Extract moving task
          const updatedDays = prev.map(day => {
            const hasTask = day.tasks.some(t => t.id === taskId);
            if (hasTask) {
              movingTask = day.tasks.find(t => t.id === taskId);
              return { ...day, tasks: day.tasks.filter(t => t.id !== taskId) };
            }
            return day;
          });

          // Insert into target day
          return updatedDays.map(day => {
            if (day.date === newDate && movingTask) {
              return { ...day, tasks: [...day.tasks, movingTask] };
            }
            return day;
          });
        });
      }
    } catch (err) {
      console.error('Drag reschedule failed:', err);
    }
  };

  const fetchLearningItems = async (subjectId) => {
    if (!userToken) return [];
    try {
      const suffix = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : '';
      const res = await authFetch(`${API_BASE}/learning-items${suffix}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch learning items:', err);
      return [];
    }
  };

  const fetchCalendarSuggestions = async (date, days = 7) => {
    if (!userToken) return [];
    try {
      const res = await authFetch(`${API_BASE}/calendar/suggestions?date=${encodeURIComponent(date)}&days=${days}`);
      const data = await res.json();
      return data.days || [];
    } catch (err) {
      console.error('Failed to fetch calendar suggestions:', err);
      return [];
    }
  };

  const addCalendarTask = async (payload) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/calendar/add-task`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await fetchCalendar();
        await fetchDashboardStats();
      }
      return data;
    } catch (err) {
      console.error('Failed to add calendar task:', err);
    }
  };

  const suggestWeeklyPlan = async (payload) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/calendar/weekly-ai-suggest`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err) {
      console.error('Failed to suggest weekly plan:', err);
      return { error: err.message };
    }
  };

  const applyWeeklyPlan = async (payload) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/calendar/apply-week-plan`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await fetchCalendar();
        await fetchDashboardStats();
      }
      return data;
    } catch (err) {
      console.error('Failed to apply weekly plan:', err);
      return { error: err.message };
    }
  };

  const logTaskTime = async (payload) => {
    if (!userToken) return;
    try {
      const res = await authFetch(`${API_BASE}/time-logs`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await fetchCalendar();
        await fetchDashboardStats();
      }
      return data;
    } catch (err) {
      console.error('Failed to log task time:', err);
    }
  };

  const rebuildPhasePlan = async (payload = {}) => {
    if (!userToken) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/calendar/rebuild-phase`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        await fetchCalendar();
        await fetchDashboardStats();
        await fetchAiMotivation();
      }
      return data;
    } catch (err) {
      console.error('Failed to rebuild phase plan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
      if (!userToken) {
        setLoading(false);
        return;
      }
      setLoading(true);
      await fetchProfile();
      await fetchSubjects();
      await fetchCalendar();
      await fetchDashboardStats();
      await fetchAiMotivation();
      setLoading(false);
    };
    initData();
  }, [userToken]);

  return (
    <AppContext.Provider value={{
      activeTab,
      setActiveTab,
      profile,
      subjects,
      calendar,
      stats,
      loading,
      aiMotivation,
      pomodoro,
      setPomodoro,
      userToken,
      userName,
      userEmail,
      login,
      signup,
      logout,
      authFetch,
      API_BASE,
      submitOnboarding,
      toggleTaskComplete,
      saveTopicNotes,
      toggleTopicBookmark,
      updateTopicConfidence,
      adaptiveReschedule,
      dragReschedule,
      fetchLearningItems,
      fetchCalendarSuggestions,
      addCalendarTask,
      suggestWeeklyPlan,
      applyWeeklyPlan,
      logTaskTime,
      rebuildPhasePlan,
      fetchSubjects,
      fetchCalendar,
      fetchDashboardStats
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
