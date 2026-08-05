import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function ProfilePage() {
  const { token, user } = useAuth();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [pw, setPw] = useState({ current_password: '', new_password: '' });

  async function savePw(e) { e.preventDefault(); setMsg(''); setError('');
    try { await api.updatePassword(pw, token); setMsg('הסיסמה עודכנה.'); setPw({ current_password: '', new_password: '' }); }
    catch (e) { setError(e.message); } }

  return (
    <div>
      <div className="page-header"><h1>פרופיל</h1></div>
      {msg && <p className="success-note">{msg}</p>}
      {error && <p className="error">{error}</p>}
      <div className="panel"><h2>פרטים</h2>
        <div className="form-field"><label>שם</label><div>{user?.name}</div></div>
        <div className="form-field"><label>תפקיד</label><div>{user?.role}</div></div>
      </div>
      <div className="form-panel"><div className="form-panel-body"><h2>שינוי סיסמה</h2>
        <div className="form-field"><label>סיסמה נוכחית</label><div className="form-field-control"><input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></div></div>
        <div className="form-field"><label>סיסמה חדשה</label><div className="form-field-control"><input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></div></div>
      </div><div className="form-actions"><button className="btn btn-primary" onClick={savePw}>עדכון סיסמה</button></div></div>
    </div>
  );
}
