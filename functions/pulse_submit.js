// functions/pulse_submit.js
const fs = require('fs');
const path = require('path');

function ensureFile(tmpPath) {
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    const seed = path.join(process.cwd(), 'data-samples', 'pulses.csv');
    if (fs.existsSync(seed)) {
      fs.copyFileSync(seed, tmpPath);
    } else {
      fs.writeFileSync(tmpPath, 'timestamp,team_id,emp_hash,rating_1to5,comment_text\n');
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Allow': 'POST' }, body: 'Use POST' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const team_id = (body.team_id || '').toString().trim();
    const rating = Number(body.rating_1to5);
    const emp_hash = (body.emp_hash || '').toString().trim();
    const comment_text = (body.comment_text || '').toString().trim().replace(/,/g, ';');

    if (!team_id || !(rating >= 1 && rating <= 5)) {
      return { statusCode: 400, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:'team_id and rating_1to5 (1..5) required' }) };
    }

    const tmp = '/tmp/pulses.csv';
    ensureFile(tmp);

    const row = [
      new Date().toISOString().slice(0,10),
      team_id,
      emp_hash,
      String(rating),
      comment_text
    ].join(',') + '\n';

    fs.appendFileSync(tmp, row, 'utf8');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:true, stored:'/tmp/pulses.csv' })
    };
  } catch (e) {
    return { statusCode: 500, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
