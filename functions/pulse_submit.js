const fs = require('fs');
const path = require('path');

function ensureFile(tmpPath) {
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    const seed = path.join(process.cwd(), 'data-samples', 'pulses.csv');
    if (fs.existsSync(seed)) fs.copyFileSync(seed, tmpPath);
    else fs.writeFileSync(tmpPath, 'timestamp,team_id,emp_hash,rating_1to5,comment_text\n');
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Use POST' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const row = [
      new Date().toISOString().slice(0, 10),
      body.team_id || '',
      body.emp_hash || '',
      body.rating_1to5 || '',
      (body.comment_text || '').replace(/,/g, ';')
    ].join(',') + '\n';

    const tmp = '/tmp/pulses.csv';
    ensureFile(tmp);
    fs.appendFileSync(tmp, row);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
