const { parseDate } = require('../../src/utils/parseDate');

describe('parseDate', () => {
  test('parses ISO date strings as UTC midnight', () => {
    const d = parseDate('2018-11-02');
    expect(d.toISOString()).toBe('2018-11-02T00:00:00.000Z');
  });

  test('parses Excel serial numbers (number type)', () => {
    const d = parseDate(43406);
    expect(d.toISOString()).toBe('2018-11-02T00:00:00.000Z');
  });

  test('parses Excel serial numbers given as numeric strings', () => {
    const d = parseDate('43406');
    expect(d.toISOString()).toBe('2018-11-02T00:00:00.000Z');
  });

  test('returns null for empty/null/undefined input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });

  test('passes through valid Date instances', () => {
    const input = new Date('2020-01-01T00:00:00.000Z');
    expect(parseDate(input).toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  test('returns null for invalid Date instances', () => {
    expect(parseDate(new Date('not-a-date'))).toBeNull();
  });

  test('returns null for unparseable strings', () => {
    expect(parseDate('not-a-date-at-all-xyz')).toBeNull();
  });
});
