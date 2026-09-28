# Development notes (real issues found while building)

Used later for the SUBMISSION tab ("one problem/error + how I solved it") and the demo.

| # | Date | What happened (observed) | Fix / decision |
|---|------|--------------------------|----------------|
| 1 | 2026-09-27 | `getPlainBody()` for Custom Job Alert emails returned only 54 chars ("Job recommendations based on your Naukri.com profile") — all job data is in HTML only. | Parser reads `getBody()` (HTML) instead of plain text. |
| 2 | 2026-09-27 | Gmail link `https://mail.google.com/mail/u/0/#all/<messageId>` opened the normal inbox, not the email. | Tested 2 alternatives in the browser: `mail/?authuser=<my email>#all/<messageId>` opens the exact email; the `rfc822msgid` search link only shows a search result. Using the authuser link (built with `Session.getEffectiveUser().getEmail()`). |
| 3 | 2026-09-27 | One job link in a Search Alert (Qualcomm "AI Engineer") was `naukri.com/jd?xp=2…` with no job ID → opened a 404 page. Other links contain `/job-listings-…-<id>` and open correctly. | Only trust links containing `/job-listings-`; otherwise Apply = "Not found". Within a category, prefer a card with a working link. |
| 4 | 2026-09-27 | Internship card showed "4 months duration" as location when location was read by position. | Read location from the text after the location icon; internship cards → "Not found". |
| 5 | 2026-09-27 | Subjects contain Naukri's broken entity `&Amp;` (e.g. "Tech &Amp; Digital"). | Case-insensitive entity decoding. |
| 6 | 2026-09-27 | 3 "check out jobs applied by your peers" emails matched the sender query but are not job alerts. | Query: `from:naukrialerts@naukri.com -subject:"applied by your peers"`. |
| 7 | 2026-09-27 | In the "Devops - Rebadging Professional" email, 3 cards parsed as "Q Devops Engineer \| company: Q" (also I…, N…). The card's outer `<a>` wraps a letter logo + the title link, and the regex captured the outer link's text. These cards also had no job ID in the URL (NO LINK). | Regex now only matches innermost links (no `<a` inside the link text). |
| 8 | 2026-09-27 | Running `testImport` failed: `SyntaxError: Identifier 'NAUKRI_QUERY' has already been declared (Parser.gs:1)`. The Code.gs content had been pasted into Parser.gs. | Learned that all .gs files in a project share one global scope; each constant/function may exist in only one file. Re-pasted the correct Parser.gs. |
| 9 | 2026-09-27 | LOGS data rows appeared bold. `insertRowAfter(1)` makes the new row inherit the bold header format. | After the first fix the newest LOGS row was still bold/grey (unverified whether the updated Sheet.gs had been pasted). More robust fix: restyle the whole LOGS table after every insert. |
