import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as Icons from '../icons';

const NAV = [
  { to: '/', label: 'מרכז שליטה', Icon: Icons.Grid, end: true },
  { to: '/agencies', label: 'סוכנויות', Icon: Icons.Building, roles: ['super_admin'] },
  { to: '/companies', label: 'חברות', Icon: Icons.Building, roles: ['super_admin', 'agency_admin'] },
  { to: '/leads', label: 'לידים', Icon: Icons.Inbox },
  { to: '/import', label: 'ייבוא לידים', Icon: Icons.Upload },
  { to: '/virtual', label: 'מספרים וירטואליים', Icon: Icons.Phone },
  { to: '/reports', label: 'דוחות', Icon: Icons.Chart },
  { to: '/contacts', label: 'אנשי קשר', Icon: Icons.Contacts },
  { to: '/users', label: 'משתמשים', Icon: Icons.Users, roles: ['super_admin', 'agency_admin', 'company_admin'] },
  { to: '/billing', label: 'מרכז החיובים', Icon: Icons.Card, roles: ['super_admin', 'agency_admin'] },
  { to: '/language', label: 'תרגומי מערכת', Icon: Icons.Globe, roles: ['super_admin'] },
  { to: '/profile', label: 'פרופיל', Icon: Icons.User },
  { to: '/developers', label: 'מפתחים', Icon: Icons.Code },
];

const CRUMBS = {
  '/': 'מרכז שליטה', '/agencies': 'סוכנויות', '/companies': 'חברות', '/leads': 'לידים',
  '/import': 'ייבוא לידים', '/virtual': 'מספרים וירטואליים', '/reports': 'דוחות',
  '/contacts': 'אנשי קשר', '/users': 'משתמשים', '/billing': 'מרכז החיובים',
  '/language': 'תרגומי מערכת', '/profile': 'פרופיל', '/developers': 'מפתחים',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const crumb = CRUMBS['/' + loc.pathname.split('/')[1]] || CRUMBS[loc.pathname] || '';
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));

  return (
    <div className="app-shell">
      <div className={'nav-backdrop' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="sidebar-logo"><span className="brand">LeadClient</span></div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {items.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="header">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="תפריט"><Icons.Menu /></button>
          <div className="header-user"><Icons.User size={18} /> ברוך הבא, {user?.name || ''}</div>
          <div className="header-actions">
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>התנתקות</a>
          </div>
        </header>
        <div className="content">
          {crumb && <div className="breadcrumb">{crumb}</div>}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
