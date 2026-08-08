import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const LINE_TYPES = ['מספר נייח - קידומת 072', 'מספר נייד', 'מספר 1-800', 'מספר 1-700', 'מספר וירטואלי בחו״ל'];
const DAYS = {
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

// open_hours is a 168-char bitmap: index = day*24 + hour, '1' = open.
const parseHours = (s) => {
  const arr = Array(168).fill(false);
  if (typeof s === 'string') for (let i = 0; i < 168 && i < s.length; i++) arr[i] = s[i] === '1';
  return arr;
};
const serializeHours = (arr) => arr.map((b) => (b ? '1' : '0')).join('');

export default function EditServicePage() {
  const [sp] = useSearchParams();
  const id = sp.get('id');
  const { token } = useAuth();
  const { t, lang } = useLang();
  const nav = useNavigate();

  const [svc, setSvc] = useState(null);
  const [form, setForm] = useState({});
  const [phones, setPhones] = useState([]);
  const [users, setUsers] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [smsOn, setSmsOn] = useState(false);
  const [smsCost, setSmsCost] = useState(false);
  const [hoursOn, setHoursOn] = useState(false);
  const [hours, setHours] = useState(Array(168).fill(false));
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.service(id, token).then((d) => {
      const s = d.service;
      setSvc(s);
      setForm({
        name: s.name || '', description: s.description || '',
        service_type: s.service_type || 'phone', site_url: s.site_url || '',
        line_type: s.line_type || '', phone_service_number: s.phone_service_number || '',
        returning_sms_from: s.returning_sms_from || '', returning_sms_text: s.returning_sms_text || '',
        service_ref: s.service_ref || '', export_webhook_url: s.export_webhook_url || '',
        is_active: s.is_active,
      });
      setPhones((d.phones || []).map((p) => ({ ...p })));
      setUsers(d.users || []);
      setAssigned((s.distribute_leads || []).map(String));
      setSmsOn(!!(s.returning_sms_from || s.returning_sms_text));
      const h = parseHours(s.open_hours);
      setHoursOn(h.some(Boolean));
      setHours(h);
    }).catch((e) => setError(e.message));
  }, [id, token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const type = form.service_type;

  const smsChars = (form.returning_sms_text || '').length;
  const smsMsgs = smsChars ? Math.ceil(smsChars / 70) : 0; // unicode (Hebrew) SMS = 70 chars/segment

  const toggleAssigned = (uid) => setAssigned((a) => (a.includes(uid) ? a.filter((x) => x !== uid) : [...a, uid]));
  const setCell = (day, hour, val) => setHours((h) => { const n = [...h]; n[day * 24 + hour] = val; return n; });
  const toggleDay = (day) => setHours((h) => {
    const n = [...h]; const all = HOURS.every((hr) => h[day * 24 + hr]);
    HOURS.forEach((hr) => (n[day * 24 + hr] = !all)); return n;
  });
  const allOn = hours.every(Boolean);
  const toggleAll = () => setHours(Array(168).fill(!allOn));

  const assignedLabel = useMemo(() => {
    if (!assigned.length) return t('es.assignNone');
    return users.filter((u) => assigned.includes(String(u.id))).map((u) => u.name).join(', ');
  }, [assigned, users, t]);

  async function save(e) {
    e.preventDefault(); setMsg(''); setError('');
    const body = {
      name: form.name, description: form.description, service_type: form.service_type,
      site_url: type === 'website' ? form.site_url : null,
      line_type: type === 'phone' ? form.line_type : null,
      phone_service_number: type === 'phone' ? form.phone_service_number : null,
      is_whatsapp_service: type === 'whatsapp' ? 1 : 0,
      returning_sms_from: smsOn ? form.returning_sms_from : null,
      returning_sms_text: smsOn ? form.returning_sms_text : null,
      distribute_leads: assigned,
      service_ref: form.service_ref, export_webhook_url: form.export_webhook_url,
      open_hours: hoursOn ? serializeHours(hours) : '',
      is_active: form.is_active ? 1 : 0,
      phones: type === 'phone' ? phones.map((p) => ({ id: p.id, redirect_to_number: p.redirect_to_number })) : undefined,
    };
    try { await api.updateService(id, body, token); setMsg(t('es.saved')); }
    catch (err) { setError(err.message); }
  }

  if (!id) return <p className="error">Missing id</p>;
  if (error && !svc) return <p className="error">{error}</p>;
  if (!svc) return <p className="muted">{t('common.loading')}</p>;

  const typeBtn = (val, label) => (
    <button type="button" className={'tab' + (type === val ? ' active' : '')} onClick={() => set('service_type', val)}>{label}</button>
  );
  const days = DAYS[lang] || DAYS.he;

  return (
    <div>
      <div className="page-header">
        <h1>{t('es.title')}: {svc.name}</h1>
        <button className="btn btn-secondary" onClick={() => nav(-1)}>{t('es.back')}</button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>{svc.agency_name} › {svc.company_name}</p>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <form className="form-panel" onSubmit={save}>
        <div className="form-panel-body">
          <div className="form-field"><label>{t('es.name')}</label><div className="form-field-control">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} /></div></div>

          <div className="form-field"><label>{t('es.code')}</label><div className="form-field-control">
            <input value={svc.public_hash || ''} readOnly className="input-readonly" /></div></div>

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
                <option value="">—</option>
                {(form.line_type && !LINE_TYPES.includes(form.line_type)) && <option value={form.line_type}>{form.line_type}</option>}
                {LINE_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select></div></div>

            <div className="form-field"><label>{t('es.virtualNumber')}</label><div className="form-field-control">
              {phones.length === 0 && <span className="muted">{t('es.noNumbers')}</span>}
              {phones.map((p) => <input key={'n' + p.id} value={p.number_to_display || p.phone_number || ''} readOnly className="input-readonly" style={{ marginBottom: 4 }} />)}
            </div></div>

            {phones.map((p, i) => (
              <div className="form-field" key={'r' + p.id}><label>{t('es.redirect')}</label><div className="form-field-control">
                <input value={p.redirect_to_number || ''} onChange={(e) => setPhones((arr) => arr.map((x, xi) => (xi === i ? { ...x, redirect_to_number: e.target.value } : x)))} />
              </div></div>
            ))}
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
        <div className="form-actions"><button className="btn btn-primary">{t('es.save')}</button></div>
      </form>
    </div>
  );
}
