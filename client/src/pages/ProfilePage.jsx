import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';

export default function ProfilePage() {
  const { token, user } = useAuth();
  const { t } = useLang();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  async function savePw(e) { e.preventDefault(); setMsg(''); setError('');
    try { await api.updatePassword(pw, token); setMsg(t('prof.pwUpdated')); setPw({ current_password: '', new_password: '' }); }
    catch (e) { setError(e.message); } }
  return (
    <div>
      <div className="page-header"><h1>{t('nav.profile')}</h1></div>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <div className="panel"><h2>{t('prof.details')}</h2>
        <div className="form-field"><label>{t('common.name')}</label><div>{user?.name}</div></div>
        <div className="form-field"><label>{t('prof.role')}</label><div>{user?.role}</div></div>
      </div>
      <div className="form-panel"><div className="form-panel-body"><h2>{t('prof.changePw')}</h2>
        <div className="form-field"><label>{t('prof.currentPw')}</label><div className="form-field-control"><input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></div></div>
        <div className="form-field"><label>{t('prof.newPw')}</label><div className="form-field-control"><input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></div></div>
      </div><div className="form-actions"><button className="btn btn-primary" onClick={savePw}>{t('prof.updatePw')}</button></div></div>
    </div>
  );
}
