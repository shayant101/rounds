// Vercel function: GET /api/voice-token → { token } (60-second AssemblyAI streaming token) or 503 when no key is set.
const { token } = require('../server/voice');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  const { status, body } = await token();
  res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body));
};
