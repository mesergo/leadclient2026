import { useEffect, useState } from 'react';
import { useLang } from '../context/LangContext';
import { api } from '../api';

// Move a company to another agency (super admin only). Its users, leads, numbers and services
// move with it; the old agency loses access at once.
export default function CompanyTransferPanel({ company, token, onDone }) {
  const { t } = useLang();
  const [agencies, setAgencies] = useState([]);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api.agencies(token).then((d) => setAgencies(d.agencies || [])).catch((e) => setError(e.message)); }, [token]);

  const current = company.agency_id == null ? '' : String(company.agency_id);
  const options = agencies.filter((a) => String(a.id) !== current);
  const targetName = to === 'none' ? t('ct.noAgency') : (agencies.find((a) => String(a.id) === to) || {}).name;

  async function transfer() {
    setMsg(''); setError('');
    if (!to) return setError(t('ct.pick'));
    if (!window.confirm(t('ct.confirm').replace('{company}', company.name).replace('{agency}', targetName))) return;
    setBusy(true);
    try {
      const r = await api.transferCompany(company.id, to === 'none' ? null : Number(to), token);
      setMsg(t('ct.done').replace('{agency}', targetName).replace('{n}', r.users_moved));
      setTo('');
      onDone && onDone();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <p><strong>{t('ct.current')}:</strong> {company.agency_name || t('ct.noAgency')}</p>
      <p className="muted">{t('ct.hint')}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <div className="form-field"><label>{t('ct.to')}</label><div className="form-field-control">
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">{t('ct.pick')}</option>
          {options.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          {current !== '' && <option value="none">{t('ct.noAgency')}</option>}
        </select></div></div>
      <div className="form-actions"><button type="button" className="btn btn-primary" disabled={busy || !to} onClick={transfer}>{busy ? t('common.loading') : t('ct.submit')}</button></div>
    </div>
  );
}
