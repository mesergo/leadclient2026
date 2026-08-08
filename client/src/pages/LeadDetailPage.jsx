import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import LeadCard from '../components/LeadCard';

export default function LeadDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t } = useLang();
  return (
    <div>
      <div className="page-header"><h1>{t('nav.leads')}</h1><button className="btn btn-secondary" onClick={() => nav('/leads')}>{t('common.back')}</button></div>
      <div className="panel"><LeadCard id={id} /></div>
    </div>
  );
}
