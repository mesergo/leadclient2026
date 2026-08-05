import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('lc_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.me(token).then((d) => setUser(d.user)).catch(() => { setToken(null); localStorage.removeItem('lc_token'); }).finally(() => setLoading(false));
  }, [token]);

  const login = async (username, password) => {
    const d = await api.login(username, password);
    localStorage.setItem('lc_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };
  const logout = () => { localStorage.removeItem('lc_token'); setToken(null); setUser(null); };
  const setImpersonatedSession = (t, u) => { localStorage.setItem('lc_token', t); setToken(t); setUser(u); };

  return <AuthContext.Provider value={{ token, user, loading, login, logout, setImpersonatedSession }}>{children}</AuthContext.Provider>;
}
