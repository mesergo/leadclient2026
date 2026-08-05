import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { LANGS } from '../i18n';
import * as Icons from '../icons';

const NAV = [
  { to: '/', key: 'nav.dashboard', Icon: Icons.Grid, end: true },
  { to: '/agencies', key: 'nav.agencies', Icon: Icons.Building, roles: ['super_admin'] },
  { to: '/companies', key: 'nav.companies', Icon: Icons.Building, roles: ['super_admin', 'agency_admin'] },
  { to: '/leads', key: 'nav.leads', Icon: Icons.Inbox },
  { to: '/import', key: 'nav.import', Icon: Icons.Upload },
  { to: '/virtual', key: 'nav.virtual', Icon: Icons.Phone },
  { to: '/reports', key: 'nav.reports', Icon: Icons.Chart },
  { to: '/contacts', key: 'nav.contacts', Icon: Icons.Contacts },
  { to: '/users', key: 'nav.users', Icon: Icons.Users, roles: ['super_admin', 'agency_admin', 'company_admin'] },
  { to: '/billing', key: 'nav.billing', Icon: Icons.Card, roles: ['super_admin', 'agency_admin'] },
  { to: '/language', key: 'nav.language', Icon: Icons.Globe, roles: ['super_admin'] },
  { to: '/profile', key: 'nav.profile', Icon: Icons.User },
  { to: '/developers', key: 'nav.developers', Icon: Icons.Code },
];
const CRUMB_KEY = {
  '/': 'nav.dashboard', '/agencies': 'nav.agencies', '/companies': 'nav.companies', '/leads': 'nav.leads',
  '/import': 'nav.import', '/virtual': 'nav.virtual', '/reports': 'nav.reports', '/contacts': 'nav.contacts',
  '/users': 'nav.users', '/billing': 'nav.billing', '/language': 'nav.language', '/profile': 'nav.profile',
  '/developers': 'nav.developers',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const ck = CRUMB_KEY['/' + loc.pathname.split('/')[1]] || CRUMB_KEY[loc.pathname];
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));
  const nextLang = LANGS.find((l) => l.code !== lang) || LANGS[0];

  return (
    <div className="app-shell">
      <div className={'nav-backdrop' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="sidebar-logo"><span className="brand">{t('brand')}</span></div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {items.map(({ to, key, Icon, end }) => (
            <NavLink key={to} to={to} end={end}><Icon size={18} /> {t(key)}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="header">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="menu"><Icons.Menu /></button>
          <div className="header-user"><Icons.User size={18} /> {t('header.welcome')}, {user?.name || ''}</div>
          <div className="header-actions">
            <a href="#" title={nextLang.label} onClick={(e) => { e.preventDefault(); setLang(nextLang.code); }}>
              <Icons.Globe size={16} /> {nextLang.label}
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>{t('header.logout')}</a>
          </div>
        </header>
        <div className="content">
          {ck && <div className="breadcrumb">{t(ck)}</div>}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
