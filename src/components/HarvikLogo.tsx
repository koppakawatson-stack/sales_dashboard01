import React from 'react';

interface HarvikLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

export const HarvikLogo: React.FC<HarvikLogoProps> = ({
  size = 'md',
  showTagline = true,
  className = '',
}) => {
  const fontSizes = {
    sm: { main: '16px', dot: '4px', tag: '7px', gap: '2px' },
    md: { main: '22px', dot: '5px', tag: '8.5px', gap: '3px' },
    lg: { main: '36px', dot: '8px', tag: '11px', gap: '6px' },
  };

  const current = fontSizes[size];

  return (
    <div className={`harvik-logo-container ${className}`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Main letters */}
        <div
          style={{
            fontFamily: "'Outfit', 'Inter', sans-serif",
            fontSize: current.main,
            fontWeight: 800,
            letterSpacing: '0.38em',
            color: '#0f172a',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            position: 'relative',
            paddingLeft: '0.38em', // balances letter spacing
          }}
        >
          HARVIK
          {/* Blue dot positioned over the 'A' */}
          <span
            style={{
              position: 'absolute',
              left: '31%',
              top: '-4px',
              width: current.dot,
              height: current.dot,
              backgroundColor: '#2563eb',
              borderRadius: '50%',
              boxShadow: '0 0 8px rgba(37,99,235,0.6)',
              display: 'inline-block',
            }}
          />
        </div>
      </div>

      {showTagline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', marginTop: current.gap }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, #3b82f6)' }} />
          <div
            style={{
              fontSize: current.tag,
              fontWeight: 700,
              letterSpacing: '0.22em',
              color: '#3b82f6',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
            }}
          >
            INNOVATE • INTEGRATE • ELEVATE
          </div>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, #3b82f6, transparent)' }} />
        </div>
      )}
    </div>
  );
};

export default HarvikLogo;
