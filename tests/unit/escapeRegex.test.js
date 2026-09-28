const { escapeRegex } = require('../../src/utils/escapeRegex');

describe('escapeRegex', () => {
  test('escapes regex special characters', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
  });

  test('neutralizes a ReDoS-style payload', () => {
    const malicious = '(a+)+$';
    const escaped = escapeRegex(malicious);
    // Should be safe to compile and should only match the literal string
    const re = new RegExp(escaped, 'i');
    expect(re.test('(a+)+$')).toBe(true);
    expect(re.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!')).toBe(false);
  });
});
