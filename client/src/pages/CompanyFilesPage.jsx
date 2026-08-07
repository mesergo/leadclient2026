import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api, API_ORIGIN } from '../api';
import { Trash } from '../icons';

export default function CompanyFilesPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const load = () => api.companyFiles(id, token).then((d) => setRows(d.files)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id, token]);
  async function upload(file) { if (!file) return; setUploading(true); try { await api.uploadCompanyFile(id, file, token); load(); } catch (e) { setError(e.message); } finally { setUploading(false); } }
  async function del(fid) { if (!confirm('?')) return; try { await api.deleteCompanyFile(fid, token); load(); } catch (e) { setError(e.message); } }
  return (
    <div>
      <div className="page-header"><h1>{t('cop.files')}</h1><Link className="btn btn-secondary" to={`/companies/${id}`}>{t('common.back')}</Link></div>
      {error && <p className="error">{error}</p>}
      <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block', marginBottom: '1rem' }}>
        {uploading ? '...' : t('cop.uploadFile')}
        <input type="file" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>{t('cop.fileName')}</th><th>{t('common.date')}</th><th></th></tr></thead>
        <tbody>{rows.map((fRow) => (<tr key={fRow.id}><td><a href={API_ORIGIN + fRow.file_url} target="_blank" rel="noreferrer">{fRow.file_name}</a></td><td>{fRow.created_at}</td><td><button className="icon-btn icon-btn--red" onClick={() => del(fRow.id)}><Trash size={14} /></button></td></tr>))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{t('common.none')}</p>}
    </div>
  );
}
