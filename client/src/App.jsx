import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AgenciesPage from './pages/AgenciesPage';
import CompaniesPage from './pages/CompaniesPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import ContactsPage from './pages/ContactsPage';
import UsersPage from './pages/UsersPage';
import ImportPage from './pages/ImportPage';
import VirtualPage from './pages/VirtualPage';
import ReportsPage from './pages/ReportsPage';
import BillingPage from './pages/BillingPage';
import LanguagePage from './pages/LanguagePage';
import ProfilePage from './pages/ProfilePage';
import DevelopersPage from './pages/DevelopersPage';
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
        <Route path="/companies" element={<Role roles={['super_admin', 'agency_admin']}><CompaniesPage /></Role>} />
        <Route path="/companies/:id" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><CompanyDetailPage /></Role>} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/virtual" element={<VirtualPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/users" element={<Role roles={['super_admin', 'agency_admin', 'company_admin']}><UsersPage /></Role>} />
        <Route path="/billing" element={<Role roles={['super_admin', 'agency_admin']}><BillingPage /></Role>} />
        <Route path="/language" element={<Role roles={['super_admin']}><LanguagePage /></Role>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/developers" element={<DevelopersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (<BrowserRouter><LangProvider><AuthProvider><Routing /></AuthProvider></LangProvider></BrowserRouter>);
}
