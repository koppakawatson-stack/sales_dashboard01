import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit2, Trash2, Eye, Mail, MapPin, Users,
  ArrowRight, ShieldCheck, AlertTriangle, Archive, UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import {
  getLeads, createLead, updateLead, deleteLead, getSalespersons,
  changeLeadStatus, assignLead, archiveLead, getLeadStats, getLeadActivities
} from '../api/client';
import { formatCurrency, formatDate, statusClass, truncate } from '../utils/helpers';

const STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const SOURCES = ['Website', 'Referral', 'Cold Call', 'Email Campaign', 'Social Media', 'Event/Trade Show', 'Partner', 'Advertisement', 'Other'];
const INDUSTRIES = ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Education', 'Real Estate', 'Media', 'Transportation', 'Energy', 'Other'];
const LOSS_REASONS = ['PRICE', 'COMPETITOR', 'NO_RESPONSE', 'BUDGET', 'TIMING', 'NOT_A_FIT', 'CUSTOMER_CANCELLED', 'OTHER'];

const emptyLead = {
  companyName: '', contactPerson: '', email: '', phone: '',
  source: 'Website', industry: 'Technology', status: 'New',
  expectedValue: '', assignedSalesperson: '',
  'location.city': '', 'location.country': 'India',
  nextFollowUpDate: '', notes: '', productService: 'Enterprise Platform', requirement: '',
};

const LeadForm: React.FC<{ form: any; onChange: (k: string, v: any) => void; salespersons: any[] }> = ({ form, onChange, salespersons }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div className="form-grid">
      <div className="form-group">
        <label className="form-label">Company Name *</label>
        <input id="lead-company" className="form-control" value={form.companyName} onChange={e => onChange('companyName', e.target.value)} placeholder="e.g. Acme Corp" />
      </div>
      <div className="form-group">
        <label className="form-label">Contact Person *</label>
        <input id="lead-contact" className="form-control" value={form.contactPerson} onChange={e => onChange('contactPerson', e.target.value)} placeholder="e.g. John Smith" />
      </div>
      <div className="form-group">
        <label className="form-label">Email</label>
        <input id="lead-email" className="form-control" type="email" value={form.email} onChange={e => onChange('email', e.target.value)} placeholder="email@company.com" />
      </div>
      <div className="form-group">
        <label className="form-label">Phone</label>
        <input id="lead-phone" className="form-control" value={form.phone} onChange={e => onChange('phone', e.target.value)} placeholder="+91 9876543210" />
      </div>
      <div className="form-group">
        <label className="form-label">Source</label>
        <select id="lead-source" className="form-control" value={form.source} onChange={e => onChange('source', e.target.value)}>
          {SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Industry</label>
        <select id="lead-industry" className="form-control" value={form.industry} onChange={e => onChange('industry', e.target.value)}>
          {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Expected Value (₹)</label>
        <input id="lead-value" className="form-control" type="number" value={form.expectedValue} onChange={e => onChange('expectedValue', e.target.value)} placeholder="500000" />
      </div>
      <div className="form-group">
        <label className="form-label">Assigned Salesperson</label>
        <select id="lead-salesperson" className="form-control" value={form.assignedSalesperson} onChange={e => onChange('assignedSalesperson', e.target.value)}>
          <option value="">Select salesperson</option>
          {salespersons.map((sp: any) => <option key={sp._id} value={sp._id}>{sp.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Next Follow-up Date</label>
        <input id="lead-followup" className="form-control" type="date" value={form.nextFollowUpDate} onChange={e => onChange('nextFollowUpDate', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Product / Service Requirement</label>
        <input id="lead-product" className="form-control" value={form.productService || ''} onChange={e => onChange('productService', e.target.value)} placeholder="e.g. Cloud CRM Suite" />
      </div>
      <div className="form-group">
        <label className="form-label">City</label>
        <input id="lead-city" className="form-control" value={form['location.city']} onChange={e => onChange('location.city', e.target.value)} placeholder="Mumbai" />
      </div>
      <div className="form-group">
        <label className="form-label">Country</label>
        <input id="lead-country" className="form-control" value={form['location.country']} onChange={e => onChange('location.country', e.target.value)} placeholder="India" />
      </div>
    </div>
    <div className="form-group">
      <label className="form-label">Notes & Requirements</label>
      <textarea id="lead-notes" className="form-control" value={form.notes} onChange={e => onChange('notes', e.target.value)} placeholder="Additional notes, technical specs, customer requirements..." rows={3} />
    </div>
  </div>
);

const Leads: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyLead });
  const [viewLead, setViewLead] = useState<any>(null);

  // Status transition state inside View Modal
  const [targetStatus, setTargetStatus] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [lossReason, setLossReason] = useState('PRICE');
  const [customClosingDate, setCustomClosingDate] = useState('');
  const [customDealValue, setCustomDealValue] = useState('');

  // Reassignment state inside View Modal
  const [reassignSalespersonId, setReassignSalespersonId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { search, status: statusFilter, source: sourceFilter, page }],
    queryFn: () => getLeads({ search, status: statusFilter, source: sourceFilter, page, limit: 15 }),
  });

  const { data: leadStats } = useQuery({
    queryKey: ['leadStats'],
    queryFn: () => getLeadStats(),
  });

  const { data: salespersons = [] } = useQuery({ queryKey: ['salespersons'], queryFn: getSalespersons });

  const { data: leadActivities = [] } = useQuery({
    queryKey: ['leadActivities', viewLead?._id || viewLead?.leadId],
    queryFn: () => getLeadActivities(viewLead?.leadId || viewLead?._id),
    enabled: !!viewLead,
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => createLead(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      toast.success('Lead created!', { className: 'toast-custom' });
      setShowModal(false);
      setForm({ ...emptyLead });
    },
    onError: (e: any) => {
      if (e.code === 'POSSIBLE_DUPLICATE_LEAD') {
        const existingId = e.data?.existingLeadId || 'an existing record';
        if (window.confirm(`Possible duplicate lead detected (${existingId}). Would you like to create it anyway?`)) {
          const payload = {
            ...form,
            expectedValue: Number(form.expectedValue) || 0,
            location: { city: form['location.city'], country: form['location.country'] },
            assignedSalesperson: form.assignedSalesperson || undefined,
            nextFollowUpDate: form.nextFollowUpDate || undefined,
            allowDuplicate: true,
          };
          createMutation.mutate(payload);
          return;
        }
      }
      toast.error(e.message, { className: 'toast-custom' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: any) => updateLead(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      toast.success('Lead updated!', { className: 'toast-custom' });
      setShowModal(false);
      setEditLead(null);
    },
    onError: (e: any) => {
      if (e.code === 'LEAD_VERSION_CONFLICT') {
        toast.error('Version conflict: The lead was modified by another user. Refreshing data...', { className: 'toast-custom' });
        qc.invalidateQueries({ queryKey: ['leads'] });
        return;
      }
      toast.error(e.message, { className: 'toast-custom' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }: any) => changeLeadStatus(id, payload),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      qc.invalidateQueries({ queryKey: ['leadActivities'] });
      toast.success(`Lead transitioned to ${targetStatus}!`, { className: 'toast-custom' });
      if (res.data) setViewLead(res.data);
      setTargetStatus('');
      setTransitionReason('');
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, salespersonId }: any) => assignLead(id, { salespersonId, reason: 'Manual reassignment via portal' }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadActivities'] });
      toast.success('Salesperson reassigned successfully!', { className: 'toast-custom' });
      if (res.data) setViewLead(res.data);
      setReassignSalespersonId('');
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveLead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      toast.success('Lead archived successfully', { className: 'toast-custom' });
      setViewLead(null);
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leadStats'] });
      toast.success('Lead removed', { className: 'toast-custom' });
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const handleFormChange = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.companyName || !form.contactPerson) {
      toast.error('Company name and contact person are required', { className: 'toast-custom' });
      return;
    }
    const payload: any = {
      ...form,
      expectedValue: Number(form.expectedValue) || 0,
      location: { city: form['location.city'], country: form['location.country'] },
      assignedSalesperson: form.assignedSalesperson || undefined,
      nextFollowUpDate: form.nextFollowUpDate || undefined,
    };
    if (editLead) {
      payload.version = editLead.version;
      updateMutation.mutate({ id: editLead.leadId || editLead._id, d: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (lead: any) => {
    setEditLead(lead);
    setForm({
      companyName: lead.companyName, contactPerson: lead.contactPerson,
      email: lead.email || '', phone: lead.phone || '',
      source: lead.source || 'Website', industry: lead.industry || 'Technology',
      status: lead.status, expectedValue: lead.expectedValue || '',
      assignedSalesperson: lead.assignedSalesperson?._id || '',
      'location.city': lead.location?.city || '', 'location.country': lead.location?.country || 'India',
      nextFollowUpDate: lead.nextFollowUpDate ? lead.nextFollowUpDate.slice(0, 10) : '',
      notes: lead.notes || '',
      productService: lead.productService || 'Enterprise Platform',
      requirement: lead.requirement || '',
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditLead(null);
    setForm({ ...emptyLead });
    setShowModal(true);
  };

  // State machine helper for valid target statuses
  const getNextStatuses = (current: string): string[] => {
    const s = (current || '').toUpperCase();
    switch (s) {
      case 'NEW': return ['CONTACTED', 'LOST'];
      case 'CONTACTED': return ['QUALIFIED', 'LOST'];
      case 'QUALIFIED': return ['PROPOSAL', 'LOST'];
      case 'PROPOSAL': return ['NEGOTIATION', 'LOST'];
      case 'NEGOTIATION': return ['WON', 'LOST'];
      default: return [];
    }
  };

  const handleStatusTransition = () => {
    if (!viewLead || !targetStatus) return;
    const payload: any = {
      status: targetStatus,
      reason: transitionReason || `Transitioning lead to ${targetStatus}`,
    };
    if (targetStatus === 'LOST') {
      payload.lossReason = lossReason;
    }
    if (targetStatus === 'WON') {
      payload.finalDealValue = Number(customDealValue) || viewLead.expectedValue || 100000;
      payload.closingDate = customClosingDate || new Date().toISOString();
      payload.productService = viewLead.productService || 'Enterprise Platform';
    }
    if (targetStatus === 'QUALIFIED') {
      payload.requirement = transitionReason || viewLead.notes || 'Requirement confirmed';
      payload.expectedValue = Number(customDealValue) || viewLead.expectedValue || 500000;
      payload.nextFollowUpDate = customClosingDate || new Date(Date.now() + 7 * 86400000).toISOString();
    }
    if (targetStatus === 'PROPOSAL' || targetStatus === 'NEGOTIATION') {
      payload.expectedValue = Number(customDealValue) || viewLead.expectedValue || 500000;
      payload.expectedClosingDate = customClosingDate || new Date(Date.now() + 14 * 86400000).toISOString();
      payload.productService = viewLead.productService || 'Enterprise Platform';
      payload.decisionMaker = viewLead.contactPerson;
    }

    statusMutation.mutate({ id: viewLead.leadId || viewLead._id, payload });
  };

  const leads = data?.leads || [];
  const totalPages = data?.pages || 1;
  const isTerminal = (status: string) => ['WON', 'LOST'].includes((status || '').toUpperCase());

  return (
    <div className="main-content">
      <Topbar
        title="Lead Management"
        subtitle={`${data?.total || 0} total leads · ${leadStats?.data?.overdueFollowUps || 0} overdue follow-ups · ${leadStats?.data?.conversionRate || 0}% conversion`}
      />
      <main className="page-content fade-in">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Leads</h1>
            <div className="page-header-subtitle">Strict backend lifecycle control & sales pipeline tracking</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={openCreate} id="add-lead-btn">
              <Plus size={15} /> Add Lead
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          <div className="search-input-bar">
            <Search size={14} />
            <input id="lead-search" placeholder="Search by company, contact, email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select id="lead-status-filter" className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select id="lead-source-filter" className="filter-select" value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}>
            <option value="">All Sources</option>
            {SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Source</th>
                <th>Industry</th>
                <th>Status</th>
                <th>Expected Value</th>
                <th>Salesperson</th>
                <th>Follow-up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={10}><div className="empty-state"><Users size={36} /><h3>No leads found</h3><p>Try adjusting your filters or add a new lead</p></div></td></tr>
              ) : leads.map((lead: any) => {
                const isOverdue = lead.nextFollowUpDate &&
                  new Date(lead.nextFollowUpDate).getTime() < Date.now() &&
                  !isTerminal(lead.status);

                return (
                  <tr key={lead._id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-300)' }}>{lead.leadId}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{lead.companyName}</div>
                      {lead.location?.city && <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} />{lead.location.city}</div>}
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{lead.contactPerson}</div>
                      {lead.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} />{truncate(lead.email, 22)}</div>}
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{lead.source}</span></td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{lead.industry}</span></td>
                    <td><span className={`badge ${statusClass(lead.status)}`}>{lead.status}</span></td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(lead.expectedValue, true)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{lead.assignedSalesperson?.name || '—'}</td>
                    <td style={{ fontSize: 12, color: isOverdue ? 'var(--accent-rose)' : (lead.nextFollowUpDate ? 'var(--accent-amber)' : 'var(--text-muted)') }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isOverdue && <AlertTriangle size={12} color="var(--accent-rose)" />}
                        <span>{formatDate(lead.nextFollowUpDate)}</span>
                        {isOverdue && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(244,63,94,0.15)', color: 'var(--status-lost)', fontWeight: 700 }}>
                            OVERDUE
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setViewLead(lead)} title="View & Lifecycle Control" id={`view-lead-${lead._id}`}><Eye size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(lead)} title="Edit" id={`edit-lead-${lead._id}`}><Edit2 size={14} /></button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => { if (confirm('Delete this lead?')) deleteMutation.mutate(lead._id); }} title="Delete" id={`delete-lead-${lead._id}`}><Trash2 size={14} /></button>
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
                <button key={p} className={`pagination-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditLead(null); }}
        title={editLead ? `Edit Lead — ${editLead.companyName}` : 'Add New Lead'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} id="save-lead-btn"
              disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editLead ? 'Update Lead' : 'Create Lead')}
            </button>
          </>
        }
      >
        <LeadForm form={form} onChange={handleFormChange} salespersons={salespersons} />
      </Modal>

      {/* View Modal with Lifecycle State Machine & Reassignment */}
      {viewLead && (
        <Modal
          isOpen={!!viewLead}
          onClose={() => { setViewLead(null); setTargetStatus(''); }}
          title={`Lead Control — ${viewLead.companyName} (${viewLead.leadId})`}
          size="lg"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => {
                  if (confirm(`Archive lead ${viewLead.leadId}? It will be hidden from active lists.`)) {
                    archiveMutation.mutate(viewLead.leadId || viewLead._id);
                  }
                }}
                disabled={archiveMutation.isPending}
              >
                <Archive size={14} style={{ marginRight: 4 }} /> Archive Lead
              </button>
              <button className="btn btn-secondary" onClick={() => { setViewLead(null); setTargetStatus(''); }}>Close</button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Header Badge Strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Status:</span>
                <span className={`badge ${statusClass(viewLead.status)}`} style={{ fontSize: 13, padding: '4px 10px' }}>
                  {viewLead.status}
                </span>
                {isTerminal(viewLead.status) && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                    (Terminal State)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {viewLead.leadQualityScore !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                    <ShieldCheck size={16} color="var(--brand-400)" />
                    <span>Quality Score: {viewLead.leadQualityScore}/100</span>
                  </div>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{viewLead.version || 1}</span>
              </div>
            </div>

            {/* Lifecycle Progression Control */}
            {!isTerminal(viewLead.status) && (
              <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'rgba(37,99,235,0.03)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowRight size={16} color="var(--brand-500)" />
                  Backend Lifecycle State Machine Transition
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="form-control"
                    style={{ width: 180 }}
                    value={targetStatus}
                    onChange={e => setTargetStatus(e.target.value)}
                  >
                    <option value="">Select Next Stage...</option>
                    {getNextStatuses(viewLead.status).map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>

                  {targetStatus === 'LOST' && (
                    <select
                      className="form-control"
                      style={{ width: 170 }}
                      value={lossReason}
                      onChange={e => setLossReason(e.target.value)}
                    >
                      {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}

                  {['QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'].includes(targetStatus) && (
                    <>
                      <input
                        className="form-control"
                        style={{ width: 160 }}
                        type="number"
                        placeholder="Commercial Value (₹)"
                        value={customDealValue}
                        onChange={e => setCustomDealValue(e.target.value)}
                      />
                      <input
                        className="form-control"
                        style={{ width: 150 }}
                        type="date"
                        value={customClosingDate}
                        onChange={e => setCustomClosingDate(e.target.value)}
                        title={targetStatus === 'QUALIFIED' ? 'Next Follow-up Date' : 'Target Closing Date'}
                      />
                    </>
                  )}

                  <input
                    className="form-control"
                    style={{ flex: 1, minWidth: 160 }}
                    placeholder={targetStatus === 'LOST' ? 'Loss explanation note...' : 'Transition note / requirements...'}
                    value={transitionReason}
                    onChange={e => setTransitionReason(e.target.value)}
                  />

                  <button
                    className="btn btn-primary"
                    disabled={!targetStatus || statusMutation.isPending}
                    onClick={handleStatusTransition}
                  >
                    {statusMutation.isPending ? 'Transitioning...' : 'Advance Stage'}
                  </button>
                </div>
              </div>
            )}

            {/* Lead Key Attributes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                ['Lead ID', viewLead.leadId],
                ['Company', viewLead.companyName],
                ['Contact Person', viewLead.contactPerson],
                ['Email', viewLead.email || '—'],
                ['Phone', viewLead.phone || '—'],
                ['Source', viewLead.source],
                ['Industry', viewLead.industry],
                ['Expected Value', formatCurrency(viewLead.expectedValue)],
                ['Assigned Salesperson', viewLead.assignedSalesperson?.name || 'Unassigned'],
                ['Location', viewLead.location ? `${viewLead.location.city || ''}, ${viewLead.location.country || ''}` : '—'],
                ['Next Follow-Up', formatDate(viewLead.nextFollowUpDate)],
                ['Last Contact', formatDate(viewLead.lastContactDate)],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: '8px 10px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Lifecycle Timestamps Audit */}
            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Stage Milestones & Audit Timestamps
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, fontSize: 12 }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Created:</span> {formatDate(viewLead.createdAt)}</div>
                {viewLead.qualifiedAt && <div><span style={{ color: 'var(--text-muted)' }}>Qualified:</span> {formatDate(viewLead.qualifiedAt)}</div>}
                {viewLead.proposalAt && <div><span style={{ color: 'var(--text-muted)' }}>Proposal:</span> {formatDate(viewLead.proposalAt)}</div>}
                {viewLead.negotiationAt && <div><span style={{ color: 'var(--text-muted)' }}>Negotiation:</span> {formatDate(viewLead.negotiationAt)}</div>}
                {viewLead.wonAt && <div><span style={{ color: 'var(--status-won)', fontWeight: 600 }}>Won At:</span> {formatDate(viewLead.wonAt)}</div>}
                {viewLead.lostAt && <div><span style={{ color: 'var(--status-lost)', fontWeight: 600 }}>Lost At:</span> {formatDate(viewLead.lostAt)} ({viewLead.lossReason})</div>}
              </div>
            </div>

            {/* Salesperson Reassignment Control */}
            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={14} /> Reassign Lead Ownership (RBAC Controlled)
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  className="form-control"
                  style={{ flex: 1 }}
                  value={reassignSalespersonId}
                  onChange={e => setReassignSalespersonId(e.target.value)}
                >
                  <option value="">Choose new salesperson...</option>
                  {salespersons.map((sp: any) => (
                    <option key={sp._id} value={sp._id}>{sp.name} ({sp.email})</option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!reassignSalespersonId || assignMutation.isPending}
                  onClick={() => assignMutation.mutate({ id: viewLead.leadId || viewLead._id, salespersonId: reassignSalespersonId })}
                >
                  {assignMutation.isPending ? 'Assigning...' : 'Confirm Reassign'}
                </button>
              </div>
            </div>

            {/* Activity History & Audit Log */}
            {leadActivities.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Recent Activities & Lifecycle History ({leadActivities.length})
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {leadActivities.map((act: any) => (
                    <div key={act._id} style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between' }}>
                      <span><strong>{act.type}</strong> — {act.description || act.notes}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatDate(act.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {viewLead.notes && (
              <div style={{ padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Notes</div>
                <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{viewLead.notes}</div>
              </div>
            )}

          </div>
        </Modal>
      )}
    </div>
  );
};

export default Leads;
