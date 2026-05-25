import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { BookOpen, Clock, Link, Bookmark, Check, Save, ShieldAlert, Award, Star } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export default function TopicDetails({ topicName, onClose }) {
  const { subjects, apiFetch, saveTopicNotes, toggleTopicBookmark, updateTopicConfidence } = useApp();
  const [topic, setTopic] = useState(null);
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Traverse subjects to find the matching topic meta
  useEffect(() => {
    if (!topicName) return;
    
    // Fetch detailed topic information from API or local state
    // For ease, we can locate it in the fetched subjects list:
    let foundTopic = null;
    let foundSubjectId = '';
    
    // We can query `/api/topics/:subjectId` by looking up the subjects
    const searchTopic = async () => {
      for (const sub of subjects) {
        try {
          const res = await apiFetch(`${API_BASE}/topics/${sub.id}`);
          const topicsList = await res.json();
          const match = topicsList.find(t => t.name.toLowerCase() === topicName.toLowerCase());
          if (match) {
            foundTopic = match;
            foundSubjectId = sub.id;
            break;
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (foundTopic) {
        setTopic(foundTopic);
        setNotes(foundTopic.notes || '');
        setConfidence(foundTopic.confidenceScore || 0);
        setIsBookmarked(foundTopic.isBookmarked || false);
      }
    };

    searchTopic();
  }, [topicName, subjects]);

  const handleBookmarkToggle = async () => {
    if (!topic) return;
    const res = await toggleTopicBookmark(topic.id);
    if (res && res.success) {
      setIsBookmarked(res.isBookmarked);
    }
  };

  const handleConfidenceChange = async (e) => {
    const val = parseInt(e.target.value);
    setConfidence(val);
  };

  const handleConfidenceSave = async () => {
    if (!topic) return;
    await updateTopicConfidence(topic.id, confidence);
  };

  const handleNotesSave = async () => {
    if (!topic) return;
    setSavingNotes(true);
    const res = await saveTopicNotes(topic.id, notes);
    setSavingNotes(false);
    if (res && res.success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  if (!topicName) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cyber-bg/80 backdrop-blur-md">
      <div className="max-w-2xl w-full glass-panel border border-cyber-primary/20 rounded-2xl p-6 relative flex flex-col justify-between max-h-[90vh] overflow-y-auto shadow-glass animate-bounce-short">
        
        {topic ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-800/80 pb-4">
              <div>
                <span className="text-[9px] uppercase tracking-widest font-extrabold text-cyber-accent block">Topic Details</span>
                <h2 className="text-xl font-extrabold text-white mt-1 leading-tight font-sans tracking-wide">{topic.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    topic.category === 'Core GATE' ? 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/30' :
                    topic.category === 'Overlapping' ? 'bg-cyber-accent/20 text-cyber-accent border border-cyber-accent/30' :
                    topic.category === 'Missing GATE' ? 'bg-cyber-rose/25 text-cyber-rose border border-cyber-rose/30' :
                    'bg-cyber-gold/20 text-cyber-gold border border-cyber-gold/30'
                  }`}>
                    {topic.category}
                  </span>
                  
                  {topic.syllabusMatched && (
                    <span className="text-[10px] text-cyber-emerald font-bold flex items-center gap-0.5">
                      ✓ Syllabus Matched
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Bookmark Button */}
                <button
                  onClick={handleBookmarkToggle}
                  className={`p-2.5 rounded-lg border transition ${
                    isBookmarked 
                      ? 'bg-cyber-gold/15 border-cyber-gold text-cyber-gold shadow-glow-gold' 
                      : 'bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-400'
                  }`}
                  title="Bookmark Topic"
                >
                  <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-cyber-gold' : ''}`} />
                </button>

                <button
                  onClick={onClose}
                  className="py-1.5 px-3 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-900 text-xs font-semibold text-gray-400"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Time / Objectives grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-950/60 p-4 rounded-xl border border-gray-900">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                <Clock className="w-4 h-4 text-cyber-primary" />
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Estimated Hours</div>
                  <div className="mt-0.5 text-white">{topic.estimatedHours} Hours</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                <Star className="w-4 h-4 text-cyber-rose" />
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Difficulty</div>
                  <div className="mt-0.5 text-white">{topic.difficulty}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
                <Award className="w-4 h-4 text-cyber-emerald" />
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">Recommended PYQs</div>
                  <div className="mt-0.5 text-white">{topic.recommendedPyqs} Problems</div>
                </div>
              </div>
            </div>

            {/* Objectives */}
            {topic.learningObjectives && topic.learningObjectives.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Learning Objectives</span>
                <ul className="text-xs text-gray-300 list-disc pl-5 space-y-1.5 leading-relaxed">
                  {topic.learningObjectives.map((obj, i) => (
                    <li key={i}>{obj}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Links */}
            {topic.resourceLink && (
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Study Materials</span>
                <a
                  href={topic.resourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary text-xs font-extrabold hover:bg-cyber-primary/20 transition-all duration-300 shadow-glow"
                >
                  <Link className="w-3.5 h-3.5" /> Launch GeeksforGeeks Lesson
                </a>
              </div>
            )}

            {/* Confidence Slider */}
            <div className="border-t border-gray-900 pt-4">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                Your Confidence Rating
              </label>
              <div className="flex items-center gap-4 mt-2">
                <input
                  type="range" min="0" max="100" step="5"
                  value={confidence}
                  onChange={handleConfidenceChange}
                  onMouseUp={handleConfidenceSave}
                  onTouchEnd={handleConfidenceSave}
                  className="flex-1 accent-cyber-primary"
                />
                <span className="bg-gray-950 border border-gray-900 py-1.5 px-3 rounded-lg text-xs font-bold text-white min-w-[50px] text-center">
                  {confidence}%
                </span>
              </div>
              <span className="text-[10px] text-gray-500 block mt-1.5">
                Note: Setting confidence above 80% automatically tags this topic as "Completed"!
              </span>
            </div>

            {/* Notes Section */}
            <div className="border-t border-gray-900 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Personal Study Notes
                </label>
                <button
                  onClick={handleNotesSave}
                  className="flex items-center gap-1.5 py-1 px-3 bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary hover:bg-cyber-primary/20 rounded-md text-[10px] font-bold transition"
                >
                  {saveSuccess ? <Check className="w-3 h-3 text-cyber-emerald" /> : <Save className="w-3 h-3" />}
                  {saveSuccess ? 'Saved!' : 'Save Notes'}
                </button>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write formulas, core theorems, shortcuts, or logs..."
                className="w-full h-32 bg-gray-950/80 border border-gray-900 rounded-xl p-3.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyber-primary focus:ring-1 focus:ring-cyber-primary/30"
              />
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-xs text-gray-500 animate-pulse">
            Loading topic configuration...
          </div>
        )}

      </div>
    </div>
  );
}
