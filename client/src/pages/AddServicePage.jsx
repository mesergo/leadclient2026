import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const LINE_TYPES = ['מספר נייח - קידומת 072', 'מספר נייד - קידומת 052'];
const DAYS = {
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const serializeHours = (arr) => arr.map((b) => (b ? '1' : '0')).join('');

export default function AddServicePage() {
  const [sp] = useSearchParams();
  const companyId = sp.get('company') || sp.get('id');
  const { token } = useAuth();
  const { t, lang } = useLang();
  const nav = useNavigate();

  const [ctx, setCtx] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', service_type: 'phone', site_url: '',
    line_type: '', phone_number_id: '', redirect_to_number: '',
    service_ref: '', export_webhook_url: '',
    returning_sms_from: '', returning_sms_text: '',
  });
  const [assigned, setAssigned] = useState([]);
  const [smsOn, setSmsOn] = useState(false);
  const [smsCost, setSmsCost] = useState(false);
  const [hoursOn, setHoursOn] = useState(false);
  const [hours, setHours] = useState(Array(168).fill(false));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    api.serviceNewContext(companyId, token).then(setCtx).catch((e) => setError(e.message));
  }, [companyId, token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const type = form.service_type;
  const users = ctx?.users || [];
  const numbers = ctx?.numbers || [];

  const smsChars = (form.returning_sms_text || '').length;
  const smsMsgs = smsChars ? Math.ceil(smsChars / 70) : 0;

  const toggleAssigned = (uid) => setAssigned((a) => (a.includes(uid) ? a.filter((x) => x !== uid) : [...a, uid]));
  const setCell = (day, hour, val) => setHours((h) => { const n = [...h]; n[day * 24 + hour] = val; return n; });
  const toggleDay = (day) => setHours((h) => { const n = [...h]; const all = HOURS.every((hr) => h[day * 24 + hr]); HOURS.forEach((hr) => (n[day * 24 + hr] = !all)); return n; });
  const allOn = hours.every(Boolean);
  const toggleAll = () => setHours(Array(168).fill(!allOn));

  const assignedLabel = useMemo(() => {
    if (!assigned.length) return t('es.assignNone');
    return users.filter((u) => assigned.includes(String(u.id))).map((u) => u.name).join(', ');
  }, [assigned, users, t]);

  async function save(e) {
    e.preventDefault(); setError('');
    if (!form.name.trim()) return setError(t('es.nameRequired'));
    setSaving(true);
    const body = {
      company_id: Number(companyId), name: form.name.trim(), service_type: form.service_type,
      description: form.description || null,
      site_url: type === 'website' ? form.site_url : null,
      line_type: type === 'phone' ? form.line_type : null,
      phone_number_id: type === 'phone' && form.phone_number_id ? Number(form.phone_number_id) : null,
      redirect_to_number: type === 'phone' ? (form.redirect_to_number || null) : null,
      returning_sms_from: smsOn ? form.returning_sms_from : null,
      returning_sms_text: smsOn ? form.returning_sms_text : null,
      distribute_leads: assigned,
      service_ref: form.service_ref || null, export_webhook_url: form.export_webhook_url || null,
      open_hours: hoursOn ? serializeHours(hours) : '',
    };
    try {
      const d = await api.createService(body, token);
      nav(`/companies/edit-service?id=${d.service.id}`);
    } catch (err) { setError(err.message); setSaving(false); }
  }

  if (!companyId) return <p className="error">Missing company</p>;
  if (error && !ctx) return <p className="error">{error}</p>;
  if (!ctx) return <p className="muted">{t('common.loading')}</p>;

  const typeBtn = (val, label) => (
    <button type="button" className={'tab' + (type === val ? ' active' : '')} onClick={() => set('service_type', val)}>{label}</button>
  );
  const days = DAYS[lang] || DAYS.he;

  return (
    <div>
      <div className="page-header">
        <h1>{t('es.addTitle')}</h1>
        <button className="btn btn-secondary" onClick={() => nav(-1)}>{t('es.back')}</button>
      </div>
      {ctx.company && <p className="muted" style={{ marginTop: -8 }}>{ctx.company.agency_name} › {ctx.company.name}</p>}
      {error && <p className="error">{error}</p>}

      <form className="form-panel" onSubmit={save}>
        <div className="form-panel-body">
          <div className="form-field"><label>{t('es.name')}</label><div className="form-field-control">
            <input value={form.name} autoFocus onChange={(e) => set('name', e.target.value)} /></div></div>

          <div className="form-field"><label>{t('es.description')}</label><div className="form-field-control">
            <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></div></div>

          <div className="form-field"><label>{t('es.type')}</label><div className="form-field-control">
            <div className="tabs" style={{ margin: 0 }}>
              {typeBtn('website', t('es.typeWebsite'))}
              {typeBtn('phone', t('es.typePhone'))}
              {typeBtn('whatsapp', t('es.typeWhatsapp'))}
            </div></div></div>

          {type === 'phone' && (<>
            <div className="form-field"><label>{t('es.lineType')}</label><div className="form-field-control">
              <select value={form.line_type} onChange={(e) => set('line_type', e.target.value)}>
                <option value="">{t('es.selectPlan')}</option>
                {LINE_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select></div></div>

            <div className="form-field"><label>{t('es.virtualNumber')}</label><div className="form-field-control">
              <select value={form.phone_number_id} onChange={(e) => set('phone_number_id', e.target.value)}>
                <option value="">{t('es.numberNone')}</option>
                {numbers.map((n) => <option key={n.id} value={n.id}>{n.number_to_display || n.phone_number}</option>)}
              </select></div></div>

            {form.phone_number_id && (
              <div className="form-field"><label>{t('es.redirect')}</label><div className="form-field-control">
                <input value={form.redirect_to_number} onChange={(e) => set('redirect_to_number', e.target.value)} /></div></div>
            )}
          </>)}

          {type === 'website' && (
            <div className="form-field"><label>{t('es.siteUrl')}</label><div className="form-field-control">
              <input value={form.site_url} onChange={(e) => set('site_url', e.target.value)} placeholder="https://" /></div></div>
          )}

          <div className="form-field"><label>{t('es.smsReturn')}</label><div className="form-field-control">
            <input type="checkbox" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} /></div></div>
          {smsOn && (
            <div className="reveal-block">
              <div className="form-field"><label>{t('es.smsFrom')}</label><div className="form-field-control">
                <input value={form.returning_sms_from} onChange={(e) => set('returning_sms_from', e.target.value)} /></div></div>
              <div className="form-field"><label>{t('es.smsText')}</label><div className="form-field-control">
                <textarea rows={3} value={form.returning_sms_text} onChange={(e) => set('returning_sms_text', e.target.value)} /></div></div>
              <p className="muted" style={{ fontSize: 13 }}>{t('es.smsCharCount')}: {smsChars} · {t('es.smsMsgCount')}: {smsMsgs}</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={smsCost} onChange={(e) => setSmsCost(e.target.checked)} /> {t('es.smsCost')}
              </label>
            </div>
          )}

          <div className="form-field"><label>{t('es.assign')}</label><div className="form-field-control">
            <div className="assign-box">
              {users.length === 0 && <span className="muted">{t('es.assignNone')}</span>}
              {users.map((u) => (
                <label key={u.id} className={'assign-chip' + (assigned.includes(String(u.id)) ? ' on' : '')}>
                  <input type="checkbox" checked={assigned.includes(String(u.id))} onChange={() => toggleAssigned(String(u.id))} /> {u.name}
                </label>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{assignedLabel}</p>
          </div></div>

          <div className="form-field"><label>{t('es.serviceRef')}</label><div className="form-field-control">
            <input value={form.service_ref} onChange={(e) => set('service_ref', e.target.value)} /></div></div>

          <div className="form-field"><label>{t('es.webhook')}</label><div className="form-field-control">
            <input value={form.export_webhook_url} onChange={(e) => set('export_webhook_url', e.target.value)} placeholder="https://" /></div></div>

          <div className="form-field"><label>{t('es.openHours')}</label><div className="form-field-control">
            <input type="checkbox" checked={hoursOn} onChange={(e) => setHoursOn(e.target.checked)} /></div></div>
          {hoursOn && (
            <div className="reveal-block">
              <div className="hours-head">
                <strong>{t('es.workHours')}</strong>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={allOn} onChange={toggleAll} /> {t('es.selectAll')}</label>
              </div>
              <div className="hours-grid-wrap"><table className="hours-grid">
                <thead><tr><th></th>{HOURS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {days.map((d, di) => (
                    <tr key={di}>
                      <th className="hours-day" onClick={() => toggleDay(di)} title={t('es.selectAll')}>{d}</th>
                      {HOURS.map((h) => (
                        <td key={h} className={hours[di * 24 + h] ? 'on' : ''} onClick={() => setCell(di, h, !hours[di * 24 + h])} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={saving}>{t('es.addSave')}</button></div>
      </form>
    </div>
  );
}
