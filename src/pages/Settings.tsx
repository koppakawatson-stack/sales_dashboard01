import React from 'react';
import { Settings as SettingsIcon, Database, Server, Globe, Shield, Bell } from 'lucide-react';
import Topbar from '../components/Topbar';

const Settings: React.FC = () => {
  return (
    <div className="main-content">
      <Topbar title="Settings" subtitle="System configuration and preferences" />
      <main className="page-content fade-in">
        <div className="page-header">
          <div>
            <h1>Settings</h1>
            <div className="page-header-subtitle">Configure your Harvik Sales Dashboard</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { icon: <Database size={20} />, title: 'Database', color: 'var(--accent-emerald)', desc: 'MongoDB connection settings', items: ['URI: mongodb://localhost:27017/harvik_sales', 'Status: Connected', 'DB: harvik_sales'] },
            { icon: <Server size={20} />, title: 'Cache / Queue', color: 'var(--accent-rose)', desc: 'Redis configuration', items: ['URL: redis://localhost:6379', 'Default TTL: 300s', 'Status: Connected'] },
            { icon: <Globe size={20} />, title: 'API Server', color: 'var(--brand-400)', desc: 'Express backend settings', items: ['Port: 5000', 'Rate Limit: 200 req/15min', 'CORS: Enabled'] },
            { icon: <Shield size={20} />, title: 'Security', color: 'var(--accent-violet)', desc: 'Authentication & security', items: ['Helmet: Enabled', 'JWT Expiry: 7 days', 'Rate Limiting: Active'] },
            { icon: <Bell size={20} />, title: 'Notifications', color: 'var(--accent-amber)', desc: 'Alert preferences', items: ['Follow-up reminders: On', 'Deal stage alerts: On', 'Target alerts: On'] },
            { icon: <SettingsIcon size={20} />, title: 'Application', color: 'var(--accent-cyan)', desc: 'General app settings', items: ['Currency: INR (₹)', 'Timezone: Asia/Kolkata', 'Version: 1.0.0'] },
          ].map(({ icon, title, color, desc, items }) => (
            <div key={title} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {items.map(item => (
                  <div key={item} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 24, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Tech Stack</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Harvik Technologies Sales Dashboard infrastructure</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { name: 'Frontend', tech: 'React 19 + Vite', badge: 'v19' },
              { name: 'Backend', tech: 'Node.js + Express', badge: 'v20' },
              { name: 'Database', tech: 'MongoDB 7.x', badge: 'v7' },
              { name: 'Cache', tech: 'Redis 7', badge: 'v7' },
              { name: 'Process Manager', tech: 'PM2', badge: 'PM2' },
              { name: 'Language', tech: 'TypeScript + JS', badge: 'TS' },
            ].map(({ name, tech, badge }) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'var(--bg-input)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)'
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, var(--brand-600), var(--accent-violet))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>
                  {badge}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{tech}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
