import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BookOpen, Calendar, CheckCircle, Clock, Flame, Search, Target, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { fallbackCatalog } from '../data/fallbackCatalog';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

const toDateInput = (date) => date.toISOString().split('T')[0];
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
};

const daysBetween = (start, end) => {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
};

export default function Onboarding() {
  const { submitOnboarding, apiFetch } = useApp();
  const [step, setStep] = useState(1);
  const [topicCatalog, setTopicCatalog] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const [draftTopicIds, setDraftTopicIds] = useState([]);
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [formData, setFormData] = useState({
    targetYear: 2027,
    startDate: new Date().toISOString().split('T')[0],
    targetExamDate: '2027-02-06',
    weekdayHours: 3,
    weekendHours: 6,
    preferredSlots: ['evening'],
    revisionFrequency: 'weekly',
    mockTestFrequency: 'biweekly',
    currentPrepLevel: 'beginner',
    completedTopics: [],
    selectedSubjects: [],
    subjectPlans: [],
    selectedTopics: [],
    planningOptions: {
      strategy: 'sequential',
      primarySubject: '',
      secondarySubject: ''
    },
    weakSubjects: [],
    breakPreference: 'pomodoro',
    userType: 'student'
  });

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/catalog`);
        if (!res.ok) {
          throw new Error(`Catalog request failed with ${res.status}`);
        }
        const catalog = await res.json();
        setTopicCatalog(catalog.length > 0 ? catalog : fallbackCatalog);
      } catch (err) {
        console.error('Failed to load syllabus catalog:', err);
        setTopicCatalog(fallbackCatalog);
      }
    };

    loadCatalog();
  }, []);

  const selectedSubjectIds = useMemo(
    () => new Set(formData.selectedSubjects.map(subject => subject.id)),
    [formData.selectedSubjects]
  );
  const completedTopicSet = useMemo(
    () => new Set(formData.completedTopics.map(topic => topic.toLowerCase())),
    [formData.completedTopics]
  );

  const plannedSubjectIds = useMemo(
    () => new Set(formData.subjectPlans.map(plan => plan.subjectId)),
    [formData.subjectPlans]
  );

  const activeSubject = topicCatalog.find(subject => subject.id === activeSubjectId)
    || formData.selectedSubjects[0]
    || null;

  const activeCatalogSubject = topicCatalog.find(subject => subject.id === activeSubject?.id);
  const activeTopics = activeCatalogSubject?.topics || [];
  const visibleTopics = activeTopics.filter(topic =>
    topic.name.toLowerCase().includes(topicSearch.toLowerCase())
  );

  const getSegmentStartDate = (subjectId = activeSubject?.id) => {
    const existing = formData.subjectPlans.find(plan => plan.subjectId === subjectId);
    return existing?.startDate || formData.startDate;
  };

  const suggestEndDate = (subject = activeCatalogSubject, topicIds = draftTopicIds, startDate = draftStartDate || getSegmentStartDate(subject?.id)) => {
    if (!subject) return formData.startDate;
    const selected = subject.topics.filter(topic => topicIds.includes(topic.id));
    const totalHours = selected.reduce((sum, topic) => sum + (topic.estimatedHours || 6) + 2.5, 0);
    const weeklyHours = (formData.weekdayHours * 5) + (formData.weekendHours * 2);
    const dailyAverage = Math.max(1, weeklyHours / 7);
    const daysNeeded = Math.ceil((totalHours / dailyAverage) * 1.2);
    const suggested = addDays(startDate, Math.max(2, daysNeeded - 1));
    return suggested > formData.targetExamDate ? formData.targetExamDate : suggested;
  };

  useEffect(() => {
    if (formData.selectedSubjects.length === 0) {
      setActiveSubjectId('');
      return;
    }

    if (!activeSubjectId || !selectedSubjectIds.has(activeSubjectId)) {
      setActiveSubjectId(formData.selectedSubjects[0].id);
    }
  }, [formData.selectedSubjects, activeSubjectId, selectedSubjectIds]);

  useEffect(() => {
    if (!activeCatalogSubject) return;
    const existing = formData.subjectPlans.find(plan => plan.subjectId === activeCatalogSubject.id);
    const topicIds = existing?.topics?.map(topic => topic.topicId) || activeCatalogSubject.topics.map(topic => topic.id);
    const startDate = existing?.startDate || getSegmentStartDate(activeCatalogSubject.id);
    setDraftTopicIds(topicIds);
    setDraftStartDate(startDate);
    setDraftEndDate(existing?.endDate || suggestEndDate(activeCatalogSubject, topicIds, startDate));
  }, [activeSubjectId, topicCatalog]);

  const handleNext = () => setStep(prev => Math.min(prev + 1, 5));
  const handlePrev = () => setStep(prev => Math.max(prev - 1, 1));

  const handleSlotToggle = (slot) => {
    setFormData(prev => {
      const exists = prev.preferredSlots.includes(slot);
      return {
        ...prev,
        preferredSlots: exists
          ? prev.preferredSlots.filter(s => s !== slot)
          : [...prev.preferredSlots, slot]
      };
    });
  };

  const handleSubjectToggle = (subject) => {
    setFormData(prev => {
      const exists = prev.selectedSubjects.some(selected => selected.id === subject.id);
      if (exists) {
        return {
          ...prev,
          selectedSubjects: prev.selectedSubjects.filter(selected => selected.id !== subject.id),
          subjectPlans: prev.subjectPlans.filter(plan => plan.subjectId !== subject.id)
        };
      }

      return {
        ...prev,
        selectedSubjects: [...prev.selectedSubjects, {
          id: subject.id,
          name: subject.name,
          weightage: subject.weightage,
          difficulty: subject.difficulty
        }]
      };
    });
  };

  const handleCompletedSubjectToggle = (subject) => {
    const subjectTopicNames = (subject.topics || []).map(topic => topic.name);
    const allCompleted = subjectTopicNames.every(topic => completedTopicSet.has(topic.toLowerCase()));

    setFormData(prev => {
      const nextCompleted = allCompleted
        ? prev.completedTopics.filter(topic => !subjectTopicNames.some(name => name.toLowerCase() === topic.toLowerCase()))
        : [...new Set([...prev.completedTopics, ...subjectTopicNames])];

      return {
        ...prev,
        completedTopics: nextCompleted,
        selectedSubjects: allCompleted
          ? prev.selectedSubjects
          : prev.selectedSubjects.filter(selected => selected.id !== subject.id),
        subjectPlans: allCompleted
          ? prev.subjectPlans
          : prev.subjectPlans.filter(plan => plan.subjectId !== subject.id)
      };
    });
  };

  const handleDraftTopicToggle = (topicId) => {
    setDraftTopicIds(prev => {
      const next = prev.includes(topicId)
        ? prev.filter(id => id !== topicId)
        : [...prev, topicId];
      setDraftEndDate(suggestEndDate(activeCatalogSubject, next, draftStartDate));
      return next;
    });
  };

  const handleSelectAllDraftTopics = () => {
    if (!activeCatalogSubject) return;
    const allIds = activeCatalogSubject.topics.map(topic => topic.id);
    const next = draftTopicIds.length === allIds.length ? [] : allIds;
    setDraftTopicIds(next);
    setDraftEndDate(suggestEndDate(activeCatalogSubject, next, draftStartDate));
  };

  const handleSaveSubjectPlan = () => {
    if (!activeCatalogSubject || draftTopicIds.length === 0) return;

    const topics = activeCatalogSubject.topics
      .filter(topic => draftTopicIds.includes(topic.id))
      .map(topic => ({
        subjectId: activeCatalogSubject.id,
        subject: activeCatalogSubject.name,
        topicId: topic.id,
        topicName: topic.name
      }));

    const plan = {
      subjectId: activeCatalogSubject.id,
      subject: activeCatalogSubject.name,
      startDate: draftStartDate || getSegmentStartDate(activeCatalogSubject.id),
      endDate: draftEndDate,
      topics
    };

    setFormData(prev => {
      const withoutCurrent = prev.subjectPlans.filter(item => item.subjectId !== activeCatalogSubject.id);
      return { ...prev, subjectPlans: [...withoutCurrent, plan] };
    });

    const nextSubject = formData.selectedSubjects.find(subject =>
      subject.id !== activeCatalogSubject.id && !plannedSubjectIds.has(subject.id)
    );
    if (nextSubject) {
      setActiveSubjectId(nextSubject.id);
    }
  };

  const handleRemoveSubjectPlan = (subjectId) => {
    setFormData(prev => ({
      ...prev,
      subjectPlans: prev.subjectPlans.filter(plan => plan.subjectId !== subjectId)
    }));
  };

  const buildSelectedTopics = () => formData.subjectPlans.flatMap(plan => plan.topics);

  const buildPlanningOptions = () => {
    const subjectNames = formData.selectedSubjects.map(subject => subject.name);
    const primary = formData.planningOptions.primarySubject || subjectNames[0] || '';
    const secondary = formData.planningOptions.secondarySubject || subjectNames.find(name => name !== primary) || '';
    const priority = [...new Set([primary, secondary, ...subjectNames].filter(Boolean))];

    return {
      strategy: formData.planningOptions.strategy || 'sequential',
      maxSubjectsPerDay: formData.planningOptions.strategy === 'parallel' ? 2 : 1,
      parallelSubjects: formData.planningOptions.strategy === 'parallel' ? [primary, secondary].filter(Boolean) : [],
      subjectPriority: priority,
      weekdayMinutes: Math.round(Number(formData.weekdayHours || 3) * 60),
      weekendMinutes: Math.round(Number(formData.weekendHours || 6) * 60)
    };
  };

  const handleSubmit = async () => {
    setSubmitError('');
    const result = await submitOnboarding({
      ...formData,
      selectedTopics: buildSelectedTopics(),
      planningOptions: buildPlanningOptions()
    });

    if (!result?.success) {
      setSubmitError(result?.error || 'Could not compile your study plan. Please check your dates and try again.');
    }
  };

  const renderProgressBar = () => (
    <div className="w-full flex items-center justify-between mb-8 px-4">
      {[1, 2, 3, 4, 5].map(num => (
        <React.Fragment key={num}>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300 font-semibold text-sm ${
            step >= num
              ? 'bg-cyber-primary border-cyber-primary text-white shadow-glow'
              : 'border-gray-700 text-gray-500 bg-gray-900'
          }`}>
            {num}
          </div>
          {num < 5 && (
            <div className={`flex-1 h-[2px] mx-2 transition-all duration-500 ${step > num ? 'bg-cyber-primary' : 'bg-gray-800'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const isNextDisabled =
    (step === 3 && formData.selectedSubjects.length === 0 && formData.completedTopics.length === 0)
    || (step === 4 && formData.subjectPlans.length === 0 && formData.completedTopics.length === 0);

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full glass-panel rounded-2xl p-8 border border-gray-800 shadow-glass relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-cyber-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-cyber-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent font-sans">
            GATE CS/IT Hinglish Planner
          </h1>
          <p className="mt-2 text-sm text-gray-400">Build a subject-by-subject roadmap with target dates.</p>
        </div>

        {renderProgressBar()}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Target className="text-cyber-primary w-5 h-5" /> Target & Timeline
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">GATE Target Year</label>
                <select
                  value={formData.targetYear}
                  onChange={(e) => setFormData({ ...formData, targetYear: parseInt(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                >
                  <option value="2027">2027</option>
                  <option value="2028">2028</option>
                  <option value="2029">2029</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Your Preparation Status</label>
                <select
                  value={formData.userType}
                  onChange={(e) => setFormData({ ...formData, userType: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                >
                  <option value="student">College Student (Part-Time)</option>
                  <option value="working">Working Professional (Part-Time)</option>
                  <option value="full-time">Full-Time Aspirant</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Exam Target Date</label>
                <input
                  type="date"
                  value={formData.targetExamDate}
                  onChange={(e) => setFormData({ ...formData, targetExamDate: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Clock className="text-cyber-accent w-5 h-5" /> Study Hour Allotment
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                ['weekdayHours', 'Weekday Study Allocation', 'Hours Monday - Friday', 10],
                ['weekendHours', 'Weekend Study Allocation', 'Hours Saturday - Sunday', 16]
              ].map(([key, title, help, max]) => (
                <div key={key} className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                  <label className="block text-sm font-semibold text-gray-200 mb-1">{title}</label>
                  <span className="text-xs text-gray-400 block mb-3">{help}</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max={max}
                      step="0.5"
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: parseFloat(e.target.value) })}
                      className={key === 'weekdayHours' ? 'flex-1 accent-cyber-primary' : 'flex-1 accent-cyber-accent'}
                    />
                    <span className={key === 'weekdayHours'
                      ? 'bg-cyber-primary/20 text-cyber-primary text-sm font-bold py-1 px-3 rounded-lg border border-cyber-primary/40 min-w-[50px] text-center'
                      : 'bg-cyber-accent/20 text-cyber-accent text-sm font-bold py-1 px-3 rounded-lg border border-cyber-accent/40 min-w-[50px] text-center'}
                    >
                      {formData[key]}h
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Preferred Study Time Slots</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['morning', 'afternoon', 'evening', 'night'].map(slot => {
                  const active = formData.preferredSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleSlotToggle(slot)}
                      className={`py-3 px-2 rounded-xl text-xs font-semibold uppercase tracking-wider border text-center transition-all duration-300 ${
                        active ? 'bg-cyber-primary/10 border-cyber-primary text-cyber-primary shadow-glow' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <BookOpen className="text-cyber-emerald w-5 h-5" /> Select Subjects To Complete
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[430px] overflow-y-auto pr-1">
              {topicCatalog.map(subject => {
                const selected = selectedSubjectIds.has(subject.id);
                const completed = subject.topics.every(topic => completedTopicSet.has(topic.name.toLowerCase()));
                return (
                  <div
                    key={subject.id}
                    className={`text-left p-4 rounded-xl border transition ${
                      completed
                        ? 'bg-cyber-primary/10 border-cyber-primary/40 text-white'
                        :
                      selected
                        ? 'bg-cyber-emerald/10 border-cyber-emerald/50 text-white'
                        : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <button type="button" onClick={() => handleSubjectToggle(subject)} className="w-full text-left flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-extrabold leading-snug">{subject.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold mt-1">
                          {subject.topics.length} topics - {subject.difficulty}
                        </div>
                      </div>
                      <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${completed ? 'bg-cyber-primary border-cyber-primary' : selected ? 'bg-cyber-emerald border-cyber-emerald' : 'border-gray-700'}`}>
                        {(selected || completed) && <CheckCircle className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompletedSubjectToggle(subject)}
                      className={`w-full mt-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wide transition ${
                        completed
                          ? 'border-cyber-primary text-cyber-primary bg-cyber-primary/10'
                          : 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
                      }`}
                    >
                      {completed ? 'Completed Earlier' : 'Mark Already Completed'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Calendar className="text-cyber-gold w-5 h-5" /> Build Subject Roadmap
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_280px] gap-4">
              <div className="bg-gray-950/70 border border-gray-900 rounded-xl p-2 max-h-[430px] overflow-y-auto">
                {formData.selectedSubjects.map(subject => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => setActiveSubjectId(subject.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition ${
                      activeSubject?.id === subject.id ? 'bg-cyber-primary text-white' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                    }`}
                  >
                    <span className="block leading-snug">{subject.name}</span>
                    <span className={plannedSubjectIds.has(subject.id) ? 'text-cyber-emerald' : 'text-gray-600'}>
                      {plannedSubjectIds.has(subject.id) ? 'Planned' : 'Not planned'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="bg-gray-950/70 border border-gray-900 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-extrabold text-white">{activeCatalogSubject?.name || 'Select a subject'}</div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                      Flexible segment: you may overlap this subject with another one.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllDraftTopics}
                    className="px-3 py-2 rounded-lg border border-gray-800 text-xs font-bold text-gray-300 hover:border-cyber-primary hover:text-white transition"
                  >
                    Toggle Topics
                  </button>
                </div>

                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="search"
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder="Search topics"
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-cyber-primary"
                  />
                </div>

                <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
                  {visibleTopics.map(topic => {
                    const selected = draftTopicIds.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => handleDraftTopicToggle(topic.id)}
                        className={`w-full flex items-start justify-between gap-3 p-3 rounded-lg border text-left transition ${
                          selected ? 'bg-cyber-emerald/10 border-cyber-emerald/50 text-white' : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700'
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-bold leading-snug">{topic.name}</span>
                          <span className="text-[10px] text-gray-500 uppercase font-bold">
                            {topic.estimatedHours || 6}h - {topic.difficulty || 'Intermediate'} - {topic.category || 'Core GATE'}
                          </span>
                        </span>
                        <span className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-cyber-emerald border-cyber-emerald text-white' : 'border-gray-700'}`}>
                          {selected && <CheckCircle className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mt-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Subject Start Date</label>
                    <input
                      type="date"
                      min={formData.startDate}
                      max={formData.targetExamDate}
                      value={draftStartDate}
                      onChange={(e) => {
                        setDraftStartDate(e.target.value);
                        setDraftEndDate(suggestEndDate(activeCatalogSubject, draftTopicIds, e.target.value));
                      }}
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Subject End Date</label>
                    <input
                      type="date"
                      min={draftStartDate || formData.startDate}
                      max={formData.targetExamDate}
                      value={draftEndDate}
                      onChange={(e) => setDraftEndDate(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSubjectPlan}
                    disabled={!activeCatalogSubject || draftTopicIds.length === 0}
                    className="self-end py-3 px-5 rounded-lg bg-cyber-primary hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-bold transition"
                  >
                    Add To Roadmap
                  </button>
                </div>
              </div>

              <div className="bg-gray-950/70 border border-gray-900 rounded-xl p-4">
                <div className="text-sm font-extrabold text-white mb-3">Roadmap Order</div>
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {formData.subjectPlans.length === 0 && (
                    <div className="text-xs text-gray-500 py-8 text-center">Add your first subject segment.</div>
                  )}
                  {formData.subjectPlans.map((plan, index) => (
                    <div key={plan.subjectId} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] text-cyber-primary font-black">#{index + 1}</div>
                          <div className="text-xs text-white font-bold leading-snug">{plan.subject}</div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            {plan.startDate} to {plan.endDate} - {plan.topics.length} topics
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubjectPlan(plan.subjectId)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-cyber-rose hover:bg-cyber-rose/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <Flame className="text-cyber-gold w-5 h-5" /> Revision, Tests & Confirmation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { level: 'beginner', title: 'Fresh Start', desc: 'Zero concepts completed' },
                { level: 'intermediate', title: 'Core Familiar', desc: 'Completed 2-3 subjects' },
                { level: 'advanced', title: 'Ready to Solve', desc: 'Completed >6 subjects' }
              ].map(item => (
                <button
                  key={item.level}
                  type="button"
                  onClick={() => setFormData({ ...formData, currentPrepLevel: item.level })}
                  className={`p-4 rounded-xl border text-center transition-all duration-300 ${
                    formData.currentPrepLevel === item.level ? 'bg-cyber-emerald/15 border-cyber-emerald text-cyber-emerald shadow-glow-emerald' : 'bg-gray-900 border-gray-800 text-gray-400'
                  }`}
                >
                  <div className="font-bold text-sm text-white">{item.title}</div>
                  <div className="text-[10px] text-gray-400 mt-2">{item.desc}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">Formula & Note Revision</label>
                <div className="space-y-2">
                  {['daily', 'weekly', 'biweekly'].map(freq => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setFormData({ ...formData, revisionFrequency: freq })}
                      className={`w-full p-3 rounded-xl border text-left text-sm font-bold capitalize ${formData.revisionFrequency === freq ? 'bg-cyber-gold/15 border-cyber-gold text-white' : 'bg-gray-900 border-gray-800 text-gray-400'}`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">Mock Test Frequency</label>
                <div className="space-y-2">
                  {['monthly', 'biweekly', 'weekly'].map(freq => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setFormData({ ...formData, mockTestFrequency: freq })}
                      className={`w-full p-3 rounded-xl border text-left text-sm font-bold capitalize ${formData.mockTestFrequency === freq ? 'bg-cyber-primary/15 border-cyber-primary text-white' : 'bg-gray-900 border-gray-800 text-gray-400'}`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gray-950 p-4 rounded-xl border border-gray-900 text-xs text-gray-400 space-y-2">
              <div className="flex justify-between">
                <span>Total Study Duration:</span>
                <span className="text-white font-bold">{daysBetween(formData.startDate, formData.targetExamDate)} Days</span>
              </div>
              <div className="flex justify-between">
                <span>Roadmap Segments:</span>
                <span className="text-white font-bold">{formData.subjectPlans.length} subjects</span>
              </div>
              <div className="flex justify-between text-cyber-emerald">
                <span>Selected Topics:</span>
                <span className="font-bold">{buildSelectedTopics().length} topics</span>
              </div>
              <div className="flex justify-between text-cyber-gold">
                <span>Assessment Structure:</span>
                <span className="font-bold">Mock tests ({formData.mockTestFrequency})</span>
              </div>
            </div>

            <div className="bg-gray-950 p-4 rounded-xl border border-gray-900 space-y-4">
              <h3 className="text-sm font-bold text-white">Planning Flow</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['sequential', 'One subject/day'],
                  ['parallel', 'Two subjects/day']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      planningOptions: { ...prev.planningOptions, strategy: value }
                    }))}
                    className={`p-3 rounded-xl border text-sm font-bold transition ${
                      formData.planningOptions.strategy === value
                        ? 'bg-cyber-emerald/15 border-cyber-emerald text-cyber-emerald'
                        : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={formData.planningOptions.primarySubject || formData.selectedSubjects[0]?.name || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    planningOptions: { ...prev.planningOptions, primarySubject: e.target.value }
                  }))}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm text-white"
                >
                  {formData.selectedSubjects.map(subject => <option key={subject.id} value={subject.name}>Start: {subject.name}</option>)}
                </select>
                <select
                  disabled={formData.planningOptions.strategy !== 'parallel'}
                  value={formData.planningOptions.secondarySubject || formData.selectedSubjects.find(subject => subject.name !== formData.planningOptions.primarySubject)?.name || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    planningOptions: { ...prev.planningOptions, secondarySubject: e.target.value }
                  }))}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {formData.selectedSubjects.map(subject => <option key={subject.id} value={subject.name}>Parallel: {subject.name}</option>)}
                </select>
              </div>

              <p className="text-xs text-gray-500">
                Generated tasks stay within {formData.weekdayHours}h weekdays and {formData.weekendHours}h weekends. Extra manual work can still be added later.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1 py-2.5 px-5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900 text-gray-300 font-semibold transition duration-200"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isNextDisabled}
              className={`flex items-center gap-1 py-2.5 px-6 rounded-lg text-white font-semibold transition duration-200 shadow-glow ${
                isNextDisabled ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-cyber-primary hover:bg-blue-600'
              }`}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-1 py-3 px-8 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold transition duration-200 shadow-glow-emerald"
            >
              Compile Study Plan <CheckCircle className="w-5 h-5" />
            </button>
          )}
        </div>
        {submitError && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {submitError}
          </div>
        )}
      </div>
    </div>
  );
}
