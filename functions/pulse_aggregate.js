// functions/pulse_aggregate.js
const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    // simple split; comments already sanitize commas to ';'
    const parts = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = parts[i] || '');
    return obj;
  });
}

function loadPulses() {
  const tmp = '/tmp/pulses.csv';
  const seed = path.join(process.cwd(), 'data-samples', 'pulses.csv');
  const file = fs.existsSync(tmp) ? tmp : seed;
  return parseCSV(fs.readFileSync(file, 'utf8'));
}

function tokenize(s) {
  return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
}

function weeklyTrend(pulses, since) {
  const weekMs = 7*24*60*60*1000;
  const buckets = {};
  for (const p of pulses) {
    const t = new Date(p.timestamp).getTime();
    if (isNaN(t)) continue;
    const idx = Math.floor((t - since.getTime())/weekMs);
    if (idx < 0) continue;
    (buckets[idx] = buckets[idx] || []).push(Number(p.rating_1to5)||0);
  }
  return Object.keys(buckets).map(k => {
    const arr = buckets[k];
    const sum = arr.reduce((a,b)=>a+b,0);
    return arr.length ? Number((sum/arr.length).toFixed(2)) : 0;
  });
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const team_id = qs.team_id || 'RISK-OPS';
    const days = Number((qs.period||'last_60d').match(/last_(\d+)d/)?.[1] || 60);
    const since = new Date(Date.now() - days*24*60*60*1000);

    const all = loadPulses();
    const pulses = all.filter(r => r.team_id === team_id && new Date(r.timestamp) >= since);

    const ratings = pulses.map(r => Number(r.rating_1to5)||0);
    const avg = ratings.length ? Number((ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(2)) : 0;

    // naive neg sentiment
    const negWords = ['late','toxic','confusion','confused','issue','problem','delay','overload','overtime','micromanage','stress','stressed','broken'];
    let negCount = 0;
    const topicTerms = JSON.parse(fs.readFileSync(path.join(process.cwd(),'models','topic_terms.json'),'utf8'));
    const topicCounts = {};
    for(const r of pulses){
      const toks = tokenize(r.comment_text);
      if (toks.some(t => negWords.includes(t))) negCount++;
      for (const topic in topicTerms) {
        if (topicTerms[topic].some(t => toks.includes(t))) {
          topicCounts[topic] = (topicCounts[topic]||0)+1;
        }
      }
    }
    const neg_rate = ratings.length ? Number((negCount/ratings.length).toFixed(2)) : 0;
    const totalMsgs = ratings.length || 1;
    const topics = Object.entries(topicCounts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5)
      .map(([name,count]) => ({ name, share: Number((count/totalMsgs).toFixed(2)) }));

    const trend_weekly = weeklyTrend(pulses, since);
    const alerts = [];
    if (neg_rate > 0.3 && trend_weekly.length >= 2 && trend_weekly.at(-1) < trend_weekly.at(-2)) {
      alerts.push({ type:'dip', severity:'high', reason:'2w downward + neg>30%' });
    }

    return { statusCode:200, headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ avg, trend_weekly, neg_rate, topics, alerts })
    };
  } catch (e) {
    return { statusCode:500, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error:String(e) }) };
  }
};
