// v1.10.77 (#85) - a real Excel (.xlsx) file, written here rather than with a
// spreadsheet library: an .xlsx is a zip of a few XML files, and the zip is
// fflate, which jspdf already uses. One sheet, a bold header row, numbers
// stored as numbers (so Excel can total them), text as text.
import { zipSync, strToU8 } from 'fflate';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0 forbids most control characters; drop them rather than corrupt the file.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// Column letter for a 0-based index: 0 -> A, 25 -> Z, 26 -> AA.
export const colName = (i) => {
  let n = i + 1;
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

const cellXml = (v, ref, bold) => {
  if (v === null || v === undefined || v === '') return '';
  const style = bold ? ' s="1"' : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
};

const sheetXml = (rows) => {
  const widths = [];
  rows.forEach((r) => r.forEach((v, c) => { widths[c] = Math.min(60, Math.max(widths[c] || 8, String(v ?? '').length + 2)); }));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + (widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '')
    + '<sheetData>'
    + rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, `${colName(ci)}${ri + 1}`, ri === 0)).join('')}</row>`).join('')
    + '</sheetData></worksheet>';
};

// Excel sheet names: at most 31 characters, none of \ / ? * [ ] :, and unique.
export function sheetNames(names) {
  const used = new Set();
  return names.map((n) => {
    const base = String(n || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i += 1) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// Divtech Hisaab - a workbook of several sheets: [{ name, rows }], each with
// its first row as the (bold) header. Empty sheet lists get one blank sheet.
export function buildWorkbook(sheets) {
  const list = (sheets && sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }]);
  const names = sheetNames(list.map((s) => s.name));
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>',
    // Two cell formats: 0 normal, 1 bold (the header row).
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>',
  };
  list.forEach((sh, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sh.rows || []); });
  const zipped = {};
  for (const [k, v] of Object.entries(files)) zipped[k] = strToU8(v);
  return zipSync(zipped, { level: 6 });
}

// rows: arrays of cells (numbers or text). The first row is the header (bold).
export const buildXlsx = (rows, sheetName = 'Sheet1') => buildWorkbook([{ name: sheetName, rows }]);
