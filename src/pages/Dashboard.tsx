import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Users, Briefcase, TrendingUp, Target,
  Award, ArrowUpRight, ArrowDownRight, Activity,
  DollarSign, Clock, CheckCircle, XCircle, Phone, Mail, Monitor, Bell
} from 'lucide-react';
import Topbar from '../components/Topbar';
import HarvikLogo from '../components/HarvikLogo';
import {
  getDashboardOverview, getSalespersonPerformance,
  getRecentActivities, getRevenueTrend, getUpcomingFollowUps, getPipelineSummary
} from '../api/client';
import { formatCurrency, formatDate, getInitials, monthName } from '../utils/helpers';

const COLORS = ['#1d4ed8', '#2563eb', '#0284c7', '#059669', '#d97706', '#ea580c'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-hover)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        fontSize: 12,
        boxShadow: 'var(--shadow-lg)',
      }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color, fontWeight: 600 }}>
            {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue')
              ? formatCurrency(p.value, true)
              : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const activityTypeIcon = (type: string) => {
  const map: Record<string, React.ReactNode> = {
    Call: <Phone size={13} />,
    Meeting: <Users size={13} />,
    Email: <Mail size={13} />,
    Demo: <Monitor size={13} />,
    'Follow-up': <Bell size={13} />,
  };
  return map[type] || <Activity size={13} />;
};

const Dashboard: React.FC = () => {
  const {
    data: overview,
    isLoading: loadingOverview,
    isError: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: getDashboardOverview,
    refetchInterval: 60000,
  });

  const { data: performance = [] } = useQuery({
    queryKey: ['salesperson-performance'],
    queryFn: getSalespersonPerformance,
  });

  const { data: recentActivities = [] } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: getRecentActivities,
  });

  const { data: revenueTrend = [] } = useQuery({
    queryKey: ['revenue-trend'],
    queryFn: getRevenueTrend,
  });

  const { data: followUps = [] } = useQuery({
    queryKey: ['upcoming-followups'],
    queryFn: getUpcomingFollowUps,
  });

  const { data: pipelineData = [] } = useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: getPipelineSummary,
  });

  // Format revenue trend for chart
  const trendChartData = revenueTrend.map((d: any) => ({
    month: monthName(d._id.month),
    revenue: d.total,
    deals: d.count,
  }));

  // Pipeline chart data
  const pipelineChartData = pipelineData.map((p: any) => ({
    stage: p._id,
    value: Math.round(p.totalValue / 100000),
    count: p.count,
  }));

  const comparisons = overview?.data?.comparisons || overview?.comparisons || {};
  const totalLeadsChange = comparisons?.totalLeads?.percentageChange ?? 0;
  const wonDealsChange = comparisons?.wonDeals?.percentageChange ?? 0;
  const revenueChange = comparisons?.monthlyRevenue?.percentageChange ?? 0;
  const conversionChange = comparisons?.conversionRate?.percentageChange ?? 0;

  const kpis = [
    {
      label: 'Total Leads',
      value: overview?.totalLeads ?? '—',
      icon: <Users size={18} />,
      color: 'var(--accent-cyan)',
      bg: 'rgba(6,182,212,0.12)',
      change: `${totalLeadsChange >= 0 ? '+' : ''}${totalLeadsChange}%`,
      up: totalLeadsChange >= 0,
    },
    {
      label: 'Active Deals',
      value: overview?.activeOpportunities ?? '—',
      icon: <Briefcase size={18} />,
      color: 'var(--brand-400)',
      bg: 'rgba(99,102,241,0.12)',
      change: 'Active',
      up: true,
    },
    {
      label: 'Won Deals',
      value: overview?.wonDeals ?? '—',
      icon: <CheckCircle size={18} />,
      color: 'var(--accent-emerald)',
      bg: 'rgba(16,185,129,0.12)',
      change: `${wonDealsChange >= 0 ? '+' : ''}${wonDealsChange}%`,
      up: wonDealsChange >= 0,
    },
    {
      label: 'Lost Deals',
      value: overview?.lostDeals ?? '—',
      icon: <XCircle size={18} />,
      color: 'var(--accent-rose)',
      bg: 'rgba(244,63,94,0.12)',
      change: 'Closed',
      up: false,
    },
    {
      label: 'Pipeline Value',
      value: overview?.totalPipeline !== undefined ? formatCurrency(overview.totalPipeline, true) : '—',
      icon: <TrendingUp size={18} />,
      color: 'var(--accent-violet)',
      bg: 'rgba(139,92,246,0.12)',
      change: 'Active',
      up: true,
    },
    {
      label: 'Won Revenue',
      value: overview?.wonRevenue !== undefined ? formatCurrency(overview.wonRevenue, true) : '—',
      icon: <DollarSign size={18} />,
      color: 'var(--accent-emerald)',
      bg: 'rgba(16,185,129,0.12)',
      change: `${revenueChange >= 0 ? '+' : ''}${revenueChange}%`,
      up: revenueChange >= 0,
    },
    {
      label: 'Monthly Revenue',
      value: overview?.monthlyRevenue !== undefined ? formatCurrency(overview.monthlyRevenue, true) : '—',
      icon: <Award size={18} />,
      color: 'var(--accent-amber)',
      bg: 'rgba(245,158,11,0.12)',
      change: `${revenueChange >= 0 ? '+' : ''}${revenueChange}%`,
      up: revenueChange >= 0,
    },
    {
      label: 'Conversion Rate',
      value: overview?.conversionRate !== undefined ? `${overview.conversionRate}%` : '—',
      icon: <Target size={18} />,
      color: 'var(--accent-orange)',
      bg: 'rgba(249,115,22,0.12)',
      change: `${conversionChange >= 0 ? '+' : ''}${conversionChange}%`,
      up: conversionChange >= 0,
    },
  ];

  return (
    <div className="main-content">
      <Topbar title="Sales Overview" subtitle="Real-time sales intelligence & performance dashboard" />
      <main className="page-content fade-in">

        {/* Error / Retry State Banner (Section 30) */}
        {overviewError && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>
                  Sales Overview Temporarily Unavailable
                </div>
                <div style={{ fontSize: 12, color: '#b91c1c' }}>
                  Unable to derive live metrics from authoritative source of truth.
                </div>
              </div>
            </div>
            <button
              onClick={() => refetchOverview()}
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* ── Harvik Corporate Brand Hero Card (from user UI format) ── */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '36px 32px 28px',
            marginBottom: '24px',
            boxShadow: '0 4px 16px -2px rgba(15,23,42,0.05)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle top brand accent line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, #1d4ed8, #2563eb, #38bdf8)',
            }}
          />

          {/* Elevated Centered Logo Container */}
          <div style={{ display: 'inline-block', marginBottom: 18 }}>
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '12px 28px',
                boxShadow: '0 2px 10px rgba(15,23,42,0.06)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HarvikLogo size="md" showTagline={true} />
            </div>
          </div>

          {/* Orange Badge */}
          <div style={{ marginBottom: 16 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#ea580c',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                padding: '4px 14px',
                borderRadius: 9999,
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: '#ea580c',
                  display: 'inline-block',
                }}
              />
              AI & SOFTWARE PRODUCT ENGINEERING • Hyderabad, India
            </span>
          </div>

          {/* Big Bold Headline */}
          <h1
            style={{
              fontFamily: "'Outfit', 'Inter', sans-serif",
              fontSize: '34px',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              marginBottom: 10,
            }}
          >
            Intelligence Engineered for{' '}
            <span
              style={{
                color: '#1d4ed8',
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Modern Software.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              maxWidth: '720px',
              margin: '0 auto 20px',
              fontSize: '14px',
              color: '#475569',
              lineHeight: 1.55,
            }}
          >
            One team to design, build and scale AI-powered software and enterprise platforms —
            architected for deployment inside your own environment.
          </p>

          {/* Live Quick Counter Badges */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              flexWrap: 'wrap',
              borderTop: '1px solid #f1f5f9',
              paddingTop: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
              <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                {overview?.wonRevenue !== undefined ? formatCurrency(overview.wonRevenue, true) : '—'}
              </span>
              <span>Won Revenue</span>
            </div>
            <span style={{ color: '#cbd5e1' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
              <span style={{ fontWeight: 700, color: '#059669' }}>
                {overview?.totalPipeline !== undefined ? formatCurrency(overview.totalPipeline, true) : '—'}
              </span>
              <span>Pipeline Value</span>
            </div>
            <span style={{ color: '#cbd5e1' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
              <span style={{ fontWeight: 700, color: '#ea580c' }}>
                {overview?.targetAchievement !== undefined ? `${overview.targetAchievement}%` : '—'}
              </span>
              <span>Target Achievement</span>
            </div>
            <span style={{ color: '#cbd5e1' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
              <span style={{ fontWeight: 700, color: '#7c3aed' }}>
                {overview?.totalLeads !== undefined ? overview.totalLeads : '—'}
              </span>
              <span>Active Leads</span>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          {kpis.map((kpi, i) => (
            <div key={i} className="kpi-card" style={{ '--kpi-accent': kpi.color, '--kpi-bg': kpi.bg } as React.CSSProperties}>
              <div className="kpi-icon" style={{ background: kpi.bg, color: kpi.color }}>
                {kpi.icon}
              </div>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">
                {loadingOverview ? <div className="spinner" style={{ width: 16, height: 16, marginTop: 4 }} /> : kpi.value}
              </div>
              <div className={`kpi-change ${kpi.up ? 'up' : 'down'}`}>
                {kpi.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {kpi.change} vs last month
              </div>
            </div>
          ))}
        </div>

        {/* Monthly Target Progress */}
        {overview && (
          <div className="card" style={{ marginBottom: 24, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div className="card-title">Monthly Target Achievement</div>
                <div className="card-subtitle">
                  {formatCurrency(overview.monthlyRevenue, true)} of {formatCurrency(overview.monthlyTarget, true)} target
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: overview.targetAchievement >= 100 ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontFamily: 'var(--font-display)' }}>
                  {overview.targetAchievement}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>achieved</div>
              </div>
            </div>
            <div className="progress-bar" style={{ height: 10 }}>
              <div
                className={`progress-fill ${overview.targetAchievement >= 100 ? 'success' : overview.targetAchievement >= 70 ? 'warning' : 'danger'}`}
                style={{ width: `${Math.min(overview.targetAchievement, 100)}%` }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>₹0</span>
              <span>{formatCurrency(overview.monthlyTarget, true)} target</span>
            </div>
          </div>
        )}

        {/* Charts Row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, marginBottom: 20 }}>
          {/* Revenue Trend */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <div className="card-title">Revenue Trend</div>
                <div className="card-subtitle">Monthly revenue over the last 12 months</div>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="chart-container" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" strokeWidth={2.5} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Pipeline */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <div className="card-title">Pipeline by Stage</div>
                <div className="card-subtitle">Value in Lakhs (₹L)</div>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="chart-container" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="stage" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Value (₹L)" radius={[4, 4, 0, 0]}>
                      {pipelineChartData.map((_: any, index: number) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Lead Status Donut */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="card-title">Lead Breakdown</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="chart-container" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'New', value: overview?.newLeads || 0 },
                        { name: 'Qualified', value: overview?.qualifiedLeads || 0 },
                        { name: 'Active', value: overview?.activeOpportunities || 0 },
                        { name: 'Won', value: overview?.wonDeals || 0 },
                        { name: 'Lost', value: overview?.lostDeals || 0 },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={48} outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Activities */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div className="card-title">Recent Activities</div>
              <a href="/activities" style={{ fontSize: 12, color: 'var(--brand-400)' }}>View all →</a>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recentActivities.slice(0, 5).map((act: any) => (
                  <div key={act._id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border)'
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-md)',
                      background: 'rgba(99,102,241,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--brand-400)', flexShrink: 0
                    }}>
                      {activityTypeIcon(act.activityType)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {act.activityType}
                        <span className={`badge ${act.outcome?.toLowerCase() === 'positive' ? 'won' : act.outcome?.toLowerCase() === 'negative' ? 'lost' : 'qualified'}`} style={{ fontSize: 10, padding: '1px 7px' }}>
                          {act.outcome || act.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                        {act.salesperson?.name} • {act.customer?.companyName || act.lead?.companyName || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                      {formatDate(act.date)}
                    </div>
                  </div>
                ))}
                {recentActivities.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
                    No recent activities
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Salesperson Performance */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">Salesperson Performance</div>
              <div className="card-subtitle">Monthly revenue vs. target</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Role</th>
                  <th>Revenue (This Month)</th>
                  <th>Target</th>
                  <th>Achievement</th>
                  <th>Leads</th>
                  <th>Deals</th>
                  <th>Won</th>
                  <th>Activities</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar" style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 2) % COLORS.length]})` }}>
                          {getInitials(p.salesperson?.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.salesperson?.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.salesperson?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.salesperson?.role}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(p.monthlyRevenue, true)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(p.monthlyTarget, true)}</td>
                    <td>
                      <div style={{ minWidth: 100 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                          <span style={{ color: p.achievement >= 100 ? 'var(--accent-emerald)' : p.achievement >= 70 ? 'var(--accent-amber)' : 'var(--accent-rose)', fontWeight: 600 }}>
                            {p.achievement}%
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className={`progress-fill ${p.achievement >= 100 ? 'success' : p.achievement >= 70 ? 'warning' : 'danger'}`}
                            style={{ width: `${Math.min(p.achievement, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>{p.totalLeads}</td>
                    <td style={{ textAlign: 'center' }}>{p.totalDeals}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>{p.wonDeals}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{p.activitiesThisMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming Follow-ups */}
        {followUps.length > 0 && (
          <div className="card">
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="card-title">Upcoming Follow-ups (Next 7 Days)</div>
              <span className="sidebar-badge" style={{ marginLeft: 0 }}>{followUps.length}</span>
            </div>
            <div className="card-body" style={{ paddingTop: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {followUps.map((lead: any) => (
                <div key={lead._id} style={{
                  padding: '12px 14px', background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)'
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{lead.companyName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{lead.contactPerson}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className={`badge ${lead.status?.toLowerCase()}`}>{lead.status}</span>
                    <span style={{ fontSize: 11, color: 'var(--accent-amber)' }}>
                      <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                      {formatDate(lead.nextFollowUpDate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default Dashboard;
