function toIsoDate(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())).toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toIsoDate(value);

  const text = normalizeText(value);
  if (!text || /^(n\/a|na|unknown|-)$/i.test(text)) return "";

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return toIsoDate(new Date(Date.UTC(year, month - 1, day)));
  }

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[T\s].*)?$/);
  if (slash) {
    let first = Number(slash[1]);
    let second = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (first > 12 && second <= 12) {
      const temp = first;
      first = second;
      second = temp;
    }
    return toIsoDate(new Date(Date.UTC(year, first - 1, second)));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  return "";
}

function normalizeAgentName(value) {
  return normalizeText(value).toLowerCase();
}

function isDateInRange(dateStr, from, to) {
  const dateValue = normalizeDateValue(dateStr);
  if (!dateValue) return false;
  if (from && dateValue < normalizeDateValue(from)) return false;
  if (to && dateValue > normalizeDateValue(to)) return false;
  return true;
}

function computeRangeDates(rangeKey, customFrom = "", customTo = "") {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  let start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

  if (rangeKey === 'all') {
    return { from: '', to: '' };
  }
  if (rangeKey === '7d') {
    start = new Date(today);
    start.setDate(today.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (rangeKey === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
  } else if (rangeKey === 'custom') {
    start = customFrom ? new Date(customFrom + 'T00:00:00') : null;
    const customEnd = customTo ? new Date(customTo + 'T23:59:59') : end;
    end.setTime(customEnd.getTime());
    if (!customTo && customFrom) {
      end.setTime(new Date(customFrom + 'T23:59:59').getTime());
    }
  }

  return {
    from: start ? normalizeDateValue(start) : '',
    to: normalizeDateValue(end)
  };
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100)).toFixed(1) + '%' : '0.0%';
}

function formatMetricValue(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value) === 0 ? '0' : String(value);
}

function summarizeCalls(rows) {
  const totalCalls = rows.length;
  const outgoingAttempts = rows.filter(call => /outgoing|outbound/.test((call.direction || '').toLowerCase())).length;
  const incomingCalls = rows.filter(call => /incoming|inbound/.test((call.direction || '').toLowerCase())).length;
  const connectedOutgoing = rows.filter(call => /outgoing|outbound/.test((call.direction || '').toLowerCase()) && /completed|connected|answered/.test((call.status || '').toLowerCase())).length;
  const completedCalls = rows.filter(call => /completed|connected|answered/.test((call.status || '').toLowerCase())).length;
  const durations = rows.filter(call => /completed|connected|answered/.test((call.status || '').toLowerCase())).map(call => Number(call.durationSeconds) || 0);
  const avgConnectedDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

  return {
    totalCalls,
    outgoingAttempts,
    incomingCalls,
    connectedOutgoing,
    completedCalls,
    attemptRate: percent(outgoingAttempts, totalCalls),
    connectRate: percent(connectedOutgoing, outgoingAttempts),
    averageConnectedDuration: avgConnectedDuration,
  };
}

function buildDayWiseRows(rows) {
  const grouped = new Map();
  rows.forEach(call => {
    const key = normalizeDateValue(call.date || 'Unknown') || 'Unknown';
    const bucket = grouped.get(key) || { date: key, total: 0, outgoing: 0, incoming: 0, completed: 0, outgoingCompleted: 0, duration: 0 };
    bucket.total += 1;
    if (/outgoing|outbound/.test((call.direction || '').toLowerCase())) bucket.outgoing += 1;
    if (/incoming|inbound/.test((call.direction || '').toLowerCase())) bucket.incoming += 1;
    if (/completed|connected|answered/.test((call.status || '').toLowerCase())) bucket.completed += 1;
    if (/outgoing|outbound/.test((call.direction || '').toLowerCase()) && /completed|connected|answered/.test((call.status || '').toLowerCase())) bucket.outgoingCompleted += 1;
    bucket.duration += Number(call.durationSeconds) || 0;
    grouped.set(key, bucket);
  });

  return Array.from(grouped.values()).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(item => ({
    date: item.date === 'Unknown' ? 'Unknown' : item.date,
    total: item.total,
    outgoing: item.outgoing,
    incoming: item.incoming,
    completed: item.completed,
    outgoingCompleted: item.outgoingCompleted,
    attemptRate: percent(item.outgoing, item.total),
    connectRate: percent(item.outgoingCompleted, item.outgoing),
    totalDuration: item.duration,
    averageConnectedDuration: item.completed ? item.duration / item.completed : 0,
  }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toIsoDate,
    normalizeText,
    normalizeDateValue,
    normalizeAgentName,
    isDateInRange,
    computeRangeDates,
    percent,
    formatMetricValue,
    summarizeCalls,
    buildDayWiseRows,
  };
}

globalThis.DashboardLogic = {
  toIsoDate,
  normalizeText,
  normalizeDateValue,
  normalizeAgentName,
  isDateInRange,
  computeRangeDates,
  percent,
  formatMetricValue,
  summarizeCalls,
  buildDayWiseRows,
};



















































































































































a



















































































































































































n
























































































































































































































































n





























