// Vercel function: POST /api/voice-parse { text, digits, clients, openPass } → { action } (one of Rounds' fixed actions).
const { understand } = require('../server/voice');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || await new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 20000) req.destroy(); }); req.on('end', () => r(d)); })); } catch (e) { body = {}; }
  }
  const { status, body: out } = await understand(body);
  res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(out));
};
