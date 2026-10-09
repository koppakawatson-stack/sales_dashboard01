import React from 'react';
import { useAuth, getUserInitials, formatDisplayRole } from '../context/AuthContext';
import { X, LogOut, User as UserIcon, Briefcase, Building2, ShieldCheck, Clock } from 'lucide-react';
import { format } from 'date-fns';


interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();

  if (!isOpen || !user) return null;

  const initials = getUserInitials(user.name);
  const displayRole = formatDisplayRole(user.role, user.displayRole);

  const formattedLastLogin = user.lastLoginAt
    ? format(new Date(user.lastLoginAt), 'dd MMM yyyy, hh:mm a')
    : format(new Date(), 'dd MMM yyyy, hh:mm a');

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '100%', padding: '24px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            User Account Profile
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Card Summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: 16,
            borderRadius: 12,
            background: 'var(--bg-card-hover, rgba(255, 255, 255, 0.04))',
            border: '1px solid var(--border)',
            marginBottom: 20,
          }}
        >
          <div
            className="avatar"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              fontSize: 18,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--brand-500, #4f46e5), var(--accent-cyan, #06b6d4))',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              {user.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--brand-400)', fontWeight: 600 }}>
              {displayRole}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {user.email}
            </div>
          </div>
        </div>

        {/* Detail List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <UserIcon size={14} />
              <span>User ID</span>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {user.userId || 'USR-0001'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <Briefcase size={14} />
              <span>Role</span>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {displayRole}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <Building2 size={14} />
              <span>Department</span>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {user.department || 'Sales Management'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <ShieldCheck size={14} />
              <span>Status</span>
            </div>
            <div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--accent-emerald, #10b981)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                ● Active
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <Clock size={14} />
              <span>Last Login</span>
            </div>
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
              {formattedLastLogin}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: 13 }}
          >
            Close
          </button>
          <button
            onClick={handleLogout}
            className="btn btn-danger"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
