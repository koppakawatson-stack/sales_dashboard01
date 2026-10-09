// Format currency in INR
export const formatCurrency = (amount: number, compact = false): string => {
  if (compact && amount >= 1_00_000) {
    if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
    if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date
export const formatDate = (date: string | Date | undefined, opts?: Intl.DateTimeFormatOptions): string => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
};

// Get initials from name
export const getInitials = (name = ''): string => {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Status → CSS class
export const statusClass = (status = ''): string => {
  return status.toLowerCase().replace(/\s+/g, '-');
};

// Probability → color
export const probColor = (prob: number): string => {
  if (prob >= 80) return 'var(--accent-emerald)';
  if (prob >= 60) return 'var(--accent-amber)';
  if (prob >= 40) return 'var(--accent-orange)';
  return 'var(--accent-rose)';
};

// Calculate days until date
export const daysUntil = (date: string | Date): number => {
  const diff = new Date(date).getTime() - Date.now();
  return Math.round(diff / (1000 * 60 * 60 * 24));
};

// Month name
export const monthName = (month: number): string => {
  return new Date(2024, month - 1).toLocaleString('en', { month: 'short' });
};

// Activity type → icon name
export const activityIcon = (type: string): string => {
  const map: Record<string, string> = {
    Call: 'phone',
    Meeting: 'users',
    Email: 'mail',
    Demo: 'monitor',
    'Follow-up': 'bell',
    Proposal: 'file-text',
    Other: 'activity',
  };
  return map[type] || 'activity';
};

// Truncate text
export const truncate = (text: string, max = 40): string => {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
};
