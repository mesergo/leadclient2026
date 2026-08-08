import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';
import { Star, X } from '../icons';
import { isAutoTag, displayTag, extractRecordingUrl } from '../tags';

const ACTIONS = ['promised', 'offered', 'called', 'meeting', 'other'];
const CHANNELS = ['sms', 'whatsapp', 'email'];
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

  const load = () => api.lead(id, token).then((d) => {
    setData(d);
    api.tags(token, d.lead.company_id).then((r) => setCompanyTags(r.tags)).catch(() => {});
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  const l = data.lead;
  const convos = data.conversations || [];
  const treatments = convos.filter((c) => c.send_by === 'treatment');
  const messages = convos.filter((c) => c.send_by !== 'treatment');

  const upd = async (patch) => { try { await api.updateLead(id, patch, token); load(); } catch (e) { setError(e.message); } };

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
        <h2>{t('leadd.title')} #{l.id} — {l.lead_name || t('lead.na')}</h2>
        {onClose && <button className="icon-btn" onClick={onClose}><X size={16} /></button>}
      </div>
      <div className="tabs">{TABS.map(([k, lbl]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{lbl}</button>)}</div>

      <div className="lead-card-body">
        {tab === 'general' && (<>
          {row(t('common.company'), `${l.company_name} / ${l.agency_name || '-'}`)}
          {row(t('lead.channel'), l.service_name || '-')}
          {row(t('common.phone'), <span>{l.lead_phone} {l.lead_phone && <a href={`https://wa.me/${(l.lead_phone || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="chip-link wa">WhatsApp</a>}</span>)}
          {row(t('common.email'), l.lead_email ? <span>{l.lead_email} <a href={`mailto:${l.lead_email}`} className="chip-link email">Email</a></span> : '--')}
          {row(t('lead.received'), l.created_at)}
          {row(t('lead.status'), (
            <select value={l.status_id || ''} onChange={(e) => upd({ status_id: e.target.value || null })}>
              <option value="">—</option>{(data.statuses || []).map((st) => <option key={st.id} value={st.id}>{st.text}</option>)}
            </select>
          ))}
          {row(t('lc.rating'), <span style={{ color: '#f5a623', display: 'flex', gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ cursor: 'pointer' }} onClick={() => upd({ lead_rating: n })}><Star size={18} filled={n <= (l.lead_rating || 0)} /></span>)}</span>)}
          {(() => {
            const rec = l.recording_url || extractRecordingUrl(l.lead_info) || extractRecordingUrl(l.referrer);
            if (!isPhoneLead(l) && !rec) return null;
            return row(t('lc.recording'), rec ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <audio controls preload="none" src={rec} style={{ height: 32 }} />
                <a href={rec} target="_blank" rel="noreferrer" className="chip-link email">{t('lc.download')}</a>
              </span>
            ) : <span className="muted">{t('lc.noRecording')}</span>);
          })()}
          {row(t('lead.tags'), (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {(data.tags || []).map((tg) => {
                const auto = isAutoTag(tg.label);
                return (
                  <span key={tg.id} className={'tag-chip ' + (auto ? 'tag-auto' : 'removable')} title={auto ? t('lc.autoTag') : ''}>
                    {auto && <span className="auto-dot" />}{displayTag(tg.label)}
                    {!auto && <button onClick={() => removeTag(tg.id)}>×</button>}
                  </span>
                );
              })}
              <form onSubmit={addTag} style={{ display: 'inline-flex' }}>
                <input list="ctags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder={t('lc.addTag')} style={{ width: 140, padding: '4px 8px' }} />
                <datalist id="ctags">{companyTags.map((tg) => <option key={tg.id} value={displayTag(tg.label)} />)}</datalist>
              </form>
            </div>
          ))}
        </>)}

        {tab === 'extra' && (<>
          {row(t('lc.source'), l.lead_through || '-')}
          {row('Facebook ID', l.facebook_id || '-')}
          {row(t('lc.ip'), l.ip_address || '-')}
          {row(t('lc.browser'), [l.browser_name, l.platform].filter(Boolean).join(' / ') || '-')}
          {row(t('lc.referrer'), l.referrer || '-')}
          <div style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRaw((v) => !v)}>{showRaw ? t('lc.hideRaw') : t('lc.showRaw')}</button>
            {showRaw && <pre className="lead-info" style={{ marginTop: '0.5rem' }}>{l.lead_info || JSON.stringify(l, null, 2)}</pre>}
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
    </div>
  );
}
