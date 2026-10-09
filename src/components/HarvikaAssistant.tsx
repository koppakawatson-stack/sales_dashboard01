import React, { useState } from 'react';
import { Sparkles, X, Send, Bot } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getDashboardOverview, getPipelineSummary } from '../api/client';
import { formatCurrency } from '../utils/helpers';

export const HarvikaAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'ai' | 'user'; text: string; time: string }>>([
    {
      role: 'ai',
      text: 'Hello! I am HARVIKA, your AI Sales Intelligence Assistant for Harvik Technologies. How can I help you analyze your pipeline, revenue, or team performance today?',
      time: 'Just now',
    },
  ]);

  const { data: overview } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: getDashboardOverview,
  });

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: getPipelineSummary,
  });

  const quickPrompts = [
    'How is our monthly revenue target progress?',
    'What is our current pipeline total value?',
    'Which deals are currently in negotiation?',
    'What is our lead-to-deal conversion rate?',
  ];

  const handleSend = (textToSend?: string) => {
    const q = textToSend || query;
    if (!q.trim()) return;

    const userMsg = { role: 'user' as const, text: q, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setQuery('');

    // Generate intelligent contextual response
    setTimeout(() => {
      let aiResponse = '';
      const lower = q.toLowerCase();

      if (lower.includes('target') || lower.includes('progress') || lower.includes('month')) {
        const achieved = overview?.monthlyRevenue || 0;
        const target = overview?.monthlyTarget || 1750000;
        const pct = overview?.targetAchievement || Math.round((achieved / target) * 100);
        aiResponse = `📊 Monthly Revenue Target Analysis:\n• Target: ${formatCurrency(target)}\n• Current Achieved: ${formatCurrency(achieved)}\n• Achievement Rate: ${pct}%\n${pct >= 80 ? '🚀 You are well on track for the month!' : '⚠️ Pipeline acceleration recommended to meet target.'}`;
      } else if (lower.includes('pipeline') || lower.includes('value')) {
        const total = overview?.totalPipelineValue || 3470000;
        const count = overview?.activeOpportunities || 4;
        aiResponse = `💼 Current Pipeline Status:\n• Active Opportunities: ${count} deals\n• Total Pipeline Value: ${formatCurrency(total)}\n• Weighted Pipeline Value: ${formatCurrency(pipeline?.totalWeightedValue || 2150000)}\nStrong momentum in Technology and Finance sectors.`;
      } else if (lower.includes('negotiation')) {
        aiResponse = `🤝 Deals Currently in Negotiation:\n• Alpha Logistics - Fleet Manager (${formatCurrency(450000)}, 65% probability)\n• MediaStar - Content Platform (${formatCurrency(220000)}, 55% probability)\nBoth are scheduled for follow-up closing this quarter.`;
      } else if (lower.includes('conversion') || lower.includes('rate')) {
        const conv = overview?.conversionRate || 33.3;
        aiResponse = `📈 Conversion Performance:\n• Lead-to-Customer Rate: ${conv}%\n• Won Deals: ${overview?.wonDeals || 4}\n• Lost Deals: ${overview?.lostDeals || 1}\nIndustry benchmark for B2B software engineering platforms is ~22%. We are outperforming by +11.3%!`;
      } else {
        aiResponse = `🔍 Intelligence Overview:\nTotal Leads: ${overview?.totalLeads || 10} | Won Revenue: ${formatCurrency(overview?.wonRevenue || 2950000)} | Active Opportunities: ${overview?.activeOpportunities || 4}.\nWould you like me to generate a deep-dive performance report?`;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: aiResponse,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 450);
  };

  return (
    <>
      {/* Floating Trigger Pill and Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 9999,
        }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 9999,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: '#1e293b',
            boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)')}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#2563eb',
              boxShadow: '0 0 6px rgba(37,99,235,0.7)',
            }}
          />
          Ask <span style={{ fontWeight: 800, color: '#0f172a' }}>HARVIKA</span>
        </button>

        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            backgroundColor: '#1d4ed8',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(29,78,216,0.4)',
            transition: 'transform 0.2s, background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.06)';
            e.currentTarget.style.backgroundColor = '#1e40af';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.backgroundColor = '#1d4ed8';
          }}
        >
          {isOpen ? <X size={20} /> : <Sparkles size={20} />}
        </button>
      </div>

      {/* Assistant Modal / Flyout */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            height: 520,
            backgroundColor: '#ffffff',
            borderRadius: 16,
            boxShadow: '0 20px 45px -10px rgba(15,23,42,0.2), 0 0 0 1px #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            overflow: 'hidden',
            animation: 'fadeInUp 0.25s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={18} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>HARVIKA AI Copilot</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>Autonomous Sales Intelligence</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                opacity: 0.8,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              padding: 16,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: '#f8fafc',
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  backgroundColor: m.role === 'user' ? '#1d4ed8' : '#ffffff',
                  color: m.role === 'user' ? '#ffffff' : '#1e293b',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  boxShadow: m.role === 'user' ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                  border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
                  whiteSpace: 'pre-line',
                }}
              >
                {m.text}
                <div
                  style={{
                    fontSize: 10,
                    opacity: 0.65,
                    marginTop: 4,
                    textAlign: m.role === 'user' ? 'right' : 'left',
                  }}
                >
                  {m.time}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Prompts */}
          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSend(p)}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              display: 'flex',
              padding: '10px 12px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              gap: 8,
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask HARVIKA about sales..."
              style={{
                flex: 1,
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                backgroundColor: '#1d4ed8',
                border: 'none',
                color: '#ffffff',
                borderRadius: 8,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default HarvikaAssistant;
