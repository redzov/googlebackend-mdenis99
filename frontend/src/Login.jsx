import React, { useState } from 'react';
import { Shield, LogIn, AlertTriangle } from 'lucide-react';
import api from './api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.login(username, password);
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ornaments */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="pointer-events-none absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(250,204,21,0.18), transparent)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(163,230,53,0.10), transparent)' }}
      />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-yellow-500/10 bg-neutral-900/80 p-8 backdrop-blur-lg ring-1 ring-yellow-500/20 shadow-[0_0_40px_rgba(234,179,8,0.12)]">
          {/* Header */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-yellow-500/10 ring-1 ring-yellow-500/20">
              <Shield className="h-6 w-6 text-yellow-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Google Workspace</h1>
              <p className="text-sm text-gray-400">Admin Panel</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-red-100 ring-1 ring-red-400/20">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-200 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                className="w-full rounded-xl border border-yellow-500/15 bg-white/10 px-4 py-3 text-gray-100 outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50 placeholder:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-200 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-yellow-500/15 bg-white/10 px-4 py-3 text-gray-100 outline-none focus:ring-2 focus:ring-yellow-400/40 focus:border-yellow-400/50 placeholder:text-gray-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium bg-gradient-to-r from-yellow-500 to-amber-600 text-white ring-1 ring-amber-300/60 hover:opacity-95 shadow-[0_0_24px_rgba(234,179,8,0.30)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-gray-500">
            Default credentials: admin / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
