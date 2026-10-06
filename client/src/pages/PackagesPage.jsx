import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

const QUOTAS = [
  ['quota_users', 'overage_users', 'quota.users'],
  ['quota_numbers', 'overage_numbers', 'quota.numbers'],
  ['quota_leads', 'overage_leads', 'quota.leads'],
  ['quota_channels', 'overage_channels', 'quota.channels'],
];
const BLANK = { name: '', monthly_price: '', quota_users: '', quota_numbers: '', quota_leads: '', quota_channels: '', overage_users: '', overage_numbers: '', overage_leads: '', overage_channels: '', is_trial_default: false };

export default function PackagesPage() {
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api.packages(token).then((d) => setRows(d.packages)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { setForm(BLANK); setEditId(null); };

  async function save(e) {
    e.preventDefault(); setMsg(''); setError('');
    try {
      if (editId) await api.updatePackage(editId, form, token);
      else await api.createPackage(form, token);
      setMsg(t('ue.saved')); reset(); load();
    } catch (er) { setError(er.message); }
  }
  function edit(p) {
    setEditId(p.id);
    setForm({
      name: p.name || '', monthly_price: p.monthly_price ?? '', is_trial_default: !!p.is_trial_default,
      quota_users: p.quota_users ?? '', quota_numbers: p.quota_numbers ?? '', quota_leads: p.quota_leads ?? '', quota_channels: p.quota_channels ?? '',
      overage_users: p.overage_users ?? '', overage_numbers: p.overage_numbers ?? '', overage_leads: p.overage_leads ?? '', overage_channels: p.overage_channels ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function del(id) {
    if (!window.confirm(t('pkg.confirmDel'))) return;
    try { await api.deletePackage(id, token); load(); } catch (er) { setError(er.message); }
  }

  const fmtQuota = (v) => (v == null ? '∞' : Number(v).toLocaleString());
  const money = (v) => (v == null || v === '' ? '—' : '₪' + Number(v).toLocaleString());

  return (
    <div>
      <div className="page-header"><h1>{t('nav.packages')}</h1></div>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <form className="form-panel" onSubmit={save}>
        <div className="form-panel-body">
          <h3 style={{ marginTop: 0 }}>{editId ? t('pkg.editTitle') : t('pkg.newTitle')}</h3>
          <div className="filter-row">
            <label className="filter-item"><span>{t('pkg.name')}</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label className="filter-item"><span>{t('pkg.monthlyPrice')} (₪)</span>
              <input type="number" min="0" step="0.01" value={form.monthly_price} onChange={(e) => set('monthly_price', e.target.value)} /></label>
          </div>

          <table className="data-table" style={{ marginTop: 12 }}>
            <thead><tr><th>{t('quota.resource')}</th><th>{t('pkg.quota')} ({t('quota.unlimited')}=∞)</th><th>{t('pkg.overage')} (₪)</th></tr></thead>
            <tbody>
              {QUOTAS.map(([qk, ok, lbl]) => (
                <tr key={qk}>
                  <td>{t(lbl)}</td>
                  <td><input type="number" min="0" style={{ width: 120 }} placeholder="∞" value={form[qk]} onChange={(e) => set(qk, e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.01" style={{ width: 120 }} placeholder="0" value={form[ok]} onChange={(e) => set(ok, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={form.is_trial_default} onChange={(e) => set('is_trial_default', e.target.checked)} />
            <span>{t('pkg.trialDefault')}</span>
          </label>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary">{editId ? t('ue.save') : t('pkg.add')}</button>
          {editId && <button type="button" className="btn btn-secondary" onClick={reset}>{t('common.cancel')}</button>}
        </div>
      </form>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="table-wrap"><table className="data-table">
          <thead><tr>
            <th>{t('pkg.name')}</th><th>{t('pkg.monthlyPrice')}</th>
            <th>{t('quota.users')}</th><th>{t('quota.numbers')}</th><th>{t('quota.leads')}</th><th>{t('quota.channels')}</th>
            <th></th><th></th>
          </tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td>{p.name} {p.is_trial_default ? <span className="tag-chip" style={{ background: '#4f46e522', color: '#4f46e5' }}>{t('pkg.trialTag')}</span> : null}</td>
              <td>{money(p.monthly_price)}</td>
              <td>{fmtQuota(p.quota_users)}</td><td>{fmtQuota(p.quota_numbers)}</td><td>{fmtQuota(p.quota_leads)}</td><td>{fmtQuota(p.quota_channels)}</td>
              <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => edit(p)}><Icons.Pencil size={13} /> {t('common.edit')}</button></td>
              <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => del(p.id)}><Icons.X size={13} /> {t('common.delete')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows.length === 0 && <p className="muted">{t('pkg.none')}</p>}
      </div>
    </div>
  );
}
