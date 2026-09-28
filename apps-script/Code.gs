// ===== Code.gs — settings, Gmail search and the main import =====

// Sender verified via "Show original". Peer-activity digests are not job alerts, so they are excluded.
const NAUKRI_QUERY = 'from:naukrialerts@naukri.com -subject:"applied by your peers"';
const NAUKRI_SENDER = 'naukrialerts@naukri.com';

// Small limit while testing.
const TEST_LIMIT = 3;

/** Adds the "Naukri Automation" menu every time the spreadsheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Naukri Automation')
    .addItem('↻ Refresh Data', 'refreshData')
    .addSeparator()
    .addItem('Rebuild layout', 'setupSheets')
    .addToUi();
}

/**
 * BONUS: checks Gmail again and adds only new emails.
 * Used by the menu, the dashboard button and the editor.
 */
function refreshData() {
  runAndLog('Refresh Data');
}

/** TEST: import only the newest TEST_LIMIT emails. */
function testImport() {
  runAndLog('Test import', TEST_LIMIT);
}

/** Runs the sync once, records it in LOGS and shows the summary in the sheet. */
function runAndLog(action, limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { // a refresh is already running (e.g. double click)
    ss.toast('A refresh is already running — please wait.', 'Naukri Automation');
    return;
  }
  try {
    ss.toast('Checking Gmail for new Naukri alerts…', 'Naukri Automation');
    const s = syncEmails(limit);
    writeLog(action, s, 'Success');
    ss.toast(`Processed ${s.processed} · Added ${s.added} · Duplicates skipped ${s.duplicates} · ` +
             `Parsing issues ${s.issues}`, 'Refresh complete', 8);
  } catch (e) {
    writeLog(action, { processed: '', added: '', duplicates: '', issues: '' }, `Failed: ${e.message}`);
    ss.toast(e.message, 'Refresh failed', 10);
    throw e; // also show the error in the execution log
  } finally {
    lock.releaseLock();
  }
}

/**
 * The whole pipeline: search Gmail → skip known emails → parse new ones → write rows.
 * Skipping by Gmail message ID makes it safe to run again and again (no duplicates).
 */
function syncEmails(limit) {
  const sheet = getJobAlertsSheet();
  const knownIds = getExistingIds(sheet);
  const messages = searchNaukriMessages(limit);
  const summary = { processed: 0, added: 0, duplicates: 0, issues: 0 };
  const records = [];

  messages.forEach(msg => {
    summary.processed++;
    if (knownIds.has(msg.getId())) {
      summary.duplicates++;
      return;
    }
    try {
      const record = parseNaukriEmail(msg);
      if (record.topTitle === NOT_FOUND) summary.issues++; // row is still written, flagged "Not found"
      records.push(record);
      knownIds.add(record.id);
    } catch (e) {
      // One bad email must not stop the run. It is not written, so the next run retries it.
      summary.issues++;
      console.log(`PARSE ERROR in "${msg.getSubject()}": ${e.message}`);
    }
  });

  writeRecords(sheet, records);
  summary.added = records.length;
  console.log(`Processed: ${summary.processed} | Added: ${summary.added} | ` +
              `Duplicates skipped: ${summary.duplicates} | Parsing issues: ${summary.issues}`);
  return summary;
}

/** Returns Naukri alert messages, newest first (pages through results 100 threads at a time). */
function searchNaukriMessages(limit) {
  const messages = [];
  for (let start = 0; ; start += 100) {
    const threads = GmailApp.search(NAUKRI_QUERY, start, 100);
    threads.forEach(thread => thread.getMessages().forEach(msg => {
      if (msg.getFrom().includes(NAUKRI_SENDER)) messages.push(msg);
    }));
    if (threads.length < 100 || (limit && messages.length >= limit)) break;
  }
  return limit ? messages.slice(0, limit) : messages;
}

/** Lists every Naukri message the query finds (sanity check for the search). */
function testGmailSearch() {
  const messages = searchNaukriMessages();
  messages.forEach((msg, i) =>
    console.log(`${i + 1} | ${msg.getDate().toISOString().slice(0, 10)} | ${msg.getSubject()}`));
  console.log(`Naukri messages found: ${messages.length}`);
}
