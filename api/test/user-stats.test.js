import test from 'node:test';
import assert from 'node:assert/strict';
import { userCardioStats, userPainStats } from '../user-stats.js';

test('userCardioStats returns null and 0 count on empty or null state', () => {
  assert.deepEqual(userCardioStats(null), { lastCardio: null, cardioCount: 0 });
  assert.deepEqual(userCardioStats({}), { lastCardio: null, cardioCount: 0 });
  assert.deepEqual(userCardioStats({ cardioLogs: [] }), { lastCardio: null, cardioCount: 0 });
});

test('userCardioStats finds the latest cardio date from multiple entries', () => {
  const S = {
    cardioLogs: [
      { date: '2026-09-01', minutes: 30 },
      { date: '2026-09-05', minutes: 45 },
      { date: '2026-09-03', minutes: 20 }
    ]
  };
  const res = userCardioStats(S);
  assert.equal(res.lastCardio, '2026-09-05');
  assert.equal(res.cardioCount, 3);
});

test('userCardioStats supports timestamp (ts) and d property', () => {
  const S = {
    cardioLogs: [
      { ts: new Date('2026-09-02T10:00:00Z').getTime() },
      { d: '2026-09-06' }
    ]
  };
  const res = userCardioStats(S);
  assert.equal(res.lastCardio, '2026-09-06');
  assert.equal(res.cardioCount, 2);
});

test('userPainStats returns false on empty or null state', () => {
  assert.deepEqual(userPainStats(null), { hasPain: false, lastPainArea: null });
  assert.deepEqual(userPainStats({}), { hasPain: false, lastPainArea: null });
  assert.deepEqual(userPainStats({ painLogs: [] }), { hasPain: false, lastPainArea: null });
});

test('userPainStats returns false if latest painLog has pain: false', () => {
  const S = {
    painLogs: [
      { date: '2026-09-01', pain: true, area: 'Rodilla' },
      { date: '2026-09-05', pain: false, area: null }
    ]
  };
  const res = userPainStats(S);
  assert.equal(res.hasPain, false);
});

test('userPainStats returns true if latest painLog has pain: true', () => {
  const S = {
    painLogs: [
      { date: '2026-09-01', pain: false },
      { date: '2026-09-05', pain: true, area: 'Zona Lumbar' }
    ]
  };
  const res = userPainStats(S);
  assert.equal(res.hasPain, true);
  assert.equal(res.lastPainArea, 'Zona Lumbar');
});

test('userPainStats correctly handles hasPain property and level', () => {
  const S = {
    painLogs: [
      { date: '2026-09-01', hasPain: false },
      { date: '2026-09-03', hasPain: true, painArea: 'Hombro' }
    ]
  };
  const res = userPainStats(S);
  assert.equal(res.hasPain, true);
  assert.equal(res.lastPainArea, 'Hombro');
});

test('userCardioStats normalizes full ISO datetime strings to YYYY-MM-DD', () => {
  const S = {
    cardioLogs: [
      { date: '2026-09-07T14:30:00.000Z', minutes: 30 }
    ]
  };
  const res = userCardioStats(S);
  assert.equal(res.lastCardio, '2026-09-07');
});

test('userPainStats returns null lastPainArea when latest report has no pain', () => {
  const S = {
    painLogs: [
      { date: '2026-09-01', pain: true, area: 'Rodilla' },
      { date: '2026-09-05', pain: false, area: 'Rodilla' }
    ]
  };
  const res = userPainStats(S);
  assert.equal(res.hasPain, false);
  assert.equal(res.lastPainArea, null);
});

test('userPainStats gracefully ignores null entries and invalid dates', () => {
  const S = {
    painLogs: [
      null,
      { date: 'invalid-date', pain: false },
      { date: '2026-09-04', pain: true, area: 'Cadera' }
    ]
  };
  const res = userPainStats(S);
  assert.equal(res.hasPain, true);
  assert.equal(res.lastPainArea, 'Cadera');
});
