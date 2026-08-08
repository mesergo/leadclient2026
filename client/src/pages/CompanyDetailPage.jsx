import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { api } from '../api';
import * as Icons from '../icons';

// Company profile hub — mirrors the legacy company profile screen.
export default function CompanyDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { t } = useLang();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.company(id, token).then((d) => setC(d.company)).catch((e) => setError(e.message)); }, [id, token]);

  if (error) return <p className="error">{error}</p>;
  if (!c) return <p className="muted">{t('common.loading')}</p>;

  const sections = [
    { to: `/companies/${id}/edit`, Icon: Icons.Pencil, color: '#e8710a', title: t('cop.company'), desc: t('cop.companyDesc') },
    { to: `/companies?agency=${c.agency_id || ''}`, Icon: Icons.Chart, color: '#00838f', title: t('cop.channels'), desc: t('cop.channelsDesc') },
    { to: `/users?company=${id}`, Icon: Icons.Users, color: '#e91e63', title: t('cop.users'), desc: t('cop.usersDesc') },
    { to: `/companies/${id}/statuses`, Icon: Icons.Grid, color: '#16a34a', title: t('cop.statuses'), desc: t('cop.statusesDesc') },
    { to: `/companies/${id}/tags`, Icon: Icons.Contacts, color: '#337ab7', title: t('cop.tags'), desc: t('cop.tagsDesc') },
    { to: `/companies/${id}/messages`, Icon: Icons.Inbox, color: '#e8710a', title: t('cop.messages'), desc: t('cop.messagesDesc') },
    { to: `/companies/${id}/files`, Icon: Icons.Upload, color: '#8bc34a', title: t('cop.files'), desc: t('cop.filesDesc') },
  ];

  return (
    <div>
      <div className="page-header"><h1>{t('cop.title')}: {c.name}</h1><Link className="btn btn-secondary" to="/companies">{t('common.back')}</Link></div>
      <div className="hub-list">
        {sections.map((s) => (
          <Link key={s.to} to={s.to} className="hub-row">
            <span className="hub-icon" style={{ color: s.color }}><s.Icon size={22} /></span>
            <span className="hub-text"><span className="hub-title" style={{ color: s.color }}>{s.title}</span><span className="hub-desc">{s.desc}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
