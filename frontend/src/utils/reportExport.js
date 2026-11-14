export const MONTH_OPTIONS = [
  { id: 1, label: "January", shortLabel: "Jan" },
  { id: 2, label: "February", shortLabel: "Feb" },
  { id: 3, label: "March", shortLabel: "Mar" },
  { id: 4, label: "April", shortLabel: "Apr" },
  { id: 5, label: "May", shortLabel: "May" },
  { id: 6, label: "June", shortLabel: "Jun" },
  { id: 7, label: "July", shortLabel: "Jul" },
  { id: 8, label: "August", shortLabel: "Aug" },
  { id: 9, label: "September", shortLabel: "Sep" },
  { id: 10, label: "October", shortLabel: "Oct" },
  { id: 11, label: "November", shortLabel: "Nov" },
  { id: 12, label: "December", shortLabel: "Dec" },
];

const escapeSpreadsheetText = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildPrintPeriodRange = (periodMode, year, month) => {
  const safeYear = Number(year);
  if (periodMode === "yearly") {
    return { start: `${safeYear}-01-01`, end: `${safeYear}-12-31` };
  }
  const safeMonth = Number(month);
  const lastDay = new Date(safeYear, safeMonth, 0).getDate();
  const monthText = String(safeMonth).padStart(2, "0");
  const dayText = String(lastDay).padStart(2, "0");
  return { start: `${safeYear}-${monthText}-01`, end: `${safeYear}-${monthText}-${dayText}` };
};

const padNumber = (value) => String(value).padStart(2, "0");

export const REPORT_PERIOD_MODES = [
  { id: "range", label: "Month range" },
  { id: "yearly", label: "Whole year" },
  { id: "daily", label: "Specific day" },
];

export const buildReportPeriod = ({ mode, year, fromMonth, toMonth, day }) => {
  const safeYear = Number(year) || new Date().getFullYear();
  if (mode === "daily") {
    const dayValue = /^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) ? String(day) : `${safeYear}-01-01`;
    const parsed = new Date(`${dayValue}T00:00:00`);
    return {
      start: dayValue,
      end: dayValue,
      label: parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      fileLabel: dayValue,
    };
  }
  if (mode === "yearly") {
    return { start: `${safeYear}-01-01`, end: `${safeYear}-12-31`, label: `January – December ${safeYear}`, fileLabel: String(safeYear) };
  }
  const startMonth = Math.min(12, Math.max(1, Number(fromMonth) || 1));
  const endMonth = Math.min(12, Math.max(startMonth, Number(toMonth) || startMonth));
  const lastDay = new Date(safeYear, endMonth, 0).getDate();
  const startLabel = MONTH_OPTIONS[startMonth - 1].label;
  const endLabel = MONTH_OPTIONS[endMonth - 1].label;
  return {
    start: `${safeYear}-${padNumber(startMonth)}-01`,
    end: `${safeYear}-${padNumber(endMonth)}-${padNumber(lastDay)}`,
    label: startMonth === endMonth ? `${startLabel} ${safeYear}` : `${startLabel} – ${endLabel} ${safeYear}`,
    fileLabel:
      startMonth === endMonth
        ? `${safeYear}-${padNumber(startMonth)}`
        : `${safeYear}-${padNumber(startMonth)}-to-${padNumber(endMonth)}`,
  };
};

export const splitReportTypeLabel = (label) => {
  const text = String(label || "").trim();
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(text);
  if (!match || !match[1]) return { name: text, kind: "" };
  return { name: match[1].trim(), kind: match[2].trim() };
};

export const buildShortTypeLabels = (labels) => {
  const shortNames = labels.map((label) => splitReportTypeLabel(label).name.toLowerCase());
  return labels.map((label, index) => {
    const { name } = splitReportTypeLabel(label);
    const isUnique = shortNames.filter((shortName) => shortName === shortNames[index]).length === 1;
    return isUnique ? name : label;
  });
};

const toPercent = (count, total) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

export const REPORT_STATUS_ORDER = ["Completed", "Ongoing", "Cancelled"];

const createStatusCounts = () => Object.fromEntries(REPORT_STATUS_ORDER.map((status) => [status, 0]));

const readStatusLabel = (row) => String(row?.appointmentStatus || "").trim() || "Ongoing";

export const buildReportSummary = (rows, { start, end } = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const total = safeRows.length;
  const typeCounts = new Map();
  const statusCounts = new Map(REPORT_STATUS_ORDER.map((status) => [status, 0]));
  for (const row of safeRows) {
    const typeLabel = String(row?.appointmentType || "").trim() || "Other";
    const statusLabel = readStatusLabel(row);
    const typeEntry = typeCounts.get(typeLabel) || { count: 0, statusCounts: createStatusCounts() };
    typeEntry.count += 1;
    typeEntry.statusCounts[statusLabel] = (typeEntry.statusCounts[statusLabel] || 0) + 1;
    typeCounts.set(typeLabel, typeEntry);
    statusCounts.set(statusLabel, (statusCounts.get(statusLabel) || 0) + 1);
  }
  const byType = Array.from(typeCounts, ([label, entry]) => ({
    label,
    count: entry.count,
    statusCounts: entry.statusCounts,
    percent: toPercent(entry.count, total),
  })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const byStatus = Array.from(statusCounts, ([label, count]) => ({ label, count, percent: toPercent(count, total) }));

  const byMonth = [];
  const startMatch = /^(\d{4})-(\d{2})/.exec(String(start || ""));
  const endMatch = /^(\d{4})-(\d{2})/.exec(String(end || ""));
  if (startMatch && endMatch) {
    const startIndex = Number(startMatch[1]) * 12 + Number(startMatch[2]) - 1;
    const endIndex = Number(endMatch[1]) * 12 + Number(endMatch[2]) - 1;
    if (endIndex > startIndex) {
      const months = new Map();
      for (let index = startIndex; index <= endIndex; index += 1) {
        const monthYear = Math.floor(index / 12);
        const monthNumber = (index % 12) + 1;
        months.set(`${monthYear}-${padNumber(monthNumber)}`, {
          label: MONTH_OPTIONS[monthNumber - 1].shortLabel,
          total: 0,
          counts: {},
          statusCounts: createStatusCounts(),
        });
      }
      for (const row of safeRows) {
        const createdAt = new Date(row?.createdAt);
        if (Number.isNaN(createdAt.getTime())) continue;
        const bucket = months.get(`${createdAt.getFullYear()}-${padNumber(createdAt.getMonth() + 1)}`);
        if (!bucket) continue;
        const typeLabel = String(row?.appointmentType || "").trim() || "Other";
        const statusLabel = readStatusLabel(row);
        bucket.total += 1;
        bucket.counts[typeLabel] = (bucket.counts[typeLabel] || 0) + 1;
        bucket.statusCounts[statusLabel] = (bucket.statusCounts[statusLabel] || 0) + 1;
      }
      byMonth.push(...months.values());
    }
  }

  return { total, byType, byStatus, byMonth };
};

const buildSpreadsheetCell = (cell, styleID = "") => {
  const isNumber = typeof cell === "number" && Number.isFinite(cell);
  const styleAttribute = styleID ? ` ss:StyleID="${styleID}"` : "";
  return `<Cell${styleAttribute}><Data ss:Type="${isNumber ? "Number" : "String"}">${
    isNumber ? cell : escapeSpreadsheetText(cell)
  }</Data></Cell>`;
};

const buildSpreadsheetTable = ({ title, headers, rows }) => {
  const titleXml = title ? `<Row><Cell ss:StyleID="Section"><Data ss:Type="String">${escapeSpreadsheetText(title)}</Data></Cell></Row>` : "";
  const headerXml = `<Row>${headers.map((header) => buildSpreadsheetCell(header, "Header")).join("")}</Row>`;
  const bodyXml = rows.map((row) => `<Row>${row.map((cell) => buildSpreadsheetCell(cell)).join("")}</Row>`).join("");
  return `${titleXml}${headerXml}${bodyXml}`;
};

export const buildExcelReportFile = ({
  summaryLines,
  summaryTables = [],
  headers,
  rows,
  headerColor = "#7F1717",
  sheetName = "Reports",
}) => {
  const summaryXml = summaryLines
    .map(
      (line) =>
        `<Row><Cell ss:StyleID="Title"><Data ss:Type="String">${escapeSpreadsheetText(line)}</Data></Cell></Row>`,
    )
    .join("");
  const summaryTablesXml = summaryTables.map((table) => `<Row/>${buildSpreadsheetTable(table)}`).join("");
  const headerXml = `${summaryTables.length > 0 ? `<Row><Cell ss:StyleID="Section"><Data ss:Type="String">Records</Data></Cell></Row>` : ""}<Row>${headers
    .map((header) => buildSpreadsheetCell(header, "Header"))
    .join("")}</Row>`;
  const bodyXml = rows.map((row) => `<Row>${row.map((cell) => buildSpreadsheetCell(cell)).join("")}</Row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="12"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="${escapeSpreadsheetText(headerColor)}" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Section"><Font ss:Bold="1" ss:Size="11" ss:Color="${escapeSpreadsheetText(headerColor)}"/></Style>
  </Styles>
  <Worksheet ss:Name="${escapeSpreadsheetText(sheetName)}">
    <Table>
      ${summaryXml}
      ${summaryTablesXml}
      <Row/>
      ${headerXml}
      ${bodyXml}
    </Table>
  </Worksheet>
</Workbook>`;
};

export const downloadTextFile = (filename, contents, mimeType) => {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
