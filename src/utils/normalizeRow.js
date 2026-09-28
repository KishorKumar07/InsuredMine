const { parseDate } = require('./parseDate');

function clean(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function cleanNumber(value) {
  const str = clean(value);
  if (str === null) return null;
  const num = parseFloat(str);
  return Number.isNaN(num) ? null : num;
}

/**
 * Normalizes one raw sheet row (keyed by the exact column headers from the
 * assessment's sample sheet) into the shape our 6 collections need.
 *
 * Kept as a pure function (no DB/IO) so it's trivially unit-testable and
 * reusable from both the worker thread and tests/scripts.
 *
 * Throws a descriptive Error if a required field is missing, so the caller
 * can record a per-row error and continue processing the rest of the file.
 */
function normalizeRow(raw, rowNumber) {
  const agentName = clean(raw.agent);
  const firstName = clean(raw.firstname);
  const policyNumber = clean(raw.policy_number);
  const categoryName = clean(raw.category_name);
  const companyName = clean(raw.company_name);

  const missing = [];
  if (!firstName) missing.push('firstname');
  if (!policyNumber) missing.push('policy_number');
  if (!categoryName) missing.push('category_name');
  if (!companyName) missing.push('company_name');
  if (missing.length) {
    throw new Error(`Row ${rowNumber}: missing required field(s): ${missing.join(', ')}`);
  }

  return {
    agent: agentName ? { name: agentName } : null,

    user: {
      firstName,
      dob: parseDate(raw.dob),
      address: clean(raw.address),
      phone: clean(raw.phone),
      city: clean(raw.city),
      state: clean(raw.state),
      zipCode: clean(raw.zip),
      email: clean(raw.email) ? clean(raw.email).toLowerCase() : null,
      gender: clean(raw.gender),
      userType: clean(raw.userType),
    },

    account: {
      accountName: clean(raw.account_name) || firstName,
      accountType: clean(raw.account_type),
    },

    category: { categoryName },

    carrier: { companyName },

    policy: {
      policyNumber,
      policyStartDate: parseDate(raw.policy_start_date),
      policyEndDate: parseDate(raw.policy_end_date),
      producer: clean(raw.producer),
      csr: clean(raw.csr),
      policyMode: clean(raw.policy_mode),
      policyType: clean(raw.policy_type),
      premiumAmount: cleanNumber(raw.premium_amount),
      premiumAmountWritten: cleanNumber(raw.premium_amount_written),
    },
  };
}

module.exports = { normalizeRow, clean, cleanNumber };
