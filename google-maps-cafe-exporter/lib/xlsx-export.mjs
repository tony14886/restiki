import { deflateRawSync } from 'node:zlib';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value & 0xffff);
  return bytes;
}

function uint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
}

function zip(files) {
  const entries = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const input = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const compressed = deflateRawSync(input);
    const crc = crc32(input);
    const local = Buffer.concat([
      uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(8), uint16(0), uint16(0),
      uint32(crc), uint32(compressed.length), uint32(input.length), uint16(name.length), uint16(0), name, compressed
    ]);
    entries.push({ name, crc, compressed, input, offset, local });
    offset += local.length;
  }
  const central = entries.map((entry) => Buffer.concat([
    uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(8), uint16(0), uint16(0),
    uint32(entry.crc), uint32(entry.compressed.length), uint32(entry.input.length),
    uint16(entry.name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(entry.offset),
    entry.name
  ]));
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const footer = Buffer.concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
    uint32(centralSize), uint32(offset), uint16(0)
  ]);
  return Buffer.concat([...entries.map((entry) => entry.local), ...central, footer]);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellXml(value, reference, isHeader) {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"${isHeader ? ' s="1"' : ''}><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${reference}" t="b"${isHeader ? ' s="1"' : ''}><v>${value ? 1 : 0}</v></c>`;
  const text = escapeXml(value);
  return `<c r="${reference}" t="inlineStr"${isHeader ? ' s="1"' : ''}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function worksheetXml(headers, rows) {
  const widthByColumn = headers.map((header, index) => {
    const isScoreColumn = /\(\+\d+\)|^score$/i.test(String(header).trim());
    if (isScoreColumn) return 14;
    const dataMax = Math.max(0, ...rows.slice(0, 200).map((row) => String(row[index] ?? '').length));
    return Math.min(38, Math.max(12, Math.min(28, Math.max(String(header).length, dataMax) + 2)));
  });
  const columns = widthByColumn.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const allRows = [headers, ...rows];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = headers.map((_, columnIndex) => cellXml(row[columnIndex] ?? '', `${columnName(columnIndex)}${rowIndex + 1}`, rowIndex === 0)).join('');
    const headerAttributes = rowIndex === 0 ? ' ht="60" customHeight="1"' : '';
    return `<row r="${rowIndex + 1}"${headerAttributes}>${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columns}</cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function createXlsxBuffer({ sheetName = 'Отчёт', headers, rows }) {
  const safeHeaders = Array.isArray(headers) && headers.length ? headers.map((value) => String(value ?? '')) : ['Данные'];
  const safeRows = Array.isArray(rows) ? rows.map((row) => Array.isArray(row) ? row.slice(0, safeHeaders.length) : [row]) : [];
  const escapedSheetName = escapeXml(String(sheetName).slice(0, 31) || 'Отчёт');
  return zip([
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapedSheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(safeHeaders, safeRows) }
  ]);
}
