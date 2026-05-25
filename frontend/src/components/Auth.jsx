import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Mail, Lock, User, Zap, Sparkles, AlertTriangle, Eye, EyeOff } from 'lucide-react';

export default function Auth() {
  const { login, signup, loading } = useApp();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  // Fields state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all required credentials.');
      return;
    }

    if (!isLogin && !name) {
      setError('Please provide your full name.');
      return;
    }

    try {
      let result;
      if (isLogin) {
        result = await login(email, password);
      } else {
        result = await signup(name, email, password);
      }

      if (result && result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError('Connection refused. Is the server running?');
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Dynamic Background Accents */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-violet-600/10 blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-600/10 blur-[140px] pointer-events-none animate-pulse" />
      
      {/* Decorative Grid Mesh */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md backdrop-blur-xl bg-gray-950/70 border border-gray-800/80 rounded-3xl p-8 shadow-2xl relative z-10"
      >
        
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 blur-xs" />

        {/* Logo and Brand */}
        <div className="flex flex-col items-center mb-8 text-center">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
            className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-violet-600 flex items-center justify-center shadow-glow mb-4"
          >
            <Zap className="w-6 h-6 text-white fill-white animate-pulse" />
          </motion.div>
          
          <h1 className="text-2xl font-black text-white tracking-widest uppercase font-sans">
            GATE<span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">PLANNER</span>
          </h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
            Global Hinglish CS/IT SaaS Portal
          </p>
        </div>

        {/* Dynamic Sliding Tabs */}
        <div className="grid grid-cols-2 bg-gray-900/60 p-1.5 rounded-2xl border border-gray-900/80 mb-6 relative">
          <button
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`py-2 text-xs font-bold rounded-xl transition-all duration-300 relative z-10 ${
              isLogin ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Sign In
          </button>
          
          <button
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`py-2 text-xs font-bold rounded-xl transition-all duration-300 relative z-10 ${
              !isLogin ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Sign Up
          </button>

          {/* Sliding Highlight Indicator */}
          <motion.div
            layout
            className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] bg-gray-800 border border-gray-700/50 rounded-xl pointer-events-none"
            animate={{ x: isLogin ? '0%' : '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        </div>

        {/* Error Display */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-5 overflow-hidden"
            >
              <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-1"
              >
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required={!isLogin}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sambhav Sharma"
                    className="w-full bg-gray-900/50 border border-gray-800 hover:border-gray-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 py-3 pl-11 pr-4 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none transition duration-200"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-gray-900/50 border border-gray-800 hover:border-gray-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 py-3 pl-11 pr-4 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none transition duration-200"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-1">
              Secure Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                <Lock className="w-4 h-4" />
              </div>
              
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-900/50 border border-gray-800 hover:border-gray-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 py-3 pl-11 pr-11 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none transition duration-200"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-glow hover:shadow-glow-violet disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <div className="w-4.5 h-4.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4.5 h-4.5" />
                {isLogin ? 'Enter Workspace' : 'Build Prep Roadmap'}
              </>
            )}
          </button>
        </form>

        {/* Motivating Hint */}
        <div className="mt-8 text-center border-t border-gray-900 pt-6">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-cyber-gold fill-cyber-gold/20" />
            <span>Curated GeeksforGeeks Hinglish Syllabus</span>
          </div>
        </div>

      </motion.div>
    </div>
  );
}
