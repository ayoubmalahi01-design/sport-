// Robust TSV/CSV parser for clipboard paste and file upload.
// Handles tab/comma/semicolon, quotes, multiline cells, BOM, CRLF/LF.

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = { '\t': 0, ',': 0, ';': 0 };
  for (const d of ['\t', ',', ';']) counts[d] = (sample.match(new RegExp(d === '\t' ? '\\t' : '\\' + d, 'g')) || []).length;
  if (counts['\t'] > 0) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

export function parseTable(text, delimiter) {
  if (text === null || text === undefined) return [];
  // strip BOM
  let src = String(text).replace(/^\uFEFF/, '');
  if (src.trim() === '') return [];
  const delim = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    if (ch === '\r') { i++; continue; }
    field += ch; i++;
  }
  // trailing field
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // trim trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows.map(r => r.map(c => c.trim()));
}

export function hasHeaderRow(rows) {
  if (!rows || rows.length < 2) return false;
  // heuristic: first row contains non-numeric text while second has numbers
  const first = rows[0], second = rows[1];
  const firstHasText = first.some(c => /[a-zA-Z\u0600-\u06FF]/.test(c));
  const secondHasNum = second.some(c => /^\d/.test(c));
  return firstHasText && secondHasNum;
}