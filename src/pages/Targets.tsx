import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import { getSalespersons, getTargets, createTarget, createSalesperson } from '../api/client';
import { formatCurrency, getInitials } from '../utils/helpers';

const COLORS = ['#1d4ed8', '#2563eb', '#0284c7', '#059669', '#d97706'];

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();
const currentQuarter = Math.ceil(currentMonth / 3);

const Targets: React.FC = () => {
  const qc = useQueryClient();
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showSpModal, setShowSpModal] = useState(false);
  const [targetForm, setTargetForm] = useState({
    salesperson: '', period: 'Monthly', year: currentYear, month: currentMonth,
    quarter: currentQuarter, targetAmount: '', notes: '',
  });
  const [spForm, setSpForm] = useState({ name: '', email: '', phone: '', role: 'Sales Rep', targets: { monthly: '', quarterly: '', annual: '' } });

  const { data: salespersons = [] } = useQuery({ queryKey: ['salespersons'], queryFn: getSalespersons });
  const { data: monthlyTargets = [] } = useQuery({
    queryKey: ['targets', 'monthly'],
    queryFn: () => getTargets({ period: 'Monthly', year: currentYear, month: currentMonth }),
  });

  const targetMutation = useMutation({
    mutationFn: (d: any) => createTarget(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['targets'] }); qc.invalidateQueries({ queryKey: ['dashboard-overview'] }); toast.success('Target set!', { className: 'toast-custom' }); setShowTargetModal(false); },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const spMutation = useMutation({
    mutationFn: (d: any) => createSalesperson(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['salespersons'] }); toast.success('Salesperson added!', { className: 'toast-custom' }); setShowSpModal(false); },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const tf = (k: string, v: any) => setTargetForm(f => ({ ...f, [k]: v }));
  const sf = (k: string, v: any) => setSpForm(f => ({ ...f, [k]: v }));

  const handleTargetSubmit = () => {
    if (!targetForm.targetAmount) { toast.error('Target amount is required', { className: 'toast-custom' }); return; }
    targetMutation.mutate({
      salesperson: targetForm.salesperson || null,
      period: targetForm.period,
      year: Number(targetForm.year),
      month: targetForm.period === 'Monthly' ? Number(targetForm.month) : undefined,
      quarter: targetForm.period === 'Quarterly' ? Number(targetForm.quarter) : undefined,
      targetAmount: Number(targetForm.targetAmount),
      notes: targetForm.notes,
    });
  };

  const handleSpSubmit = () => {
    if (!spForm.name || !spForm.email) { toast.error('Name and email are required', { className: 'toast-custom' }); return; }
    spMutation.mutate({
      ...spForm,
      targets: {
        monthly: Number(spForm.targets.monthly) || 0,
        quarterly: Number(spForm.targets.quarterly) || 0,
        annual: Number(spForm.targets.annual) || 0,
      },
    });
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Build performance data per salesperson
  const performanceData = salespersons.map((sp: any, i: number) => {
    const spTarget = monthlyTargets.find((t: any) => t.salesperson?._id === sp._id);
    return {
      sp,
      monthlyTarget: spTarget?.targetAmount || sp.targets?.monthly || 0,
      quarterlyTarget: sp.targets?.quarterly || 0,
      annualTarget: sp.targets?.annual || 0,
      color: COLORS[i % COLORS.length],
    };
  });

  return (
    <div className="main-content">
      <Topbar title="Sales Targets" subtitle="Manage individual and company-wide sales goals" />
      <main className="page-content fade-in">
        <div className="page-header">
          <div>
            <h1>Targets</h1>
            <div className="page-header-subtitle">Set and track monthly, quarterly, and annual sales targets</div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={() => setShowSpModal(true)} id="add-sp-btn">
              <Plus size={15} /> Add Salesperson
            </button>
            <button className="btn btn-primary" onClick={() => setShowTargetModal(true)} id="set-target-btn">
              <Target size={15} /> Set Target
            </button>
          </div>
        </div>

        {/* Target Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
          {performanceData.map(({ sp, monthlyTarget, quarterlyTarget, annualTarget, color }: any) => (
            <div key={sp._id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}>
                  {getInitials(sp.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sp.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sp.role}</div>
                </div>
              </div>

              {[
                { label: 'Monthly Target', amount: monthlyTarget, period: `${monthNames[currentMonth - 1]} ${currentYear}` },
                { label: 'Quarterly Target', amount: quarterlyTarget, period: `Q${currentQuarter} ${currentYear}` },
                { label: 'Annual Target', amount: annualTarget, period: `${currentYear}` },
              ].map(({ label, amount, period }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color }}>
                      {amount > 0 ? formatCurrency(amount, true) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not set</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{period}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Salesperson table */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div className="card-title">Salesperson Directory</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Monthly Target</th>
                  <th>Quarterly Target</th>
                  <th>Annual Target</th>
                </tr>
              </thead>
              <tbody>
                {salespersons.map((sp: any, i: number) => (
                  <tr key={sp._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar" style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 2) % COLORS.length]})` }}>
                          {getInitials(sp.name)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{sp.name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sp.email}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sp.phone || '—'}</td>
                    <td><span className="badge qualified" style={{ fontSize: 10 }}>{sp.role}</span></td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(sp.targets?.monthly || 0, true)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(sp.targets?.quarterly || 0, true)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(sp.targets?.annual || 0, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Set Target Modal */}
      <Modal isOpen={showTargetModal} onClose={() => setShowTargetModal(false)} title="Set Sales Target" size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowTargetModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleTargetSubmit} id="save-target-btn" disabled={targetMutation.isPending}>
            {targetMutation.isPending ? 'Saving...' : 'Set Target'}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group"><label className="form-label">Salesperson (leave blank for company-wide)</label>
            <select id="target-sp" className="form-control" value={targetForm.salesperson} onChange={e => tf('salesperson', e.target.value)}>
              <option value="">Company-wide</option>
              {salespersons.map((sp: any) => <option key={sp._id} value={sp._id}>{sp.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Period</label>
            <select id="target-period" className="form-control" value={targetForm.period} onChange={e => tf('period', e.target.value)}>
              <option>Monthly</option><option>Quarterly</option><option>Annual</option>
            </select>
          </div>
          {targetForm.period === 'Monthly' && (
            <div className="form-group"><label className="form-label">Month</label>
              <select id="target-month" className="form-control" value={targetForm.month} onChange={e => tf('month', Number(e.target.value))}>
                {monthNames.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {targetForm.period === 'Quarterly' && (
            <div className="form-group"><label className="form-label">Quarter</label>
              <select id="target-quarter" className="form-control" value={targetForm.quarter} onChange={e => tf('quarter', Number(e.target.value))}>
                <option value={1}>Q1</option><option value={2}>Q2</option><option value={3}>Q3</option><option value={4}>Q4</option>
              </select>
            </div>
          )}
          <div className="form-group"><label className="form-label">Year</label>
            <input id="target-year" className="form-control" type="number" value={targetForm.year} onChange={e => tf('year', Number(e.target.value))} />
          </div>
          <div className="form-group"><label className="form-label">Target Amount (₹) *</label>
            <input id="target-amount" className="form-control" type="number" value={targetForm.targetAmount} onChange={e => tf('targetAmount', e.target.value)} placeholder="500000" />
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea id="target-notes" className="form-control" value={targetForm.notes} onChange={e => tf('notes', e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Add Salesperson Modal */}
      <Modal isOpen={showSpModal} onClose={() => setShowSpModal(false)} title="Add Salesperson" size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowSpModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSpSubmit} id="save-sp-btn" disabled={spMutation.isPending}>
            {spMutation.isPending ? 'Saving...' : 'Add Salesperson'}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group"><label className="form-label">Full Name *</label><input id="sp-name" className="form-control" value={spForm.name} onChange={e => sf('name', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Email *</label><input id="sp-email" className="form-control" type="email" value={spForm.email} onChange={e => sf('email', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Phone</label><input id="sp-phone" className="form-control" value={spForm.phone} onChange={e => sf('phone', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Role</label>
            <select id="sp-role" className="form-control" value={spForm.role} onChange={e => sf('role', e.target.value)}>
              <option>Sales Rep</option><option>Senior Sales Rep</option><option>Account Executive</option><option>Sales Manager</option>
            </select>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Default Targets</div>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Monthly (₹)</label><input id="sp-monthly" className="form-control" type="number" value={spForm.targets.monthly} onChange={e => sf('targets', { ...spForm.targets, monthly: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Annual (₹)</label><input id="sp-annual" className="form-control" type="number" value={spForm.targets.annual} onChange={e => sf('targets', { ...spForm.targets, annual: e.target.value })} /></div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Targets;
