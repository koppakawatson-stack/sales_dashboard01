import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import {
  Plus, Trash2, DollarSign, Calendar, TrendingUp,
  Users, Building, ShoppingBag, BarChart3, Search,
  ArrowUpRight, ArrowDownRight, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import {
  getRevenue, createRevenue, deleteRevenue,
  getRevenueAnalytics,
  getCustomers, getSalespersons
} from '../api/client';
import { formatCurrency, formatDate, getInitials } from '../utils/helpers';

const COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#0284c7', '#ea580c', '#e11d48', '#8b5cf6'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-hover)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        fontSize: 12,
        boxShadow: 'var(--shadow-lg)'
      }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color, fontWeight: 600, margin: 0 }}>
            {p.name}: {formatCurrency(p.value, true)} {p.payload.count !== undefined ? `(${p.payload.count} txns)` : ''}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const emptyRevenue = {
  customer: '',
  salesperson: '',
  amount: '',
  productService: '',
  date: new Date().toISOString().slice(0, 10),
  invoiceNumber: '',
  paymentStatus: 'Paid',
  notes: '',
};

type ViewMode = 'overview' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'byPerson' | 'byCustomer' | 'byProduct' | 'transactions';

const Revenue: React.FC = () => {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...emptyRevenue });
  const [activeTab, setActiveTab] = useState<ViewMode>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSalesperson, setFilterSalesperson] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');

  // Fetch comprehensive revenue analytics
  const { data: analytics } = useQuery({
    queryKey: ['revenue-analytics'],
    queryFn: getRevenueAnalytics,
  });

  // Fetch paginated transactions
  const { data: txData } = useQuery({
    queryKey: ['revenue', { page, search: searchTerm, salesperson: filterSalesperson, status: filterPaymentStatus }],
    queryFn: () => getRevenue({
      page,
      limit: 15,
      salesperson: filterSalesperson || undefined,
    }),
  });

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons'],
    queryFn: getSalespersons,
  });

  const { data: customersData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => getCustomers({ limit: 200 }).then(r => r.customers || r.data?.customers || r),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => createRevenue(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue'] });
      qc.invalidateQueries({ queryKey: ['revenue-analytics'] });
      qc.invalidateQueries({ queryKey: ['revenue-trend'] });
      qc.invalidateQueries({ queryKey: ['revenue-by-salesperson'] });
      toast.success('Revenue recorded successfully!', { className: 'toast-custom' });
      setShowModal(false);
      setForm({ ...emptyRevenue });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to record revenue', { className: 'toast-custom' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRevenue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue'] });
      qc.invalidateQueries({ queryKey: ['revenue-analytics'] });
      toast.success('Revenue record cancelled', { className: 'toast-custom' });
    },
    onError: (e: any) => toast.error(e.message, { className: 'toast-custom' }),
  });

  const fc = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.customer || !form.salesperson || !form.amount || !form.productService) {
      toast.error('Please fill required fields (Customer, Salesperson, Product, Amount)', { className: 'toast-custom' });
      return;
    }
    createMutation.mutate({ ...form, amount: Number(form.amount) });
  };

  const summary = analytics?.summary || {
    totalRevenue: 0,
    totalTransactions: 0,
    avgTransactionValue: 0,
    daily: { current: 0, previous: 0, change: 0 },
    weekly: { current: 0, previous: 0, change: 0 },
    monthly: { current: 0, previous: 0, change: 0 },
    quarterly: { current: 0, previous: 0, change: 0 },
    yearly: { current: 0, previous: 0, change: 0 },
  };

  const dailyTrend = analytics?.dailyTrend || [];
  const weeklyTrend = analytics?.weeklyTrend || [];
  const monthlyTrend = analytics?.monthlyTrend || [];
  const quarterlyTrend = analytics?.quarterlyTrend || [];
  const yearlyTrend = analytics?.yearlyTrend || [];
  const bySalesperson = analytics?.bySalesperson || [];
  const byCustomer = analytics?.byCustomer || [];
  const byProduct = analytics?.byProduct || [];

  const rawRevenues = txData?.revenues || [];
  const filteredRevenues = useMemo(() => {
    return rawRevenues.filter((r: any) => {
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesCust = r.customer?.companyName?.toLowerCase().includes(query);
        const matchesInv = r.invoiceNumber?.toLowerCase().includes(query);
        const matchesProd = r.productService?.toLowerCase().includes(query);
        const matchesSp = r.salesperson?.name?.toLowerCase().includes(query);
        if (!matchesCust && !matchesInv && !matchesProd && !matchesSp) return false;
      }
      if (filterPaymentStatus && r.paymentStatus !== filterPaymentStatus) return false;
      return true;
    });
  }, [rawRevenues, searchTerm, filterPaymentStatus]);

  const totalPages = txData?.pages || 1;

  const renderChangeBadge = (change: number) => {
    const isPositive = change >= 0;
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontSize: 11,
        fontWeight: 700,
        color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)',
        background: isPositive ? 'rgba(5, 150, 105, 0.1)' : 'rgba(225, 29, 72, 0.1)',
        padding: '2px 6px',
        borderRadius: 'var(--radius-sm)'
      }}>
        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {Math.abs(change)}%
      </span>
    );
  };

  return (
    <div className="main-content">
      <Topbar
        title="Revenue Intelligence & Tracking"
        subtitle={`Total Recognized: ${formatCurrency(summary.totalRevenue, true)} across ${summary.totalTransactions} transactions`}
      />

      <main className="page-content fade-in">
        {/* Header with Title and Action */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1>Revenue Dashboard</h1>
            <div className="page-header-subtitle">
              Comprehensive tracking: Daily, Weekly, Monthly, Quarterly, Yearly & Multi-Dimension Analytics
            </div>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setShowModal(true)} id="record-revenue-btn">
              <Plus size={15} /> Record Revenue
            </button>
          </div>
        </div>

        {/* ── 1. CORE REVENUE PERIOD KPIS (Daily, Weekly, Monthly, Quarterly, Yearly) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          {/* Daily Revenue Card */}
          <div className="card stat-card" style={{ padding: '16px 20px', borderLeft: '4px solid #0284c7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Daily Revenue
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(2, 132, 199, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                <Calendar size={16} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
              {formatCurrency(summary.daily.current, true)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Yesterday: {formatCurrency(summary.daily.previous, true)}</span>
              {renderChangeBadge(summary.daily.change)}
            </div>
          </div>

          {/* Weekly Revenue Card */}
          <div className="card stat-card" style={{ padding: '16px 20px', borderLeft: '4px solid #7c3aed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Weekly Revenue
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(124, 58, 237, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                <TrendingUp size={16} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
              {formatCurrency(summary.weekly.current, true)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Last Week: {formatCurrency(summary.weekly.previous, true)}</span>
              {renderChangeBadge(summary.weekly.change)}
            </div>
          </div>

          {/* Monthly Revenue Card */}
          <div className="card stat-card" style={{ padding: '16px 20px', borderLeft: '4px solid #059669' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Monthly Revenue
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(5, 150, 105, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                <DollarSign size={16} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
              {formatCurrency(summary.monthly.current, true)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Last Month: {formatCurrency(summary.monthly.previous, true)}</span>
              {renderChangeBadge(summary.monthly.change)}
            </div>
          </div>

          {/* Quarterly Revenue Card */}
          <div className="card stat-card" style={{ padding: '16px 20px', borderLeft: '4px solid #d97706' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quarterly Revenue
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(217, 119, 6, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                <Layers size={16} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
              {formatCurrency(summary.quarterly.current, true)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Last Quarter: {formatCurrency(summary.quarterly.previous, true)}</span>
              {renderChangeBadge(summary.quarterly.change)}
            </div>
          </div>

          {/* Yearly Revenue Card */}
          <div className="card stat-card" style={{ padding: '16px 20px', borderLeft: '4px solid #2563eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Yearly Revenue
              </span>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <BarChart3 size={16} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
              {formatCurrency(summary.yearly.current, true)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Last Year: {formatCurrency(summary.yearly.previous, true)}</span>
              {renderChangeBadge(summary.yearly.change)}
            </div>
          </div>
        </div>

        {/* ── 2. INTERACTIVE NAVIGATION TABS ── */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
          {[
            { id: 'overview', label: 'All-in-One Overview' },
            { id: 'daily', label: 'Daily Breakdown' },
            { id: 'weekly', label: 'Weekly Trend' },
            { id: 'monthly', label: 'Monthly Trend' },
            { id: 'quarterly', label: 'Quarterly View' },
            { id: 'yearly', label: 'Yearly View' },
            { id: 'byPerson', label: 'By Salesperson' },
            { id: 'byCustomer', label: 'By Customer' },
            { id: 'byProduct', label: 'By Product/Service' },
            { id: 'transactions', label: 'Transactions' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
              onClick={() => setActiveTab(tab.id as ViewMode)}
              id={`rev-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 3. TAB CONTENT VIEWS ── */}

        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Top Charts: Monthly Trend & Revenue by Salesperson */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
              <div className="card">
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="card-title">Monthly Revenue Trend (Last 12 Months)</div>
                    <div className="card-subtitle">Trajectory of recognized monthly business</div>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="monthRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                        <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="revenue" name="Monthly Revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#monthRevGrad)" dot={{ r: 3, fill: '#2563eb' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* By Product / Service Breakdown */}
              <div className="card">
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="card-title">Revenue by Product / Service</div>
                    <div className="card-subtitle">Contribution across portfolio solutions</div>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byProduct} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                        <YAxis type="category" dataKey="productService" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                          {byProduct.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom 3 Dimension Cards: Salesperson, Customer, Product summary tables */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {/* Salesperson Performance */}
              <div className="card">
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={16} color="var(--brand-500)" />
                    <div className="card-title">Revenue by Salesperson</div>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {bySalesperson.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px 0' }}>No salesperson records</div>
                  ) : bySalesperson.slice(0, 5).map((sp: any, idx: number) => (
                    <div key={sp.id || idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: idx < 3 ? 'var(--accent-amber)' : 'var(--text-muted)', width: 16 }}>#{idx + 1}</span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{sp.name}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(sp.revenue, true)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({sp.percentage}%)</span>
                        </div>
                      </div>
                      <div className="progress-bar" style={{ height: 6 }}>
                        <div className="progress-fill success" style={{ width: `${Math.min(100, sp.percentage * 2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Contribution */}
              <div className="card">
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building size={16} color="var(--accent-violet)" />
                    <div className="card-title">Revenue by Customer</div>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {byCustomer.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px 0' }}>No customer records</div>
                  ) : byCustomer.slice(0, 5).map((cust: any, idx: number) => (
                    <div key={cust.id || idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 16 }}>#{idx + 1}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{cust.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cust.industry} • {cust.count} txns</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(cust.revenue, true)}</div>
                          <div style={{ fontSize: 11, color: 'var(--brand-500)', fontWeight: 600 }}>{cust.percentage}%</div>
                        </div>
                      </div>
                      <div className="progress-bar" style={{ height: 6 }}>
                        <div className="progress-fill primary" style={{ width: `${Math.min(100, cust.percentage * 2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product / Service Breakdown List */}
              <div className="card">
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShoppingBag size={16} color="var(--accent-emerald)" />
                    <div className="card-title">Product / Service Share</div>
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {byProduct.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px 0' }}>No product records</div>
                  ) : byProduct.slice(0, 5).map((prod: any, idx: number) => (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{prod.productService}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(prod.revenue, true)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({prod.percentage}%)</span>
                        </div>
                      </div>
                      <div className="progress-bar" style={{ height: 6 }}>
                        <div className="progress-fill" style={{ width: `${prod.percentage}%`, background: COLORS[idx % COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: DAILY REVENUE */}
        {activeTab === 'daily' && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Daily Revenue Tracking (Last 14 Days)</div>
                <div className="card-subtitle">Granular day-to-day revenue recognized in MongoDB</div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ height: 320, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} angle={-25} textAnchor="end" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Daily Revenue" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Transactions</th>
                      <th>Total Daily Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyTrend.length === 0 ? (
                      <tr><td colSpan={3} className="text-center">No daily revenue recorded in the last 14 days</td></tr>
                    ) : dailyTrend.map((d: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{d.date}</td>
                        <td>{d.count} txns</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(d.revenue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: WEEKLY REVENUE */}
        {activeTab === 'weekly' && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Weekly Revenue Tracking (Last 8 Weeks)</div>
                <div className="card-subtitle">Week-over-week revenue aggregates</div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ height: 320, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="weekGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" name="Weekly Revenue" stroke="#7c3aed" strokeWidth={2.5} fill="url(#weekGrad)" dot={{ r: 4, fill: '#7c3aed' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Year</th>
                      <th>Transactions</th>
                      <th>Total Weekly Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyTrend.length === 0 ? (
                      <tr><td colSpan={4} className="text-center">No weekly revenue recorded</td></tr>
                    ) : weeklyTrend.map((w: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{w.label}</td>
                        <td>{w.year}</td>
                        <td>{w.count} txns</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(w.revenue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: MONTHLY REVENUE */}
        {activeTab === 'monthly' && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Monthly Revenue Tracking (Last 12 Months)</div>
                <div className="card-subtitle">Month-by-month recognized revenue performance</div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ height: 320, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Monthly Revenue" fill="#059669" radius={[4, 4, 0, 0]}>
                      {monthlyTrend.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Year</th>
                      <th>Transactions</th>
                      <th>Total Monthly Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrend.length === 0 ? (
                      <tr><td colSpan={4} className="text-center">No monthly revenue recorded</td></tr>
                    ) : monthlyTrend.map((m: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{m.label}</td>
                        <td>{m.year}</td>
                        <td>{m.count} txns</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(m.revenue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: QUARTERLY REVENUE */}
        {activeTab === 'quarterly' && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Quarterly Revenue Tracking (Q1 - Q4)</div>
                <div className="card-subtitle">Quarter-by-quarter revenue recognition</div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ height: 320, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quarterlyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barSize={36}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Quarterly Revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Quarter</th>
                      <th>Year</th>
                      <th>Transactions</th>
                      <th>Total Quarterly Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarterlyTrend.length === 0 ? (
                      <tr><td colSpan={4} className="text-center">No quarterly revenue recorded</td></tr>
                    ) : quarterlyTrend.map((q: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{q.label}</td>
                        <td>{q.year}</td>
                        <td>{q.count} txns</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(q.revenue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: YEARLY REVENUE */}
        {activeTab === 'yearly' && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Yearly Revenue Tracking</div>
                <div className="card-subtitle">Annual revenue trajectory and comparisons</div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ height: 320, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearlyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barSize={48}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Yearly Revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Transactions</th>
                      <th>Total Annual Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyTrend.length === 0 ? (
                      <tr><td colSpan={3} className="text-center">No yearly revenue recorded</td></tr>
                    ) : yearlyTrend.map((y: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{y.label}</td>
                        <td>{y.count} transactions</td>
                        <td style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: 15 }}>{formatCurrency(y.revenue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: REVENUE BY SALESPERSON */}
        {activeTab === 'byPerson' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Revenue Share by Salesperson</div>
              </div>
              <div className="card-body">
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={bySalesperson.map((s: any) => ({ name: s.name, value: s.revenue }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={105}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }: any) => `${name} (${(((percent as number) || 0) * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {bySalesperson.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(v, true)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Salesperson Performance Leaderboard</div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {bySalesperson.map((sp: any, i: number) => (
                  <div key={sp.id || i} style={{ padding: '10px 14px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 22, fontWeight: 700, fontSize: 13, color: i < 3 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>#{i + 1}</div>
                        <div className="avatar avatar-sm" style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 2) % COLORS.length]})` }}>
                          {getInitials(sp.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{sp.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sp.role || 'Sales Rep'} • {sp.count} deals closed</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(sp.revenue, true)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sp.percentage}% of total</div>
                      </div>
                    </div>
                    <div className="progress-bar" style={{ height: 6 }}>
                      <div className="progress-fill success" style={{ width: `${sp.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: REVENUE BY CUSTOMER */}
        {activeTab === 'byCustomer' && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Revenue by Customer Breakdown</div>
                <div className="card-subtitle">Lifetime recognized revenue per enterprise client</div>
              </div>
            </div>
            <div className="card-body">
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Customer Company</th>
                      <th>Industry</th>
                      <th>Transactions</th>
                      <th>Total Revenue</th>
                      <th>Revenue Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCustomer.length === 0 ? (
                      <tr><td colSpan={6} className="text-center">No customer revenue records</td></tr>
                    ) : byCustomer.map((c: any, i: number) => (
                      <tr key={c.id || i}>
                        <td><span style={{ fontWeight: 700, color: i < 3 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>#{i + 1}</span></td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</td>
                        <td><span className="badge" style={{ background: 'rgba(37, 99, 235, 0.08)', color: 'var(--brand-600)' }}>{c.industry}</span></td>
                        <td>{c.count} transactions</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: 14 }}>{formatCurrency(c.revenue, true)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="progress-bar" style={{ width: 80, height: 6 }}>
                              <div className="progress-fill primary" style={{ width: `${c.percentage}%` }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: REVENUE BY PRODUCT / SERVICE */}
        {activeTab === 'byProduct' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Product / Service Distribution</div>
              </div>
              <div className="card-body">
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byProduct.map((p: any) => ({ name: p.productService, value: p.revenue }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={105}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }: any) => `${name} (${(((percent as number) || 0) * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {byProduct.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(v, true)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Solution Portfolio Breakdown</div>
              </div>
              <div className="card-body">
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Product / Service</th>
                        <th>Deals</th>
                        <th>Total Revenue</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byProduct.map((p: any, i: number) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.productService}</td>
                          <td>{p.count}</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(p.revenue, true)}</td>
                          <td style={{ fontWeight: 600, color: 'var(--brand-600)' }}>{p.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: TRANSACTIONS TABLE */}
        {activeTab === 'transactions' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="card-title">All Revenue Transactions</div>
                <div className="card-subtitle">Audited financial records recorded from Won opportunities and invoices</div>
              </div>
              {/* Search & Filters */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 220 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: 30, height: 34, fontSize: 12 }}
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <select
                  className="form-control"
                  style={{ width: 140, height: 34, fontSize: 12 }}
                  value={filterSalesperson}
                  onChange={e => setFilterSalesperson(e.target.value)}
                >
                  <option value="">All Salespersons</option>
                  {salespersons.map((sp: any) => (
                    <option key={sp._id} value={sp._id}>{sp.name}</option>
                  ))}
                </select>
                <select
                  className="form-control"
                  style={{ width: 120, height: 34, fontSize: 12 }}
                  value={filterPaymentStatus}
                  onChange={e => setFilterPaymentStatus(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>
            </div>

            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Revenue ID</th>
                      <th>Customer</th>
                      <th>Salesperson</th>
                      <th>Product / Service</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRevenues.length === 0 ? (
                      <tr>
                        <td colSpan={9}>
                          <div className="empty-state" style={{ padding: '30px 0' }}>
                            <DollarSign size={36} color="var(--text-muted)" />
                            <h3>No transactions found</h3>
                            <p>Try clearing your filters or record a new revenue entry.</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredRevenues.map((r: any) => (
                      <tr key={r._id}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--brand-600)', fontWeight: 600 }}>{r.revenueId}</span></td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{r.customer?.companyName || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.salesperson?.name || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.productService}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: 14 }}>{formatCurrency(r.amount, true)}</td>
                        <td style={{ fontSize: 12 }}>{formatDate(r.date || r.recognizedAt)}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{r.invoiceNumber || '—'}</td>
                        <td>
                          <span className={`badge ${r.paymentStatus === 'Paid' ? 'won' : r.paymentStatus === 'Overdue' ? 'lost' : 'new'}`} style={{ fontSize: 11 }}>
                            {r.paymentStatus || 'Paid'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-danger btn-icon btn-sm"
                            onClick={() => {
                              if (confirm('Cancel this revenue record?')) deleteMutation.mutate(r._id);
                            }}
                            id={`delete-revenue-${r._id}`}
                            title="Cancel record"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
            </div>
          </div>
        )}
      </main>

      {/* Record Revenue Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Record Recognized Revenue"
        size="md"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            id="save-revenue-btn"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving...' : 'Record Revenue'}
          </button>
        </>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Customer *</label>
              <select id="rev-customer" className="form-control" value={form.customer} onChange={e => fc('customer', e.target.value)}>
                <option value="">Select customer</option>
                {(customersData || []).map((c: any) => (
                  <option key={c._id} value={c._id}>{c.companyName}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Salesperson *</label>
              <select id="rev-sp" className="form-control" value={form.salesperson} onChange={e => fc('salesperson', e.target.value)}>
                <option value="">Select salesperson</option>
                {salespersons.map((sp: any) => (
                  <option key={sp._id} value={sp._id}>{sp.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Product/Service *</label>
              <input
                id="rev-product"
                className="form-control"
                value={form.productService}
                onChange={e => fc('productService', e.target.value)}
                placeholder="e.g. Enterprise Cloud Suite"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                id="rev-amount"
                className="form-control"
                type="number"
                value={form.amount}
                onChange={e => fc('amount', e.target.value)}
                placeholder="e.g. 500000"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                id="rev-date"
                className="form-control"
                type="date"
                value={form.date}
                onChange={e => fc('date', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice Number</label>
              <input
                id="rev-invoice"
                className="form-control"
                value={form.invoiceNumber}
                onChange={e => fc('invoiceNumber', e.target.value)}
                placeholder="INV-2026-001"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Status</label>
              <select
                id="rev-status"
                className="form-control"
                value={form.paymentStatus}
                onChange={e => fc('paymentStatus', e.target.value)}
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Partial">Partial</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              id="rev-notes"
              className="form-control"
              value={form.notes}
              onChange={e => fc('notes', e.target.value)}
              placeholder="Commercial contract details, payment terms, or notes..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Revenue;
