import React, { useState } from 'react';
import { BookOpen, LogIn, UserPlus, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function AuthPage() {
  const { signIn, signUp, authError } = useApp();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    const result = mode === 'signin'
      ? await signIn(form.email, form.password)
      : await signUp(form.email, form.password, form.name);

    if (result?.needsConfirmation) {
      setMessage('Check your email to confirm your account, then sign in.');
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md glass-panel border border-gray-800 rounded-2xl p-8 shadow-glass">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center shadow-glow">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-widest uppercase">GATEPlanner</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">Secure study workspace</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-gray-950 border border-gray-900 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`py-2.5 rounded-lg text-xs font-bold transition ${
              mode === 'signin' ? 'bg-cyber-primary text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`py-2.5 rounded-lg text-xs font-bold transition ${
              mode === 'signup' ? 'bg-cyber-primary text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-cyber-primary"
              placeholder="Minimum 6 characters"
              minLength={6}
              required
            />
          </div>

          {(authError || message) && (
            <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              authError
                ? 'bg-cyber-rose/10 border-cyber-rose/40 text-cyber-rose'
                : 'bg-cyber-emerald/10 border-cyber-emerald/40 text-cyber-emerald'
            }`}>
              {authError || message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-cyber-primary hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold transition shadow-glow"
          >
            {mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'Please wait' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 flex items-center gap-2 text-xs text-gray-500">
          <BookOpen className="w-4 h-4 text-cyber-emerald" />
          Your plan, progress, notes, and calendar are saved per account.
        </div>
      </div>
    </div>
  );
}
