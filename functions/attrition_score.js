const fs = require('fs');
const path = require('path');

const model = JSON.parse(fs.readFileSync(path.join(process.cwd(),'models','attrition_model.json'),'utf8'));
const features = JSON.parse(fs.readFileSync(path.join(process.cwd(),'models','latest_features.json'),'utf8'));

function sigmoid(z){ return 1/(1+Math.exp(-z)); }

function scoreRow(row){
  let z = model.intercept;
  const reasons = [];
  for(const [k,coef] of Object.entries(model.features)){
    const x = Number(row[k]||0);
    z += coef * x;
    if (coef && x) reasons.push({feature:k, impact: Number((coef*x).toFixed(2))});
  }
  const risk = sigmoid(z);
  reasons.sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));
  return { risk: Number(risk.toFixed(2)), reasons: reasons.slice(0,3) };
}

exports.handler = async (event)=>{
  const qs = event.queryStringParameters || {};
  const team_id = qs.team_id || 'RISK-OPS';
  const top_k = Number(qs.top_k || 10);
  const rows = features.filter(r=>r.team_id===team_id);
  const scored = rows.map(r=>({ emp_hash:r.emp_hash, ...scoreRow(r) }))
                     .sort((a,b)=>b.risk-a.risk).slice(0, top_k);
  return { statusCode:200, headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ as_of:new Date().toISOString().slice(0,10), team_id, members: scored })
  };
};
