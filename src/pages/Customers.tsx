import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit2, Trash2, Eye, Building2, Mail, Phone,
  Users, FileText, TrendingUp, UserCheck, Clock, Tag, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import {
  getCustomers, createCustomer, updateCustomer,
  deleteCustomer, assignCustomer, archiveCustomer, getCustomerStats,
  getCustomerActivities, getSalespersons
} from '../api/client';
import { formatCurrency, formatDate, getInitials, truncate, daysUntil } from '../utils/helpers';

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Manufacturing',
  'Retail', 'Education', 'Real Estate', 'Media',
  'Transportation', 'Energy', 'Other'
];

const STATUSES = ['Active', 'Inactive', 'Prospect', 'Churned'];
const CONTRACT_STATUSES = ['Active', 'Pending Renewal', 'Expired', 'Terminated'];

interface ContactPersonItem {
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

const emptyContact: ContactPersonItem = {
  name: '',
  title: '',
  email: '',
  phone: '',
  isPrimary: false,
};

const emptyCustomer = {
  companyName: '',
  email: '',
  phone: '',
  industry: 'Technology',
  status: 'Active',
  assignedSalesperson: '',
  website: '',
  notes: '',
  // Address
  'address.street': '',
  'address.city': '',
  'address.state': '',
  'address.country': 'India',
  'address.pincode': '',
  // Contacts
  contactPersons: [{ name: '', title: '', email: '', phone: '', isPrimary: true }] as ContactPersonItem[],
  // Products / Services
  productsPurchasedStr: '',
  // Revenue
  totalRevenue: 0,
  // Contract Information
  'contractInfo.contractNumber': '',
  'contractInfo.value': 0,
  'contractInfo.startDate': '',
  'contractInfo.endDate': '',
  'contractInfo.renewalDate': '',
  'contractInfo.status': 'Active',
  'contractInfo.terms': '',
};

const Customers: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyCustomer });
  const [viewCustomer, setViewCustomer] = useState<any>(null);

  // Salesperson Reassignment in View Modal
  const [reassignSalespersonId, setReassignSalespersonId] = useState('');

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, status: statusFilter, industry: industryFilter, page }],
    queryFn: () => getCustomers({ search, status: statusFilter, industry: industryFilter, page, limit: 15 }),
  });

  const { data: customerStats } = useQuery({
    queryKey: ['customerStats'],
    queryFn: () => getCustomerStats(),
  });

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons'],
    queryFn: getSalespersons,
  });

  const { data: customerActivities = [] } = useQuery({
    queryKey: ['customerActivities', viewCustomer?._id || viewCustomer?.customerId],
    queryFn: () => getCustomerActivities(viewCustomer?.customerId || viewCustomer?._id),
    enabled: !!viewCustomer,
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (d: any) => createCustomer(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerStats'] });
      toast.success('Customer created successfully!', { className: 'toast-custom' });
      setShowModal(false);
      setForm({ ...emptyCustomer });
    },
    onError: (e: any) => {
      if (e.code === 'POSSIBLE_DUPLICATE_CUSTOMER') {
        const existingId = e.data?.existingCustomerId || 'an existing account';
        if (window.confirm(`Possible duplicate customer detected (${existingId}). Would you like to create anyway?`)) {
          const payload = buildPayload(form, true);
          createMutation.mutate(payload);
          return;
        }
      }
      toast.error(e.message, { className: 'toast-custom' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: any) => updateCustomer(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerStats'] });
      toast.success('Customer updated successfully!', { className: 'toast-custom' });
      setShowModal(false);
      setEditCustomer(null);
    },
    onError: (e: any) => {
      if (e.code === 'CUSTOMER_VERSION_CONFLICT') {
        toast.error('Record was modified by another user. Refreshing latest data...', { className: 'toast-custom' });
        qc.invalidateQueries({ queryKey: ['customers'] });
        setShowModal(false);
        return;
      }
      toast.error(e.message, { className: 'toast-custom' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, salespersonId }: any) => assignCustomer(id, { salespersonId, reason: 'Account reassignment via portal' }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerStats'] });
      qc.invalidateQueries({ queryKey: ['customerActivities'] });
      toast.success('Salesperson reassigned successfully!', { className: 'toast-custom' });
      if (res.data) setViewCustomer(res.data);
      setReassignSalespersonId('');
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCustomer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerStats'] });
      toast.success('Customer archived', { className: 'toast-custom' });
      setViewCustomer(null);
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerStats'] });
      toast.success('Customer deleted', { className: 'toast-custom' });
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  // ── Form Helpers ──
  const fc = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const updateContact = (index: number, field: keyof ContactPersonItem, val: any) => {
    setForm(f => {
      const updated = [...f.contactPersons];
      if (field === 'isPrimary' && val === true) {
        updated.forEach((cp, i) => { cp.isPrimary = i === index; });
      } else {
        updated[index] = { ...updated[index], [field]: val };
      }
      return { ...f, contactPersons: updated };
    });
  };

  const addContactRow = () => {
    setForm(f => ({
      ...f,
      contactPersons: [...f.contactPersons, { ...emptyContact, isPrimary: f.contactPersons.length === 0 }],
    }));
  };

  const removeContactRow = (index: number) => {
    setForm(f => {
      if (f.contactPersons.length <= 1) return f;
      const updated = f.contactPersons.filter((_, i) => i !== index);
      if (!updated.some(cp => cp.isPrimary) && updated.length > 0) {
        updated[0].isPrimary = true;
      }
      return { ...f, contactPersons: updated };
    });
  };

  const buildPayload = (f: typeof form, allowDuplicate = false) => {
    const products = f.productsPurchasedStr
      ? f.productsPurchasedStr.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const validContacts = f.contactPersons
      .filter(cp => cp.name.trim().length > 0)
      .map((cp, idx) => ({
        name: cp.name.trim(),
        title: cp.title.trim() || undefined,
        email: cp.email.trim() || undefined,
        phone: cp.phone.trim() || undefined,
        isPrimary: f.contactPersons.length === 1 ? true : (cp.isPrimary || idx === 0),
      }));

    const payload: any = {
      companyName: f.companyName.trim(),
      email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined,
      industry: f.industry,
      status: f.status,
      website: f.website.trim() || undefined,
      notes: f.notes.trim() || undefined,
      assignedSalesperson: f.assignedSalesperson || undefined,
      address: {
        street: f['address.street'].trim() || undefined,
        city: f['address.city'].trim() || undefined,
        state: f['address.state'].trim() || undefined,
        country: f['address.country'].trim() || 'India',
        pincode: f['address.pincode'].trim() || undefined,
      },
      contactPersons: validContacts,
      productsPurchased: products,
      totalRevenue: Number(f.totalRevenue) || 0,
      allowDuplicate,
    };

    if (f['contractInfo.contractNumber'] || f['contractInfo.value'] || f['contractInfo.startDate'] || f['contractInfo.endDate']) {
      payload.contractInfo = {
        contractNumber: f['contractInfo.contractNumber'].trim() || undefined,
        value: Number(f['contractInfo.value']) || 0,
        startDate: f['contractInfo.startDate'] || undefined,
        endDate: f['contractInfo.endDate'] || undefined,
        renewalDate: f['contractInfo.renewalDate'] || undefined,
        status: f['contractInfo.status'] || 'Active',
        terms: f['contractInfo.terms'].trim() || undefined,
      };
    }

    return payload;
  };

  const handleSubmit = () => {
    if (!form.companyName.trim()) {
      toast.error('Company name is required', { className: 'toast-custom' });
      return;
    }
    const payload = buildPayload(form);
    if (editCustomer) {
      payload.version = editCustomer.version;
      updateMutation.mutate({ id: editCustomer.customerId || editCustomer._id, d: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (c: any) => {
    setEditCustomer(c);
    const contacts: ContactPersonItem[] = (c.contactPersons && c.contactPersons.length > 0)
      ? c.contactPersons.map((cp: any) => ({
          name: cp.name || '',
          title: cp.title || '',
          email: cp.email || '',
          phone: cp.phone || '',
          isPrimary: !!cp.isPrimary,
        }))
      : [{ name: '', title: '', email: '', phone: '', isPrimary: true }];

    setForm({
      companyName: c.companyName || '',
      email: c.email || '',
      phone: c.phone || '',
      industry: c.industry || 'Technology',
      status: c.status || 'Active',
      assignedSalesperson: c.assignedSalesperson?._id || c.assignedSalesperson || '',
      website: c.website || '',
      notes: c.notes || '',
      'address.street': c.address?.street || '',
      'address.city': c.address?.city || '',
      'address.state': c.address?.state || '',
      'address.country': c.address?.country || 'India',
      'address.pincode': c.address?.pincode || '',
      contactPersons: contacts,
      productsPurchasedStr: c.productsPurchased ? c.productsPurchased.join(', ') : '',
      totalRevenue: c.totalRevenue ?? 0,
      'contractInfo.contractNumber': c.contractInfo?.contractNumber || '',
      'contractInfo.value': c.contractInfo?.value ?? 0,
      'contractInfo.startDate': c.contractInfo?.startDate ? c.contractInfo.startDate.slice(0, 10) : '',
      'contractInfo.endDate': c.contractInfo?.endDate ? c.contractInfo.endDate.slice(0, 10) : '',
      'contractInfo.renewalDate': c.contractInfo?.renewalDate ? c.contractInfo.renewalDate.slice(0, 10) : '',
      'contractInfo.status': c.contractInfo?.status || 'Active',
      'contractInfo.terms': c.contractInfo?.terms || '',
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditCustomer(null);
    setForm({ ...emptyCustomer });
    setShowModal(true);
  };

  const customers = data?.customers || [];
  const totalPages = data?.pages || 1;
  const stats = customerStats?.data || {};

  // Helper for contract renewal status badge
  const renderContractBadge = (c: any) => {
    const ci = c.contractInfo;
    if (!ci || !ci.contractNumber) {
      return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No contract</span>;
    }
    const isExpired = ci.endDate && new Date(ci.endDate).getTime() < Date.now();
    const days = ci.renewalDate ? daysUntil(ci.renewalDate) : (ci.endDate ? daysUntil(ci.endDate) : null);
    const isDueSoon = days !== null && days >= 0 && days <= 30;

    return (
      <div>
        <div style={{ fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <FileText size={12} color="var(--brand-400)" />
          {ci.contractNumber}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--accent-emerald)', fontWeight: 600 }}>
            {formatCurrency(ci.value, true)}
          </span>
          {isExpired ? (
            <span className="badge lost" style={{ fontSize: 9, padding: '1px 5px' }}>Expired</span>
          ) : isDueSoon ? (
            <span className="badge" style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              Due in {days}d
            </span>
          ) : (
            <span className="badge active" style={{ fontSize: 9, padding: '1px 5px' }}>{ci.status || 'Active'}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="main-content">
      <Topbar
        title="Customer Management"
        subtitle={`${data?.total || 0} total accounts · ${stats.activeCustomers || 0} active · ${formatCurrency(stats.totalRevenue || 0, true)} total revenue`}
      />

      <main className="page-content fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Customers</h1>
            <div className="page-header-subtitle">
              Manage complete customer profiles, contacts, contracts, and revenue lifecycle
            </div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={openCreate} id="add-customer-btn">
              <Plus size={15} /> Add Customer
            </button>
          </div>
        </div>

        {/* Portfolio KPI Summary Grid */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-accent': 'var(--brand-500)', '--kpi-bg': 'rgba(99, 102, 241, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--brand-400)' }}>
              <Building2 size={18} />
            </div>
            <div className="kpi-label">Total Accounts</div>
            <div className="kpi-value">{stats.totalCustomers ?? (data?.total || 0)}</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              {stats.activeCustomers || 0} Active · {stats.prospectCustomers || 0} Prospects
            </div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': 'var(--accent-emerald)', '--kpi-bg': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)' }}>
              <TrendingUp size={18} />
            </div>
            <div className="kpi-label">Portfolio Revenue</div>
            <div className="kpi-value">{formatCurrency(stats.totalRevenue || 0, true)}</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              Active customer lifetime revenue
            </div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': 'var(--accent-cyan)', '--kpi-bg': 'rgba(6, 182, 212, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(6, 182, 212, 0.12)', color: 'var(--accent-cyan)' }}>
              <FileText size={18} />
            </div>
            <div className="kpi-label">Active Contract Value</div>
            <div className="kpi-value">{formatCurrency(stats.totalContractValue || 0, true)}</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              Signed enterprise contract commitments
            </div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': 'var(--accent-amber)', '--kpi-bg': 'rgba(245, 158, 11, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)' }}>
              <Clock size={18} />
            </div>
            <div className="kpi-label">Upcoming Renewals</div>
            <div className="kpi-value" style={{ color: (stats.upcomingRenewals > 0) ? 'var(--accent-amber)' : 'inherit' }}>
              {stats.upcomingRenewals || 0}
            </div>
            <div className={`kpi-change ${(stats.upcomingRenewals > 0) ? 'down' : 'up'}`} style={{ fontSize: 11 }}>
              {stats.upcomingRenewals || 0} expiring in next 30 days
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          <div className="search-input-bar">
            <Search size={14} />
            <input
              id="customer-search"
              placeholder="Search by ID, company, email, or phone..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            id="customer-status-filter"
            className="filter-select"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            id="customer-industry-filter"
            className="filter-select"
            value={industryFilter}
            onChange={e => { setIndustryFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Industries</option>
            {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>

        {/* Customers Table */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Company</th>
                <th>Contact Persons</th>
                <th>Industry</th>
                <th>Salesperson</th>
                <th>Status</th>
                <th>Total Revenue</th>
                <th>Contract Info</th>
                <th>Products / Services</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <Building2 size={36} />
                      <h3>No customers found</h3>
                      <p>Add a new customer account or adjust your search filters</p>
                    </div>
                  </td>
                </tr>
              ) : customers.map((c: any) => {
                const primary = c.contactPersons?.find((p: any) => p.isPrimary) || c.contactPersons?.[0];
                const totalContacts = c.contactPersons?.length || 0;

                return (
                  <tr key={c._id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--brand-300)' }}>
                        {c.customerId}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div className="avatar" style={{ background: 'linear-gradient(135deg, var(--accent-cyan), var(--brand-500))' }}>
                          {getInitials(c.companyName)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.companyName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {c.address?.city ? `${c.address.city}, ` : ''}{c.address?.country || 'India'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {primary ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {primary.name}
                            {totalContacts > 1 && (
                              <span className="badge" style={{ fontSize: 9, padding: '1px 5px', background: 'var(--bg-input)' }}>
                                +{totalContacts - 1} more
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {primary.title && <span>{primary.title} · </span>}
                            {primary.email && <span>{truncate(primary.email, 22)}</span>}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No contacts</span>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: 11 }}>
                        {c.industry}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {c.assignedSalesperson?.name ? (
                        <span style={{ fontWeight: 500 }}>{c.assignedSalesperson.name}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${c.status?.toLowerCase()}`}>{c.status}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                      {formatCurrency(c.totalRevenue || 0, true)}
                    </td>
                    <td>{renderContractBadge(c)}</td>
                    <td>
                      {c.productsPurchased && c.productsPurchased.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 170 }}>
                          {c.productsPurchased.slice(0, 2).map((p: string, idx: number) => (
                            <span key={idx} className="badge" style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--brand-300)' }}>
                              {p}
                            </span>
                          ))}
                          {c.productsPurchased.length > 2 && (
                            <span className="badge" style={{ fontSize: 9, padding: '1px 4px' }}>
                              +{c.productsPurchased.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setViewCustomer(c)}
                          id={`view-customer-${c._id}`}
                          title="View Customer Profile"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => openEdit(c)}
                          id={`edit-customer-${c._id}`}
                          title="Edit Customer"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          onClick={() => {
                            if (window.confirm(`Delete or archive customer record "${c.companyName}"?`)) {
                              deleteMutation.mutate(c.customerId || c._id);
                            }
                          }}
                          id={`delete-customer-${c._id}`}
                          title="Delete Customer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <div className="pagination">
              <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`pagination-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────
          ADD / EDIT CUSTOMER MODAL
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditCustomer(null); }}
        title={editCustomer ? `Edit Customer Profile — ${editCustomer.companyName} (${editCustomer.customerId})` : 'Add New Customer Profile'}
        size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            id="save-customer-btn"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editCustomer ? 'Update Customer' : 'Create Customer')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: Company Profile */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
              1. Company Profile
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Company Name *</label>
                <input
                  id="cust-company"
                  className="form-control"
                  value={form.companyName}
                  onChange={e => fc('companyName', e.target.value)}
                  placeholder="e.g. Reliance Tech Solutions"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Company Email</label>
                <input
                  id="cust-email"
                  className="form-control"
                  type="email"
                  value={form.email}
                  onChange={e => fc('email', e.target.value)}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  id="cust-phone"
                  className="form-control"
                  value={form.phone}
                  onChange={e => fc('phone', e.target.value)}
                  placeholder="+91 9876543210"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Website</label>
                <input
                  id="cust-website"
                  className="form-control"
                  value={form.website}
                  onChange={e => fc('website', e.target.value)}
                  placeholder="https://company.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Industry</label>
                <select
                  id="cust-industry"
                  className="form-control"
                  value={form.industry}
                  onChange={e => fc('industry', e.target.value)}
                >
                  {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Customer Status</label>
                <select
                  id="cust-status"
                  className="form-control"
                  value={form.status}
                  onChange={e => fc('status', e.target.value)}
                >
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Salesperson</label>
                <select
                  id="cust-sp"
                  className="form-control"
                  value={form.assignedSalesperson}
                  onChange={e => fc('assignedSalesperson', e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {salespersons.map((sp: any) => (
                    <option key={sp._id} value={sp._id}>{sp.name} ({sp.role || 'Sales'})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Total Revenue (₹)</label>
                <input
                  id="cust-total-revenue"
                  className="form-control"
                  type="number"
                  value={form.totalRevenue}
                  onChange={e => fc('totalRevenue', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Address Information */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
              2. Corporate Address
            </div>
            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Street Address</label>
                <input
                  id="cust-address-street"
                  className="form-control"
                  value={form['address.street']}
                  onChange={e => fc('address.street', e.target.value)}
                  placeholder="e.g. 104, Tech Park, Outer Ring Road"
                />
              </div>
              <div className="form-group">
                <label className="form-label">City</label>
                <input
                  id="cust-address-city"
                  className="form-control"
                  value={form['address.city']}
                  onChange={e => fc('address.city', e.target.value)}
                  placeholder="Bangalore"
                />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input
                  id="cust-address-state"
                  className="form-control"
                  value={form['address.state']}
                  onChange={e => fc('address.state', e.target.value)}
                  placeholder="Karnataka"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Pincode</label>
                <input
                  id="cust-address-pincode"
                  className="form-control"
                  value={form['address.pincode']}
                  onChange={e => fc('address.pincode', e.target.value)}
                  placeholder="560103"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Country</label>
                <input
                  id="cust-address-country"
                  className="form-control"
                  value={form['address.country']}
                  onChange={e => fc('address.country', e.target.value)}
                  placeholder="India"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Contact Persons */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                3. Contact Persons ({form.contactPersons.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addContactRow}
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                <Plus size={12} /> Add Contact
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {form.contactPersons.map((cp, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    border: cp.isPrimary ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>Contact #{idx + 1}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', color: cp.isPrimary ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                        <input
                          type="checkbox"
                          checked={cp.isPrimary}
                          onChange={e => updateContact(idx, 'isPrimary', e.target.checked)}
                        />
                        Primary Contact
                      </label>
                    </div>
                    {form.contactPersons.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => removeContactRow(idx)}
                        title="Remove contact"
                      >
                        <X size={13} color="var(--accent-rose)" />
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Full Name *</label>
                      <input
                        className="form-control"
                        value={cp.name}
                        onChange={e => updateContact(idx, 'name', e.target.value)}
                        placeholder="e.g. Priya Sharma"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Designation / Title</label>
                      <input
                        className="form-control"
                        value={cp.title}
                        onChange={e => updateContact(idx, 'title', e.target.value)}
                        placeholder="e.g. Head of Engineering"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Direct Email</label>
                      <input
                        className="form-control"
                        type="email"
                        value={cp.email}
                        onChange={e => updateContact(idx, 'email', e.target.value)}
                        placeholder="priya@company.com"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Direct Phone</label>
                      <input
                        className="form-control"
                        value={cp.phone}
                        onChange={e => updateContact(idx, 'phone', e.target.value)}
                        placeholder="+91 9988776655"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Products / Services Purchased */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
              4. Products & Services Purchased
            </div>
            <div className="form-group">
              <label className="form-label">Products / Services (Comma-separated)</label>
              <input
                id="cust-products"
                className="form-control"
                value={form.productsPurchasedStr}
                onChange={e => fc('productsPurchasedStr', e.target.value)}
                placeholder="Enterprise Cloud CRM, Data Migration, 24/7 Premium SLA"
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Enter product modules or service tiers separated by commas.
              </div>
            </div>
          </div>

          {/* Section 5: Contract Information */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
              5. Contract Information
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Contract Number</label>
                <input
                  id="cust-contract-no"
                  className="form-control"
                  value={form['contractInfo.contractNumber']}
                  onChange={e => fc('contractInfo.contractNumber', e.target.value)}
                  placeholder="e.g. HAR-CTR-2026-0042"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Contract Value (₹)</label>
                <input
                  id="cust-contract-val"
                  className="form-control"
                  type="number"
                  value={form['contractInfo.value']}
                  onChange={e => fc('contractInfo.value', e.target.value)}
                  placeholder="1500000"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  id="cust-contract-start"
                  className="form-control"
                  type="date"
                  value={form['contractInfo.startDate']}
                  onChange={e => fc('contractInfo.startDate', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  id="cust-contract-end"
                  className="form-control"
                  type="date"
                  value={form['contractInfo.endDate']}
                  onChange={e => fc('contractInfo.endDate', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Renewal Date</label>
                <input
                  id="cust-contract-renewal"
                  className="form-control"
                  type="date"
                  value={form['contractInfo.renewalDate']}
                  onChange={e => fc('contractInfo.renewalDate', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Contract Status</label>
                <select
                  id="cust-contract-status"
                  className="form-control"
                  value={form['contractInfo.status']}
                  onChange={e => fc('contractInfo.status', e.target.value)}
                >
                  {CONTRACT_STATUSES.map(cs => <option key={cs}>{cs}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Contract Terms & SLAs</label>
                <input
                  id="cust-contract-terms"
                  className="form-control"
                  value={form['contractInfo.terms']}
                  onChange={e => fc('contractInfo.terms', e.target.value)}
                  placeholder="Annual subscription, Net 30 payment terms, 99.9% SLA"
                />
              </div>
            </div>
          </div>

          {/* Section 6: Notes */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
              6. Account Notes
            </div>
            <div className="form-group">
              <textarea
                id="cust-notes"
                className="form-control"
                value={form.notes}
                onChange={e => fc('notes', e.target.value)}
                placeholder="Enterprise account background, key stakeholders, special requirements, history..."
                rows={3}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          CUSTOMER PROFILE DETAIL VIEW MODAL
          ───────────────────────────────────────────────────────────── */}
      {viewCustomer && (
        <Modal
          isOpen={!!viewCustomer}
          onClose={() => setViewCustomer(null)}
          title={`Customer Profile — ${viewCustomer.companyName}`}
          size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setViewCustomer(null)}>Close</button>
            <button
              className="btn btn-danger"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              disabled={archiveMutation.isPending}
              onClick={() => {
                if (window.confirm(`Archive customer account "${viewCustomer.companyName}"?`)) {
                  archiveMutation.mutate(viewCustomer.customerId || viewCustomer._id);
                }
              }}
            >
              <Trash2 size={13} /> {archiveMutation.isPending ? 'Archiving...' : 'Archive Customer'}
            </button>
            <button
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                const c = viewCustomer;
                setViewCustomer(null);
                openEdit(c);
              }}
            >
              <Edit2 size={14} /> Edit Customer
            </button>
          </>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header Badge Strip */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  className="avatar"
                  style={{
                    width: 44,
                    height: 44,
                    fontSize: 16,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, var(--brand-500), var(--accent-cyan))',
                  }}
                >
                  {getInitials(viewCustomer.companyName)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{viewCustomer.companyName}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--brand-300)', borderRadius: 4 }}>
                      {viewCustomer.customerId}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {viewCustomer.industry} · {viewCustomer.address?.city || 'India'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${viewCustomer.status?.toLowerCase()}`} style={{ fontSize: 12, padding: '4px 10px' }}>
                  {viewCustomer.status}
                </span>
              </div>
            </div>

            {/* Financial Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Revenue</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-emerald)', marginTop: 4 }}>
                  {formatCurrency(viewCustomer.totalRevenue || 0)}
                </div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Contract Value</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 4 }}>
                  {formatCurrency(viewCustomer.contractInfo?.value || 0)}
                </div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Contract Status</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-300)', marginTop: 6 }}>
                  {viewCustomer.contractInfo?.status || 'No Active Contract'}
                </div>
              </div>
            </div>

            {/* Contract Information Detailed Panel */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} /> Contract Information
              </div>
              {viewCustomer.contractInfo?.contractNumber ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, fontSize: 13 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Contract Number:</span>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{viewCustomer.contractInfo.contractNumber}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Contract Value:</span>
                    <div style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>{formatCurrency(viewCustomer.contractInfo.value || 0)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Start Date:</span>
                    <div>{formatDate(viewCustomer.contractInfo.startDate)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>End Date:</span>
                    <div>{formatDate(viewCustomer.contractInfo.endDate)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Renewal Date:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{formatDate(viewCustomer.contractInfo.renewalDate)}</span>
                      {viewCustomer.contractInfo.renewalDate && (
                        (() => {
                          const days = daysUntil(viewCustomer.contractInfo.renewalDate);
                          if (days < 0) return <span className="badge lost" style={{ fontSize: 9 }}>Expired</span>;
                          if (days <= 30) return <span className="badge" style={{ fontSize: 9, background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>Due in {days}d</span>;
                          return <span className="badge active" style={{ fontSize: 9 }}>In {days}d</span>;
                        })()
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Contract Status:</span>
                    <div><span className="badge active" style={{ fontSize: 10 }}>{viewCustomer.contractInfo.status || 'Active'}</span></div>
                  </div>
                  {viewCustomer.contractInfo.terms && (
                    <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Terms & SLA:</span>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{viewCustomer.contractInfo.terms}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  No active enterprise contract logged for this account. Click 'Edit Customer' to attach contract details.
                </div>
              )}
            </div>

            {/* Products / Services Purchased */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={14} /> Products / Services Purchased
              </div>
              {viewCustomer.productsPurchased && viewCustomer.productsPurchased.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {viewCustomer.productsPurchased.map((p: string, idx: number) => (
                    <span
                      key={idx}
                      className="badge"
                      style={{
                        padding: '4px 10px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--brand-300)',
                        fontSize: 12,
                        fontWeight: 500,
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No products or services recorded yet.</div>
              )}
            </div>

            {/* Contact Persons Panel */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} /> Contact Persons ({viewCustomer.contactPersons?.length || 0})
              </div>
              {viewCustomer.contactPersons && viewCustomer.contactPersons.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {viewCustomer.contactPersons.map((cp: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-md)',
                        border: cp.isPrimary ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {cp.name}
                          {cp.isPrimary && (
                            <span className="badge active" style={{ fontSize: 9, padding: '1px 6px' }}>Primary</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {cp.title || 'Executive'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12 }}>
                        {cp.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                            <Mail size={11} /> {cp.email}
                          </div>
                        )}
                        {cp.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', marginTop: 2 }}>
                            <Phone size={11} /> {cp.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No contact persons added.</div>
              )}
            </div>

            {/* Corporate Details & Location */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                  Corporate Contact
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> {viewCustomer.email || '—'}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Phone:</span> {viewCustomer.phone || '—'}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Website:</span> {viewCustomer.website ? <a href={viewCustomer.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-400)' }}>{viewCustomer.website}</a> : '—'}</div>
                </div>
              </div>

              <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                  Office Address
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {viewCustomer.address?.street && <div>{viewCustomer.address.street}</div>}
                  <div>
                    {[viewCustomer.address?.city, viewCustomer.address?.state].filter(Boolean).join(', ')}
                    {viewCustomer.address?.pincode ? ` - ${viewCustomer.address.pincode}` : ''}
                  </div>
                  <div>{viewCustomer.address?.country || 'India'}</div>
                </div>
              </div>
            </div>

            {/* Salesperson Assignment & Reassignment Control */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={14} /> Assigned Salesperson & Territory Control
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {viewCustomer.assignedSalesperson?.name || 'Unassigned'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {viewCustomer.assignedSalesperson?.email || 'No sales representative assigned'} · {viewCustomer.assignedSalesperson?.role || 'Sales Rep'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    className="form-control"
                    style={{ width: 180, fontSize: 12 }}
                    value={reassignSalespersonId}
                    onChange={e => setReassignSalespersonId(e.target.value)}
                  >
                    <option value="">Select new salesperson</option>
                    {salespersons.map((sp: any) => (
                      <option key={sp._id} value={sp._id}>{sp.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!reassignSalespersonId || assignMutation.isPending}
                    onClick={() => {
                      if (!reassignSalespersonId) return;
                      assignMutation.mutate({
                        id: viewCustomer.customerId || viewCustomer._id,
                        salespersonId: reassignSalespersonId,
                      });
                    }}
                  >
                    {assignMutation.isPending ? 'Assigning...' : 'Reassign'}
                  </button>
                </div>
              </div>
            </div>

            {/* Account Notes */}
            {viewCustomer.notes && (
              <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                  Account Notes
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {viewCustomer.notes}
                </div>
              </div>
            )}

            {/* Activity History Timeline */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} /> Customer Interactions & Activities ({customerActivities?.data?.length || customerActivities?.length || 0})
              </div>
              {(() => {
                const acts = customerActivities?.data || (Array.isArray(customerActivities) ? customerActivities : []);
                if (acts.length === 0) {
                  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No activities logged for this customer yet.</div>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {acts.map((a: any) => (
                      <div
                        key={a._id}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--bg-card)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600 }}>{a.activityType}: </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{a.subject || a.notes || 'Activity completed'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatDate(a.createdAt || a.dueDate)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Customers;
