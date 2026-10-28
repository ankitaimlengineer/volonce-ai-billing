"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authGet, clearTokens } from "@/lib/api";
import { useRouter } from "next/navigation";

export type UserRole = "owner" | "manager" | "cashier" | "super_admin";

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_id: string | null;
  setup_completed: boolean;
}

interface AuthContextType {
  user: Me | null;
  role: UserRole | null;
  loading: boolean;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  logout: () => {},
  hasRole: () => false,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await authGet<Me>("/api/v1/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // 🚀 React 19 માં cascading render ટાળવા માટે ટાઈમર દ્વારા સેફલી loadUser કોલ કરવો
    const timer = setTimeout(() => {
      if (active) {
        loadUser();
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loadUser]);

  const logout = () => {
    clearTokens();
    setUser(null);
    router.replace("/login");
  };

  const hasRole = (...roles: UserRole[]) => {
    if (!user) return false;
    if (user.role === "super_admin") return true; // Super admin has access to everything
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, loading, logout, hasRole, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);