import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit2, Trash2, Eye, Briefcase, TrendingUp,
  ArrowRight, CheckCircle2, XCircle, Clock, UserCheck,
  Building2, Percent, DollarSign
} from 'lucide-react';
import toast from 'react-hot-toast';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import {
  getDeals, createDeal, updateDeal, changeDealStage, assignDeal,
  deleteDeal, getCustomers, getSalespersons, getDealStats
} from '../api/client';
import { formatCurrency, formatDate, statusClass, daysUntil, probColor, getInitials, truncate } from '../utils/helpers';

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const STAGE_DEFAULT_PROBABILITIES: Record<string, number> = {
  Lead: 20,
  Qualified: 40,
  Proposal: 60,
  Negotiation: 80,
  Won: 100,
  Lost: 0,
};

const LOSS_REASONS = [
  'Price / Budgetary Constraint',
  'Competitor Chosen',
  'Project Postponed / Timing',
  'Feature / Scope Mismatch',
  'No Decision / Inaction',
  'Customer Reorganization',
  'Other',
];

const emptyDeal = {
  opportunityName: '',
  salesperson: '',
  customer: '',
  productService: '',
  dealValue: '',
  probability: '20',
  stage: 'Lead',
  expectedClosingDate: '',
  notes: '',
  lostReason: '',
};

const Deals: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editDeal, setEditDeal] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyDeal });
  const [viewDeal, setViewDeal] = useState<any>(null);

  // Stage Advancement States inside View Modal
  const [customLossReason, setCustomLossReason] = useState(LOSS_REASONS[0]);
  const [showLossPrompt, setShowLossPrompt] = useState(false);

  // Salesperson Reassignment in View Modal
  const [reassignSalespersonId, setReassignSalespersonId] = useState('');

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: ['deals', { search, stage: stageFilter, salesperson: salespersonFilter, page }],
    queryFn: () => getDeals({
      search,
      stage: stageFilter,
      salesperson: salespersonFilter || undefined,
      page,
      limit: 15,
    }),
  });

  const { data: dealStats } = useQuery({
    queryKey: ['dealStats'],
    queryFn: () => getDealStats(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => getCustomers({ limit: 200 }).then(r => r.customers || r.data?.customers || []),
  });

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons'],
    queryFn: getSalespersons,
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (d: any) => createDeal(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['dealStats'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
      toast.success('Opportunity created!', { className: 'toast-custom' });
      setShowModal(false);
      setForm({ ...emptyDeal });
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: any) => updateDeal(id, d),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['dealStats'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
      toast.success('Opportunity updated!', { className: 'toast-custom' });
      setShowModal(false);
      setEditDeal(null);
      if (res.data && viewDeal) setViewDeal(res.data);
    },
    onError: (e: any) => {
      if (e.code === 'DEAL_VERSION_CONFLICT') {
        toast.error('Record was modified by another user. Refreshing latest data...', { className: 'toast-custom' });
        qc.invalidateQueries({ queryKey: ['deals'] });
        setShowModal(false);
        return;
      }
      toast.error(e.message, { className: 'toast-custom' });
    },
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, payload }: any) => changeDealStage(id, payload),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['dealStats'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
      toast.success(`Opportunity transitioned!`, { className: 'toast-custom' });
      if (res.data) setViewDeal(res.data);
      setShowLossPrompt(false);
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, salespersonId }: any) => assignDeal(id, { salespersonId, reason: 'Territory management' }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['dealStats'] });
      toast.success('Salesperson reassigned successfully!', { className: 'toast-custom' });
      if (res.data) setViewDeal(res.data);
      setReassignSalespersonId('');
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDeal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['dealStats'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
      toast.success('Opportunity deleted', { className: 'toast-custom' });
      setViewDeal(null);
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  // ── Form Handlers ──
  const fc = (k: string, v: any) => {
    setForm(f => {
      const updated = { ...f, [k]: v };
      // Auto-adjust probability when stage changes in form
      if (k === 'stage' && STAGE_DEFAULT_PROBABILITIES[v] !== undefined) {
        updated.probability = String(STAGE_DEFAULT_PROBABILITIES[v]);
      }
      return updated;
    });
  };

  const handleSubmit = () => {
    if (!form.opportunityName.trim()) {
      toast.error('Opportunity name is required', { className: 'toast-custom' });
      return;
    }
    if (!form.customer) {
      toast.error('Customer account is required', { className: 'toast-custom' });
      return;
    }
    if (!form.salesperson) {
      toast.error('Assigned salesperson is required', { className: 'toast-custom' });
      return;
    }
    if (!form.productService.trim()) {
      toast.error('Product/service requirement is required', { className: 'toast-custom' });
      return;
    }
    if (form.dealValue === '' || Number(form.dealValue) < 0) {
      toast.error('Deal value must be a valid non-negative number', { className: 'toast-custom' });
      return;
    }
    if (!form.expectedClosingDate) {
      toast.error('Expected close date is required', { className: 'toast-custom' });
      return;
    }

    const payload: any = {
      opportunityName: form.opportunityName.trim(),
      customer: form.customer,
      salesperson: form.salesperson,
      productService: form.productService.trim(),
      dealValue: Number(form.dealValue),
      probability: Number(form.probability),
      stage: form.stage,
      expectedClosingDate: form.expectedClosingDate,
      notes: form.notes.trim() || undefined,
    };

    if (form.stage === 'Lost') {
      payload.lostReason = form.lostReason || customLossReason;
    }

    if (editDeal) {
      payload.version = editDeal.version;
      updateMutation.mutate({ id: editDeal.dealId || editDeal._id, d: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (d: any) => {
    setEditDeal(d);
    setForm({
      opportunityName: d.opportunityName,
      salesperson: d.salesperson?._id || d.salesperson || '',
      customer: d.customer?._id || d.customer || '',
      productService: d.productService || '',
      dealValue: String(d.dealValue ?? ''),
      probability: String(d.probability ?? 50),
      stage: d.stage || 'Lead',
      expectedClosingDate: d.expectedClosingDate ? d.expectedClosingDate.slice(0, 10) : '',
      notes: d.notes || '',
      lostReason: d.lostReason || '',
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditDeal(null);
    setForm({ ...emptyDeal });
    setShowModal(true);
  };

  // State Machine Allowed Next Stages Helper
  const getNextStage = (stage: string) => {
    switch (stage) {
      case 'Lead': return 'Qualified';
      case 'Qualified': return 'Proposal';
      case 'Proposal': return 'Negotiation';
      case 'Negotiation': return 'Won';
      default: return null;
    }
  };

  const handleAdvanceStage = () => {
    if (!viewDeal) return;
    const nextStage = getNextStage(viewDeal.stage);
    if (!nextStage) return;

    stageMutation.mutate({
      id: viewDeal.dealId || viewDeal._id,
      payload: { stage: nextStage },
    });
  };

  const handleMarkLost = () => {
    if (!viewDeal) return;
    stageMutation.mutate({
      id: viewDeal.dealId || viewDeal._id,
      payload: {
        stage: 'Lost',
        lostReason: customLossReason,
      },
    });
  };

  const deals = data?.deals || [];
  const totalPages = data?.pages || 1;
  const stats = dealStats?.data || {};

  return (
    <div className="main-content">
      <Topbar
        title="Deal / Opportunity Management"
        subtitle={`${stats.totalDeals || data?.total || 0} total deals · ${formatCurrency(stats.pipelineValue || 0, true)} active pipeline · ${stats.winRate || 0}% win rate`}
      />

      <main className="page-content fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1>Deals & Opportunities</h1>
            <div className="page-header-subtitle">
              Strict lifecycle control across Lead → Qualified → Proposal → Negotiation → Won / Lost
            </div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={openCreate} id="add-deal-btn">
              <Plus size={15} /> Add Opportunity
            </button>
          </div>
        </div>

        {/* Pipeline KPI Cards Grid */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ '--kpi-accent': 'var(--brand-500)', '--kpi-bg': 'rgba(99, 102, 241, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--brand-400)' }}>
              <TrendingUp size={18} />
            </div>
            <div className="kpi-label">Active Pipeline Value</div>
            <div className="kpi-value">{formatCurrency(stats.pipelineValue || 0, true)}</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              {stats.activeDeals || 0} active opportunities in progress
            </div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': 'var(--accent-cyan)', '--kpi-bg': 'rgba(6, 182, 212, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(6, 182, 212, 0.12)', color: 'var(--accent-cyan)' }}>
              <Percent size={18} />
            </div>
            <div className="kpi-label">Weighted Forecast</div>
            <div className="kpi-value">{formatCurrency(stats.weightedPipeline || 0, true)}</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              Probability-weighted forecast revenue
            </div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': 'var(--accent-emerald)', '--kpi-bg': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)' }}>
              <DollarSign size={18} />
            </div>
            <div className="kpi-label">Closed Won Revenue</div>
            <div className="kpi-value">{formatCurrency(stats.wonRevenue || 0, true)}</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              {stats.wonDeals || 0} closed-won deals booked
            </div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': 'var(--accent-amber)', '--kpi-bg': 'rgba(245, 158, 11, 0.12)' } as React.CSSProperties}>
            <div className="kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)' }}>
              <CheckCircle2 size={18} />
            </div>
            <div className="kpi-label">Pipeline Win Rate</div>
            <div className="kpi-value">{stats.winRate ?? 0}%</div>
            <div className="kpi-change up" style={{ fontSize: 11 }}>
              {stats.wonDeals || 0} won · {stats.lostDeals || 0} lost deals
            </div>
          </div>
        </div>

        {/* Stage Funnel / Filter Pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${stageFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setStageFilter(''); setPage(1); }}
            style={{ fontSize: 12, borderRadius: 20 }}
          >
            All Stages ({stats.totalDeals ?? deals.length})
          </button>
          {STAGES.map(stage => {
            const count = stats.stageBreakdown?.[stage]?.count ?? deals.filter((d: any) => d.stage === stage).length;
            const isSelected = stageFilter === stage;
            return (
              <button
                key={stage}
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setStageFilter(isSelected ? '' : stage); setPage(1); }}
                style={{ fontSize: 12, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span>{stage}</span>
                <span style={{ padding: '1px 6px', background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--bg-input)', borderRadius: 10, fontSize: 10 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters Bar */}
        <div className="filters-bar">
          <div className="search-input-bar">
            <Search size={14} />
            <input
              id="deal-search"
              placeholder="Search opportunity, customer, ID, or product..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            id="deal-stage-filter"
            className="filter-select"
            value={stageFilter}
            onChange={e => { setStageFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            id="deal-salesperson-filter"
            className="filter-select"
            value={salespersonFilter}
            onChange={e => { setSalespersonFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Salespersons</option>
            {salespersons.map((sp: any) => (
              <option key={sp._id} value={sp._id}>{sp.name}</option>
            ))}
          </select>
        </div>

        {/* Deals Table */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Deal ID</th>
                <th>Opportunity Name</th>
                <th>Customer</th>
                <th>Salesperson</th>
                <th>Product / Service</th>
                <th>Deal Value</th>
                <th>Probability</th>
                <th>Weighted Value</th>
                <th>Stage</th>
                <th>Close Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : deals.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-state">
                      <Briefcase size={36} />
                      <h3>No opportunities found</h3>
                      <p>Create a new opportunity or adjust filters</p>
                    </div>
                  </td>
                </tr>
              ) : deals.map((deal: any) => {
                const isClosed = deal.stage === 'Won' || deal.stage === 'Lost';
                const days = !isClosed && deal.expectedClosingDate ? daysUntil(deal.expectedClosingDate) : null;
                const companyName = deal.customer?.companyName || deal.lead?.companyName || '—';

                return (
                  <tr key={deal._id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--brand-300)' }}>
                        {deal.dealId}
                      </span>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{deal.opportunityName}</div>
                        {deal.notes && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {truncate(deal.notes, 28)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div
                          className="avatar"
                          style={{
                            width: 24,
                            height: 24,
                            fontSize: 10,
                            background: 'linear-gradient(135deg, var(--accent-cyan), var(--brand-500))',
                          }}
                        >
                          {getInitials(companyName)}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>
                          {truncate(companyName, 22)}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {deal.salesperson?.name ? (
                        <span>{deal.salesperson.name}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {deal.productService}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                      {formatCurrency(deal.dealValue, true)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 36, height: 5, background: 'var(--bg-input)', borderRadius: 99, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${deal.probability}%`,
                              background: probColor(deal.probability),
                              borderRadius: 99,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: probColor(deal.probability) }}>
                          {deal.probability}%
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      {formatCurrency(deal.weightedValue || 0, true)}
                    </td>
                    <td>
                      <span className={`badge ${statusClass(deal.stage)}`} style={{ fontSize: 11 }}>
                        {deal.stage}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>{formatDate(deal.expectedClosingDate)}</div>
                      {days !== null && (
                        <div style={{ fontSize: 10, marginTop: 1, color: days < 0 ? 'var(--accent-rose)' : days <= 7 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => { setViewDeal(deal); setShowLossPrompt(false); }}
                          id={`view-deal-${deal._id}`}
                          title="View Opportunity & Advance Stage"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => openEdit(deal)}
                          id={`edit-deal-${deal._id}`}
                          title="Edit Opportunity"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          onClick={() => {
                            if (window.confirm(`Delete opportunity "${deal.opportunityName}"?`)) {
                              deleteMutation.mutate(deal.dealId || deal._id);
                            }
                          }}
                          id={`delete-deal-${deal._id}`}
                          title="Delete Opportunity"
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
          ADD / EDIT DEAL MODAL
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditDeal(null); }}
        title={editDeal ? `Edit Opportunity — ${editDeal.opportunityName} (${editDeal.dealId})` : 'New Deal / Opportunity'}
        size="lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            id="save-deal-btn"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editDeal ? 'Update Opportunity' : 'Create Opportunity')}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Opportunity Name *</label>
            <input
              id="deal-name"
              className="form-control"
              value={form.opportunityName}
              onChange={e => fc('opportunityName', e.target.value)}
              placeholder="e.g. Acme Corp - Enterprise Cloud Platform"
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Customer Account *</label>
              <select
                id="deal-customer"
                className="form-control"
                value={form.customer}
                onChange={e => fc('customer', e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.map((c: any) => (
                  <option key={c._id} value={c._id}>
                    {c.companyName} ({c.customerId || c.industry})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Salesperson *</label>
              <select
                id="deal-sp"
                className="form-control"
                value={form.salesperson}
                onChange={e => fc('salesperson', e.target.value)}
              >
                <option value="">Select salesperson</option>
                {salespersons.map((sp: any) => (
                  <option key={sp._id} value={sp._id}>{sp.name} ({sp.role || 'Sales'})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Product / Service *</label>
              <input
                id="deal-product"
                className="form-control"
                value={form.productService}
                onChange={e => fc('productService', e.target.value)}
                placeholder="e.g. Cloud ERP Suite Enterprise"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Deal Value (₹) *</label>
              <input
                id="deal-value"
                className="form-control"
                type="number"
                value={form.dealValue}
                onChange={e => fc('dealValue', e.target.value)}
                placeholder="1500000"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Stage</label>
              <select
                id="deal-stage"
                className="form-control"
                value={form.stage}
                onChange={e => fc('stage', e.target.value)}
              >
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Probability (%)</label>
              <input
                id="deal-prob"
                className="form-control"
                type="number"
                min="0"
                max="100"
                value={form.probability}
                onChange={e => fc('probability', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Expected Closing Date *</label>
              <input
                id="deal-date"
                className="form-control"
                type="date"
                value={form.expectedClosingDate}
                onChange={e => fc('expectedClosingDate', e.target.value)}
              />
            </div>

            {form.stage === 'Lost' && (
              <div className="form-group">
                <label className="form-label">Lost Reason *</label>
                <select
                  id="deal-lost"
                  className="form-control"
                  value={form.lostReason}
                  onChange={e => fc('lostReason', e.target.value)}
                >
                  <option value="">Select reason</option>
                  {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Notes & Technical Requirements</label>
            <textarea
              id="deal-notes"
              className="form-control"
              value={form.notes}
              onChange={e => fc('notes', e.target.value)}
              placeholder="Commercial parameters, stakeholders involved, specific SLA requirements..."
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          OPPORTUNITY DETAIL & STAGE LIFECYCLE MODAL
          ───────────────────────────────────────────────────────────── */}
      {viewDeal && (
        <Modal
          isOpen={!!viewDeal}
          onClose={() => { setViewDeal(null); setShowLossPrompt(false); }}
          title={`Opportunity — ${viewDeal.opportunityName}`}
          size="lg"
          footer={<>
            <button className="btn btn-secondary" onClick={() => setViewDeal(null)}>Close</button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm(`Delete opportunity "${viewDeal.opportunityName}"?`)) {
                  deleteMutation.mutate(viewDeal.dealId || viewDeal._id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 size={13} /> Delete Deal
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const d = viewDeal;
                setViewDeal(null);
                openEdit(d);
              }}
            >
              <Edit2 size={14} /> Edit Opportunity
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
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{viewDeal.opportunityName}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--brand-300)', borderRadius: 4 }}>
                    {viewDeal.dealId}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  Customer: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{viewDeal.customer?.companyName || viewDeal.lead?.companyName || '—'}</span> · Product: {viewDeal.productService}
                </div>
              </div>
              <div>
                <span className={`badge ${statusClass(viewDeal.stage)}`} style={{ fontSize: 13, padding: '5px 12px' }}>
                  {viewDeal.stage}
                </span>
              </div>
            </div>

            {/* Financial Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Deal Value</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-emerald)', marginTop: 4 }}>
                  {formatCurrency(viewDeal.dealValue)}
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Probability</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: probColor(viewDeal.probability), marginTop: 4 }}>
                  {viewDeal.probability}%
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Weighted Value</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 4 }}>
                  {formatCurrency(viewDeal.weightedValue || 0)}
                </div>
              </div>
            </div>

            {/* Stage Progression Controller */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Briefcase size={14} /> Stage Lifecycle Machine (Lead → Qualified → Proposal → Negotiation → Won / Lost)
              </div>

              {/* Lifecycle Breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won'].map((stg, i, arr) => {
                  const isCurrent = viewDeal.stage === stg;
                  const isPast = arr.indexOf(viewDeal.stage) > i;
                  return (
                    <React.Fragment key={stg}>
                      <span
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          borderRadius: 14,
                          fontWeight: 600,
                          background: isCurrent
                            ? 'var(--brand-500)'
                            : isPast
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'var(--bg-card)',
                          color: isCurrent
                            ? '#fff'
                            : isPast
                              ? 'var(--accent-emerald)'
                              : 'var(--text-muted)',
                          border: isCurrent ? '1px solid var(--brand-400)' : '1px solid var(--border)',
                        }}
                      >
                        {stg}
                      </span>
                      {i < arr.length - 1 && (
                        <ArrowRight size={12} color="var(--text-muted)" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Action Controls for Stage Progression */}
              {viewDeal.stage !== 'Won' && viewDeal.stage !== 'Lost' ? (
                <div>
                  {!showLossPrompt ? (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      {getNextStage(viewDeal.stage) && (
                        <button
                          className="btn btn-primary"
                          onClick={handleAdvanceStage}
                          disabled={stageMutation.isPending}
                        >
                          <ArrowRight size={14} />
                          {getNextStage(viewDeal.stage) === 'Won'
                            ? `Close Deal as WON 🎉 (${formatCurrency(viewDeal.dealValue)})`
                            : `Advance to ${getNextStage(viewDeal.stage)} →`}
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowLossPrompt(true)}
                        style={{ color: 'var(--accent-rose)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      >
                        <XCircle size={14} /> Mark as Lost
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-rose)', marginBottom: 8 }}>
                        Specify reason for closing opportunity as Lost:
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          className="form-control"
                          style={{ maxWidth: 260, fontSize: 12 }}
                          value={customLossReason}
                          onChange={e => setCustomLossReason(e.target.value)}
                        >
                          {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={handleMarkLost}
                          disabled={stageMutation.isPending}
                        >
                          Confirm Lost
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setShowLossPrompt(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : viewDeal.stage === 'Won' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-emerald)', fontSize: 13, fontWeight: 600 }}>
                  <CheckCircle2 size={16} />
                  Closed Won! Revenue of {formatCurrency(viewDeal.dealValue)} automatically booked & synced to customer lifetime revenue.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-rose)', fontSize: 13, fontWeight: 500 }}>
                  <XCircle size={16} />
                  Opportunity Lost. Reason: <span style={{ fontWeight: 600 }}>{viewDeal.lostReason || 'Not specified'}</span>
                </div>
              )}
            </div>

            {/* Commercial & Contact Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={13} /> Customer Information
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {viewDeal.customer?.companyName || viewDeal.lead?.companyName || '—'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {viewDeal.customer?.email && <div>Email: {viewDeal.customer.email}</div>}
                  {viewDeal.customer?.phone && <div>Phone: {viewDeal.customer.phone}</div>}
                  {viewDeal.customer?.industry && <div>Industry: {viewDeal.customer.industry}</div>}
                </div>
              </div>

              <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} /> Timeline & Closing
                </div>
                <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Target Close Date: </span>
                    <span style={{ fontWeight: 600 }}>{formatDate(viewDeal.expectedClosingDate)}</span>
                  </div>
                  {viewDeal.actualClosingDate && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Actual Close Date: </span>
                      <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>{formatDate(viewDeal.actualClosingDate)}</span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Created On: </span>
                    <span>{formatDate(viewDeal.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Salesperson Assignment & Reassignment */}
            <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={14} /> Assigned Salesperson & Territory Control
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {viewDeal.salesperson?.name || 'Unassigned'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {viewDeal.salesperson?.email || 'No email'} · {viewDeal.salesperson?.role || 'Sales Rep'}
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
                        id: viewDeal.dealId || viewDeal._id,
                        salespersonId: reassignSalespersonId,
                      });
                    }}
                  >
                    {assignMutation.isPending ? 'Assigning...' : 'Reassign'}
                  </button>
                </div>
              </div>
            </div>

            {/* Opportunity Notes */}
            {viewDeal.notes && (
              <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-400)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                  Opportunity Notes
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {viewDeal.notes}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Deals;
