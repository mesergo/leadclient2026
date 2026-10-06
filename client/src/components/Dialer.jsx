import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// Click-to-call dialer. The agent picks which number they'll call FROM (their
// mobile), which virtual number to call via, and dials the customer's number.
// Registering a callback makes the next inbound call from that mobile route to
// the customer (logged as an outgoing call). The agent then rings the virtual #.
export default function Dialer({ onClose }) {
  const { token, user } = useAuth();
  const { t } = useLang();
  const [opts, setOpts] = useState({ mobiles: [], targets: [], virtuals: [] });
  const [from, setFrom] = useState('');
  const [via, setVia] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.callbackOptions(token).then((d) => {
      setOpts(d);
      if (d.virtuals[0]) setVia(d.virtuals[0].phone_number);
      // default "from" to the signed-in agent's own mobile — it MUST equal the number they call from
      setFrom(user?.phone || (d.mobiles[0] && d.mobiles[0].phone) || '');
    }).catch((e) => setError(e.message));
  }, [token]);

  const press = (k) => setTarget((v) => v + k);

  async function callNow() {
    setError('');
    if (!from) { setError(t('dial.errFrom')); return; }
    if (!via) { setError(t('dial.errVia')); return; }
    if (!target) { setError(t('dial.errTarget')); return; }
    setBusy(true);
    try { await api.createCallback({ from_number: from, via_number: via, target_number: target }, token); setDone(true); }
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

          <label className="dialer-field"><span>{t('dial.from')}</span>
            <input list="dialer-from-list" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="05X-XXXXXXX" />
            <datalist id="dialer-from-list">
              {opts.mobiles.map((m) => <option key={'m' + m.phone} value={m.phone}>{m.name} · {m.phone}</option>)}
              {opts.targets.map((n) => <option key={'t' + n} value={n}>{n}</option>)}
            </datalist>
          </label>

          <label className="dialer-field"><span>{t('dial.via')}</span>
            <select value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="">{t('dial.viaNone')}</option>
              {opts.virtuals.map((vn) => <option key={vn.id} value={vn.phone_number}>{vn.number_to_display || vn.phone_number}</option>)}
            </select>
          </label>

          <div className="dialer-display">
            <input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d*#+]/g, ''))} placeholder={t('dial.target')} />
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
