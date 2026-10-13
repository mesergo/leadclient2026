import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const ADD = '__add__';

const localPhone = (v) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  else if (d && !d.startsWith('0')) d = '0' + d;
  return d;
};
const fmt = (p) => { const d = localPhone(p); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };

// temporary "call from" numbers live only in this browser tab session (cleared when it closes)
const tempKey = (uid) => `lc_dial_temp_${uid}`;
const readTemp = (uid) => { try { return JSON.parse(window.sessionStorage.getItem(tempKey(uid))) || { numbers: [], def: '' }; } catch { return { numbers: [], def: '' }; } };
const writeTemp = (uid, v) => { try { window.sessionStorage.setItem(tempKey(uid), JSON.stringify(v)); } catch { /* private mode */ } };

// Click-to-call dialer. The agent picks which number they'll call FROM (their
// mobile), which virtual number to call via, and dials the customer's number.
// Registering a callback makes the next inbound call from that mobile route to
// the customer (logged as an outgoing call). The agent then rings the virtual #.
// initialTarget / leadId: opened from a lead card ("חייג ללקוח") — the call is logged on that lead
export default function Dialer({ onClose, initialTarget = '', leadId = null, leadName = '' }) {
  const { token, user } = useAuth();
  const { t } = useLang();
  const [opts, setOpts] = useState({ mobiles: [], targets: [], virtuals: [] });
  const [from, setFrom] = useState('');
  const [via, setVia] = useState('');
  const [target, setTarget] = useState(String(initialTarget || '').replace(/[^\d*#+]/g, ''));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState([]);               // saved (permanent) numbers {id, phone, is_default}
  const [temp, setTemp] = useState(() => readTemp(user?.id));
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newKind, setNewKind] = useState('permanent');  // permanent | temporary
  const [newDefault, setNewDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  const profilePhone = localPhone(user?.phone);
  const saveTemp = (v) => { setTemp(v); writeTemp(user?.id, v); };

  useEffect(() => {
    api.callbackOptions(token).then((d) => {
      setOpts(d);
      setMine(d.my_numbers || []);
      if (d.virtuals[0]) setVia(d.virtuals[0].phone_number);
      // default "from": this session's temporary default > the saved default > the profile phone.
      // It MUST equal the number the agent answers on.
      const savedDef = (d.my_numbers || []).find((n) => n.is_default);
      const tmp = readTemp(user?.id);
      setFrom(tmp.def || (savedDef && savedDef.phone) || profilePhone || (d.mobiles[0] && localPhone(d.mobiles[0].phone)) || '');
    }).catch((e) => setError(e.message));
  }, [token]);

  // every number the agent may call from, without duplicates
  const choices = [];
  const seen = new Set();
  const push = (phone, label, kind, id) => { const p = localPhone(phone); if (p && !seen.has(p)) { seen.add(p); choices.push({ phone: p, label, kind, id }); } };
  if (profilePhone) push(profilePhone, t('dial.myProfile'), 'profile');
  mine.forEach((n) => push(n.phone, t('dial.saved'), 'saved', n.id));
  temp.numbers.forEach((p) => push(p, t('dial.temporary'), 'temp'));
  const others = opts.mobiles.filter((m) => !seen.has(localPhone(m.phone)));
  if (from && !seen.has(localPhone(from)) && !others.some((m) => localPhone(m.phone) === localPhone(from))) push(from, '', 'other');
  const current = choices.find((c) => c.phone === localPhone(from));
  const savedDefault = mine.find((n) => n.is_default);
  const isDefault = current && (temp.def ? temp.def === current.phone
    : savedDefault ? savedDefault.phone === current.phone : current.kind === 'profile');

  function pickFrom(v) {
    if (v === ADD) { setAdding(true); setNewPhone(''); setNewKind('permanent'); setNewDefault(true); return; }
    setFrom(v);
  }

  async function addNumber() {
    setError('');
    const p = localPhone(newPhone);
    if (p.length < 9 || p.length > 10) { setError(t('dial.errPhone')); return; }
    setSaving(true);
    try {
      if (newKind === 'permanent') {
        const r = await api.addDialNumber({ phone: p, is_default: newDefault }, token);
        setMine(r.my_numbers || []);
        // a saved default replaces any temporary one
        saveTemp({ numbers: temp.numbers.filter((x) => x !== p), def: newDefault ? '' : temp.def });
      } else {
        saveTemp({ numbers: temp.numbers.includes(p) ? temp.numbers : [...temp.numbers, p], def: newDefault ? p : temp.def });
      }
      setFrom(p);
      setAdding(false);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function makeDefault() {
    if (!current) return;
    setError('');
    try {
      if (current.kind === 'temp') { saveTemp({ ...temp, def: current.phone }); return; }
      const r = await api.setDefaultDialNumber(current.kind === 'saved' ? current.id : null, token);
      setMine(r.my_numbers || []);
      saveTemp({ ...temp, def: '' });
    } catch (e) { setError(e.message); }
  }

  async function removeCurrent() {
    if (!current) return;
    setError('');
    try {
      if (current.kind === 'saved') { const r = await api.deleteDialNumber(current.id, token); setMine(r.my_numbers || []); }
      if (current.kind === 'temp') saveTemp({ numbers: temp.numbers.filter((x) => x !== current.phone), def: temp.def === current.phone ? '' : temp.def });
      setFrom(profilePhone || '');
    } catch (e) { setError(e.message); }
  }

  const press = (k) => setTarget((v) => v + k);

  async function callNow() {
    setError('');
    if (!from) { setError(t('dial.errFrom')); return; }
    if (!via) { setError(t('dial.errVia')); return; }
    if (!target) { setError(t('dial.errTarget')); return; }
    setBusy(true);
    try { await api.createCallback({ from_number: from, via_number: via, target_number: target, ...(leadId ? { lead_id: leadId } : {}) }, token); setDone(true); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const viaDisplay = opts.virtuals.find((x) => x.phone_number === via);

  return (
    <div className="dialer-backdrop" onClick={onClose}>
      <div className="dialer" onClick={(e) => e.stopPropagation()}>
        <div className="dialer-head">
          <h3>{t('dial.title')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close"><Icons.X size={18} /></button>
        </div>

        {done ? (
          <div className="dialer-done">
            <p className="success-note">{t('dial.placed')}</p>
            <p>{t('dial.ringingYou')}</p>
            <div className="dialer-via-big">{from}</div>
            <p className="muted">{t('dial.answerToConnect')} {target}</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>{t('common.close') || 'סגור'}</button>
          </div>
        ) : (<>
          {error && <p className="error">{error}</p>}

          <div className="dialer-field"><span>{t('dial.from')}</span>
            {adding ? (
              <div className="dialer-add">
                <input dir="ltr" autoFocus value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/[^\d+\-\s]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNumber(); }} placeholder="05X-XXXXXXX" />
                <div className="dialer-add-q">{t('dial.kindQ')}</div>
                <div className="dialer-seg" role="radiogroup">
                  <button type="button" role="radio" aria-checked={newKind === 'permanent'} className={newKind === 'permanent' ? 'on' : ''} onClick={() => setNewKind('permanent')}>
                    <b>{t('dial.permanent')}</b><small>{t('dial.permanentHint')}</small>
                  </button>
                  <button type="button" role="radio" aria-checked={newKind === 'temporary'} className={newKind === 'temporary' ? 'on' : ''} onClick={() => setNewKind('temporary')}>
                    <b>{t('dial.temporary')}</b><small>{t('dial.temporaryHint')}</small>
                  </button>
                </div>
                <label className="dialer-check"><input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} /> {t('dial.asDefault')}</label>
                <div className="dialer-add-actions">
                  <button type="button" className="btn btn-primary" onClick={addNumber} disabled={saving}>{t('dial.add')}</button>
                  <button type="button" className="btn" onClick={() => setAdding(false)}>{t('common.cancel') || 'ביטול'}</button>
                </div>
              </div>
            ) : (<>
              <select value={localPhone(from)} onChange={(e) => pickFrom(e.target.value)}>
                {!from && <option value="">{t('dial.errFrom')}</option>}
                {choices.map((c) => <option key={c.phone} value={c.phone}>{fmt(c.phone)}{c.label ? ` · ${c.label}` : ''}</option>)}
                {others.length > 0 && <optgroup label={t('dial.companyMobiles')}>
                  {others.map((m) => <option key={'m' + m.phone} value={localPhone(m.phone)}>{fmt(m.phone)} · {m.name}</option>)}
                </optgroup>}
                <option value={ADD}>＋ {t('dial.addNumber')}</option>
              </select>
              {current && (
                <div className="dialer-from-meta">
                  {isDefault ? <span className="dialer-badge">★ {t('dial.default')}</span>
                    : <button type="button" className="link-btn" onClick={makeDefault}>☆ {t('dial.setDefault')}</button>}
                  {(current.kind === 'saved' || current.kind === 'temp') && <button type="button" className="link-btn danger" onClick={removeCurrent}>{t('dial.remove')}</button>}
                </div>
              )}
            </>)}
          </div>

          <label className="dialer-field"><span>{t('dial.via')}</span>
            <select value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="">{t('dial.viaNone')}</option>
              {opts.virtuals.map((vn) => <option key={vn.id} value={vn.phone_number}>{vn.number_to_display || vn.phone_number}</option>)}
            </select>
          </label>

          <div className="dialer-display">
            <input dir="ltr" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d*#+]/g, ''))} placeholder={t('dial.target')} />
            {target && <button className="icon-btn" onClick={() => setTarget((v) => v.slice(0, -1))} aria-label="back"><Icons.X size={16} /></button>}
          </div>

          <div className="dialer-keys">
            {KEYS.map((k) => <button key={k} type="button" className="dialer-key" onClick={() => press(k)}>{k}</button>)}
          </div>

          <button className="btn btn-primary dialer-call" onClick={callNow} disabled={busy}>
            <Icons.Phone size={18} /> {busy ? t('dial.setting') : t('dial.call')}
          </button>
        </>)}
      </div>
    </div>
  );
}
