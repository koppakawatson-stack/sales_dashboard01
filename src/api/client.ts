import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer JWT token if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('harvik_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // If unauthorized, clear token and notify session expiration (unless on login page)
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('harvik_auth_token');
        localStorage.removeItem('harvik_auth_user');
        window.dispatchEvent(new Event('harvik_auth_logout'));
      }
    }

    const errorPayload = err.response?.data?.error;
    const msg = (typeof errorPayload === 'object' ? errorPayload?.message : errorPayload)
      || err.response?.data?.message
      || err.message
      || 'An error occurred';
    const error: any = new Error(msg);
    error.response = err.response;
    error.code = typeof errorPayload === 'object' ? errorPayload?.code : undefined;
    error.data = err.response?.data?.data;
    return Promise.reject(error);
  }
);

export default api;

// ── Authentication & User Profile ──
export const loginApi = (data: { email: string; password: string }) => api.post('/auth/login', data).then(r => r.data);
export const getMeApi = () => api.get('/auth/me').then(r => r.data);
export const logoutApi = () => api.post('/auth/logout').then(r => r.data);

// ── Dashboard ──

export const getDashboardOverview = () => api.get('/dashboard/overview').then(r => r.data);
export const getSalespersonPerformance = () => api.get('/dashboard/salesperson-performance').then(r => r.data);
export const getRecentActivities = () => api.get('/dashboard/recent-activities').then(r => r.data);
export const getUpcomingFollowUps = () => api.get('/dashboard/upcoming-followups').then(r => r.data);

// ── Leads ──
export const getLeads = (params?: object) => api.get('/leads', { params }).then(r => r.data);
export const getLead = (id: string) => api.get(`/leads/${id}`).then(r => r.data);
export const createLead = (data: object) => api.post('/leads', data).then(r => r.data);
export const updateLead = (id: string, data: object) => api.patch(`/leads/${id}`, data).then(r => r.data);
export const changeLeadStatus = (id: string, data: { status: string; reason?: string; [key: string]: any }) => api.patch(`/leads/${id}/status`, data).then(r => r.data);
export const assignLead = (id: string, data: { salespersonId: string; reason?: string }) => api.patch(`/leads/${id}/assignment`, data).then(r => r.data);
export const archiveLead = (id: string) => api.patch(`/leads/${id}/archive`).then(r => r.data);
export const deleteLead = (id: string) => api.delete(`/leads/${id}`).then(r => r.data);
export const getLeadStats = (params?: object) => api.get('/leads/stats', { params }).then(r => r.data);
export const getLeadActivities = (id: string) => api.get(`/leads/${id}/activities`).then(r => r.data);

// ── Customers ──
export const getCustomers = (params?: object) => api.get('/customers', { params }).then(r => r.data);
export const getCustomer = (id: string) => api.get(`/customers/${id}`).then(r => r.data);
export const createCustomer = (data: object) => api.post('/customers', data).then(r => r.data);
export const updateCustomer = (id: string, data: object) => api.patch(`/customers/${id}`, data).then(r => r.data);
export const deleteCustomer = (id: string) => api.delete(`/customers/${id}`).then(r => r.data);
export const assignCustomer = (id: string, data: { salespersonId: string; reason?: string }) => api.patch(`/customers/${id}/assignment`, data).then(r => r.data);
export const archiveCustomer = (id: string) => api.patch(`/customers/${id}/archive`).then(r => r.data);
export const getCustomerStats = () => api.get('/customers/stats').then(r => r.data);
export const getCustomerActivities = (id: string) => api.get(`/customers/${id}/activities`).then(r => r.data);

// ── Deals ──
export const getDeals = (params?: object) => api.get('/deals', { params }).then(r => r.data);
export const getDeal = (id: string) => api.get(`/deals/${id}`).then(r => r.data);
export const createDeal = (data: object) => api.post('/deals', data).then(r => r.data);
export const updateDeal = (id: string, data: object) => api.patch(`/deals/${id}`, data).then(r => r.data);
export const changeDealStage = (id: string, data: { stage: string; lostReason?: string; actualClosingDate?: string }) => api.patch(`/deals/${id}/stage`, data).then(r => r.data);
export const assignDeal = (id: string, data: { salespersonId: string; reason?: string }) => api.patch(`/deals/${id}/assignment`, data).then(r => r.data);
export const deleteDeal = (id: string) => api.delete(`/deals/${id}`).then(r => r.data);
export const getPipelineSummary = () => api.get('/deals/pipeline/summary').then(r => r.data);
export const getDealStats = () => api.get('/deals/stats').then(r => r.data);

// ── Activities ──
export const getActivities = (params?: object) => api.get('/activities', { params }).then(r => r.data);
export const createActivity = (data: object) => api.post('/activities', data).then(r => r.data);
export const updateActivity = (id: string, data: object) => api.put(`/activities/${id}`, data).then(r => r.data);
export const deleteActivity = (id: string) => api.delete(`/activities/${id}`).then(r => r.data);
export const getActivityStats = () => api.get('/activities/stats').then(r => r.data);

// ── Revenue ──
export const getRevenue = (params?: object) => api.get('/revenue', { params }).then(r => r.data);
export const createRevenue = (data: object) => api.post('/revenue', data).then(r => r.data);
export const updateRevenue = (id: string, data: object) => api.put(`/revenue/${id}`, data).then(r => r.data);
export const deleteRevenue = (id: string) => api.delete(`/revenue/${id}`).then(r => r.data);
export const getRevenueTrend = () => api.get('/revenue/trend').then(r => r.data);
export const getRevenueBySalesperson = () => api.get('/revenue/by-salesperson').then(r => r.data);
export const getRevenueByCustomer = () => api.get('/revenue/by-customer').then(r => r.data);
export const getRevenueByProduct = () => api.get('/revenue/by-product').then(r => r.data);
export const getRevenueAnalytics = () => api.get('/revenue/analytics').then(r => r.data);

// ── Salespersons ──
export const getSalespersons = () => api.get('/salespersons').then(r => r.data);
export const createSalesperson = (data: object) => api.post('/salespersons', data).then(r => r.data);
export const updateSalesperson = (id: string, data: object) => api.put(`/salespersons/${id}`, data).then(r => r.data);
export const getTargets = (params?: object) => api.get('/salespersons/targets', { params }).then(r => r.data);
export const createTarget = (data: object) => api.post('/salespersons/targets', data).then(r => r.data);
export const updateTarget = (id: string, data: object) => api.put(`/salespersons/targets/${id}`, data).then(r => r.data);
