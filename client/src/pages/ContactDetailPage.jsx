import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import LeadCard from '../components/LeadCard';
import { formatIL } from '../phone';
import { displayStatus } from '../tags';

export default function ContactDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();

  const [contact, setContact] = useState(null);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState({});
  const [selected, setSelected] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.contact(id, token).then((d) => {
    setContact(d.contact); setLeads(d.leads || []);
    setForm({
      first_name: d.contact.first_name || '', last_name: d.contact.last_name || '',
      phone: d.contact.phone || '', phone2: d.contact.phone2 || '',
      email: d.contact.email || '', status: d.contact.status || '',
    });
  }).catch((e) => setError(e.message));

  // "מידע נוסף" is legacy metadata (often JSON) — read-only, shown as key/value.
  const infoRows = (() => {
    const raw = contact?.info;
    if (raw == null || raw === '') return null;
    let obj = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return [['', raw]]; } }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj).filter(([, v]) => v != null && v !== '' && typeof v !== 'object').map(([k, v]) => [k, String(v)]);
    }
    return [['', String(raw)]];
  })();
  useEffect(() => { load(); }, [id, token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api.updateContact(id, form, token); setMsg(t('con.saved')); load(); }
    catch (er) { setError(er.message); }
  };

  if (error && !contact) return <p className="error">{error}</p>;
  if (!contact) return <p className="muted">{t('common.loading')}</p>;
  const fld = (label, k, type = 'text') => (
    <div className="form-field"><label>{label}</label><div className="form-field-control">
      <input type={type} value={form[k] || ''} onChange={(e) => set(k, e.target.value)} /></div></div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>{[contact.first_name, contact.last_name].filter(Boolean).join(' ') || t('nav.contacts')}</h1>
        <button className="btn btn-secondary" onClick={() => nav('/contacts')}>{t('con.back')}</button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>{contact.agency_name || '-'} › {contact.company_name || '-'}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="contact-layout">
        {/* right column: details + more-info stacked */}
        <div className="contact-side">
        <form className="form-panel" onSubmit={save}>
          <div className="form-panel-body">
            <h3>{t('con.details')}</h3>
            {fld(t('con.firstName'), 'first_name')}
            {fld(t('con.lastName'), 'last_name')}
            {fld(t('common.phone'), 'phone', 'tel')}
            {fld(t('con.phone2'), 'phone2', 'tel')}
            {fld(t('common.email'), 'email', 'email')}
          </div>
          <div className="form-actions"><button className="btn btn-primary">{t('con.save')}</button></div>
        </form>

        {infoRows && (
          <div className="panel info-panel">
            <button type="button" className="info-toggle" onClick={() => setShowInfo((v) => !v)}>
              {showInfo ? '▾' : '▸'} {t('con.info')}
            </button>
            {showInfo && (
              <dl className="info-dl">
                {infoRows.map(([k, v], i) => (
                  <div className="info-dl-row" key={i}>
                    {k && <dt>{k}</dt>}<dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
        </div>

        {/* left column: submitted leads */}
        <div className="panel">
          <h3>{t('con.leads')} ({leads.length})</h3>
          {leads.length === 0 ? <p className="muted">{t('con.noLeads')}</p> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t('lead.name')}</th><th>{t('common.phone')}</th><th>{t('lead.channel')}</th><th>{t('lead.status')}</th><th>{t('lead.received')}</th></tr></thead>
              <tbody>{leads.map((l) => (
                <tr key={l.id}>
                  <td><button className="link-name" onClick={() => setSelected(l.id)}>{l.lead_name || t('lead.na')}</button></td>
                  <td>{formatIL(l.lead_phone) || '-'}</td>
                  <td>{l.service_name || '-'}</td>
                  <td>{displayStatus(l.status_text) || '-'}</td>
                  <td>{l.created_at}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      {selected && (
        <div className="lead-modal-overlay" onClick={() => setSelected(null)}>
          <div className="lead-modal" onClick={(e) => e.stopPropagation()}>
            <LeadCard id={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
