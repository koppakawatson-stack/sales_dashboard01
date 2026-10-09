import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Line, AreaChart, Area
} from 'recharts';
import { BarChart2, TrendingUp, Users, Briefcase } from 'lucide-react';
import Topbar from '../components/Topbar';
import { getLeads, getDeals, getRevenueTrend, getSalespersonPerformance } from '../api/client';
import { formatCurrency, monthName, getInitials } from '../utils/helpers';

const COLORS = ['#1d4ed8', '#2563eb', '#0284c7', '#059669', '#d97706', '#ea580c', '#7c3aed'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, boxShadow: 'var(--shadow-lg)' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color, fontWeight: 600 }}>
            {p.name}: {typeof p.value === 'number' && (p.name?.toLowerCase().includes('revenue') || p.name?.toLowerCase().includes('value'))
              ? formatCurrency(p.value, true) : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'conversion' | 'revenue' | 'performance'>('pipeline');

  const { data: leadsData } = useQuery({
    queryKey: ['leads-all'],
    queryFn: () => getLeads({ limit: 500 }).then(r => r.leads || []),
  });

  const { data: dealsData } = useQuery({
    queryKey: ['deals-all'],
    queryFn: () => getDeals({ limit: 500 }).then(r => r.deals || []),
  });

  const { data: trendData = [] } = useQuery({ queryKey: ['revenue-trend'], queryFn: getRevenueTrend });
  const { data: performance = [] } = useQuery({ queryKey: ['salesperson-performance'], queryFn: getSalespersonPerformance });

  // Lead by source
  const leadsBySource = (leadsData || []).reduce((acc: Record<string, number>, l: any) => {
    acc[l.source] = (acc[l.source] || 0) + 1;
    return acc;
  }, {});
  const sourceData = Object.entries(leadsBySource).map(([name, value]) => ({ name, value }));

  // Lead by status
  const leadsByStatus = (leadsData || []).reduce((acc: Record<string, number>, l: any) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});
  const statusData = Object.entries(leadsByStatus).map(([name, value]) => ({ name, value }));

  // Deals by stage
  const dealsByStage = (dealsData || []).reduce((acc: Record<string, { count: number; value: number }>, d: any) => {
    if (!acc[d.stage]) acc[d.stage] = { count: 0, value: 0 };
    acc[d.stage].count++;
    acc[d.stage].value += d.dealValue || 0;
    return acc;
  }, {});
  const stageData = Object.entries(dealsByStage).map(([name, v]: [string, any]) => ({ name, count: v.count, value: Math.round(v.value / 100000) }));

  // Revenue trend chart
  const chartData = trendData.map((d: any) => ({
    month: `${monthName(d._id.month)}`,
    revenue: d.total,
    deals: d.count,
  }));

  // Won vs Lost
  const wonVsLost = [
    { name: 'Won', value: (dealsData || []).filter((d: any) => d.stage === 'Won').length },
    { name: 'Lost', value: (dealsData || []).filter((d: any) => d.stage === 'Lost').length },
    { name: 'Active', value: (dealsData || []).filter((d: any) => !['Won', 'Lost'].includes(d.stage)).length },
  ];

  const tabs = [
    { id: 'pipeline', label: 'Pipeline Report', icon: <Briefcase size={14} /> },
    { id: 'conversion', label: 'Conversion Report', icon: <TrendingUp size={14} /> },
    { id: 'revenue', label: 'Revenue Report', icon: <BarChart2 size={14} /> },
    { id: 'performance', label: 'Salesperson Report', icon: <Users size={14} /> },
  ];

  return (
    <div className="main-content">
      <Topbar title="Sales Reports" subtitle="Comprehensive analytics and insights" />
      <main className="page-content fade-in">
        <div className="page-header">
          <div>
            <h1>Reports</h1>
            <div className="page-header-subtitle">Data-driven insights to make smarter sales decisions</div>
          </div>
        </div>

        {/* Tab Nav */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              id={`report-tab-${tab.id}`}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ gap: 7 }}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Pipeline Report */}
        {activeTab === 'pipeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card">
                <div className="card-header" style={{ marginBottom: 16 }}>
                  <div className="card-title">Deals by Stage (Count)</div>
                </div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageData} barSize={30}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]}>
                          {stageData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header" style={{ marginBottom: 16 }}>
                  <div className="card-title">Pipeline Value by Stage (₹L)</div>
                </div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageData} barSize={30}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" name="Value (₹L)" radius={[4, 4, 0, 0]}>
                          {stageData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage table */}
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Stage</th><th>Deal Count</th><th>Total Value</th><th>Avg Deal Size</th></tr></thead>
                <tbody>
                  {stageData.map((s: any, i: number) => {
                    const avg = s.count > 0 ? (s.value * 100000) / s.count : 0;
                    return (
                      <tr key={s.name}>
                        <td><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />{s.name}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{s.count}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>₹{s.value}L</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(avg, true)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conversion Report */}
        {activeTab === 'conversion' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <div className="card">
                <div className="card-header" style={{ marginBottom: 16 }}><div className="card-title">Leads by Source</div></div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sourceData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                          {sourceData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header" style={{ marginBottom: 16 }}><div className="card-title">Lead Status Breakdown</div></div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={3}>
                          {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header" style={{ marginBottom: 16 }}><div className="card-title">Won vs Lost vs Active</div></div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={wonVsLost} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                          <Cell fill="#10b981" />
                          <Cell fill="#f43f5e" />
                          <Cell fill="#6366f1" />
                        </Pie>
                        <Tooltip />
                        <Legend formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Source breakdown table */}
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Source</th><th>Total Leads</th><th>% of Total</th></tr></thead>
                <tbody>
                  {sourceData.sort((a: any, b: any) => Number(b.value) - Number(a.value)).map((s: any, i: number) => {
                    const total = sourceData.reduce((a: number, d: any) => a + d.value, 0);
                    return (
                      <tr key={s.name}>
                        <td><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />{s.name}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{s.value}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 5, background: 'var(--bg-input)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(s.value / total) * 100}%`, background: COLORS[i % COLORS.length], borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36 }}>{((s.value / total) * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Revenue Report */}
        {activeTab === 'revenue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header" style={{ marginBottom: 16 }}>
                <div className="card-title">Monthly Revenue vs Deal Count</div>
              </div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="url(#revG)" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="deals" name="Deals" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead><tr><th>Month</th><th>Revenue</th><th>No. of Deals</th><th>Avg per Deal</th></tr></thead>
                <tbody>
                  {chartData.map((d: any) => (
                    <tr key={d.month}>
                      <td style={{ fontWeight: 600 }}>{d.month}</td>
                      <td style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{formatCurrency(d.revenue, true)}</td>
                      <td style={{ textAlign: 'center' }}>{d.deals}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{d.deals > 0 ? formatCurrency(d.revenue / d.deals, true) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Salesperson Performance Report */}
        {activeTab === 'performance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header" style={{ marginBottom: 16 }}>
                <div className="card-title">Revenue Achievement vs Target (This Month)</div>
              </div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={performance.map((p: any) => ({
                        name: p.salesperson?.name?.split(' ')[0] || 'Unknown',
                        Revenue: Math.round(p.monthlyRevenue / 100000),
                        Target: Math.round(p.monthlyTarget / 100000),
                      }))}
                      margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                      barCategoryGap="30%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}L`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Target" fill="rgba(99,102,241,0.3)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead><tr><th>Salesperson</th><th>Revenue</th><th>Target</th><th>Achievement</th><th>Leads</th><th>Won Deals</th><th>Pipeline</th><th>Activities</th></tr></thead>
                <tbody>
                  {performance.map((p: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div className="avatar" style={{ background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 2) % COLORS.length]})` }}>{getInitials(p.salesperson?.name)}</div>
                          <div style={{ fontWeight: 600 }}>{p.salesperson?.name}</div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{formatCurrency(p.monthlyRevenue, true)}</td>
                      <td>{formatCurrency(p.monthlyTarget, true)}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: p.achievement >= 100 ? 'var(--accent-emerald)' : p.achievement >= 70 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>
                          {p.achievement}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{p.totalLeads}</td>
                      <td style={{ textAlign: 'center', color: 'var(--accent-emerald)', fontWeight: 700 }}>{p.wonDeals}</td>
                      <td>{formatCurrency(p.pipelineValue, true)}</td>
                      <td style={{ textAlign: 'center' }}>{p.activitiesThisMonth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Reports;
