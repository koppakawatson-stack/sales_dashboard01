import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, Eye, Phone, Mail, Users, Monitor, Bell, FileText,
  Activity as ActivityIcon, Search, Calendar, Clock, UserCheck, Building
} from 'lucide-react';
import toast from 'react-hot-toast';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import {
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getActivityStats,
  getSalespersons,
  getCustomers,
  getLeads
} from '../api/client';
import { formatDate } from '../utils/helpers';

const ACTIVITY_TYPES = ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up', 'Proposal', 'Other'];
const OUTCOMES = ['Positive', 'Neutral', 'Negative', 'No Answer', 'Pending'];
const STATUSES = ['Planned', 'Completed', 'Cancelled'];

const typeIcon = (type: string) => {
  const map: Record<string, React.ReactNode> = {
    Call: <Phone size={15} />,
    Meeting: <Users size={15} />,
    Email: <Mail size={15} />,
    Demo: <Monitor size={15} />,
    'Follow-up': <Bell size={15} />,
    Proposal: <FileText size={15} />,
    Other: <ActivityIcon size={15} />,
  };
  return map[type] || <ActivityIcon size={15} />;
};

const typeColor: Record<string, string> = {
  Call: '#06b6d4',
  Meeting: '#8b5cf6',
  Email: '#6366f1',
  Demo: '#f59e0b',
  'Follow-up': '#f97316',
  Proposal: '#10b981',
  Other: '#4d5e7a',
};

const emptyActivity = {
  activityType: 'Call',
  salesperson: '',
  customer: '',
  lead: '',
  associationType: 'customer' as 'customer' | 'lead',
  date: new Date().toISOString().slice(0, 16),
  duration: '',
  notes: '',
  nextAction: '',
  nextActionDate: '',
  outcome: 'Pending',
  status: 'Planned',
  version: 1,
};

const Activities: React.FC = () => {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editActivity, setEditActivity] = useState<any>(null);
  const [viewActivity, setViewActivity] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyActivity });

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: ['activities', {
      activityType: typeFilter,
      status: statusFilter,
      outcome: outcomeFilter,
      salesperson: salespersonFilter,
      search: searchTerm,
      page,
    }],
    queryFn: () => getActivities({
      activityType: typeFilter || undefined,
      status: statusFilter || undefined,
      outcome: outcomeFilter || undefined,
      salesperson: salespersonFilter || undefined,
      search: searchTerm || undefined,
      page,
      limit: 15,
    }),
  });

  const { data: stats = [] } = useQuery({
    queryKey: ['activity-stats'],
    queryFn: getActivityStats,
  });

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons'],
    queryFn: getSalespersons,
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => getCustomers({ limit: 200 }).then(r => r.customers || []),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads-all'],
    queryFn: () => getLeads({ limit: 200 }).then(r => r.leads || []),
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (d: any) => createActivity(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['activity-stats'] });
      toast.success('Sales activity logged successfully!', { className: 'toast-custom' });
      setShowModal(false);
      setForm({ ...emptyActivity });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to log activity', { className: 'toast-custom' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: any) => updateActivity(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['activity-stats'] });
      toast.success('Activity updated successfully!', { className: 'toast-custom' });
      setShowModal(false);
      setEditActivity(null);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update activity', { className: 'toast-custom' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['activity-stats'] });
      toast.success('Activity deleted', { className: 'toast-custom' });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to delete activity', { className: 'toast-custom' }),
  });

  const fc = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.salesperson) {
      toast.error('Salesperson assignment is required', { className: 'toast-custom' });
      return;
    }
    if (form.associationType === 'customer' && !form.customer) {
      toast.error('Please select an associated customer account', { className: 'toast-custom' });
      return;
    }
    if (form.associationType === 'lead' && !form.lead) {
      toast.error('Please select an associated sales lead', { className: 'toast-custom' });
      return;
    }

    const payload: any = {
      activityType: form.activityType,
      salesperson: form.salesperson,
      customer: form.associationType === 'customer' ? form.customer : undefined,
      lead: form.associationType === 'lead' ? form.lead : undefined,
      date: form.date,
      duration: form.duration ? Number(form.duration) : 0,
      notes: form.notes,
      nextAction: form.nextAction || undefined,
      nextActionDate: form.nextActionDate || undefined,
      outcome: form.outcome,
      status: form.status,
    };

    if (editActivity) {
      payload.version = editActivity.version;
      updateMutation.mutate({ id: editActivity._id, d: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openAdd = () => {
    setEditActivity(null);
    const defaultSp = salespersons?.[0]?._id || '';
    setForm({
      ...emptyActivity,
      salesperson: defaultSp,
      customer: customersData?.[0]?._id || '',
    });
    setShowModal(true);
  };

  const openEdit = (a: any) => {
    setEditActivity(a);
    const isCustomer = Boolean(a.customer);
    setForm({
      activityType: a.activityType,
      salesperson: a.salesperson?._id || a.salesperson || '',
      customer: a.customer?._id || a.customer || '',
      lead: a.lead?._id || a.lead || '',
      associationType: isCustomer ? 'customer' : 'lead',
      date: a.date ? new Date(a.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      duration: a.duration !== undefined ? String(a.duration) : '',
      notes: a.notes || '',
      nextAction: a.nextAction || '',
      nextActionDate: a.nextActionDate ? new Date(a.nextActionDate).toISOString().slice(0, 10) : '',
      outcome: a.outcome || 'Pending',
      status: a.status || 'Planned',
      version: a.version || 1,
    });
    setShowModal(true);
  };

  const openView = (a: any) => {
    setViewActivity(a);
    setShowViewModal(true);
  };

  const activities = data?.activities || [];
  const totalPages = data?.pages || 1;
  const totalActivities = Array.isArray(stats) ? stats.reduce((acc: number, s: any) => acc + (s.count || 0), 0) : (data?.total || 0);

  return (
    <div className="main-content">
      <Topbar title="Sales Activities" subtitle={`${totalActivities || data?.total || 0} total logged sales activities`} />
      <main className="page-content fade-in">
        <div className="page-header">
          <div>
            <h1>Sales Activities</h1>
            <div className="page-header-subtitle">
              Comprehensive tracking for Calls, Meetings, Emails, Demos, Follow-ups, Proposals, and other engagements
            </div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={openAdd} id="add-activity-btn">
              <Plus size={15} /> Log Activity
            </button>
          </div>
        </div>

        {/* ── 7 Activity Type KPI Badges / Quick Filters ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12, marginBottom: 20 }}>
          {ACTIVITY_TYPES.map(type => {
            const statObj = Array.isArray(stats) ? stats.find((s: any) => s._id === type) : null;
            const count = statObj ? statObj.count : 0;
            const isSelected = typeFilter === type;
            const color = typeColor[type] || '#4d5e7a';

            return (
              <div
                key={type}
                onClick={() => {
                  setTypeFilter(isSelected ? '' : type);
                  setPage(1);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: isSelected ? `${color}18` : 'var(--bg-card)',
                  border: isSelected ? `2px solid ${color}` : '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? `0 0 12px ${color}33` : 'none',
                }}
                title={`Click to filter by ${type}`}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-sm)',
                  background: `${color}25`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: color,
                  flexShrink: 0,
                }}>
                  {typeIcon(type)}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isSelected ? 600 : 500 }}>
                    {type}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Search & Filter Controls ── */}
        <div className="filters-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              id="activity-search-input"
              className="filter-input"
              style={{ width: '100%', paddingLeft: 30 }}
              placeholder="Search notes, next action, ID..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            />
          </div>

          <select
            id="activity-type-filter"
            className="filter-select"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Activity Types</option>
            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            id="activity-status-filter"
            className="filter-select"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            id="activity-outcome-filter"
            className="filter-select"
            value={outcomeFilter}
            onChange={e => { setOutcomeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Outcomes</option>
            {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>

          <select
            id="activity-salesperson-filter"
            className="filter-select"
            value={salespersonFilter}
            onChange={e => { setSalespersonFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Salespersons</option>
            {salespersons.map((sp: any) => (
              <option key={sp._id} value={sp._id}>{sp.name}</option>
            ))}
          </select>

          {(typeFilter || statusFilter || outcomeFilter || salespersonFilter || searchTerm) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setTypeFilter('');
                setStatusFilter('');
                setOutcomeFilter('');
                setSalespersonFilter('');
                setSearchTerm('');
                setPage(1);
              }}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* ── Activities Table ── */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Participant</th>
                <th>Salesperson</th>
                <th>Date</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Next Action</th>
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
              ) : activities.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <ActivityIcon size={36} />
                      <h3>No sales activities found</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                        Log a new call, meeting, email, demo, follow-up, or proposal.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                activities.map((a: any) => (
                  <tr key={a._id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-300)', fontWeight: 600 }}>
                        {a.activityId || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{
                          color: typeColor[a.activityType] || 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          background: `${typeColor[a.activityType] || '#4d5e7a'}20`
                        }}>
                          {typeIcon(a.activityType)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{a.activityType}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.customer ? (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {a.customer.companyName}
                          </div>
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                            Customer
                          </span>
                        </div>
                      ) : a.lead ? (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {a.lead.companyName}
                          </div>
                          <span className="badge" style={{ fontSize: 10, background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                            Lead ({a.lead.contactPerson || 'Contact'})
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>{a.salesperson?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.salesperson?.email || ''}</div>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      <div>{formatDate(a.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(a.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {a.duration ? `${a.duration} min` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${a.status === 'Completed' ? 'won' : a.status === 'Cancelled' ? 'lost' : 'new'}`} style={{ fontSize: 11 }}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${a.outcome === 'Positive' ? 'won' : a.outcome === 'Negative' ? 'lost' : 'new'}`} style={{ fontSize: 11 }}>
                        {a.outcome || 'Pending'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {a.nextAction ? (
                        <div style={{ maxWidth: 180 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={a.nextAction}>
                            {a.nextAction}
                          </div>
                          {a.nextActionDate && (
                            <div style={{ fontSize: 10, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              <Calendar size={10} /> {formatDate(a.nextActionDate)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => openView(a)}
                          title="View activity details"
                          id={`view-activity-${a._id}`}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => openEdit(a)}
                          title="Edit activity"
                          id={`edit-activity-${a._id}`}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          onClick={() => {
                            if (confirm(`Delete activity ${a.activityId || 'record'}?`)) {
                              deleteMutation.mutate(a._id);
                            }
                          }}
                          title="Delete activity"
                          id={`delete-activity-${a._id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
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

      {/* ── Log / Edit Activity Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditActivity(null); }}
        title={editActivity ? `Edit Activity (${editActivity.activityId || 'Record'})` : 'Log Sales Activity'}
        size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            id="save-activity-btn"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editActivity ? 'Update Activity' : 'Save Activity')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Association Type Switcher (Customer vs Lead) */}
          <div className="form-group">
            <label className="form-label">Associate With *</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                <input
                  type="radio"
                  name="associationType"
                  value="customer"
                  checked={form.associationType === 'customer'}
                  onChange={() => fc('associationType', 'customer')}
                />
                <Building size={14} color="#6366f1" /> Existing Customer Account
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                <input
                  type="radio"
                  name="associationType"
                  value="lead"
                  checked={form.associationType === 'lead'}
                  onChange={() => fc('associationType', 'lead')}
                />
                <UserCheck size={14} color="#06b6d4" /> Pipeline Lead
              </label>
            </div>
          </div>

          <div className="form-grid">
            {form.associationType === 'customer' ? (
              <div className="form-group">
                <label className="form-label">Customer Account *</label>
                <select
                  id="act-customer"
                  className="form-control"
                  value={form.customer}
                  onChange={e => fc('customer', e.target.value)}
                >
                  <option value="">Select Customer Account</option>
                  {(customersData || []).map((c: any) => (
                    <option key={c._id} value={c._id}>
                      {c.companyName} {c.customerId ? `(${c.customerId})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Sales Lead *</label>
                <select
                  id="act-lead"
                  className="form-control"
                  value={form.lead}
                  onChange={e => fc('lead', e.target.value)}
                >
                  <option value="">Select Sales Lead</option>
                  {(leadsData || []).map((l: any) => (
                    <option key={l._id} value={l._id}>
                      {l.companyName} — {l.contactPerson || 'Contact'} {l.leadId ? `(${l.leadId})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Salesperson *</label>
              <select
                id="act-sp"
                className="form-control"
                value={form.salesperson}
                onChange={e => fc('salesperson', e.target.value)}
              >
                <option value="">Select Salesperson</option>
                {salespersons.map((sp: any) => (
                  <option key={sp._id} value={sp._id}>{sp.name} ({sp.role || 'Sales'})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Activity Type *</label>
              <select
                id="act-type"
                className="form-control"
                value={form.activityType}
                onChange={e => fc('activityType', e.target.value)}
              >
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Date & Time *</label>
              <input
                id="act-date"
                className="form-control"
                type="datetime-local"
                value={form.date}
                onChange={e => fc('date', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Duration (minutes)</label>
              <input
                id="act-duration"
                className="form-control"
                type="number"
                min="0"
                value={form.duration}
                onChange={e => fc('duration', e.target.value)}
                placeholder="30"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                id="act-status"
                className="form-control"
                value={form.status}
                onChange={e => fc('status', e.target.value)}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Outcome</label>
              <select
                id="act-outcome"
                className="form-control"
                value={form.outcome}
                onChange={e => fc('outcome', e.target.value)}
              >
                {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes & Summary</label>
            <textarea
              id="act-notes"
              className="form-control"
              rows={3}
              value={form.notes}
              onChange={e => fc('notes', e.target.value)}
              placeholder="Record discussion points, key takeaways, customer feedback, and objections..."
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Next Action</label>
              <input
                id="act-next"
                className="form-control"
                value={form.nextAction}
                onChange={e => fc('nextAction', e.target.value)}
                placeholder="e.g. Send proposal draft, Schedule architecture demo"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Next Action Date</label>
              <input
                id="act-next-date"
                className="form-control"
                type="date"
                value={form.nextActionDate}
                onChange={e => fc('nextActionDate', e.target.value)}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ── View Activity Details Modal ── */}
      <Modal
        isOpen={showViewModal}
        onClose={() => { setShowViewModal(false); setViewActivity(null); }}
        title={`Sales Activity — ${viewActivity?.activityId || 'Details'}`}
        size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>Close</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowViewModal(false);
              openEdit(viewActivity);
            }}
          >
            <Edit2 size={14} /> Edit Activity
          </button>
        </>}
      >
        {viewActivity && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-sm)',
                  background: `${typeColor[viewActivity.activityType] || '#4d5e7a'}22`,
                  color: typeColor[viewActivity.activityType] || '#4d5e7a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {typeIcon(viewActivity.activityType)}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {viewActivity.activityType}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {viewActivity.activityId}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <span className={`badge ${viewActivity.status === 'Completed' ? 'won' : viewActivity.status === 'Cancelled' ? 'lost' : 'new'}`}>
                  {viewActivity.status}
                </span>
                <span className={`badge ${viewActivity.outcome === 'Positive' ? 'won' : viewActivity.outcome === 'Negative' ? 'lost' : 'new'}`}>
                  {viewActivity.outcome || 'Pending'}
                </span>
              </div>
            </div>

            {/* Key Information Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
              fontSize: 13,
            }}>
              <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Participant / Account</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {viewActivity.customer?.companyName || viewActivity.lead?.companyName || '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--brand-400)', marginTop: 2 }}>
                  {viewActivity.customer ? 'Customer Account' : viewActivity.lead ? `Lead (${viewActivity.lead.contactPerson || ''})` : ''}
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Assigned Salesperson</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {viewActivity.salesperson?.name || '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {viewActivity.salesperson?.email || ''}
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Date & Time</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={13} color="var(--brand-400)" />
                  {formatDate(viewActivity.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(viewActivity.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Duration</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={13} color="var(--brand-400)" />
                  {viewActivity.duration ? `${viewActivity.duration} minutes` : 'Not recorded'}
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div style={{
              padding: 12,
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Notes & Details</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {viewActivity.notes || 'No notes entered.'}
              </div>
            </div>

            {/* Next Action Callout Card */}
            {viewActivity.nextAction && (
              <div style={{
                padding: '12px 14px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Scheduled Next Action
                  </span>
                  {viewActivity.nextActionDate && (
                    <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} /> {formatDate(viewActivity.nextActionDate)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {viewActivity.nextAction}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Activities;
