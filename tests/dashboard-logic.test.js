const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDateValue,
  normalizeAgentName,
  computeRangeDates,
  summarizeCalls,
  buildDayWiseRows,
  percent,
  formatMetricValue,
} = require('../dashboard-logic.js');

test('normalizeDateValue preserves ISO calendar day boundaries', () => {
  assert.equal(normalizeDateValue('2024-04-21T17:30:00'), '2024-04-21');
  assert.equal(normalizeDateValue('04/21/2024'), '2024-04-21');
  assert.equal(normalizeDateValue('21/04/2024'), '2024-04-21');
});

test('computeRangeDates supports All Time', () => {
  assert.deepEqual(computeRangeDates('all'), { from: '', to: '' });
});

test('summarizeCalls handles zero values without showing dashes', () => {
  const summary = summarizeCalls([]);
  assert.equal(summary.totalCalls, 0);
  assert.equal(summary.outgoingAttempts, 0);
  assert.equal(summary.attemptRate, '0.0%');
  assert.equal(summary.connectRate, '0.0%');
  assert.equal(formatMetricValue(0, '—'), '0');
});

test('buildDayWiseRows groups by normalized date and agent filter works', () => {
  const rows = [
    { date: '2024-04-01', direction: 'Outgoing', status: 'Completed', agent: 'Alice Johnson', durationSeconds: 120 },
    { date: '2024-04-01', direction: 'Incoming', status: 'Completed', agent: 'Bob', durationSeconds: 200 },
    { date: '2024-04-02', direction: 'Outgoing', status: 'Failed', agent: 'alice johnson', durationSeconds: 30 },
    { date: '2024-04-02', direction: 'Outgoing', status: 'Completed', agent: 'Alice Johnson', durationSeconds: 450 },
    { date: '2024-04-03', direction: 'Incoming', status: 'Failed', agent: 'Charlie', durationSeconds: 0 }
  ];

  const dayWise = buildDayWiseRows(rows);
  assert.equal(dayWise.length, 3);
  assert.equal(dayWise[0].date, '2024-04-01');
  assert.equal(dayWise[0].total, 2);
  assert.equal(normalizeAgentName('  Alice Johnson  '), 'alice johnson');
  assert.equal(percent(0, 0), '0.0%');
});
