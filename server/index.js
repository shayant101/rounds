require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { SYSTEM, userMessage } = require('./prompt');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
// First model that the account can use wins. Override with ROUNDS_MODEL in .env.
const MODELS = [process.env.ROUNDS_MODEL, 'claude-sonnet-5-5', 'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929'].filter(Boolean);

const clients = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'clients.json'), 'utf8')).clients;
const mocks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'mock-outputs.json'), 'utf8'));

const app = express();
app.use(express.json({ limit: '64kb' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'landing.html')));
app.get(['/app/', '/app/index.html'], (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get(['/program/', '/program/index.html'], (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'program.html')));
app.use(['/app', '/program'], express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/data', express.static(path.join(__dirname, '..', 'data'), { index: false }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: API_KEY ? 'live' : 'mock', models: API_KEY ? MODELS : [] });
});

app.get('/api/clients', (_req, res) => res.json({ clients }));

// Draft a note. Body: { clientId, jottings }. The jottings arrive already stripped of
// identifiers by the browser; the server strips nothing and stores nothing.
app.post('/api/draft', async (req, res) => {
  const { clientId, jottings } = req.body || {};
  const client = clients.find(c => c.id === clientId);
  if (!client) return res.status(400).json({ error: 'Unknown client' });
  if (!jottings || !String(jottings).trim()) return res.status(400).json({ error: 'No jottings' });

  if (!API_KEY) {
    const mock = mocks[clientId];
    const unchanged = norm(jottings) === norm(client.sample_jottings);
    if (mock && unchanged) return res.json({ mode: 'mock', model: 'hand-written sample', draft: mock });
    return res.status(503).json({
      error: 'No ANTHROPIC_API_KEY set. Without a key, Rounds can only draft the unedited sample jottings. Add a key to .env to draft your own.'
    });
  }

  try {
    const { draft, model } = await callClaude({ client, jottings });
    res.json({ mode: 'live', model, draft });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'The AI call failed: ' + (e.message || String(e)) });
  }
});

async function callClaude({ client, jottings }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: API_KEY });
  let lastErr;
  for (const model of MODELS) {
    try {
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMessage({ client, jottings }) }]
      });
      const text = msg.content.map(c => c.text || '').join('');
      return { draft: parseJson(text), model };
    } catch (e) {
      lastErr = e;
      // Try the next model only if this one does not exist for the account.
      if (!(e && (e.status === 404 || /not_found|model/i.test(e.message || '')))) throw e;
    }
  }
  throw lastErr || new Error('No model available');
}

function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Model did not return JSON');
  return JSON.parse(t.slice(start, end + 1));
}

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Rounds running at http://localhost:${PORT}  (${API_KEY ? 'live Claude' : 'mock mode, no API key'})`);
  });
}

module.exports = { app, callClaude, clients, mocks };
