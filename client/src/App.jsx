import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import { api } from './api';
import Layout from './components/Layout';
import BillingSetupPage from './pages/BillingSetupPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import InvitePage from './pages/InvitePage';
import DashboardPage from './pages/DashboardPage';
import AgenciesPage from './pages/AgenciesPage';
import AgencyEditPage from './pages/AgencyEditPage';
import CompaniesPage from './pages/CompaniesPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import CompanyEditPage from './pages/CompanyEditPage';
import EditServicePage from './pages/EditServicePage';
import AddServicePage from './pages/AddServicePage';
import CompanyStatusesPage from './pages/CompanyStatusesPage';
import CompanyTagsPage from './pages/CompanyTagsPage';
import CompanyFilesPage from './pages/CompanyFilesPage';
import CompanyMessagesPage from './pages/CompanyMessagesPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import ContactsPage from './pages/ContactsPage';
import ContactDetailPage from './pages/ContactDetailPage';
import UsersPage from './pages/UsersPage';
import UserEditPage from './pages/UserEditPage';
import ImportPage from './pages/ImportPage';
import VirtualPage from './pages/VirtualPage';
import ReportsPage from './pages/ReportsPage';
import BillingPage from './pages/BillingPage';
import LanguagePage from './pages/LanguagePage';
import LanguageEditPage from './pages/LanguageEditPage';
import ProfilePage from './pages/ProfilePage';
import VerifyPhonePage from './pages/VerifyPhonePage';
import PackagesPage from './pages/PackagesPage';
import DevelopersPage from './pages/DevelopersPage';
import ImportLivePage from './pages/ImportLivePage';
import WebhookLogPage from './pages/WebhookLogPage';
import ActionsPage from './pages/ActionsPage';
import './App.css';

function Protected() {
  const { token, user, loading, impersonatorName } = useAuth();
  if (loading) return <div className="loading-screen">טוען...</div>;
  if (!token) return <Navigate to="/login" replace />;
  if (!user) return <div className="loading-screen">טוען...</div>; // /me still resolving
  // mandatory phone verification before entering (unless disabled server-side, or impersonating)
  if (user.phone_verify_required !== false && !user.phone_verified_at && !impersonatorName) return <VerifyPhonePage />;
  return <BillingGate />;
}
// Mandatory billing setup for self-registered companies (standing order via iCount)
// before entering. Fails open: if the status can't be read, let them in.
function BillingGate() {
  const { token, user, impersonatorName } = useAuth();
  const companyRole = user.role === 'company_admin' || user.role === 'company_user';
  const [st, setSt] = useState(undefined);
  const load = () => api.subscription(token).then(setSt).catch(() => setSt(null));
  useEffect(() => {
    if (companyRole && !impersonatorName) load(); else setSt(null);
  }, [token, user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (st === undefined) return <div className="loading-screen">טוען...</div>;
  if (st && st.required) return <BillingSetupPage state={st} onDone={load} />;
  return <Layout />;
}
function Role({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user?.role) ? children : <Navigate to="/" replace />;
}

function Routing() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/:token" element={<RegisterPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<Protected />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agencies" element={<Role roles={['super_admin']}><AgenciesPage /></Role>} />
        <Route path="/agencies/:id" element={<Role roles={["super_admin","agency_admin"]}><AgencyEditPage /></Role>} />
        <Route path="/companies" element={<Role roles={['super_admin', 'agency_admin', 'company_admin', 'sales_manager']}><CompaniesPage /></Role>} />
        <Route path="/companies/edit-service" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><EditServicePage /></Role>} />
        <Route path="/companies/add-service" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><AddServicePage /></Role>} />
        <Route path="/companies/:id" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><CompanyDetailPage /></Role>} />
        <Route path="/companies/:id/edit" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><CompanyEditPage /></Role>} />
        <Route path="/companies/:id/statuses" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><CompanyStatusesPage /></Role>} />
        <Route path="/companies/:id/tags" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><CompanyTagsPage /></Role>} />
        <Route path="/companies/:id/messages" element={<Role roles={["super_admin","agency_admin","company_admin"]}><CompanyMessagesPage /></Role>} />
        <Route path="/companies/:id/files" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><CompanyFilesPage /></Role>} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/virtual" element={<Role roles={['super_admin', 'agency_admin']}><VirtualPage /></Role>} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/users" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><UsersPage /></Role>} />
        <Route path="/users/:id/edit" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><UserEditPage /></Role>} />
        <Route path="/billing" element={<Role roles={['super_admin', 'agency_admin']}><BillingPage /></Role>} />
        <Route path="/packages" element={<Role roles={['super_admin']}><PackagesPage /></Role>} />
        <Route path="/language" element={<Role roles={['super_admin', 'agency_admin']}><LanguagePage /></Role>} />
        <Route path="/language/:slug" element={<Role roles={['super_admin', 'agency_admin']}><LanguageEditPage /></Role>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/import-live" element={<Role roles={['super_admin']}><ImportLivePage /></Role>} />
        <Route path="/webhook-log" element={<Role roles={['super_admin', 'agency_admin']}><WebhookLogPage /></Role>} />
        <Route path="/developers" element={<DevelopersPage />} />
        <Route path="/actions" element={<ActionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (<BrowserRouter><LangProvider><AuthProvider><Routing /></AuthProvider></LangProvider></BrowserRouter>);
}
