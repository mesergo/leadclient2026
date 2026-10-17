import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';
import { Star, X, Phone, Mobile, Inbox, Globe, User, Check } from '../icons';
import { isAutoTag, displayTag, extractRecordingUrl, maskSuppliers } from '../tags';
import { formatIL, waNumber } from '../phone';
import Dialer from './Dialer';

// The recording plays from a short-lived signed link (fetched per lead), never from a URL
// carrying the session token.
function RecordingPlayer({ leadId, token, downloadLabel }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    api.recordingLink(leadId, token).then((d) => { if (alive && d.url) setSrc(API_ORIGIN + d.url); }).catch(() => {});
    return () => { alive = false; };
  }, [leadId, token]);
  if (!src) return <div className="lc-rec" />;
  return (
    <div className="lc-rec">
      <audio controls preload="none" src={src} />
      <a href={src} target="_blank" rel="noreferrer" className="lc-action small">{downloadLabel}</a>
    </div>
  );
}

const ACTIONS = ['promised', 'offered', 'called', 'meeting', 'other'];
const CHANNELS = ['sms', 'whatsapp', 'email'];

// Raw lead_info is JSON with \uXXXX-escaped Hebrew (sometimes double-encoded).
// Decode + pretty-print so it's readable.
function prettyRaw(s) {
  if (s == null) return '';
  const out = (() => {
    if (typeof s === 'object') return JSON.stringify(s, null, 2);
    let v = String(s);
    for (let i = 0; i < 3; i++) {
      try {
        const o = JSON.parse(v);
        if (o && typeof o === 'object') return JSON.stringify(o, null, 2);
        if (typeof o === 'string') { v = o; continue; }
        return String(o);
      } catch { break; }
    }
    return v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  })();
  return maskSuppliers(out); // hide our telephony providers from the customer
}
const isPhoneLead = (l) => /phone|call|טלפון|שיח/i.test(((l.lead_through || '') + ' ' + (l.service_type || '') + ' ' + (l.service_name || '')));

// Shared lead card content — used both as a floating modal and as a full page.
export default function LeadCard({ id, onClose }) {
  const { token } = useAuth();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('general');
  const [companyTags, setCompanyTags] = useState([]);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [treat, setTreat] = useState({ action_type: 'promised', content: '' });
  const [msg, setMsg] = useState({ channel: 'sms', content: '' });
  const [rem, setRem] = useState({ reminder_at: '', comment: '' });
  const [edit, setEdit] = useState({ lead_name: '', lead_phone: '', lead_email: '' });
  const [dialOpen, setDialOpen] = useState(false); // "חייג ללקוח" — the call is logged on this lead

  const load = () => api.lead(id, token).then((d) => {
    setData(d);
    setEdit({ lead_name: d.lead.lead_name || '', lead_phone: formatIL(d.lead.lead_phone), lead_email: d.lead.lead_email || '' });
    api.tags(token, d.lead.company_id).then((r) => setCompanyTags(r.tags)).catch(() => {});
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  const l = data.lead;
  const convos = data.conversations || [];
  const treatments = convos.filter((c) => c.send_by === 'treatment');
  const messages = convos.filter((c) => c.send_by !== 'treatment');

  // what kind of lead this is, for the avatar
  const callKind = l.lead_through === 'mobile'
    ? { Icon: Mobile, cls: 'k-mobile', label: t('lead.mobileCall') }
    : l.lead_through === 'call_out' ? { Icon: Phone, cls: 'k-out', label: t('lead.outgoing') }
      : isPhoneLead(l) ? { Icon: Phone, cls: l.call_status === 'missed' ? 'k-missed' : 'k-in', label: t('lc.callIn') }
        : /site|web|widget|form/i.test(l.lead_through || '') ? { Icon: Globe, cls: 'k-web', label: l.lead_through } : { Icon: Inbox, cls: 'k-web', label: l.lead_through || '' };
  // who took the call: incoming -> answered by, outgoing -> dialed by
  const outgoing = l.lead_through === 'call_out' || l.lead_through === 'mobile';
  const takerName = l.answered_by_name || (outgoing ? l.agent_name : null);
  const takerPhone = l.answered_by_name ? (l.answered_by_phone || l.answered_phone) : (outgoing ? null : l.answered_phone);
  const durText = l.call_duration_sec ? `${Math.floor(l.call_duration_sec / 60)}:${String(l.call_duration_sec % 60).padStart(2, '0')}` : null;

  const upd = async (patch) => { try { await api.updateLead(id, patch, token); load(); } catch (e) { setError(e.message); } };
  const saveField = (f) => {
    const a = edit[f] || '', b = l[f] || '';
    const same = f === 'lead_phone' ? a.replace(/\D/g, '') === b.replace(/\D/g, '') : a === b;
    if (!same) upd({ [f]: a });
  };
  const editInput = (f, w = 200, placeholder = '') => (
    <input value={edit[f]} placeholder={placeholder} onChange={(e) => setEdit({ ...edit, [f]: e.target.value })}
      onBlur={() => saveField(f)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={{ width: w, padding: '4px 8px' }} />
  );

  async function addTag(e) {
    e.preventDefault();
    const label = tagInput.trim();
    if (!label) return;
    try {
      let tg = companyTags.find((x) => x.label.toLowerCase() === label.toLowerCase());
      if (!tg) { const r = await api.createTag({ company_id: l.company_id, label }, token); tg = { id: r.tag.id, label }; setCompanyTags((c) => [...c, tg]); }
      await api.addLeadTag(id, tg.id, token);
      setTagInput('');
      load();
    } catch (e) { setError(e.message); }
  }
  const addExistingTag = async (tagId) => {
    try { await api.addLeadTag(id, tagId, token); load(); } catch (e) { setError(e.message); }
  };
  const removeTag = (tagId) => api.removeLeadTag(id, tagId, token).then(load).catch((e) => setError(e.message));
  async function addTreatment(e) { e.preventDefault(); try { await api.addTreatment(id, treat, token); setTreat({ action_type: 'promised', content: '' }); load(); } catch (e) { setError(e.message); } }
  async function sendMsg(e) { e.preventDefault(); if (!msg.content.trim()) return; try { await api.sendLeadMessage(id, msg, token); setMsg({ ...msg, content: '' }); load(); } catch (e) { setError(e.message); } }
  async function addRem(e) { e.preventDefault(); if (!rem.reminder_at) return; try { await api.addLeadReminder(id, rem, token); setRem({ reminder_at: '', comment: '' }); load(); } catch (e) { setError(e.message); } }

  const TABS = [
    ['general', t('ltab.general')], ['extra', t('ltab.extra')], ['treatment', t('ltab.treatment')],
    ['chat', t('ltab.chat')], ['assign', t('ltab.assign')], ['reminder', t('ltab.reminder')],
  ];
  const row = (label, val) => (<div className="form-field"><label>{label}</label><div className="form-field-control" style={{ justifyContent: 'flex-start' }}>{val}</div></div>);

  return (
    <div className="lead-card">
      <div className="lead-card-head">
        <span className="lc-id">{t('leadd.title')} #{l.id}</span>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label="close"><X size={16} /></button>}
      </div>

      {/* hero: who, how to reach, where it came from */}
      <div className="lc-hero">
        <div className={'lc-avatar ' + callKind.cls} title={callKind.label}><callKind.Icon size={22} /></div>
        <div className="lc-hero-main">
          <input className="lc-name-input" value={edit.lead_name} placeholder={t('lead.na')}
            onChange={(e) => setEdit({ ...edit, lead_name: e.target.value })}
            onBlur={() => saveField('lead_name')} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
          <div className="lc-phone" dir="ltr">
            {isPhoneLead(l)
              ? <span title={t('lc.callerLocked')}>{edit.lead_phone || t('lead.unknownPhone')}</span>
              : <input value={edit.lead_phone} placeholder={t('lead.unknownPhone')} onChange={(e) => setEdit({ ...edit, lead_phone: e.target.value })}
                  onBlur={() => saveField('lead_phone')} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />}
          </div>
          <div className="lc-meta">
            {l.service_name && <span className="lc-meta-chip">{l.service_name}</span>}
            <span className="lc-meta-chip">{l.company_name}{l.agency_name ? ` · ${l.agency_name}` : ''}</span>
            <span className="lc-meta-chip">{l.created_at}</span>
          </div>
        </div>
        <div className="lc-rating" title={t('lc.rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => upd({ lead_rating: n })} aria-label={`${n}`}><Star size={18} filled={n <= (l.lead_rating || 0)} /></button>
          ))}
        </div>
      </div>

      <div className="lc-actions">
        {waNumber(edit.lead_phone) && <button type="button" className="lc-action primary" onClick={() => setDialOpen(true)}><Phone size={16} /> {t('lc.dialCustomer')}</button>}
        {waNumber(edit.lead_phone) && <a className="lc-action wa" href={`https://wa.me/${waNumber(edit.lead_phone)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {edit.lead_email && <a className="lc-action" href={`mailto:${edit.lead_email}`}>Email</a>}
      </div>

      <div className="tabs">{TABS.map(([k, lbl]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{lbl}</button>)}</div>

      <div className="lead-card-body">
        {tab === 'general' && (<>
          {/* status — colored chips like the app */}
          <section className="lc-section">
            <h4>{t('lead.status')}</h4>
            <div className="lc-status-row">
              {(data.statuses || []).map((st) => {
                const on = String(l.status_id) === String(st.id);
                const c = st.color || '#888';
                return (
                  <button key={st.id} type="button" className={'lc-status' + (on ? ' on' : '')}
                    style={on ? { background: c, borderColor: c, color: '#fff' } : { borderColor: c + '66', color: c }}
                    onClick={() => !on && upd({ status_id: st.id })}>
                    {on && <Check size={13} />}{st.text}
                  </button>
                );
              })}
            </div>
          </section>

          {/* the call: who answered / dialed, outcome, length, recording */}
          {isPhoneLead(l) || l.lead_through === 'mobile' ? (() => {
            const hasRec = !!(l.recording_url || extractRecordingUrl(l.lead_info) || extractRecordingUrl(l.referrer));
            return (
              <section className="lc-section">
                <h4>{t('lc.callTitle')}</h4>
                <div className="lc-call-grid">
                  <div className="lc-kv">
                    <span>{outgoing ? t('lc.dialedBy') : t('lc.answeredBy')}</span>
                    <strong>
                      {takerName
                        ? <><User size={14} /> {takerName}{takerPhone && <em dir="ltr"> · {formatIL(takerPhone)}</em>}</>
                        : takerPhone ? <span dir="ltr">{formatIL(takerPhone)}</span>
                          : <span className="muted">{l.call_status === 'missed' ? t('lc.notAnswered') : '—'}</span>}
                    </strong>
                  </div>
                  <div className="lc-kv">
                    <span>{t('lc.callResult')}</span>
                    <strong className={'lc-callstate ' + (l.call_status || '')}>
                      {l.call_status === 'answered' ? t('lc.resAnswered') : l.call_status === 'missed' ? t('lc.resMissed') : l.call_status === 'active' ? t('lc.resActive') : '—'}
                    </strong>
                  </div>
                  <div className="lc-kv">
                    <span>{t('lc.duration')}</span>
                    <strong dir="ltr">{durText || '—'}</strong>
                  </div>
                </div>
                {hasRec ? <RecordingPlayer leadId={l.id} token={token} downloadLabel={t('lc.download')} />
                  : <p className="muted lc-norec">{t('lc.noRecording')}</p>}
              </section>
            );
          })() : null}

          {/* details */}
          <section className="lc-section">
            <h4>{t('lc.details')}</h4>
            <div className="lc-fields">
              <label className="lc-field">
                <span>{t('common.email')}</span>
                <input value={edit.lead_email} onChange={(e) => setEdit({ ...edit, lead_email: e.target.value })}
                  onBlur={() => saveField('lead_email')} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} placeholder="name@example.com" dir="ltr" />
              </label>
              <div className="lc-field">
                <span>{t('lead.agent')}</span>
                <strong>{l.agent_name || t('lead.general')}</strong>
              </div>
            </div>
          </section>

          {/* tags */}
          <section className="lc-section">
            <h4>{t('lead.tags')}</h4>
            <div className="lc-tags">
              {(data.tags || []).map((tg) => {
                const auto = isAutoTag(tg.label);
                return (
                  <span key={tg.id} className={'tag-chip ' + (auto ? 'tag-auto' : 'removable')} title={auto ? t('lc.autoTag') : ''}>
                    {auto && <span className="auto-dot" />}{displayTag(tg.label)}
                    {!auto && <button onClick={() => removeTag(tg.id)}>×</button>}
                  </span>
                );
              })}
              <select className="tag-picker" value="" onChange={(e) => { if (e.target.value) addExistingTag(e.target.value); e.target.value = ''; }}>
                <option value="">+ {t('lc.addTag')}</option>
                {companyTags
                  .filter((ct) => !(data.tags || []).some((lt) => String(lt.id) === String(ct.id)))
                  .map((tg) => <option key={tg.id} value={tg.id}>{displayTag(tg.label)}</option>)}
              </select>
              <form onSubmit={addTag} style={{ display: 'inline-flex' }}>
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder={t('lc.newTag')} className="lc-tag-input" />
              </form>
            </div>
          </section>
        </>)}

        {tab === 'extra' && (<>
          {row(t('lc.source'), l.lead_through || '-')}
          {row('Facebook ID', l.facebook_id || '-')}
          {row(t('lc.ip'), l.ip_address || '-')}
          {row(t('lc.browser'), [l.browser_name, l.platform].filter(Boolean).join(' / ') || '-')}
          {row(t('lc.referrer'), l.referrer || '-')}
          <div style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRaw((v) => !v)}>{showRaw ? t('lc.hideRaw') : t('lc.showRaw')}</button>
            {showRaw && <pre className="lead-info" style={{ marginTop: '0.5rem' }}>{l.lead_info ? prettyRaw(l.lead_info) : JSON.stringify(l, null, 2)}</pre>}
          </div>
        </>)}

        {tab === 'treatment' && (<>
          <form className="inline-form" onSubmit={addTreatment}>
            <select value={treat.action_type} onChange={(e) => setTreat({ ...treat, action_type: e.target.value })}>
              {ACTIONS.map((a) => <option key={a} value={a}>{t('act.' + a)}</option>)}
            </select>
            <input placeholder={t('leadd.content')} value={treat.content} onChange={(e) => setTreat({ ...treat, content: e.target.value })} style={{ flex: 1 }} />
            <button className="btn btn-primary">{t('lc.addTreatment')}</button>
          </form>
          {treatments.length === 0 ? <p className="muted">{t('lc.treatmentEmpty')}</p> : (
            <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('lc.actionType')}</th><th>{t('leadd.content')}</th><th>{t('common.date')}</th></tr></thead>
              <tbody>{treatments.map((c) => <tr key={c.id}><td>{t('act.' + c.comment)}</td><td>{c.content}</td><td>{c.created_at}</td></tr>)}</tbody></table></div>
          )}
        </>)}

        {tab === 'chat' && (<>
          <form className="inline-form" onSubmit={sendMsg}>
            <select value={msg.channel} onChange={(e) => setMsg({ ...msg, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input placeholder={t('lc.msgSend')} value={msg.content} onChange={(e) => setMsg({ ...msg, content: e.target.value })} style={{ flex: 1 }} />
            <button className="btn btn-primary">{t('lc.msgSend')}</button>
          </form>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('lc.msgChannel')}</th><th>{t('leadd.content')}</th><th>{t('common.date')}</th></tr></thead>
            <tbody>{messages.map((c) => <tr key={c.id}><td>{c.send_by}</td><td>{c.content}</td><td>{c.created_at}</td></tr>)}</tbody></table></div>
          {messages.length === 0 && <p className="muted">{t('common.none')}</p>}
        </>)}

        {tab === 'assign' && row(t('lc.assignAgent'), (
          <select value={l.current_agent_id || ''} onChange={(e) => upd({ current_agent_id: e.target.value || null })}>
            <option value="">{t('lead.general')}</option>{(data.agents || []).map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>
        ))}

        {tab === 'reminder' && (<>
          <form className="inline-form" onSubmit={addRem}>
            <input type="datetime-local" value={rem.reminder_at} onChange={(e) => setRem({ ...rem, reminder_at: e.target.value })} />
            <input placeholder={t('leadd.content')} value={rem.comment} onChange={(e) => setRem({ ...rem, comment: e.target.value })} style={{ flex: 1 }} />
            <button className="btn btn-primary">{t('lc.addReminder')}</button>
          </form>
          {(data.reminders || []).length === 0 ? <p className="muted">{t('lc.noReminders')}</p> : (
            <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('lc.reminderAt')}</th><th>{t('leadd.content')}</th></tr></thead>
              <tbody>{data.reminders.map((r) => <tr key={r.id}><td>{r.reminder_at}</td><td>{r.comment}</td></tr>)}</tbody></table></div>
          )}
        </>)}
      </div>
      {dialOpen && <Dialer onClose={() => setDialOpen(false)} initialTarget={edit.lead_phone} leadId={l.id} leadName={l.lead_name || ''} />}
    </div>
  );
}
