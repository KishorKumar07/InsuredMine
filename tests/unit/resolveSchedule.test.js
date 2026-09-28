const { resolveSchedule } = require('../../src/utils/resolveSchedule');

describe('resolveSchedule', () => {
  test('resolves an ISO date + time to the correct UTC instant', () => {
    const result = resolveSchedule({ day: '2026-09-30', time: '14:30' });
    expect(result.toISOString()).toBe('2026-09-30T14:30:00.000Z');
  });

  test('applies a positive timezone offset (local -> UTC)', () => {
    // IST is UTC+5:30, so to convert local->UTC we subtract 5:30,
    // i.e. offset = -330 minutes gets added to local time.
    const result = resolveSchedule({ day: '2026-09-30', time: '20:00', timezoneOffsetMinutes: -330 });
    expect(result.toISOString()).toBe('2026-09-30T14:30:00.000Z');
  });

  test('resolves a weekday name to its next future occurrence', () => {
    // 2026-09-28 is a Monday (fixed reference "now").
    const now = new Date('2026-09-28T10:00:00.000Z');
    const result = resolveSchedule({ day: 'Wednesday', time: '09:00', now });
    expect(result.toISOString()).toBe('2026-09-30T09:00:00.000Z');
  });

  test('rolls a same-weekday-but-already-passed time to next week', () => {
    const now = new Date('2026-09-28T10:00:00.000Z'); // Monday 10:00 UTC
    const result = resolveSchedule({ day: 'Monday', time: '09:00', now }); // 09:00 already passed today
    expect(result.toISOString()).toBe('2026-10-05T09:00:00.000Z');
  });

  test('throws on malformed time', () => {
    expect(() => resolveSchedule({ day: '2026-09-30', time: '25:99' })).toThrow();
    expect(() => resolveSchedule({ day: '2026-09-30', time: 'not-a-time' })).toThrow();
  });

  test('throws on malformed day', () => {
    expect(() => resolveSchedule({ day: 'not-a-day', time: '10:00' })).toThrow();
  });
});
