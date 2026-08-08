const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שגיאה בתקשורת עם השרת');
  return data;
}

async function uploadForm(path, field, file, extra, token) {
  const fd = new FormData();
  fd.append(field, file);
  Object.entries(extra || {}).forEach(([k, v]) => fd.append(k, v));
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שגיאה בהעלאת הקובץ');
  return data;
}

const qs = (p) => {
  const e = Object.entries(p || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return e.length ? '?' + new URLSearchParams(e).toString() : '';
};

export const API_ORIGIN = API_URL;
export const api = {
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: (token) => request('/api/auth/me', { token }),

  agencies: (token, filters) => request(`/api/agencies${qs(typeof filters === 'string' ? { q: filters } : filters)}`, { token }),
  createAgency: (name, token) => request('/api/agencies', { method: 'POST', body: { name }, token }),
  updateAgency: (id, body, token) => request(`/api/agencies/${id}`, { method: 'PATCH', body, token }),
  agency: (id, token) => request(`/api/agencies/${id}`, { token }),
  uploadAgencyLogo: (id, file, token) => uploadForm(`/api/agencies/${id}/logo`, 'logo', file, {}, token),

  companies: (token) => request('/api/companies', { token }),
  company: (id, token) => request(`/api/companies/${id}`, { token }),
  createCompany: (body, token) => request('/api/companies', { method: 'POST', body, token }),
  updateCompany: (id, body, token) => request(`/api/companies/${id}`, { method: 'PATCH', body, token }),
  impersonateCompany: (id, token) => request(`/api/companies/${id}/impersonate`, { method: 'POST', token }),

  importLeads: (body, token) => request('/api/import', { method: 'POST', body, token }),
  services: (token, companyId) => request(`/api/services${qs({ company_id: companyId })}`, { token }),
  createService: (body, token) => request('/api/services', { method: 'POST', body, token }),
  updateService: (id, body, token) => request(`/api/services/${id}`, { method: 'PATCH', body, token }),
  deleteService: (id, token) => request(`/api/services/${id}`, { method: 'DELETE', token }),
  users: (token, f) => request(`/api/users${qs(f)}`, { token }),
  createUser: (body, token) => request('/api/users', { method: 'POST', body, token }),
  updateUser: (id, body, token) => request(`/api/users/${id}`, { method: 'PATCH', body, token }),

  statuses: (token, companyId) => request(`/api/statuses${qs({ company_id: companyId })}`, { token }),
  createStatus: (body, token) => request('/api/statuses', { method: 'POST', body, token }),
  updateStatus: (id, body, token) => request(`/api/statuses/${id}`, { method: 'PATCH', body, token }),
  deleteStatus: (id, token) => request(`/api/statuses/${id}`, { method: 'DELETE', token }),
  createTag: (body, token) => request('/api/tags', { method: 'POST', body, token }),
  companyFiles: (companyId, token) => request(`/api/files${qs({ company_id: companyId })}`, { token }),
  uploadCompanyFile: (companyId, file, token) => uploadForm('/api/files', 'file', file, { company_id: companyId }, token),
  deleteCompanyFile: (id, token) => request(`/api/files/${id}`, { method: 'DELETE', token }),
  tags: (token, companyId) => request(`/api/tags${qs({ company_id: companyId })}`, { token }),

  leads: (token, f) => request(`/api/leads${qs(f)}`, { token }),
  lead: (id, token) => request(`/api/leads/${id}`, { token }),
  updateLead: (id, body, token) => request(`/api/leads/${id}`, { method: 'PATCH', body, token }),
  addNote: (id, body, token) => request(`/api/leads/${id}/notes`, { method: 'POST', body, token }),
  addTreatment: (id, body, token) => request(`/api/leads/${id}/treatment`, { method: 'POST', body, token }),
  sendLeadMessage: (id, body, token) => request(`/api/leads/${id}/message`, { method: 'POST', body, token }),
  addLeadReminder: (id, body, token) => request(`/api/leads/${id}/reminders`, { method: 'POST', body, token }),
  addLeadTag: (id, tagId, token) => request(`/api/leads/${id}/tags`, { method: 'POST', body: { tag_id: tagId }, token }),
  removeLeadTag: (id, tagId, token) => request(`/api/leads/${id}/tags/${tagId}`, { method: 'DELETE', token }),

  contacts: (token, f) => request(`/api/contacts${qs(f)}`, { token }),
  contact: (id, token) => request(`/api/contacts/${id}`, { token }),
  reminders: (token) => request('/api/reminders', { token }),
  templates: (token, agencyId) => request(`/api/templates${qs({ agency_id: agencyId })}`, { token }),
  createTemplate: (body, token) => request('/api/templates', { method: 'POST', body, token }),
  deleteTemplate: (id, token) => request(`/api/templates/${id}`, { method: 'DELETE', token }),

  dashboardSummary: (token, filters) => request(`/api/dashboard/summary${qs(filters)}`, { token }),
  dashboardByAgency: (token, filters) => request(`/api/dashboard/by-agency${qs(filters)}`, { token }),
  dashboardOnline: (token) => request('/api/dashboard/online-users', { token }),
  dashboardRecent: (token) => request('/api/dashboard/recent', { token }),
  dashboardActions: (token, filters) => request(`/api/dashboard/actions${qs(filters)}`, { token }),
  reports: (token, f) => request(`/api/reports${qs(f)}`, { token }),
  billing: (token, month) => request(`/api/billing${qs({ month })}`, { token }),
  virtual: (token) => request('/api/virtual', { token }),
  notifications: (token) => request('/api/notifications', { token }),
  languages: (token) => request('/api/language', { token }),
  updateProfile: (body, token) => request('/api/profile', { method: 'PATCH', body, token }),
  updatePassword: (body, token) => request('/api/profile/password', { method: 'PATCH', body, token }),
};
