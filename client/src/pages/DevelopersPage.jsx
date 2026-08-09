import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';

function CodeBlock({ code }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <div className="code-block">
      <button className="code-copy" onClick={copy}>{copied ? t('dev.copied') : t('dev.copy')}</button>
      <pre>{code}</pre>
    </div>
  );
}

export default function DevelopersPage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const isSuper = user?.role === 'super_admin';
  const isAgency = user?.role === 'agency_admin';

  const [agencies, setAgencies] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [services, setServices] = useState([]);
  const [sel, setSel] = useState({ agency: '', company_id: '', service_id: '' });

  useEffect(() => {
    if (isSuper) api.agencies(token).then((d) => setAgencies(d.agencies)).catch(() => {});
    api.companies(token).then((d) => setCompanies(d.companies)).catch(() => {});
  }, [token]);
  const agencyCompanies = useMemo(
    () => (sel.agency ? companies.filter((c) => String(c.agency_id) === String(sel.agency)) : companies),
    [companies, sel.agency]
  );
  const activeCompany = isSuper || isAgency ? sel.company_id : user?.company_id;
  useEffect(() => {
    if (activeCompany) api.services(token, activeCompany).then((d) => setServices(d.services)).catch(() => setServices([]));
    else setServices([]);
  }, [activeCompany, token]);

  const svc = services.find((s) => String(s.id) === String(sel.service_id));
  const code = svc?.public_hash || '<קוד הערוץ שלך>';
  const O = API_ORIGIN;

  const headCode = `<link rel="preload" as="script" href="${O}/leadclient.js?CO=${code}&foinj=1" referrerpolicy="unsafe-url">\n<script src="${O}/leadclient.js?CO=${code}&foinj=1" defer></script>`;
  const wixCode = `<link rel="preload" as="script" href="${O}/leadclient.js?CO=${code}&foinj=4" referrerpolicy="unsafe-url">\n<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js"></script>\n<script src="${O}/leadclient.js?CO=${code}&foinj=4" defer></script>`;
  const manualCode = `<script type="text/javascript" src="${O}/leadclient.js?foinj=1&CH=${code}"></script>`;
  const htmlCode = `<form id="my-form">\n  <input type="text"  name="name"  placeholder="שם" />\n  <input type="tel"   name="phone" placeholder="טלפון" />\n  <input type="email" name="email" placeholder="דוא״ל" />\n  <button type="submit">שלח</button>\n</form>`;
  const jsCode = `<script type="text/javascript">\n$(document).ready(function () {\n  $("#my-form").on("submit", function (event) {\n    event.preventDefault();\n    $.leadClientSubmit({\n      name:  $("#my-form [name=name]").val(),\n      phone: $("#my-form [name=phone]").val(),\n      email: $("#my-form [name=email]").val()\n    });\n  });\n});\n</script>`;

  const errors = [['no_channel_id', t('dev.err.noChannel')], ['missing_phone', t('dev.err.noPhone')]];

  return (
    <div>
      <div className="page-header"><h1>{t('nav.developers')}</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>{t('dev.subtitle')}</p>

      <div className="panel">
        <h2>{t('dev.start')}</h2>
        <p>{t('dev.jquery')}</p>
      </div>

      <div className="panel">
        <h2>{t('dev.embed')}</h2>
        <p className="muted">{t('dev.pick')}</p>
        <div className="filter-row">
          {isSuper && (
            <label className="filter-item"><span>{t('common.agency')}</span>
              <select value={sel.agency} onChange={(e) => setSel({ agency: e.target.value, company_id: '', service_id: '' })}>
                <option value="">{t('imp.selectAgency')}</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          )}
          {(isSuper || isAgency) && (
            <label className="filter-item"><span>{t('common.company')}</span>
              <select value={sel.company_id} onChange={(e) => setSel({ ...sel, company_id: e.target.value, service_id: '' })}>
                <option value="">{t('imp.selectCompany')}</option>
                {agencyCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
          )}
          <label className="filter-item"><span>{t('lead.channel')}</span>
            <select value={sel.service_id} onChange={(e) => setSel({ ...sel, service_id: e.target.value })} disabled={!activeCompany}>
              <option value="">{t('dev.pickPh')}</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
        </div>

        <h3 style={{ marginTop: 16 }}>{t('dev.headCode')}</h3>
        <CodeBlock code={headCode} />
        <h3 style={{ marginTop: 16 }}>{t('dev.wixCode')}</h3>
        <CodeBlock code={wixCode} />
        <h3 style={{ marginTop: 16 }}>{t('dev.manualCode')}</h3>
        <CodeBlock code={manualCode} />
      </div>

      <div className="panel">
        <h2>{t('dev.advanced')}</h2>
        <p className="muted">{t('dev.advancedNote')}</p>
        <h3>{t('dev.htmlCode')}</h3>
        <CodeBlock code={htmlCode} />
        <h3 style={{ marginTop: 16 }}>{t('dev.jsCode')}</h3>
        <CodeBlock code={jsCode} />
      </div>

      <div className="panel">
        <h2>{t('dev.errCodes')}</h2>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t('dev.errCode')}</th><th>{t('dev.errDesc')}</th></tr></thead>
          <tbody>{errors.map(([c, d]) => <tr key={c}><td><code>{c}</code></td><td>{d}</td></tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}
