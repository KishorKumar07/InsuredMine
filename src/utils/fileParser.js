const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const ExcelJS = require('exceljs');

/**
 * Streams a CSV file and returns an array of row objects keyed by header.
 * Streaming (rather than reading the whole file into memory first) keeps
 * memory flat regardless of row count.
 */
function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Reads an XLSX workbook's first worksheet into an array of row objects
 * keyed by the header row. Uses exceljs's streaming reader so large sheets
 * don't get fully materialized twice.
 */
async function readXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows = [];
  let headers = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values; // 1-indexed array, values[0] is undefined
    if (rowNumber === 1) {
      headers = values.slice(1).map((h) => (h === undefined || h === null ? '' : String(h).trim()));
      return;
    }
    const obj = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const cell = values[idx + 1];
      obj[header] = cell && cell.result !== undefined ? cell.result : cell;
    });
    rows.push(obj);
  });

  return rows;
}

/**
 * Detects the file type by extension and parses accordingly.
 */
async function parseSheetFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return readCsv(filePath);
  if (ext === '.xlsx' || ext === '.xlsm') return readXlsx(filePath);
  throw new Error(`Unsupported file extension: ${ext}. Only .csv and .xlsx are supported.`);
}

module.exports = { parseSheetFile, readCsv, readXlsx };
