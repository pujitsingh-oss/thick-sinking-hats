\
const fs = require('fs');
const path = require('path');

// Simple CSV-append helper
function toCSVRow(obj, cols){
  return cols.map(k => {
    const v = (obj[k] ?? '').toString();
    // escape quotes
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return '"' + v.replace(/"/g,'""') + '"';
    }
    return v;
  }).join(',') + '\n';
}

function ensureStorageFile(tmpPath, seedPath){
  // If /tmp/pulses.csv doesn't exist, seed from data-samples/pulses.csv (read-only fallback)
  if (!fs.existsSync(tmpPath)){
    // Ensure directory exists
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    if (fs.existsSync(seedPath)){
      // copy seed to tmp
      fs.copyFileSync(seedPath, tmpPath);
    } else {
      // create header if no seed
      fs.writeFileSync(tmpPath, 'timestamp,team_id,emp_hash,rating_1to5,comment_text\n');
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Allow': 'POST' }, body: 'Method Not Allowed' };
  }
  try{
    const body = JSON.parse(event.body || '{}');
    const { team_id, emp_hash, rating_1to5, comment_text } = body;
    if(!team_id || !rating_1to5){
      return { statusCode: 400, body: JSON.stringify({ ok:false, error: 'team_id and rating_1to5 are required' }) };
    }
    const rating = Number(rating_1to5);
    if (!(rating >= 1 && rating <= 5)) {
      return { statusCode: 400, body: JSON.stringify({ ok:false, error: 'rating_1to5 must be 1..5' }) };
    }

    const nowISO = new Date().toISOString().slice(0,10);
    const row = {
      timestamp: nowISO,
      team_id: String(team_id).trim(),
      emp_hash: (emp_hash || '').trim(),    // optional for anonymous
      rating_1to5: String(rating),
      comment_text: (comment_text || '').trim()
    };

    const tmpPath = path.join('/tmp', 'pulses.csv');
    const seedPath = path.join(__dirname, '../data-samples/pulses.csv');
    ensureStorageFile(tmpPath, seedPath);

    // Append row to /tmp/pulses.csv
    const line = toCSVRow(row, ['timestamp','team_id','emp_hash','rating_1to5','comment_text']);
    fs.appendFileSync(tmpPath, line, 'utf8');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:true, stored:'tmp/pulses.csv', row })
    };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
