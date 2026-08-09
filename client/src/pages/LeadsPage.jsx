import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';
import LeadCard from '../components/LeadCard';
import { displayTag, isAutoTag } from '../tags';
import { formatIL } from '../phone';

// map a lead's source to an icon
function typeIcon(l) {
  const s = ((l.lead_through || '') + ' ' + (l.service_type || '') + ' ' + (l.service_name || '')).toLowerCase();
  if (/whatsapp|וואטס|ווטס/.test(s)) return Icons.Phone;
  if (/phone|call|טלפון|שיח/.test(s)) return Icons.Phone;
  if (/facebook|face|פייס/.test(s)) return Icons.Chart;
  if (/site|web|widget|אתר|דף/.test(s)) return Icons.Globe;
  if (/sms|הודע/.test(s)) return Icons.Inbox;
  if (/mail|מייל|אימייל/.test(s)) return Icons.Bell;
  return Icons.Inbox;
}

export default function LeadsPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const [sp] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [services, setServices] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [f, setF] = useState({
    agency: sp.get('agency') || '', company_id: sp.get('company_id') || '', service_id: sp.get('service_id') || '',
    status_id: '', start: sp.get('start') || '', end: sp.get('end') || '', q: '',
  });
  const [sort, setSort] = useState({ col: 'created_at', dir: 'desc' });
  const [selected, setSelected] = useState(null); // lead id for the floating card
  const [error, setError] = useState('');

  const load = (filters) => api.leads(token, filters).then((d) => setRows(d.leads)).catch((e) => setError(e.message));
  useEffect(() => {
    load(f);
    if (user?.role === 'super_admin') api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
  }, [token]);

  const agencyCompanies = useMemo(
    () => (f.agency ? companies.filter((c) => String(c.agency_id) === String(f.agency)) : companies),
    [companies, f.agency]
  );
  useEffect(() => {
    if (f.company_id) {
      api.services(token, f.company_id).then((d) => setServices(d.services)).catch(() => setServices([]));
      api.statuses(token, f.company_id).then((d) => setStatuses(d.statuses)).catch(() => setStatuses([]));
    } else { setServices([]); setStatuses([]); }
  }, [f.company_id, token]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const { col, dir } = sort;
    arr.sort((a, b) => {
      const av = a[col] ?? '', bv = b[col] ?? '';
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sort]);

  const th = (col, label) => (
    <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label} {sort.col === col ? (sort.dir === 'asc' ? '▴' : '▾') : ''}
    </th>
  );

  function exportCsv() {
    const head = ['id', 'name', 'phone', 'email', 'agency', 'company', 'channel', 'agent', 'received', 'status'];
    const lines = [head.join(',')].concat(sorted.map((l) => [l.id, l.lead_name, l.lead_phone, l.lead_email, l.agency_name, l.company_name, l.service_name, l.agent_name, l.created_at, l.status_text].map((x) => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'leads.csv'; a.click();
  }

  return (
    <div>
      <div className="page-header"><h1>{t('nav.leads')}</h1>
        <button className="btn btn-secondary" onClick={exportCsv}><Icons.Upload size={14} /> {t('lead.export')}</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel dash-filter">
        <div className="filter-row">
          <label className="filter-item"><span>{t('lead.received')}</span><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="filter-item"><span>&nbsp;</span><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
          {user?.role === 'super_admin' && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={f.agency} onChange={(e) => setF({ ...f, agency: e.target.value, company_id: '', service_id: '', status_id: '' })}>
                <option value="">{t('dash.allAgencies')}</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          )}
          <label className="filter-item"><span>{t('common.company')}</span>
            <select value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value, service_id: '', status_id: '' })}>
              <option value="">{t('dash.allCompanies')}</option>{agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className="filter-item"><span>{t('lead.channel')}</span>
            <select value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })} disabled={!f.company_id}>
              <option value="">{t('dash.allChannels')}</option>{services.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
            </select></label>
          <label className="filter-item"><span>{t('lead.status')}</span>
            <select value={f.status_id} onChange={(e) => setF({ ...f, status_id: e.target.value })} disabled={!f.company_id}>
              <option value="">—</option>{statuses.map((st) => <option key={st.id} value={st.id}>{st.text}</option>)}
            </select></label>
          <button className="btn btn-primary" onClick={() => load(f)}>{t('dash.show')}</button>
        </div>
      </div>

      <div className="leads-toolbar">
        <input placeholder={t('lead.searchPh')} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') load(f); }} />
        <span className="muted">{sorted.length}{sorted.length >= 500 ? '+' : ''} {t('lead.count')}</span>
      </div>

      <div className="table-wrap"><table className="data-table leads-table">
        <thead><tr>
          <th></th>
          {th('lead_name', t('lead.name'))}{th('lead_phone', t('common.phone'))}{th('lead_email', t('common.email'))}
          {th('agency_name', t('common.agency'))}{th('company_name', t('common.company'))}{th('service_name', t('lead.channel'))}
          {th('agent_name', t('lead.agent'))}{th('created_at', t('lead.received'))}<th>{t('lead.lastCall')}</th>
          {th('status_text', t('lead.status'))}<th>{t('lead.tags')}</th>
        </tr></thead>
        <tbody>{sorted.map((l) => {
          const TI = typeIcon(l);
          return (
            <tr key={l.id}>
              <td><TI size={16} /></td>
              <td><button className="link-name" onClick={() => setSelected(l.id)}>{l.lead_name || t('lead.na')}</button></td>
              <td>{formatIL(l.lead_phone, t('lead.unknownPhone'))}</td><td>{l.lead_email || '--'}</td>
              <td>{l.agency_name}</td><td>{l.company_name}</td><td>{l.service_name || '-'}</td>
              <td><span className={'presence ' + (/(available|online)/i.test(l.agent_status || '') ? 'on' : 'off')} /> {l.agent_name || t('lead.general')}</td>
              <td>{l.created_at}</td>
              <td>{l.last_interaction_type || ''}</td>
              <td>{l.status_text ? <span className="tag-chip" style={{ background: (l.status_color || '#888') + '22', color: l.status_color || '#555' }}>{l.status_text}</span> : '-'}</td>
              <td>{(l.tags || []).map((tg) => <span key={tg.id} className={'tag-chip ' + (isAutoTag(tg.label) ? 'tag-auto' : '')} style={{ marginInlineStart: 2 }}>{displayTag(tg.label)}</span>)}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {sorted.length === 0 && <p className="muted">{t('lead.none')}</p>}

      {selected && (
        <div className="lead-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setSelected(null); load(f); } }}>
          <div className="lead-modal">
            <LeadCard id={selected} onClose={() => { setSelected(null); load(f); }} />
          </div>
        </div>
      )}
    </div>
  );
}
