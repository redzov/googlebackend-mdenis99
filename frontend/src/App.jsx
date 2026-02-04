import React, { useState, useEffect } from 'react';
import api from './api';
import Login from './Login';
import GoogleWorkspaceAdmin from './GoogleWorkspaceAdmin';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if we have a valid token on mount
    const checkAuth = async () => {
      const token = api.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.verify();
        if (data.valid) {
          setIsAuthenticated(true);
          setUser(data.user);
        }
      } catch (err) {
        // Token invalid, clear it
        api.logout();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for logout events
    const handleLogout = () => {
      setIsAuthenticated(false);
      setUser(null);
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const handleLogin = (data) => {
    setIsAuthenticated(true);
    setUser(data);
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
          <span className="text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  // Authenticated - show admin panel
  return <GoogleWorkspaceAdmin user={user} onLogout={handleLogout} />;
}
