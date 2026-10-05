import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('lc_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonatorName, setImpersonatorName] = useState(() => localStorage.getItem('lc_admin_name'));

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
  const loginWithPhone = async (phone, code) => {
    const d = await api.phoneVerify(phone, code);
    localStorage.setItem('lc_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };
  const loginWithGoogle = async (credential) => {
    const d = await api.googleLogin(credential);
    localStorage.setItem('lc_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };
  const refreshUser = async () => { const d = await api.me(token); setUser(d.user); return d.user; };
  const registerAccount = async (regToken, body) => {
    const d = await api.register(regToken, body);
    localStorage.setItem('lc_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };
  const registerWithGoogle = async (regToken, credential) => {
    const d = await api.registerGoogle(regToken, credential);
    localStorage.setItem('lc_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };
  const logout = () => {
    localStorage.removeItem('lc_token'); localStorage.removeItem('lc_admin_token'); localStorage.removeItem('lc_admin_name');
    setImpersonatorName(null); setToken(null); setUser(null);
  };

  // Start impersonating: stash the current (admin) token, switch to the target's token.
  const startImpersonation = (newToken, newUser, adminName) => {
    if (token) localStorage.setItem('lc_admin_token', token);
    localStorage.setItem('lc_admin_name', adminName || '');
    setImpersonatorName(adminName || '');
    localStorage.setItem('lc_token', newToken);
    setToken(newToken); setUser(newUser);
  };
  // Return to the original admin session.
  const stopImpersonation = () => {
    const admin = localStorage.getItem('lc_admin_token');
    localStorage.removeItem('lc_admin_token'); localStorage.removeItem('lc_admin_name');
    setImpersonatorName(null);
    if (admin) { localStorage.setItem('lc_token', admin); setToken(admin); setUser(null); }
  };

  return <AuthContext.Provider value={{ token, user, loading, login, loginWithPhone, loginWithGoogle, registerAccount, registerWithGoogle, refreshUser, logout, impersonatorName, startImpersonation, stopImpersonation }}>{children}</AuthContext.Provider>;
}
