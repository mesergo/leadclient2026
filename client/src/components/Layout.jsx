import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { LANGS } from '../i18n';
import * as Icons from '../icons';
import logo from '../assets/logo.png';

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
  const { user, logout, impersonatorName, stopImpersonation } = useAuth();
  const { t, lang, setLang, langs } = useLang();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const ck = CRUMB_KEY['/' + loc.pathname.split('/')[1]] || CRUMB_KEY[loc.pathname];
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));

  return (
    <div className="app-shell">
      <div className={'nav-backdrop' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="sidebar-logo"><img src={logo} alt="LeadClient" className="sidebar-logo-img" /></div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {items.map(({ to, key, Icon, end }) => (
            <NavLink key={to} to={to} end={end}><Icon size={18} /> {t(key)}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        {impersonatorName != null && (
          <div className="impersonation-bar">
            <span><Icons.User size={15} /> {t('imp.bar')} <strong>{user?.name || ''}</strong></span>
            <button onClick={() => { stopImpersonation(); }}>{t('imp.return')}</button>
          </div>
        )}
        <header className="header">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="menu"><Icons.Menu /></button>
          <NavLink to="/profile" className="header-user" title={t('nav.profile')}>
            <Icons.User size={18} /> {t('header.welcome')}, <strong>{user?.name || user?.display_name || user?.username || ''}</strong>
          </NavLink>
          <div className="header-actions">
            <label className="lang-picker" title={t('nav.language')}>
              <Icons.Globe size={16} />
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {langs.map((l) => <option key={l.slug} value={l.slug}>{l.language}</option>)}
              </select>
            </label>
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
