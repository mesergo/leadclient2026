import { createContext, useContext, useEffect, useState } from 'react';
import { api, setActiveCompany } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Where the session token lives: "remember me" -> localStorage (survives closing the
// browser, server issues a 30-day token); otherwise sessionStorage (gone when the
// browser closes, short server-side token).
const readToken = () => localStorage.getItem('lc_token') || sessionStorage.getItem('lc_token');
const tokenIsRemembered = () => !!localStorage.getItem('lc_token');
function saveToken(token, remember = tokenIsRemembered()) {
  localStorage.removeItem('lc_token'); sessionStorage.removeItem('lc_token');
  (remember ? localStorage : sessionStorage).setItem('lc_token', token);
}
const clearToken = () => { localStorage.removeItem('lc_token'); sessionStorage.removeItem('lc_token'); };

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonatorName, setImpersonatorName] = useState(() => localStorage.getItem('lc_admin_name'));

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.me(token).then((d) => setUser(d.user)).catch(() => { setToken(null); clearToken(); }).finally(() => setLoading(false));
  }, [token]);

  const login = async (username, password, remember = false) => {
    const d = await api.login(username, password, remember);
    saveToken(d.token, remember);
    setToken(d.token);
    setUser(d.user);
  };
  const loginWithPhone = async (phone, code, remember = false) => {
    const d = await api.phoneVerify(phone, code, remember);
    saveToken(d.token, remember);
    setToken(d.token);
    setUser(d.user);
  };
  const loginWithGoogle = async (credential, remember = false) => {
    const d = await api.googleLogin(credential, remember);
    saveToken(d.token, remember);
    setToken(d.token);
    setUser(d.user);
  };
  const refreshUser = async () => { const d = await api.me(token); setUser(d.user); return d.user; };
  const acceptInvite = async (tok, body) => {
    const d = await api.acceptInvite(tok, body);
    saveToken(d.token, false);
    setToken(d.token);
    setUser(d.user);
  };
  const registerAccount = async (regToken, body) => {
    const d = await api.register(regToken, body);
    saveToken(d.token, false);
    setToken(d.token);
    setUser(d.user);
  };
  const registerWithGoogle = async (regToken, credential, extra) => {
    const d = await api.registerGoogle(regToken, credential, extra);
    saveToken(d.token, false);
    setToken(d.token);
    setUser(d.user);
  };
  const logout = () => {
    clearToken(); localStorage.removeItem('lc_admin_token'); localStorage.removeItem('lc_admin_name');
    setImpersonatorName(null); setToken(null); setUser(null);
  };

  // Start impersonating: stash the current (admin) token, switch to the target's token.
  const startImpersonation = (newToken, newUser, adminName) => {
    if (token) localStorage.setItem('lc_admin_token', token);
    localStorage.setItem('lc_admin_name', adminName || '');
    setImpersonatorName(adminName || '');
    saveToken(newToken);
    setToken(newToken); setUser(newUser);
  };
  // Return to the original admin session.
  const stopImpersonation = () => {
    const admin = localStorage.getItem('lc_admin_token');
    localStorage.removeItem('lc_admin_token'); localStorage.removeItem('lc_admin_name');
    setImpersonatorName(null);
    if (admin) { saveToken(admin); setToken(admin); setUser(null); }
  };

  // switch the active company of a user who works in several ('all' = every company together);
  // a full reload makes every screen refetch under the new company
  const switchCompany = (v) => { setActiveCompany(v); window.location.reload(); };

  return <AuthContext.Provider value={{ token, user, loading, switchCompany, login, loginWithPhone, loginWithGoogle, registerAccount, registerWithGoogle, acceptInvite, refreshUser, logout, impersonatorName, startImpersonation, stopImpersonation }}>{children}</AuthContext.Provider>;
}
