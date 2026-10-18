// Voice helpers shared by the Express server (npm start) and the Vercel functions in /api.
// 1) token(): mints a short-lived AssemblyAI streaming token so the API key never reaches the browser.
// 2) understand(): asks Claude to map a sentence the regex parser could not read (odd phrasing, Spanish)
//    onto one of Rounds' fixed actions. Claude never acts; the nurse still taps "Do it".
// Both return { status, body } so each host can send it its own way.

const AAI_KEY = () => process.env.ASSEMBLYAI_API_KEY || '';
const CLAUDE_KEY = () => process.env.ANTHROPIC_API_KEY || '';
const MODELS = () => [process.env.ROUNDS_VOICE_MODEL, 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'].filter(Boolean);

async function token() {
  if (!AAI_KEY()) return { status: 200, body: { configured: false } }; // 200 so the browser console stays clean; the app falls back
  try {
    const u = new URL('https://streaming.assemblyai.com/v3/token');
    u.searchParams.set('expires_in_seconds', '60');          // token must be used within 60 s
    u.searchParams.set('max_session_duration_seconds', '60'); // one command, then the socket closes (billing is per open second)
    const r = await fetch(u, { headers: { Authorization: AAI_KEY() } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return { status: 502, body: { error: 'token_failed', detail: j.error || r.status } };
    return { status: 200, body: { token: j.token } };
  } catch (e) {
    return { status: 502, body: { error: 'token_failed', detail: String(e.message || e) } };
  }
}

const SYSTEM = `You turn one spoken sentence from a nurse (LVN or medical assistant) on a recuperative-care floor into ONE action for the app "Rounds". The sentence may be English, Spanish, or a mix. Reply with JSON only, no prose.

Allowed actions (pick exactly one):
- {"kind":"vital","clientId":ID|null,"vital":"bp"|"sugar"|"temp","value":"120/80"|"142"|"98.6","context":"before breakfast"|""}
- {"kind":"walked","clientId":ID|null,"feet":NUMBER}
- {"kind":"pass","clientId":ID|null,"status":"took"|"missed"|"side","note":"short English note of the side effect, or empty"}
- {"kind":"flag","clientId":ID|null,"flag":"doctor"|"ready"|"vitals"}
- {"kind":"says","clientId":ID|null,"text":"what the client said, in English, close to their words"}
- {"kind":"taught","clientId":ID|null,"text":"what the nurse taught or did, in English"}
- {"kind":"note","clientId":ID|null,"text":"short English line for the client's sheet"}
- {"kind":"open","clientId":ID}
- {"kind":"handoff"}
- {"kind":"audit"}
- {"kind":"unsure","reason":"short English reason"}

Rules:
- clientId must be one of the ids in the client list, matched by first name, alias or room number; null if no client is named. Never guess between two clients: use null.
- Numbers must come from the sentence. Never invent a value, a client, or an event. If a needed number is missing or unclear, use "unsure".
- "pass" means the medication pass: took it (tomó, se tomó), didn't come (no vino, no se presentó), or had a side effect (mareo, náusea, etc).
- Translate Spanish into plain English for text fields; keep numbers exactly.
- If the sentence is not one of these actions, use "unsure".`;

function sanitizeClients(list) {
  return (Array.isArray(list) ? list : []).slice(0, 40).map(c => ({
    id: String(c.id || '').slice(0, 40),
    name: String(c.name || '').slice(0, 40),
    aliases: (Array.isArray(c.aliases) ? c.aliases : []).slice(0, 5).map(a => String(a).slice(0, 40)),
    room: String(c.room || '').slice(0, 6)
  })).filter(c => c.id);
}

function extractJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json');
  return JSON.parse(m[0]);
}

const KINDS = new Set(['vital', 'walked', 'pass', 'flag', 'says', 'taught', 'note', 'open', 'handoff', 'audit', 'unsure']);

function validate(out, clients) {
  if (!out || !KINDS.has(out.kind)) return { kind: 'unsure', reason: 'unrecognised' };
  const ids = new Set(clients.map(c => c.id));
  if (out.clientId != null && !ids.has(out.clientId)) out.clientId = null;
  if (out.kind === 'vital') {
    const v = String(out.value || '');
    const ok = (out.vital === 'bp' && /^\d{2,3}\/\d{2,3}$/.test(v)) || (out.vital === 'sugar' && /^\d{2,3}$/.test(v)) || (out.vital === 'temp' && /^\d{2,3}(\.\d)?$/.test(v));
    if (!ok) return { kind: 'unsure', reason: 'number unclear' };
  }
  if (out.kind === 'walked' && !(Number(out.feet) > 0 && Number(out.feet) < 10000)) return { kind: 'unsure', reason: 'distance unclear' };
  if (out.kind === 'pass' && !['took', 'missed', 'side'].includes(out.status)) return { kind: 'unsure', reason: 'pass unclear' };
  if (out.kind === 'flag' && !['doctor', 'ready', 'vitals'].includes(out.flag)) return { kind: 'unsure', reason: 'flag unclear' };
  if (['says', 'taught', 'note'].includes(out.kind) && !String(out.text || '').trim()) return { kind: 'unsure', reason: 'nothing to add' };
  if (out.kind === 'open' && !out.clientId) return { kind: 'unsure', reason: 'which client' };
  ['text', 'note', 'context', 'reason'].forEach(k => { if (out[k] != null) out[k] = String(out[k]).slice(0, 240); });
  return out;
}

// Numbers in a Claude answer must appear in what was heard (digits or Spanish/English words already
// turned into digits by the browser). This is the same "nothing you didn't say" rule as the notes.
function numbersHeard(out, heardDigits) {
  const nums = []; if (out.value) nums.push(...String(out.value).split('/')); if (out.feet) nums.push(String(out.feet));
  return nums.every(n => heardDigits.includes(String(Number(n))) || heardDigits.includes(n));
}

async function understand(body) {
  const text = String((body && body.text) || '').trim().slice(0, 500);
  if (!text) return { status: 400, body: { error: 'no_text' } };
  if (!CLAUDE_KEY()) return { status: 200, body: { configured: false } };
  const clients = sanitizeClients(body.clients);
  const heardDigits = (String(body.digits || text).match(/\d+(?:\.\d)?/g) || []);
  const user = `Clients on this floor:\n${JSON.stringify(clients)}\nOpen medication pass right now: ${body.openPass ? JSON.stringify(String(body.openPass).slice(0, 20)) : 'none'}\n\nSentence: ${JSON.stringify(text)}`;
  let lastErr;
  for (const model of MODELS()) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': CLAUDE_KEY(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 300, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: user }] })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastErr = new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        if (r.status === 404 || /model/i.test(lastErr.message)) continue; // try the next model name
        break;
      }
      const raw = (j.content || []).map(c => c.text || '').join('');
      let out = validate(extractJson(raw), clients);
      if (!numbersHeard(out, heardDigits)) out = { kind: 'unsure', reason: 'a number did not match what was heard' };
      return { status: 200, body: { action: out, model } };
    } catch (e) { lastErr = e; break; }
  }
  return { status: 502, body: { error: 'understand_failed', detail: String((lastErr && lastErr.message) || lastErr) } };
}

module.exports = { token, understand, validate, numbersHeard };
