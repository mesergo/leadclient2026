import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function LanguageEditPage() {
  const { slug } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();

  const [language, setLanguage] = useState(null);
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);           // selected namespace
  const [strings, setStrings] = useState([]);        // rows for the selected file
  const [edited, setEdited] = useState({});          // string_key -> value
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.languageStrings(slug, undefined, token).then((d) => { setLanguage(d.language); setFiles(d.files); })
      .catch((e) => setError(e.message));
  }, [slug, token]);

  const openFile = (ns) => {
    setFile(ns); setEdited({}); setMsg(''); setQ('');
    api.languageStrings(slug, ns, token).then((d) => setStrings(d.strings)).catch((e) => setError(e.message));
  };

  const rows = useMemo(() => {
    if (!q) return strings;
    const s = q.toLowerCase();
    return strings.filter((r) => r.string_key.toLowerCase().includes(s) || (r.string_value || '').toLowerCase().includes(s));
  }, [strings, q]);

  const save = async () => {
    const items = Object.entries(edited).map(([string_key, string_value]) => ({ string_key, namespace: file, string_value }));
    if (!items.length) return;
    setMsg(''); setError('');
    try {
      await api.saveLanguageStrings(slug, items, token);
      setMsg(t('lng.saved')); setEdited({});
      // refresh file counts
      api.languageStrings(slug, undefined, token).then((d) => setFiles(d.files)).catch(() => {});
    } catch (e) { setError(e.message); }
  };

  if (error && !language) return <p className="error">{error}</p>;
  if (!language) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div>
      <div className="page-header">
        <h1>{t('lng.title')}: {language.language}</h1>
        <button className="btn btn-secondary" onClick={() => nav('/language')}>{t('lng.back')}</button>
      </div>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="lng-layout">
        <div className="lng-files panel">
          <h3>{t('lng.files')}</h3>
          <ul>
            {files.map((f) => (
              <li key={f.namespace}>
                <button className={'lng-file' + (file === f.namespace ? ' active' : '')} onClick={() => openFile(f.namespace)}>
                  <span>{f.namespace}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{Number(f.translated)}/{Number(f.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lng-editor panel">
          {!file ? (
            <p className="muted">{t('lng.selectFile')}</p>
          ) : (<>
            <div className="lng-editor-head">
              <input placeholder={t('lng.searchKey')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
              <button className="btn btn-primary" onClick={save} disabled={!Object.keys(edited).length}>{t('lng.save')}</button>
            </div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th style={{ width: '35%' }}>{t('lng.key')}</th><th>{t('lng.value')}</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.string_key}>
                  <td><code className="lng-key">{r.string_key}</code></td>
                  <td>
                    <input
                      value={edited[r.string_key] !== undefined ? edited[r.string_key] : (r.string_value || '')}
                      onChange={(e) => setEdited((m) => ({ ...m, [r.string_key]: e.target.value }))} />
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </>)}
        </div>
      </div>
    </div>
  );
}
