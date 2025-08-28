\
const fs = require('fs');
const path = require('path');

function parseCSV(text){
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map(line => {
    const parts = []; let cur = ''; let inQ=false;
    for (let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='\"'){ inQ=!inQ; continue; }
      if(c===',' && !inQ){ parts.push(cur); cur=''; } else { cur+=c; }
    }
    parts.push(cur);
    const obj = {};
    cols.forEach((k,idx)=>obj[k]=parts[idx]);
    return obj;
  });
}

function loadPulses(){
  const tmp = '/tmp/pulses.csv';
  const seed = path.join(__dirname,'../data-samples/pulses.csv');
  const p = fs.existsSync(tmp) ? tmp : seed;
  const text = fs.readFileSync(p,'utf8');
  return parseCSV(text);
}

function tokenize(s){ return (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean); }

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const team_id = params.team_id || 'RISK-OPS';
  const period = params.period || 'last_60d';
  const days = Number((period.match(/last_(\d+)d/)||[])[1]||60);
  const since = new Date(Date.now() - days*24*60*60*1000);
  const pulses = loadPulses().filter(r => r.team_id===team_id && new Date(r.timestamp)>=since);

  const ratings = pulses.map(r => Number(r.rating_1to5)||0);
  const avg = ratings.reduce((a,b)=>a+b,0)/Math.max(1,ratings.length);

  // weekly trend
  const byWeek = {};
  pulses.forEach(r=>{
    const d = new Date(r.timestamp);
    const wk = `${d.getUTCFullYear()}-W${Math.ceil((d.getUTCDate() + (new Date(Date.UTC(d.getUTCFullYear(),0,1)).getUTCDay()+1))/7)}`;
    byWeek[wk] = byWeek[wk] || [];
    byWeek[wk].push(Number(r.rating_1to5)||0);
  });
  const weeks = Object.keys(byWeek).sort();
  const trend_weekly = weeks.map(wk => {
    const arr = byWeek[wk]; return arr.reduce((a,b)=>a+b,0)/arr.length;
  });

  // naive sentiment + topics
  const negWords = ['late','toxic','confusion','confused','issue','problem','delay','overload','overtime','micromanage'];
  const topicTerms = JSON.parse(fs.readFileSync(path.join(__dirname,'../models/topic_terms.json'),'utf8'));
  let negCount=0;
  const topicCounts = {};
  pulses.forEach(r=>{
    const toks = tokenize(r.comment_text);
    if (toks.some(t => negWords.includes(t))) negCount++;
    for(const [topic, terms] of Object.entries(topicTerms)){
      if(terms.some(t => toks.includes(t))){
        topicCounts[topic]=(topicCounts[topic]||0)+1;
      }
    }
  });
  const total = Math.max(1, pulses.length);
  const neg_rate = negCount/total;
  const topics = Object.entries(topicCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name, share: count/total}));

  const alerts = [];
  if (neg_rate>0.3 && trend_weekly.length>1 && (trend_weekly.slice(-1)[0] < trend_weekly.slice(-2)[0])) {
    alerts.push({type:'dip', severity:'high', reason:'2w downward + neg>30%'});
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ avg: Number(avg.toFixed(2)), trend_weekly, neg_rate: Number(neg_rate.toFixed(2)), topics, alerts })
  };
};
