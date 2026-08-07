import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const INDUSTRIES = ['תיירות', 'שירותים', 'חינוך ולימודים', 'עמותות', 'אירועים', 'מסחר ותעשיה', 'מקצועות חופשיים', 'פרסום', 'אחר'];

export default function CompanyEditPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [c, setC] = useState(null);
  const [form, setForm] = useState({});
  const [tab, setTab] = useState('details');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.company(id, token).then((d) => { setC(d.company); setForm(d.company); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault(); setMsg('');
    try {
      await api.updateCompany(id, {
        name: form.name, phone: form.phone, fax: form.fax, address: form.address, zip_code: form.zip_code, industry: form.industry,
        returning_sms_enabled: form.returning_sms_enabled ? 1 : 0, returning_sms_from: form.returning_sms_from, returning_sms_text: form.returning_sms_text,
        leads_distribution_enabled: form.leads_distribution_enabled ? 1 : 0,
      }, token);
      setMsg(t('cod.saved')); load();
    } catch (e) { setError(e.message); }
  }

  if (error && !c) return <p className="error">{error}</p>;
  if (!c) return <p className="muted">{t('common.loading')}</p>;
  const fld = (k, label, type = 'text') => (
    <div className="form-field"><label>{label}</label><div className="form-field-control"><input type={type} value={form[k] || ''} onChange={(e) => set(k, e.target.value)} /></div></div>
  );

  return (
    <div>
      <div className="page-header"><h1>{t('cop.company')}: {c.name}</h1><Link className="btn btn-secondary" to={`/companies/${id}`}>{t('common.back')}</Link></div>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <div className="tabs">
        <button className={'tab' + (tab === 'details' ? ' active' : '')} onClick={() => setTab('details')}>{t('cop.tabDetails')}</button>
        <button className={'tab' + (tab === 'settings' ? ' active' : '')} onClick={() => setTab('settings')}>{t('cop.tabSettings')}</button>
      </div>
      <form className="form-panel" onSubmit={save}>
        <div className="form-panel-body">
          {tab === 'details' && (<>
            {fld('name', t('cod.name'))}
            {fld('phone', t('cod.phone'), 'tel')}
            {fld('fax', t('cod.fax'), 'tel')}
            {fld('address', t('cod.address'))}
            {fld('zip_code', t('cod.zip'))}
            <div className="form-field"><label>{t('cod.industry')}</label><div className="form-field-control">
              <select value={form.industry || ''} onChange={(e) => set('industry', e.target.value)}>
                <option value="">—</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select></div></div>
          </>)}
          {tab === 'settings' && (<>
            <div className="form-field"><label>{t('cop.smsReturn')}</label><div className="form-field-control">
              <input type="checkbox" checked={!!form.returning_sms_enabled} onChange={(e) => set('returning_sms_enabled', e.target.checked)} /></div></div>
            {form.returning_sms_enabled && (
              <div className="reveal-block">
                {fld('returning_sms_from', t('cod.phone'), 'tel')}
                <div className="form-field"><label>SMS</label><div className="form-field-control"><textarea rows={2} value={form.returning_sms_text || ''} onChange={(e) => set('returning_sms_text', e.target.value)} /></div></div>
              </div>
            )}
            <div className="form-field"><label>{t('cop.leadsDist')}</label><div className="form-field-control">
              <input type="checkbox" checked={!!form.leads_distribution_enabled} onChange={(e) => set('leads_distribution_enabled', e.target.checked)} /></div></div>
          </>)}
        </div>
        <div className="form-actions"><button className="btn btn-primary">{t('common.save')}</button></div>
      </form>
    </div>
  );
}
