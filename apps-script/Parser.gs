// ===== Parser.gs =====
// Turns one Naukri job-alert email into one record (one email = one row).
// Built from the real HTML of my Naukri emails: every job card links to
// naukri.com/jd/... with a position marker xp=1, xp=2, ... (card order).

const NOT_FOUND = 'Not found';

// Top Job priority: AI > ML > Backend > SDE, matched on the job title only.
// \b = whole words, so "AI" does not match "Chennai" and "ML" does not match "HTML".
const ROLE_PRIORITY = [
  { category: 'AI',      pattern: /\b(ai|artificial intelligence|gen ?ai|generative|llm|agentic|nlp)\b/i },
  { category: 'ML',      pattern: /\b(ml|machine learning|deep learning|data scientist|data science)\b/i },
  { category: 'Backend', pattern: /\b(back[\s-]?end|server[\s-]?side)\b/i },
  { category: 'SDE',     pattern: /\b(sde|software (development )?engineer|software developer)\b/i },
];

/** Parses one GmailMessage into a flat record object. */
function parseNaukriEmail(message) {
  const subject = decodeEntities(message.getSubject()).trim();
  const jobs = extractJobs(message.getBody());
  const top = pickTopJob(jobs);
  const alert = parseSubject(subject);

  return {
    id: message.getId(),
    date: message.getDate(),
    sender: (message.getFrom().match(/<([^>]+)>/) || [, message.getFrom()])[1],
    alertType: alert.type,
    alertName: alert.name,
    subject: subject,
    topTitle: top ? top.title : NOT_FOUND,
    topCompany: top && top.company ? top.company : NOT_FOUND,
    topLocation: top && top.location ? top.location : NOT_FOUND,
    matchCategory: top ? top.category : NOT_FOUND,
    jobsDetected: jobs.length,
    applyUrl: top && top.applyUrl ? top.applyUrl : '',
    emailUrl: buildGmailLink(message.getId()),
    jobs: jobs, // kept for testing/logging only, not written to the sheet
  };
}

/** Alert type + alert name come from the subject line (two formats seen in my inbox). */
function parseSubject(subject) {
  let m = subject.match(/Custom Job Alert - (.+)$/i);
  if (m) return { type: 'Custom Job Alert', name: m[1].trim() };
  m = subject.match(/^New (.+?) jobs in (.+?) matching your search/i);
  if (m) return { type: 'Search Alert', name: `${m[1].trim()} · ${m[2].trim()}` };
  return { type: 'Other', name: NOT_FOUND };
}

/** Finds every job card in the email HTML and returns them in card order. */
function extractJobs(html) {
  // Innermost links only: some cards are wrapped in an outer <a> that also contains
  // a letter logo (e.g. "Q"), which would otherwise leak into the title.
  const linkRegex = /<a\b[^>]*href=["']([^"']*naukri\.com\/jd[^"']*?[?&](?:amp;)?xp=(\d+)[^"']*)["'][^>]*>((?:(?!<a\b)[\s\S])*?)<\/a>/gi;
  const cards = {};
  let m;

  // 1) Group all job links by their xp card number
  while ((m = linkRegex.exec(html)) !== null) {
    const xp = Number(m[2]);
    const url = decodeEntities(m[1]);
    const text = htmlToLines(m[3]).join(' ');
    const card = cards[xp] || (cards[xp] = { xp: xp, start: m.index, title: '', titleUrl: '', applyUrl: '' });

    if (/^apply$/i.test(text)) card.applyUrl = url;                 // Search Alerts have an "Apply" button
    else if (text && !card.title && text.length < 200) {            // the link whose text is the job title
      card.title = text;
      card.titleUrl = url;
    }
  }

  const list = Object.keys(cards).map(k => cards[k]).sort((a, b) => a.xp - b.xp);

  // 2) Read company + location from each card's own slice of HTML
  list.forEach((card, i) => {
    const end = i + 1 < list.length ? list[i + 1].start : card.start + 8000;
    const cardHtml = html.slice(card.start, end);
    const lines = htmlToLines(cardHtml);

    // Company = first text line after the title, skipping the AmbitionBox rating (e.g. "4.4")
    const afterTitle = lines.slice(lines.indexOf(card.title) + 1).filter(l => !/^\d(\.\d)?$/.test(l));
    card.company = afterTitle[0] || '';

    // Location = text right after the location icon (internship cards have no location)
    const loc = cardHtml.match(/<img[^>]*src=["'][^"']*(location|\/i1\.png)[^"']*["'][^>]*>([\s\S]*?)(?=<img|$)/i);
    card.location = loc ? (htmlToLines(loc[2])[0] || '') : '';

    // Apply link: explicit "Apply" button if present, else the job title link.
    // Only trusted if it points to a real job page (contains "job-listings-").
    const url = card.applyUrl || card.titleUrl;
    card.applyUrl = /\/job-listings-/.test(url) ? url : '';
    delete card.start;
    delete card.titleUrl;
  });

  return list.filter(card => card.title);
}

/** Highest-priority category wins; ties go to the earliest card with a working link. */
function pickTopJob(jobs) {
  if (!jobs.length) return null;
  for (const rule of ROLE_PRIORITY) {
    const matches = jobs.filter(j => rule.pattern.test(j.title));
    if (matches.length) {
      const best = matches.find(j => j.applyUrl) || matches[0];
      return Object.assign({ category: rule.category }, best);
    }
  }
  return Object.assign({ category: 'Other' }, jobs[0]); // nothing matched: first card
}

/**
 * Link that opens the original email in Gmail.
 * Tested: ".../mail/u/0/#all/<id>" only opened the inbox; adding authuser=<my account> opens the email itself.
 */
function buildGmailLink(messageId) {
  const account = Session.getEffectiveUser().getEmail();
  return `https://mail.google.com/mail/?authuser=${account}#all/${messageId}`;
}

/** Strips HTML tags and returns the visible text as trimmed, non-empty lines. */
function htmlToLines(html) {
  return decodeEntities(
    html.replace(/<(br|\/td|\/tr|\/div|\/p|\/a|\/span|\/strong)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  ).split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Decodes the HTML entities seen in Naukri emails (including their "&Amp;" typo). */
function decodeEntities(s) {
  return s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** TEST: parse the first TEST_LIMIT emails and print the results. Writes nothing. */
function testParser() {
  searchNaukriMessages(TEST_LIMIT).forEach(msg => {
    try {
      const r = parseNaukriEmail(msg);
      console.log(`===== ${r.subject}`);
      console.log(`Type: ${r.alertType} | Alert: ${r.alertName} | Jobs detected: ${r.jobsDetected}`);
      console.log(`TOP [${r.matchCategory}]: ${r.topTitle} | ${r.topCompany} | ${r.topLocation}`);
      console.log(`Apply: ${r.applyUrl || NOT_FOUND}`);
      console.log(`Email: ${r.emailUrl}`);
      r.jobs.forEach(j => console.log(`  ${j.xp}. ${j.title} | ${j.company || '-'} | ${j.location || '-'} | ${j.applyUrl ? 'link ok' : 'NO LINK'}`));
    } catch (e) {
      console.log(`PARSE ERROR in "${msg.getSubject()}": ${e.message}`);
    }
  });
}
