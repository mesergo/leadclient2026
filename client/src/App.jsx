import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
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
import DevelopersPage from './pages/DevelopersPage';
import ActionsPage from './pages/ActionsPage';
import './App.css';

function Protected() {
  const { token, loading } = useAuth();
  if (loading) return <div className="loading-screen">טוען...</div>;
  if (!token) return <Navigate to="/login" replace />;
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
      <Route element={<Protected />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agencies" element={<Role roles={['super_admin']}><AgenciesPage /></Role>} />
        <Route path="/agencies/:id" element={<Role roles={["super_admin","agency_admin"]}><AgencyEditPage /></Role>} />
        <Route path="/companies" element={<Role roles={['super_admin', 'agency_admin']}><CompaniesPage /></Role>} />
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
        <Route path="/virtual" element={<VirtualPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/users" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><UsersPage /></Role>} />
        <Route path="/users/:id/edit" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><UserEditPage /></Role>} />
        <Route path="/billing" element={<Role roles={['super_admin', 'agency_admin']}><BillingPage /></Role>} />
        <Route path="/language" element={<Role roles={['super_admin', 'agency_admin']}><LanguagePage /></Role>} />
        <Route path="/language/:slug" element={<Role roles={['super_admin', 'agency_admin']}><LanguageEditPage /></Role>} />
        <Route path="/profile" element={<ProfilePage />} />
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
