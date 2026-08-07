import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';

const IVR = ['native', 'micropay', 'paycall', 'maskyoo', 'all'];

export default function AgencyEditPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [a, setA] = useState(null);
  const [form, setForm] = useState({});
  const [icountOn, setIcountOn] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () =>
    api.agency(id, token).then((d) => {
      setA(d.agency);
      setForm(d.agency);
      setIcountOn(!!(d.agency.icount_cid || d.agency.icount_user || d.agency.icount_pass));
    }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api.updateAgency(id, {
        name: form.name,
        ivr_provider: form.ivr_provider,
        phone_limit: form.phone_limit === '' ? null : Number(form.phone_limit),
        whatsapp_id: form.whatsapp_id,
        icount_cid: icountOn ? form.icount_cid : '',
        icount_user: icountOn ? form.icount_user : '',
        icount_pass: icountOn ? form.icount_pass : '',
        allow_add_user_external: form.allow_add_user_external ? 1 : 0,
        control_templates: form.control_templates ? 1 : 0,
      }, token);
      setMsg(t('cod.saved'));
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function uploadLogo(file) {
    if (!file) return;
    setUploading(true);
    try { await api.uploadAgencyLogo(id, file, token); load(); }
    catch (e) { setError(e.message); }
    finally { setUploading(false); }
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (error && !a) return <p className="error">{error}</p>;
  if (!a) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div>
      <div className="page-header">
        <h1>{t('agedit.title')}: {a.name}</h1>
        <Link className="btn btn-secondary" to="/agencies">{t('common.back')}</Link>
      </div>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <form className="form-panel" onSubmit={save}>
        <div className="form-panel-body">
          <div className="form-field"><label>{t('agedit.name')}</label>
            <div className="form-field-control"><input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></div>
          </div>

          <div className="form-field"><label>{t('agedit.logo')}</label>
            <div className="form-field-control" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
              {a.logo_url && <img src={API_ORIGIN + a.logo_url} alt="" style={{ maxHeight: 40, border: '1px solid var(--border)', borderRadius: 4, padding: 4 }} />}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>{uploading ? '...' : t('agedit.uploadLogo')}
                <input type="file" accept="image/*" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} /></label>
            </div>
          </div>

          <div className="form-field"><label>{t('agedit.ivr')}</label>
            <div className="form-field-control">
              <select value={form.ivr_provider || 'native'} onChange={(e) => set('ivr_provider', e.target.value)}>
                {IVR.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="form-field"><label>{t('agedit.phoneLimit')}</label>
            <div className="form-field-control">
              <input type="number" min="0" value={form.phone_limit ?? ''} onChange={(e) => set('phone_limit', e.target.value)} />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t('agedit.phonesInUse')}: {a.phones_in_use}</div>
            </div>
          </div>

          {/* iCount — options revealed only when the checkbox is on */}
          <div className="form-field"><label>{t('agedit.icount')}</label>
            <div className="form-field-control"><input type="checkbox" checked={icountOn} onChange={(e) => setIcountOn(e.target.checked)} /></div>
          </div>
          {icountOn && (
            <div className="reveal-block">
              <div className="form-field"><label>{t('agedit.icountCid')}</label><div className="form-field-control"><input value={form.icount_cid || ''} onChange={(e) => set('icount_cid', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('agedit.icountUser')}</label><div className="form-field-control"><input value={form.icount_user || ''} onChange={(e) => set('icount_user', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('agedit.icountPass')}</label><div className="form-field-control"><input type="password" value={form.icount_pass || ''} onChange={(e) => set('icount_pass', e.target.value)} /></div></div>
            </div>
          )}

          <div className="form-field"><label>{t('agedit.externalUser')}</label>
            <div className="form-field-control"><input type="checkbox" checked={!!form.allow_add_user_external} onChange={(e) => set('allow_add_user_external', e.target.checked)} /></div>
          </div>

          {/* template management — options revealed only when the checkbox is on */}
          <div className="form-field"><label>{t('agedit.templates')}</label>
            <div className="form-field-control"><input type="checkbox" checked={!!form.control_templates} onChange={(e) => set('control_templates', e.target.checked ? 1 : 0)} /></div>
          </div>
          {!!form.control_templates && (
            <div className="reveal-block">
              <div className="form-field"><label>{t('agedit.whatsappId')}</label><div className="form-field-control"><input value={form.whatsapp_id || ''} onChange={(e) => set('whatsapp_id', e.target.value)} /></div></div>
              <div className="form-field"><label>&nbsp;</label><div className="form-field-control"><span className="btn btn-secondary btn-sm" style={{ cursor: 'default' }}>{t('agedit.editTemplates')}</span></div></div>
            </div>
          )}
        </div>
        <div className="form-actions"><button className="btn btn-primary">{t('agedit.title')}</button></div>
      </form>
    </div>
  );
}
