import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, Briefcase, Activity,
  TrendingUp, Target, BarChart2, Settings, ChevronRight,
} from 'lucide-react';
import HarvikLogo from './HarvikLogo';
import { useAuth, getUserInitials, formatDisplayRole } from '../context/AuthContext';
import UserProfileModal from './UserProfileModal';

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, to: '/' },
  { section: 'Sales' },
  { label: 'Leads', icon: Users, to: '/leads' },
  { label: 'Customers', icon: UserCheck, to: '/customers' },
  { label: 'Deals', icon: Briefcase, to: '/deals' },
  { label: 'Activities', icon: Activity, to: '/activities' },
  { section: 'Finance' },
  { label: 'Revenue', icon: TrendingUp, to: '/revenue' },
  { label: 'Targets', icon: Target, to: '/targets' },
  { section: 'Insights' },
  { label: 'Reports', icon: BarChart2, to: '/reports' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  const displayName = user?.name || 'Admin Manager';
  const displayRole = formatDisplayRole(user?.role, user?.displayRole) || 'Sales Manager';
  const initials = getUserInitials(displayName);

  return (
    <>
      <aside className="sidebar">
        {/* Harvik Brand Logo Card */}
        <div className="sidebar-logo">
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '10px 16px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 2px 6px rgba(15,23,42,0.04)',
            }}
          >
            <HarvikLogo size="sm" showTagline={true} />
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#ea580c',
                background: '#fff7ed',
                border: '1px solid #ffedd5',
                padding: '2px 8px',
                borderRadius: 9999,
                marginTop: 6,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Sales Intelligence
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {navItems.map((item, i) => {
            if ('section' in item && item.section) {
              return (
                <div key={i} className="sidebar-section-label">{item.section}</div>
              );
            }
            const Icon = (item as any).icon;
            return (
              <NavLink
                key={(item as any).to}
                to={(item as any).to}
                end={(item as any).to === '/'}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              >
                <Icon size={16} />
                {(item as any).label}
              </NavLink>
            );
          })}
        </nav>

        {/* Dynamic Authenticated User Footer */}
        <div className="sidebar-footer">
          <div
            className="sidebar-link"
            onClick={() => setShowProfileModal(true)}
            style={{
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              borderRadius: 8,
              padding: '8px 10px',
            }}
            title="View User Profile"
          >
            <div
              className="avatar avatar-sm"
              style={{
                marginRight: 8,
                background: 'linear-gradient(135deg, var(--brand-500, #4f46e5), var(--accent-cyan, #06b6d4))',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{displayRole}</div>
            </div>
            <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        </div>
      </aside>

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </>
  );
};

export default Sidebar;

