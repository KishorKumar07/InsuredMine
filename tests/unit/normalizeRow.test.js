const { normalizeRow } = require('../../src/utils/normalizeRow');

const validRawRow = {
  agent: 'Alex Watson',
  userType: 'Active Client',
  policy_mode: '12',
  producer: 'Brandie Placencia',
  policy_number: 'YEEX9MOIBU7X',
  premium_amount_written: '',
  premium_amount: '1180.83',
  policy_type: 'Single',
  company_name: 'Integon Gen Ins Corp',
  category_name: 'Commercial Auto',
  policy_start_date: '2018-11-02',
  policy_end_date: '2019-11-02',
  csr: 'Tami Ellison',
  account_name: 'Lura Lucca & Owen Dodson',
  email: 'Madler@Yahoo.ca',
  gender: '',
  firstname: 'Lura Lucca',
  city: 'MOCKSVILLE',
  account_type: 'Commercial',
  phone: '8677356559',
  address: '170 MATTHIAS CT',
  state: 'NC',
  zip: '27028',
  dob: '1960-02-11',
};

describe('normalizeRow', () => {
  test('maps a valid raw row into the 6-collection shape', () => {
    const result = normalizeRow(validRawRow, 2);

    expect(result.agent).toEqual({ name: 'Alex Watson' });
    expect(result.user.firstName).toBe('Lura Lucca');
    expect(result.user.email).toBe('madler@yahoo.ca'); // lowercased
    expect(result.user.gender).toBeNull(); // blank -> null
    expect(result.account).toEqual({ accountName: 'Lura Lucca & Owen Dodson', accountType: 'Commercial' });
    expect(result.category).toEqual({ categoryName: 'Commercial Auto' });
    expect(result.carrier).toEqual({ companyName: 'Integon Gen Ins Corp' });
    expect(result.policy.policyNumber).toBe('YEEX9MOIBU7X');
    expect(result.policy.premiumAmount).toBe(1180.83);
    expect(result.policy.premiumAmountWritten).toBeNull(); // blank -> null
    expect(result.policy.policyStartDate.toISOString()).toBe('2018-11-02T00:00:00.000Z');
  });

  test('throws a descriptive error when firstname is missing', () => {
    const row = { ...validRawRow, firstname: '' };
    expect(() => normalizeRow(row, 5)).toThrow(/Row 5.*firstname/);
  });

  test('throws when policy_number is missing', () => {
    const row = { ...validRawRow, policy_number: '' };
    expect(() => normalizeRow(row, 7)).toThrow(/policy_number/);
  });

  test('throws listing multiple missing fields at once', () => {
    const row = { ...validRawRow, firstname: '', category_name: '' };
    expect(() => normalizeRow(row, 9)).toThrow(/firstname.*category_name|category_name.*firstname/);
  });

  test('falls back account name to firstname when account_name is blank', () => {
    const row = { ...validRawRow, account_name: '' };
    const result = normalizeRow(row, 2);
    expect(result.account.accountName).toBe('Lura Lucca');
  });

  test('handles a row with no agent', () => {
    const row = { ...validRawRow, agent: '' };
    const result = normalizeRow(row, 2);
    expect(result.agent).toBeNull();
  });
});
