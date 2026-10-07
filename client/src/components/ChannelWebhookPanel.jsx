import { Fragment, useEffect, useState } from 'react';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const pretty = (s) => { if (!s) return ''; try { return JSON.stringify(typeof s === 'object' ? s : JSON.parse(s), null, 2); } catch { return String(s); } };
const PRE = { background: 'var(--bg)', padding: 8, borderRadius: 6, overflow: 'auto', fontSize: 12, direction: 'ltr', textAlign: 'left', margin: '4px 0 8px' };
const meta = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// Under the channel's webhook URL: "send test" + the delivery log of this channel's
// outgoing webhook (every attempt with the receiver's HTTP status / error).
export default function ChannelWebhookPanel({ serviceId, url, token }) {
  const { t } = useLang();
  const [logs, setLogs] = useState(null);
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null);

  const load = () => api.serviceWebhookLog(serviceId, token).then((d) => setLogs(d.logs || [])).catch(() => setLogs([]));
  useEffect(() => { load(); }, [serviceId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendTest() {
    setBusy(true); setTest(null);
    try { setTest(await api.serviceWebhookTest(serviceId, url, token)); }
    catch (e) { setTest({ ok: false, error: e.message }); }
    setBusy(false); load(); setOpen(true);
  }

  const failed = (logs || []).filter((l) => !String(l.result || '').startsWith('ok_')).length;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !String(url || '').trim()} onClick={sendTest}>
          {busy ? '...' : t('wh.test')}
        </button>
        <button type="button" className="rc-advanced-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} {t('wh.log')} ({logs ? logs.length : '…'}{failed ? ` · ${failed} ${t('wh.failedN')}` : ''})
        </button>
      </div>
      {test && (
        <div className={'bill-status ' + (test.ok ? 'ok' : 'bad')} style={{ marginTop: 6 }}>
          {test.ok
            ? t('wh.testOk').replace('{status}', test.status).replace('{ms}', test.ms)
            : `${t('wh.testFail')}: ${test.error || `HTTP ${test.status}`}`}
          {test.payload && (
            <div style={{ fontSize: 12 }}>
              {test.payload.sample ? t('wh.sentSample') : t('wh.sentLead').replace('{id}', test.payload.lead_id).replace('{event}', test.payload.event)}
            </div>
          )}
          {(test.status === 401 || test.status === 403) && <div style={{ fontSize: 12 }}>{t('wh.authHint')}</div>}
          {test.response ? <div className="muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{String(test.response).slice(0, 300)}</div> : null}
        </div>
      )}
      {open && logs && (
        logs.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>{t('wh.empty')}</p> : (
          <table className="data-table" style={{ marginTop: 6 }}>
            <thead><tr><th>{t('wl.time')}</th><th>{t('wh.event')}</th><th>{t('wl.result')}</th><th>{t('wh.ms')}</th></tr></thead>
            <tbody>{logs.map((l) => {
              const m = meta(l.query_data);
              const ok = String(l.result || '').startsWith('ok_');
              return (
                <Fragment key={l.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setRow(row === l.id ? null : l.id)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('he-IL')}</td>
                    <td>{m.event || '—'}</td>
                    <td style={{ color: ok ? '#2e7d32' : '#c62828', fontWeight: 600 }}>{ok ? `✓ ${m.status}` : `✗ ${l.error || l.result}`}</td>
                    <td>{m.ms != null ? m.ms : '—'}</td>
                  </tr>
                  {row === l.id && (
                    <tr><td colSpan={4}>
                      <div className="muted" style={{ fontSize: 12, direction: 'ltr' }}>{l.url}</div>
                      <strong style={{ fontSize: 12 }}>{t('wh.sent')}</strong>
                      <pre style={{ ...PRE, maxHeight: 220 }}>{pretty(l.body_data)}</pre>
                      {m.response ? (<><strong style={{ fontSize: 12 }}>{t('wh.response')}</strong>
                        <pre style={{ ...PRE, maxHeight: 160 }}>{m.response}</pre></>) : null}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table>
        )
      )}
    </div>
  );
}
