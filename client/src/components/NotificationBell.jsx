import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { registerSW } from '../push';
import * as Icons from '../icons';

// Header bell: polls in-app notifications, shows unread badge + dropdown.
export default function NotificationBell() {
  const { token } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);

  const load = async () => { try { const d = await api.notifications(token); setItems(d.notifications || []); setUnread(d.unread || 0); } catch { /* */ } };

  useEffect(() => {
    if (!token) return undefined;
    registerSW();
    load();
    timer.current = setInterval(load, 20000);
    return () => clearInterval(timer.current);
  }, [token]);

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) { await api.notificationsRead(token, n.id).catch(() => {}); setUnread((u) => Math.max(0, u - 1)); }
    if (n.lead_id) nav(`/leads/${n.lead_id}`);
  };
  const markAll = async () => { await api.notificationsRead(token).catch(() => {}); setUnread(0); setItems((xs) => xs.map((i) => ({ ...i, is_read: 1 }))); };

  return (
    <div className="notif" ref={boxRef}>
      <button className="notif-btn" onClick={() => setOpen((v) => !v)} aria-label="notifications">
        <Icons.Bell size={18} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>{t('notif.title')}</strong>
            {unread > 0 && <button className="notif-markall" onClick={markAll}>{t('notif.markAll')}</button>}
          </div>
          <div className="notif-list">
            {items.length === 0 && <div className="notif-empty">{t('notif.empty')}</div>}
            {items.map((n) => (
              <button key={n.id} className={'notif-item' + (n.is_read ? '' : ' unread')} onClick={() => openItem(n)}>
                <span className="notif-content">{n.content}</span>
                <span className="notif-time">{new Date(n.created_at).toLocaleString('he-IL')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
