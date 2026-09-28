// ===== Format.gs — layout and styling of all tabs (visual only, no data logic) =====

const THEME = {
  font: 'Roboto',
  ink: '#202124',      // main text
  muted: '#5F6368',    // labels
  faint: '#9AA0A6',    // hints, "Not found"
  line: '#DADCE0',     // borders
  headerBg: '#F1F3F4',
  band: '#F8F9FA',     // alternating rows / dashboard background
  accent: '#1A73E8',   // links
  good: '#188038',
  bad: '#D93025',
};
const SHEET_DASHBOARD = 'DASHBOARD';
const SHEET_SUBMISSION = 'SUBMISSION';

/** One-time setup (also in the menu): builds/restyles every tab and puts them in order. */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  styleJobAlerts(getJobAlertsSheet());
  buildSubmission(ss);
  buildDashboard(ss);
  const logs = ss.getSheetByName(SHEET_LOGS);
  if (logs) styleTable(logs, LOG_HEADERS.length, LOG_WIDTHS);

  // Tab order: DASHBOARD, JOB ALERTS, SUBMISSION, LOGS
  [SHEET_DASHBOARD, SHEET_JOBS, SHEET_SUBMISSION, SHEET_LOGS].forEach((name, i) => {
    const sheet = ss.getSheetByName(name);
    if (sheet) { ss.setActiveSheet(sheet); ss.moveActiveSheet(i + 1); }
  });
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
  ss.setActiveSheet(ss.getSheetByName(SHEET_DASHBOARD));
}

/** Shared table style: header, fonts, alternating rows, widths. */
function styleTable(sheet, numCols, widths) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const table = sheet.getRange(1, 1, lastRow, numCols);
  table.setFontFamily(THEME.font).setFontSize(10).setFontColor(THEME.ink).setFontWeight('normal')
       .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.getRange(1, 1, 1, numCols).setFontWeight('bold').setFontColor(THEME.muted)
       .setBorder(null, null, true, null, null, null, THEME.line, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(1, 34);
  if (lastRow > 1) sheet.setRowHeights(2, lastRow - 1, 28);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);

  sheet.getBandings().forEach(b => b.remove());
  table.applyRowBanding()
       .setHeaderRowColor(THEME.headerBg).setFirstRowColor('#FFFFFF').setSecondRowColor(THEME.band);
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

/** JOB ALERTS styling. Called after every write so new rows get the same look. */
function styleJobAlerts(sheet) {
  const numCols = HEADERS.length - 1; // hidden Message ID column is left alone
  styleTable(sheet, numCols, [135, 170, 125, 220, 260, 240, 180, 150, 70, 100, 80, 80]);
  const lastRow = Math.max(sheet.getLastRow(), 2);

  sheet.getRange(2, 1, lastRow - 1, 1).setNumberFormat('dd MMM yyyy, HH:mm');
  sheet.getRange(1, 9, lastRow, 4).setHorizontalAlignment('center');           // Match … Email Link
  sheet.getRange(2, COL_APPLY, lastRow - 1, 2).setFontColor(THEME.accent);

  // Filter over the whole table (recreated only when new rows fall outside it)
  const filter = sheet.getFilter();
  if (filter && filter.getRange().getLastRow() < lastRow) filter.remove();
  if (!sheet.getFilter()) sheet.getRange(1, 1, lastRow, numCols).createFilter();

  // "Not found" in grey italic; Match category as coloured text
  const data = sheet.getRange(2, 1, lastRow - 1, numCols);
  const match = sheet.getRange(2, 9, lastRow - 1, 1);
  const rule = () => SpreadsheetApp.newConditionalFormatRule();
  const colours = { AI: THEME.accent, ML: '#8430CE', Backend: THEME.good, SDE: '#E37400', Other: THEME.faint };
  sheet.setConditionalFormatRules([
    rule().whenTextEqualTo(NOT_FOUND).setFontColor(THEME.faint).setItalic(true).setRanges([data]).build(),
    ...Object.keys(colours).map(cat =>
      rule().whenTextEqualTo(cat).setFontColor(colours[cat]).setBold(true).setRanges([match]).build()),
  ]);
}

/** DASHBOARD: title, 4 KPI cards, automation status, alerts-by-search. All values are live formulas. */
function buildDashboard(ss) {
  const sh = ss.getSheetByName(SHEET_DASHBOARD) || ss.insertSheet(SHEET_DASHBOARD);
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.setHiddenGridlines(true);
  [24, 190, 16, 190, 16, 190, 16, 220, 50, 24].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange(1, 1, 40, 10).setBackground(THEME.band).setFontFamily(THEME.font)
    .setFontColor(THEME.ink).setVerticalAlignment('middle');

  // Header
  sh.setRowHeight(1, 16);
  sh.setRowHeight(2, 40);
  sh.getRange('B2').setValue('Naukri Job Alerts Tracker').setFontSize(18).setFontWeight('bold');
  sh.getRange('B3').setValue('Gmail → Apps Script → Google Sheets  ·  one row per Naukri job-alert email')
    .setFontSize(10).setFontColor(THEME.muted);

  // KPI cards (whole-column references so inserted LOG rows never shift them)
  const successCol = col => `FILTER(LOGS!${col}:${col}, LOGS!G:G="Success")`;
  const cards = [
    ['B', 'TOTAL ALERTS', `=COUNTA('JOB ALERTS'!M:M)-1`, 'Naukri emails imported', '0', 22],
    ['D', 'NEW RECORDS', `=IFERROR(INDEX(${successCol('D')}, 1), 0)`, 'added in the last refresh', '0', 22],
    ['F', 'UNIQUE COMPANIES',
      `=IFERROR(COUNTUNIQUE(FILTER('JOB ALERTS'!G2:G, 'JOB ALERTS'!G2:G<>"", 'JOB ALERTS'!G2:G<>"${NOT_FOUND}")), 0)`,
      'across top jobs', '0', 22],
    ['H', 'LAST REFRESHED', `=IFERROR(INDEX(${successCol('A')}, 1), "—")`, 'last successful sync', 'dd MMM, HH:mm', 16],
  ];
  sh.setRowHeight(5, 26); sh.setRowHeight(6, 42); sh.setRowHeight(7, 24);
  cards.forEach(([c, label, formula, note, format, size]) => {
    sh.getRange(`${c}5:${c}7`).setBackground('#FFFFFF')
      .setBorder(true, true, true, true, false, false, THEME.line, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(`${c}5`).setValue(label).setFontSize(9).setFontWeight('bold').setFontColor(THEME.muted);
    sh.getRange(`${c}6`).setFormula(formula).setNumberFormat(format).setFontSize(size).setFontWeight('bold')
      .setHorizontalAlignment('left');
    sh.getRange(`${c}7`).setValue(note).setFontSize(9).setFontColor(THEME.faint);
  });

  // Automation status (latest LOGS row)
  sh.getRange('B10').setValue('AUTOMATION STATUS').setFontSize(9).setFontWeight('bold').setFontColor(THEME.muted);
  const latest = col => `=IFERROR(INDEX(LOGS!${col}:${col}, 2), "—")`;
  const status = [
    ['Status', `=IFERROR(IF(INDEX(LOGS!G:G, 2)="Success", "● Synced", INDEX(LOGS!G:G, 2)), "Not run yet")`],
    ['Last run', latest('A')],
    ['Processed', latest('C')],
    ['Added', latest('D')],
    ['Duplicates skipped', latest('E')],
    ['Parsing issues', latest('F')],
    ['Gmail query', NAUKRI_QUERY],
  ];
  status.forEach(([label, value], i) => {
    const row = 11 + i;
    sh.getRange(row, 2).setValue(label).setFontSize(10).setFontColor(THEME.muted);
    const cell = sh.getRange(row, 4).setFontSize(10).setHorizontalAlignment('left');
    value.startsWith('=') ? cell.setFormula(value) : cell.setValue(value);
  });
  sh.getRange('D12').setNumberFormat('dd MMM yyyy, HH:mm');
  sh.getRange('B11:F17').setBorder(true, null, true, null, null, true, THEME.line, SpreadsheetApp.BorderStyle.SOLID);

  // Alerts by search: which of my Naukri alerts send the most emails
  sh.getRange('H10').setValue('ALERTS BY SEARCH').setFontSize(9).setFontWeight('bold').setFontColor(THEME.muted);
  sh.getRange('H11').setFormula(
    `=IFERROR(QUERY('JOB ALERTS'!D2:D, "select D, count(D) where D <> '' group by D order by count(D) desc label count(D) ''", 0), "—")`);
  sh.getRange('H11:I25').setFontSize(10);
  sh.getRange('I11:I25').setHorizontalAlignment('right').setFontColor(THEME.muted);

  const statusCell = sh.getRange('D11');
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('●').setFontColor(THEME.good).setBold(true)
      .setRanges([statusCell]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Failed').setFontColor(THEME.bad).setBold(true)
      .setRanges([statusCell]).build(),
  ]);
}

/** SUBMISSION: required fields. Created once, so my later edits are never overwritten. */
function buildSubmission(ss) {
  if (ss.getSheetByName(SHEET_SUBMISSION)) return;
  const sh = ss.insertSheet(SHEET_SUBMISSION);
  const rows = [
    ['Field', 'Response'],
    ['Name', 'Esha Bobby'],
    ['App/Service selected', 'Naukri (job-alert emails from naukrialerts@naukri.com)'],
    ['Number of records extracted', `=COUNTA('JOB ALERTS'!M:M)-1`],
    ['Google Apps Script link', '[to add]'],
    ['AI tool(s) used', 'Claude and ChatGPT'],
    ['Most important AI prompt', '[to add]'],
    ['One problem/error encountered', '[to add]'],
    ['How I solved it', '[to add]'],
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  styleTable(sh, 2, [240, 640]);
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sh.getRange(2, 2, rows.length - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
    .setVerticalAlignment('top').setHorizontalAlignment('left');
  sh.getRange(2, 1, rows.length - 1, 1).setVerticalAlignment('top');
}
