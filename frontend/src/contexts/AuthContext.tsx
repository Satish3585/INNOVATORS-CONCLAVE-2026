import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getAccessToken, setAccessToken, type Role, type User } from "@/lib/api";

type AuthValue = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: Record<string, unknown>, password: string) => Promise<User>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) { setUser(null); setLoading(false); return; }
    try {
      const response = await api.auth.me();
      setUser(response.user);
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const clear = () => { setUser(null); setLoading(false); };
    window.addEventListener("farmai:unauthorized", clear);
    return () => window.removeEventListener("farmai:unauthorized", clear);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login(email, password);
    setAccessToken(result.access_token);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>, password: string) => {
    const result = await api.auth.register(payload);
    // Registration intentionally returns no token; authenticate once to begin profile setup.
    const session = await api.auth.login(String(payload.email), password);
    setAccessToken(session.access_token);
    setUser(result.user || session.user);
    return result.user || session.user;
  }, []);

  const logout = useCallback(async () => {
    try { if (getAccessToken()) await api.auth.logout(); } finally { setAccessToken(null); setUser(null); }
  }, []);

  const value = useMemo<AuthValue>(() => ({ user, role: user?.role || null, loading, isAuthenticated: Boolean(user), login, register, refresh, logout }), [user, loading, login, register, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
