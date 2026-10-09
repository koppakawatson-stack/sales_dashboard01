import React from 'react';
import { Bell, Search, RefreshCw, ArrowRight, Calculator } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface TopbarProps {
  title: string;
  subtitle?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

const Topbar: React.FC<TopbarProps> = ({ title, subtitle, actionButton }) => {
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast.success('Sales intelligence data refreshed');
  };

  return (
    <header className="topbar">
      {/* ── Harvik Corporate Announcement Ribbon (from Brand UI) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 28px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '12px',
          color: '#475569',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              backgroundColor: '#1d4ed8',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 10px',
              borderRadius: 9999,
              letterSpacing: '0.02em',
            }}
          >
            HARVIK Technologies
          </span>
          <span style={{ color: '#64748b', fontSize: '11.5px' }}>
            Hyderabad, Telangana, India • Remote-First Global Engineering
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: '#1d4ed8',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => toast('ROI Calculator opened')}
          >
            <Calculator size={13} />
            ROI Calculator
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: '#1d4ed8',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => toast('Platform Demo requested')}
          >
            Book a Platform Demo <ArrowRight size={12} />
          </span>
        </div>
      </div>

      {/* ── Main Topbar Content ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 28px',
          flex: 1,
        }}
      >
        <div className="topbar-left">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <div className="topbar-right">
          {/* Search */}
          <div className="topbar-search">
            <Search size={14} color="var(--text-muted)" />
            <input placeholder="Search deals, leads, revenue..." />
          </div>

          {/* Quick Action / Let's Build Button */}
          {actionButton ? (
            <button
              onClick={actionButton.onClick}
              style={{
                backgroundColor: '#1d4ed8',
                color: '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(29,78,216,0.3)',
                transition: 'all 0.2s',
              }}
            >
              {actionButton.label}
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={() => toast.success('Let’s Build portal initialized')}
              style={{
                backgroundColor: '#1d4ed8',
                color: '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(29,78,216,0.3)',
                transition: 'all 0.2s',
              }}
            >
              Let's Build <ArrowRight size={14} />
            </button>
          )}

          {/* Refresh */}
          <button
            className="topbar-icon-btn"
            onClick={handleRefresh}
            title="Refresh data"
            id="refresh-btn"
          >
            <RefreshCw size={15} />
          </button>

          {/* Notifications */}
          <button
            className="topbar-icon-btn"
            id="notifications-btn"
            onClick={() => toast('3 new lead alerts this morning')}
          >
            <Bell size={15} />
            <span className="notification-dot" />
          </button>

          {/* Avatar */}
          <div
            className="topbar-avatar"
            id="user-avatar"
            style={{
              backgroundColor: '#1d4ed8',
              color: '#ffffff',
              fontWeight: 700,
            }}
          >
            AM
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
