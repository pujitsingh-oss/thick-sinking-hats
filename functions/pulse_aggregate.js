// functions/pulse_aggregate.js
// Safe, ASCII-only aggregator. No external deps.

const fs = require('fs');
const path = require('path');

// Very small CSV parser that handles commas, quotes, and newlines inside quotes.
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\n' || c === '\r') {
        // consume CRLF
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++;
        row.push(field); field = '';
        if (row.length && !row.every(x => x === '')) rows.push(row);
        row = [];
        continue;
      }
      field += c; i++; continue;
    }
  }
  // last field / row
  row.push(field);
  if (row.length && !row.every(x => x === '')) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = r[j] || '';
    return obj;
  });
}

function loadPulses() {
  // Prefer tmp (appended by pulse_submit). Fall back to seeded sample.
  const tmp = '/tmp/pulses.csv';
  const seed = path.join(__dirname, '../data-samples/pulses.csv');
  const file = fs.existsSync(tmp) ? tmp : seed;
  const text = fs.readFileSync(file, 'utf8');
  return parseCSV(text);
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function startDateFromDays(days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

// Group ratings into simple 7-day buckets from the start date (no ISO-week math).
function weeklyTrend(pulses, since) {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const buckets = {};
  for (const p of pulses) {
    const t = new Date(p.timestamp).getTime();
    const idx = Math.floor((t - since.getTime()) / weekMs);
    if (idx < 0) continue;
    (buckets[idx] = buckets[idx] || []).push(Number(p.rating_1to5) || 0);
  }
  const keys = Object.keys(buckets).map(k => Number(k)).sort((a, b) => a - b);
  return keys.map(k => {
    const arr = buckets[k];
    const sum = arr.reduce((a, b) => a + b, 0);
    return arr.length ? sum / arr.length : 0;
  });
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const team_id = params.team_id || 'RISK-OPS';
    const period = params.period || 'last_60d';
    const days = Number((period.match(/last_(\d+)d/) || [])[1] || 60);

    const since = startDateFromDays(days);
    const pulsesAll = loadPulses();

    const pulses = pulsesAll.filter(r => {
      if (r.team_id !== team_id) return false;
      const d = new Date(r.timestamp);
      return !isNaN(d.getTime()) && d >= since;
    });

    const ratings = pulses.map(r => Number(r.rating_1to5) || 0);
    const avg = ratings.length
      ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
      : 0;

    // Naive negative sentiment (lexicon)
    const negWords = ['late', 'toxic', 'confusion', 'confused', 'issue', 'problem', 'delay', 'overload', 'overtime', 'micromanage', 'stress', 'stressed', 'broken'];
    let negCount = 0;
    for (const r of pulses) {
      const toks = tokenize(r.comment_text);
      if (toks.some(t => negWords.includes(t))) negCount++;
    }
    const neg_rate = ratings.length ? Number((negCount / ratings.length).toFixed(2)) : 0;

    // Topic tagging (keyword share)
    const topicTerms = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../models/topic_terms.json'), 'utf8')
    );
    const topicCounts = {};
    for (const r of pulses) {
      const toks = tokenize(r.comment_text);
      for (const topic in topicTerms) {
        const terms = topicTerms[topic];
        if (terms.some(t => toks.includes(t))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }
    }
    const total = ratings.length || 1;
    const topics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, share: Number((count / total).toFixed(2)) }));

    // Weekly trend bars
    const trend_weekly = weeklyTrend(pulses, since);

    // Simple alert
    const alerts = [];
    if (neg_rate > 0.3 && trend_weekly.length >= 2) {
      const last = trend_weekly[trend_weekly.length - 1];
      const prev = trend_weekly[trend_weekly.length - 2];
      if (last < prev) alerts.push({ type: 'dip', severity: 'high', reason: '2w downward + neg>30%' });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avg, trend_weekly, neg_rate, topics, alerts })
    };
  } catch (e) {
    // Surface useful info in logs
    console.error('pulse_aggregate error:', e && e.stack ? e.stack : e);
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
