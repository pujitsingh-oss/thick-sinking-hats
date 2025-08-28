const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
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

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const team_id = params.team_id || 'RISK-OPS';
    const days = 60;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pulses = loadPulses().filter(r =>
      r.team_id === team_id && new Date(r.timestamp) >= since
    );

    const ratings = pulses.map(r => Number(r.rating_1to5) || 0);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avg, count: ratings.length })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
