import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import { Trash } from '../icons';

// Message templates for the company's agency (templates are agency-scoped).
export default function CompanyMessagesPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [agencyId, setAgencyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', body: '', for_whatsapp: false, for_sms: false });
  const [error, setError] = useState('');

  const loadTemplates = (aid) => api.templates(token, aid).then((d) => setRows(d.templates)).catch((e) => setError(e.message));
  useEffect(() => {
    api.company(id, token).then((d) => { setAgencyId(d.company.agency_id); loadTemplates(d.company.agency_id); }).catch((e) => setError(e.message));
  }, [id, token]);

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    try {
      await api.createTemplate({ agency_id: agencyId, name: form.name.trim(), body: form.body.trim(), type: 'manual', for_whatsapp: form.for_whatsapp, for_sms: form.for_sms }, token);
      setForm({ name: '', body: '', for_whatsapp: false, for_sms: false });
      loadTemplates(agencyId);
    } catch (e) { setError(e.message); }
  }
  async function del(tid) { if (!confirm('?')) return; try { await api.deleteTemplate(tid, token); loadTemplates(agencyId); } catch (e) { setError(e.message); } }

  return (
    <div>
      <div className="page-header"><h1>{t('cop.messages')}</h1><Link className="btn btn-secondary" to={`/companies/${id}`}>{t('common.back')}</Link></div>
      {error && <p className="error">{error}</p>}
      <form className="form-panel" onSubmit={add}>
        <div className="form-panel-body">
          <div className="form-field"><label>{t('cop.msgName')}</label><div className="form-field-control"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div></div>
          <div className="form-field"><label>{t('cop.msgBody')}</label><div className="form-field-control"><textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div></div>
          <div className="form-field"><label>{t('cop.forWhatsapp')}</label><div className="form-field-control"><input type="checkbox" checked={form.for_whatsapp} onChange={(e) => setForm({ ...form, for_whatsapp: e.target.checked })} /></div></div>
          <div className="form-field"><label>{t('cop.forSms')}</label><div className="form-field-control"><input type="checkbox" checked={form.for_sms} onChange={(e) => setForm({ ...form, for_sms: e.target.checked })} /></div></div>
        </div>
        <div className="form-actions"><button className="btn btn-primary">{t('cop.addMsg')}</button></div>
      </form>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('cop.msgName')}</th><th>{t('cop.msgBody')}</th><th>WhatsApp/SMS</th><th></th></tr></thead>
        <tbody>{rows.map((m) => (
          <tr key={m.id}><td>{m.name}</td><td>{m.body}</td>
            <td>{[m.for_whatsapp ? 'WA' : null, m.for_sms ? 'SMS' : null].filter(Boolean).join(', ') || '-'}</td>
            <td><button className="icon-btn icon-btn--red" onClick={() => del(m.id)}><Trash size={14} /></button></td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('common.none')}</p>}
    </div>
  );
}
