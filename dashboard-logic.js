const { normalizeDateValue, normalizeAgentName, computeRangeDates, summarizeCalls, buildDayWiseRows, percent, formatMetricValue } = require('./dashboard-logic');

const rows = [
  { date: '2024-04-01', direction: 'Outgoing', status: 'Completed', agent: 'Alice', durationSeconds: 120 },
  { date: '2024-04-01', direction: 'Incoming', status: 'Completed', agent: 'Bob', durationSeconds: 200 },
  { date: '2024-04-02', direction: 'Outgoing', status: 'Failed', agent: 'Alice', durationSeconds: 30 },
  { date: '2024-04-02', direction: 'Outgoing', status: 'Completed', agent: 'Alice', durationSeconds: 450 },
  { date: '2024-04-03', direction: 'Incoming', status: 'Failed', agent: 'Charlie', durationSeconds: 0 }
];

console.log('normalizeDateValue', normalizeDateValue('2024-04-21T17:30:00'));
console.log('computeRangeDates', computeRangeDates('all'));
console.log('summary', summarizeCalls(rows));
console.log('dayWise', buildDayWiseRows(rows));
console.log('agent', normalizeAgentName('  Alice Johnson  '));
console.log('formatMetricValue', formatMetricValue(0, '—'));
