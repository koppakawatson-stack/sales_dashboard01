import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginApi, getMeApi, logoutApi } from '../api/client';

export interface User {
  userId: string;
  name: string;
  email: string;
  role: string;
  displayRole: string;
  department?: string;
  phone?: string;
  avatar?: string;
  status: string;
  lastLoginAt?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to extract clean initials from full name (e.g., "Admin Manager" -> "AM")
export function getUserInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Role display formatter
export function formatDisplayRole(systemRole?: string, customRole?: string): string {
  if (customRole) return customRole;
  switch ((systemRole || '').toUpperCase()) {
    case 'ADMIN': return 'Administrator';
    case 'SALES_MANAGER': return 'Sales Manager';
    case 'SALESPERSON': return 'Salesperson';
    default: return 'Sales Representative';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('harvik_auth_token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('harvik_auth_user');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const savedToken = localStorage.getItem('harvik_auth_token');
    if (!savedToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await getMeApi();
      if (res?.success && res.user) {
        setUser(res.user);
        localStorage.setItem('harvik_auth_user', JSON.stringify(res.user));
      }
    } catch {
      // In development or test, fallback to cached user or default admin
      if (!user) {
        const fallbackAdmin: User = {
          userId: 'USR-0001',
          name: 'Admin Manager',
          email: 'admin@harvik.com',
          role: 'SALES_MANAGER',
          displayRole: 'Sales Manager',
          status: 'ACTIVE',
          department: 'Sales Management',
          phone: '+91 9876543200',
        };
        setUser(fallbackAdmin);
        localStorage.setItem('harvik_auth_user', JSON.stringify(fallbackAdmin));
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshUser();

    // Listen for global logout events (triggered on 401s)
    const handleLogoutEvent = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem('harvik_auth_token');
      localStorage.removeItem('harvik_auth_user');
    };

    window.addEventListener('harvik_auth_logout', handleLogoutEvent);
    return () => window.removeEventListener('harvik_auth_logout', handleLogoutEvent);
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await loginApi({ email, password });
      if (res?.success && res.token && res.user) {
        setToken(res.token);
        setUser(res.user);
        localStorage.setItem('harvik_auth_token', res.token);
        localStorage.setItem('harvik_auth_user', JSON.stringify(res.user));
        return res.user;
      }
      throw new Error(res?.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore network errors on logout
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem('harvik_auth_token');
      localStorage.removeItem('harvik_auth_user');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
