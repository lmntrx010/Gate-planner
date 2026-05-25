import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, Play, Pause, RotateCcw, X, Minimize2, Maximize2, Award } from 'lucide-react';

export default function Pomodoro() {
  const { pomodoro, setPomodoro } = useApp();

  const activeMode = pomodoro.mode;
  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const modeLimits = {
    focus: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60
  };

  const getPercentage = () => {
    const limit = modeLimits[activeMode];
    return ((limit - pomodoro.timeLeft) / limit) * 100;
  };

  // Timer Tick Engine
  useEffect(() => {
    let interval = null;
    if (pomodoro.isActive && pomodoro.timeLeft > 0) {
      interval = setInterval(() => {
        setPomodoro(prev => ({
          ...prev,
          timeLeft: prev.timeLeft - 1
        }));
      }, 1000);
    } else if (pomodoro.timeLeft === 0 && pomodoro.isActive) {
      // Completed session
      setPomodoro(prev => {
        let nextMode = 'focus';
        let sessions = prev.totalSessions;
        
        if (prev.mode === 'focus') {
          sessions += 1;
          nextMode = sessions % 4 === 0 ? 'longBreak' : 'shortBreak';
        } else {
          nextMode = 'focus';
        }

        // Mock play audio block
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-500.wav');
          audio.volume = 0.4;
          audio.play();
        } catch (e) {
          console.log('Audio notify failed');
        }

        return {
          ...prev,
          isActive: false,
          mode: nextMode,
          timeLeft: modeLimits[nextMode],
          totalSessions: sessions
        };
      });
    }

    return () => clearInterval(interval);
  }, [pomodoro.isActive, pomodoro.timeLeft]);

  const toggleTimer = () => {
    setPomodoro(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const resetTimer = () => {
    setPomodoro(prev => ({
      ...prev,
      isActive: false,
      timeLeft: modeLimits[prev.mode]
    }));
  };

  const switchMode = (mode) => {
    setPomodoro(prev => ({
      ...prev,
      isActive: false,
      mode: mode,
      timeLeft: modeLimits[mode]
    }));
  };

  if (!pomodoro.isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 glass-panel border border-cyber-primary/25 rounded-2xl shadow-glass p-5 animate-bounce-short">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-3 mb-4">
        <div className="flex items-center gap-1.5 text-cyber-primary font-extrabold text-sm uppercase tracking-wider font-sans">
          <Clock className="w-4 h-4 animate-spin-slow" /> Pomodoro Timer
        </div>
        <button
          onClick={() => setPomodoro(prev => ({ ...prev, isOpen: false }))}
          className="text-gray-500 hover:text-gray-400 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modes Switcher */}
      <div className="grid grid-cols-3 gap-1.5 mb-4 text-[10px] font-bold text-center">
        {[
          { id: 'focus', label: 'Study' },
          { id: 'shortBreak', label: 'Short Break' },
          { id: 'longBreak', label: 'Long Rest' }
        ].map(m => (
          <button
            key={m.id}
            onClick={() => switchMode(m.id)}
            className={`py-1.5 rounded-lg uppercase tracking-wider transition ${
              activeMode === m.id 
                ? 'bg-cyber-primary/15 border border-cyber-primary/30 text-cyber-primary' 
                : 'bg-gray-950 border border-gray-900 text-gray-500 hover:text-gray-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Time Circle Progress indicator */}
      <div className="flex items-center justify-center my-4">
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
          <svg className="transform -rotate-90" width={140} height={140}>
            {/* track */}
            <circle cx="70" cy="70" r="58" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="6" fill="transparent" />
            {/* progress */}
            <circle
              cx="70"
              cy="70"
              r="58"
              stroke={activeMode === 'focus' ? '#3B82F6' : '#10B981'}
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 58}
              strokeDashoffset={2 * Math.PI * 58 - (getPercentage() / 100) * 2 * Math.PI * 58}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute text-center">
            <span className="text-3xl font-extrabold text-white tracking-tighter block font-sans">
              {formattedTime}
            </span>
            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest block mt-0.5">
              {activeMode === 'focus' ? 'Focusing' : 'Resting'}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={resetTimer}
          className="p-2.5 rounded-full bg-gray-950 border border-gray-900 text-gray-400 hover:text-white transition duration-200"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={toggleTimer}
          className={`p-4 rounded-full text-white transition duration-300 shadow-glow ${
            pomodoro.isActive 
              ? 'bg-cyber-rose hover:bg-rose-600 shadow-glow-rose' 
              : 'bg-cyber-primary hover:bg-blue-600 shadow-glow-blue'
          }`}
        >
          {pomodoro.isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
        </button>

        <div className="w-10 text-center">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Blocks</div>
          <div className="text-sm font-extrabold text-white flex items-center justify-center gap-0.5 mt-0.5">
            <Award className="w-3.5 h-3.5 text-cyber-gold" /> {pomodoro.totalSessions}
          </div>
        </div>
      </div>

    </div>
  );
}
