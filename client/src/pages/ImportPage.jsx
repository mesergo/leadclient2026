import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

const guess = (h) => {
  const c = (h || '').toString().toLowerCase();
  if (/phone|טלפון|נייד|מספר/.test(c)) return 'phone';
  if (/mail|מייל|אימייל|דוא/.test(c)) return 'email';
  if (/name|שם|פונה|לקוח/.test(c)) return 'name';
  return 'ignore';
};

export default function ImportPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const isSuper = user?.role === 'super_admin';

  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [services, setServices] = useState([]);
  const [sel, setSel] = useState({ agency: '', company_id: '', service_id: '' });
  const [mode, setMode] = useState('excel');
  const [pasteText, setPasteText] = useState('');
  const [parsed, setParsed] = useState(null); // { columns:[], rows:[[]] }
  const [mapping, setMapping] = useState({});
  const [manual, setManual] = useState({ name: '', phone: '', email: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
  }, [token]);
  const agencyCompanies = useMemo(
    () => (sel.agency ? companies.filter((c) => String(c.agency_id) === String(sel.agency)) : companies),
    [companies, sel.agency]
  );
  useEffect(() => {
    if (sel.company_id) api.services(token, sel.company_id).then((d) => setServices(d.services)).catch(() => setServices([]));
    else setServices([]);
  }, [sel.company_id, token]);
  const activeCompany = isSuper ? sel.company_id : user?.company_id;

  function applyParsed(columns, rows) {
    setParsed({ columns, rows });
    const m = {};
    columns.forEach((h, i) => (m[i] = guess(h)));
    setMapping(m);
    setResult(null);
  }
  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!aoa.length) return setError('הקובץ ריק');
      applyParsed(aoa[0].map((x) => (x ?? '').toString()), aoa.slice(1));
    } catch (err) { setError(err.message); }
  }
  function onParsePaste() {
    const lines = pasteText.trim().split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return;
    const split = (l) => (l.includes('\t') ? l.split('\t') : l.split(','));
    const all = lines.map(split);
    applyParsed(all[0].map((x) => x.trim()), all.slice(1));
  }

  const canImport = activeCompany && parsed && Object.values(mapping).includes('phone');

  async function doImport() {
    if (!activeCompany) return setError(t('imp.needCompany'));
    if (!Object.values(mapping).includes('phone')) return setError(t('imp.needPhoneCol'));
    const rows = parsed.rows.map((r) => {
      const o = {};
      Object.entries(mapping).forEach(([i, type]) => { if (type !== 'ignore') o[type] = (r[i] ?? '').toString().trim(); });
      return o;
    }).filter((o) => o.phone);
    setError(''); setResult(null);
    try {
      const d = await api.importLeads({ company_id: activeCompany, service_id: sel.service_id || null, rows }, token);
      setResult(d); setParsed(null); setPasteText('');
    } catch (e) { setError(e.message); }
  }
  async function addManual(e) {
    e.preventDefault();
    if (!manual.phone.trim() || !activeCompany) return;
    setError(''); setResult(null);
    try {
      const d = await api.importLeads({ company_id: activeCompany, service_id: sel.service_id || null, rows: [manual] }, token);
      setResult(d); setManual({ name: '', phone: '', email: '' });
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className="page-header"><h1>{t('nav.import')}</h1></div>
      {error && <p className="error">{error}</p>}
      {result && <p className="success-note">{t('imp.imported')} {result.success}/{result.total}{result.failed ? ` (${result.failed} נכשלו)` : ''}.</p>}

      {/* cascading target selector */}
      <div className="panel dash-filter">
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('imp.selectAgency')}</span>
              <select value={sel.agency} onChange={(e) => setSel({ agency: e.target.value, company_id: '', service_id: '' })}>
                <option value="">—</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          )}
          {isSuper && (
            <label className="filter-item"><span>{t('imp.selectCompany')}</span>
              <select value={sel.company_id} onChange={(e) => setSel({ ...sel, company_id: e.target.value, service_id: '' })}>
                <option value="">—</option>{agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
          <label className="filter-item"><span>{t('imp.selectChannel')}</span>
            <select value={sel.service_id} onChange={(e) => setSel({ ...sel, service_id: e.target.value })} disabled={!activeCompany}>
              <option value="">—</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
        </div>
      </div>

      {!activeCompany && <p className="muted">{t('imp.needCompany')}</p>}

      {activeCompany && (<>
        <div className="tabs">
          <button className={'tab' + (mode === 'excel' ? ' active' : '')} onClick={() => setMode('excel')}>{t('imp.excel')}</button>
          <button className={'tab' + (mode === 'paste' ? ' active' : '')} onClick={() => setMode('paste')}>{t('imp.paste')}</button>
          <button className={'tab' + (mode === 'manual' ? ' active' : '')} onClick={() => setMode('manual')}>{t('imp.manual')}</button>
        </div>

        <div className="panel">
          {mode === 'excel' && <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />}
          {mode === 'paste' && (
            <div>
              <textarea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={t('imp.pastePh')} style={{ width: '100%' }} />
              <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={onParsePaste}>{t('imp.parse')}</button>
            </div>
          )}
          {mode === 'manual' && (
            <form className="inline-form" onSubmit={addManual}>
              <input placeholder={t('imp.colName')} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
              <input placeholder={t('imp.colPhone')} value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} />
              <input placeholder={t('imp.colEmail')} value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
              <button className="btn btn-primary">{t('imp.doImport')}</button>
            </form>
          )}

          {/* preview + mapping (excel/paste) */}
          {mode !== 'manual' && parsed && (
            <div style={{ marginTop: '1rem' }}>
              <p className="muted">{parsed.rows.length} {t('imp.rowsFound')}. {t('imp.mapCol')}:</p>
              <div className="table-wrap"><table className="data-table">
                <thead>
                  <tr>{parsed.columns.map((c, i) => <th key={i}>{c || `#${i + 1}`}</th>)}</tr>
                  <tr>{parsed.columns.map((_, i) => (
                    <th key={i}>
                      <select value={mapping[i] || 'ignore'} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}>
                        <option value="ignore">{t('imp.colIgnore')}</option>
                        <option value="name">{t('imp.colName')}</option>
                        <option value="phone">{t('imp.colPhone')}</option>
                        <option value="email">{t('imp.colEmail')}</option>
                      </select>
                    </th>
                  ))}</tr>
                </thead>
                <tbody>{parsed.rows.slice(0, 4).map((r, ri) => <tr key={ri}>{parsed.columns.map((_, ci) => <td key={ci}>{(r[ci] ?? '').toString()}</td>)}</tr>)}</tbody>
              </table></div>
              <button className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={!canImport} onClick={doImport}>{t('imp.doImport')}</button>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}
