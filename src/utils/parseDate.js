/**
 * Parses date values coming from either CSV (plain strings like
 * "2018-11-02") or XLSX (Excel serial numbers, or JS Date objects once
 * exceljs has already converted them).
 *
 * Excel's date epoch is 1899-12-30 (it has a well-known leap-year bug for
 * 1900, which is why 1899-12-30 rather than -12-31/-01-01 is used as the
 * correction). Serial 1 = 1899-12-31.
 */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    // Excel serial date number
    return new Date(EXCEL_EPOCH_MS + value * MS_PER_DAY);
  }

  const str = String(value).trim();
  if (!str) return null;

  // Pure-numeric string from a CSV export of an Excel sheet, e.g. "43406"
  if (/^\d+(\.\d+)?$/.test(str)) {
    return new Date(EXCEL_EPOCH_MS + parseFloat(str) * MS_PER_DAY);
  }

  // ISO-ish "YYYY-MM-DD" (optionally with time) - parse as UTC to avoid
  // local-timezone off-by-one-day shifts.
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // Fallback: let the Date constructor try (e.g. "11/02/2018")
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

module.exports = { parseDate };
