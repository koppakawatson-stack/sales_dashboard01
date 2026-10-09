import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HarvikLogo from '../components/HarvikLogo';
import { Lock, Mail, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';


const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('admin@harvik.com');
  const [password, setPassword] = useState('Password@123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (testEmail: string, testPass: string = 'Password@123') => {
    setEmail(testEmail);
    setPassword(testPass);
    setErrorMessage(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
        padding: 20,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          padding: '36px 32px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(79, 70, 229, 0.1)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '12px 24px',
              borderRadius: 14,
              background: '#ffffff',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              marginBottom: 16,
            }}
          >
            <HarvikLogo size="md" showTagline={true} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>
            Sales Intelligence Portal
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Sign in to access your CRM, Pipeline & Analytics
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={16}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@harvik.com"
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  borderRadius: 10,
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: 13.5,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 38px',
                  borderRadius: 10,
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  color: '#ffffff',
                  fontSize: 13.5,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: 6,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
              transition: 'all 0.15s ease',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
            {!isLoading && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Quick Test Role Presets */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Demo Login:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@harvik.com')}
              style={{
                padding: '8px 6px',
                borderRadius: 8,
                background: email === 'admin@harvik.com' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                border: email === 'admin@harvik.com' ? '1px solid #6366f1' : '1px solid #334155',
                color: email === 'admin@harvik.com' ? '#c7d2fe' : '#94a3b8',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div>Admin Mgr</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>Sales Manager</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('arjun@harvik.com')}
              style={{
                padding: '8px 6px',
                borderRadius: 8,
                background: email === 'arjun@harvik.com' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                border: email === 'arjun@harvik.com' ? '1px solid #6366f1' : '1px solid #334155',
                color: email === 'arjun@harvik.com' ? '#c7d2fe' : '#94a3b8',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div>Arjun S.</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>Administrator</div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('rahul@harvik.com')}
              style={{
                padding: '8px 6px',
                borderRadius: 8,
                background: email === 'rahul@harvik.com' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                border: email === 'rahul@harvik.com' ? '1px solid #6366f1' : '1px solid #334155',
                color: email === 'rahul@harvik.com' ? '#c7d2fe' : '#94a3b8',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div>Rahul M.</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>Salesperson</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
