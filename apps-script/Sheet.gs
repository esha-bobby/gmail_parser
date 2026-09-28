// ===== Sheet.gs — reading and writing the JOB ALERTS tab =====

const SHEET_JOBS = 'JOB ALERTS';
const HEADERS = ['Date', 'Sender', 'Alert Type', 'Alert Name', 'Subject', 'Top Job Title', 'Top Company',
                 'Top Location', 'Match', 'Jobs Detected', 'Apply Link', 'Email Link', 'Message ID'];
const COL_APPLY = 11;
const COL_ID = HEADERS.length; // last column, hidden: Gmail message ID used for duplicate checks

/** Returns the JOB ALERTS tab, creating it with headers the first time. */
function getJobAlertsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_JOBS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_JOBS);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.hideColumns(COL_ID);
  }
  return sheet;
}

/** Set of Gmail message IDs already in the sheet. */
function getExistingIds(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  return new Set(sheet.getRange(2, COL_ID, lastRow - 1, 1).getValues().map(row => String(row[0])));
}

/** Appends one row per record, adds clickable links, then sorts newest first. */
function writeRecords(sheet, records) {
  if (!records.length) return;
  const startRow = sheet.getLastRow() + 1;
  const rows = records.map(r => [
    r.date, r.sender, r.alertType, r.alertName, r.subject, r.topTitle, r.topCompany,
    r.topLocation, r.matchCategory, r.jobsDetected, '', '', r.id,
  ]);

  // Message IDs as plain text, so an ID like "18e4..." is never turned into a number
  sheet.getRange(startRow, COL_ID, rows.length, 1).setNumberFormat('@');
  sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.getRange(startRow, 1, rows.length, 1).setNumberFormat('dd MMM yyyy, HH:mm');

  // Short clickable labels instead of long raw URLs
  const links = records.map(r => [linkCell('Apply ↗', r.applyUrl), linkCell('Email ↗', r.emailUrl)]);
  sheet.getRange(startRow, COL_APPLY, rows.length, 2).setRichTextValues(links);

  sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).sort({ column: 1, ascending: false });
  styleJobAlerts(sheet); // new rows get the same look (Format.gs)
}

/** A cell showing `label` that links to `url`, or "Not found" when there is no trustworthy URL. */
function linkCell(label, url) {
  const builder = SpreadsheetApp.newRichTextValue();
  return url ? builder.setText(label).setLinkUrl(url).build() : builder.setText(NOT_FOUND).build();
}

// ----- LOGS tab: one row per run -----

const SHEET_LOGS = 'LOGS';
const LOG_HEADERS = ['Timestamp', 'Action', 'Emails Processed', 'Records Added',
                     'Duplicates Skipped', 'Parsing Issues', 'Status'];
const LOG_WIDTHS = [170, 110, 130, 120, 140, 120, 260];

/** Adds one row to LOGS (newest at the top), creating the tab the first time. */
function writeLog(action, summary, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOGS);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, LOG_HEADERS.length).setValues([[new Date(), action, summary.processed,
    summary.added, summary.duplicates, summary.issues, status]]);
  sheet.getRange(2, 1).setNumberFormat('dd MMM yyyy, HH:mm:ss');
  // The inserted row copies the header's look (bold, grey), so restyle the whole table
  styleTable(sheet, LOG_HEADERS.length, LOG_WIDTHS);
}
