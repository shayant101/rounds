import json, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3123'
SHOTS = './'
results = []
def check(name, ok, detail=''):
    results.append((name, ok, detail)); print(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(detail) if detail else ''))

# Fake AssemblyAI socket: records the URL and binary frames, then "hears" a scripted sentence.
FAKE_WS = r"""
(() => {
  const Real = window.WebSocket;
  window.__ws = { url: null, frames: 0, bytes: 0, sent: [] };
  window.__script = window.__script || { text: 'flag Marcus for a doctor', lang: null };
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; window.__ws.url = url;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 150);
      setTimeout(() => { const s = window.__script; const words = s.text.split(' ');
        this._emit({ type: 'Begin', id: 'x' });
        this._emit({ type: 'Turn', transcript: '', end_of_turn: false, turn_is_formatted: false, words: words.slice(0, 2).map(t => ({ text: t, word_is_final: false })) });
        this._emit({ type: 'Turn', transcript: s.text.toLowerCase().replace(/[.,]/g, ''), end_of_turn: true, turn_is_formatted: false, words: words.map(t => ({ text: t })) , language_code: s.lang });
        setTimeout(() => this._emit({ type: 'Turn', transcript: s.text, end_of_turn: true, turn_is_formatted: true, words: words.map(t => ({ text: t })), language_code: s.lang }), 200);
      }, 900);
    }
    _emit(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
    send(d) { if (typeof d === 'string') window.__ws.sent.push(d); else { window.__ws.frames++; window.__ws.bytes += d.byteLength; } }
    close() { this.readyState = 3; }
  }
  window.WebSocket = function (url, p) { return /assemblyai/.test(url) ? new FakeWS(url) : new Real(url, p); };
  window.WebSocket.prototype = Real.prototype;
})();
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])

    def page_for(mock_cloud=False, parse_reply=None, width=820, height=1180):
        ctx = b.new_context(viewport={'width': width, 'height': height}, permissions=['microphone'])
        pg = ctx.new_page(); errs = []; parse_calls = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        if mock_cloud:
            pg.add_init_script(FAKE_WS)
            pg.route('**/api/voice-token/', lambda r: r.fulfill(status=200, content_type='application/json', body='{"token":"tmp-test"}'))
        if parse_reply is not None:
            def h(r):
                parse_calls.append(json.loads(r.request.post_data or '{}'))
                r.fulfill(status=200, content_type='application/json', body=json.dumps({'action': parse_reply, 'model': 'test'}))
            pg.route('**/api/voice-parse/', h)
        pg.goto(BASE + '/app/?reset=1'); pg.wait_for_timeout(800)
        return pg, errs, parse_calls

    # A. No keys: typed English command → regex plan → Do it → "Done" clip
    pg, errs, _ = page_for()
    pg.click('#micBtn'); pg.wait_for_timeout(1500)
    eng = pg.evaluate('window.__roundsVoice && window.__roundsVoice.engine')
    pg.fill('#vText', 'flag Marcus for a doctor'); pg.click('#vGo'); pg.wait_for_timeout(400)
    plan = pg.inner_text('#vPlan')
    check('A typed English → plan', 'doctor' in plan and 'Marcus' in plan, plan.replace('\n', ' | ')[:120])
    check('A no "Claude" note on regex plan', 'Claude' not in plan)
    pg.click('#vDo'); pg.wait_for_timeout(300)
    check('A Do it plays done-en', pg.evaluate('window.__roundsLastSaid') == 'done-en', pg.evaluate('window.__roundsLastSaid'))
    check('A voice closed after Do it', pg.is_hidden('#voice'))
    check('A no JS errors', not [e for e in errs if 'speech' not in e.lower()], errs[:3])

    # B. No keys: Spanish → regex can't → /api/voice-parse 503 → "unsure" + Spanish "again" clip
    pg.click('#micBtn'); pg.wait_for_timeout(600)
    pg.fill('#vText', 'presión ciento veinte sobre ochenta para Roberto'); pg.click('#vGo'); pg.wait_for_timeout(800)
    plan = pg.inner_text('#vPlan')
    check('B Spanish without Claude key → unsure', "Didn't understand" in plan, plan[:80])
    check('B plays again-es', pg.evaluate('window.__roundsLastSaid') == 'again-es', pg.evaluate('window.__roundsLastSaid'))
    pg.screenshot(path=SHOTS + 'b_unsure.png')
    pg.context.close()

    # C. Private line (simulated socket): mic audio streams, scripted sentence → plan
    pg, errs, _ = page_for(mock_cloud=True)
    pg.evaluate("window.__script={text:'Flag Marcus for a doctor.',lang:'en'}")
    pg.click('#micBtn'); pg.wait_for_function('window.__roundsVoice', timeout=10000); pg.wait_for_timeout(600)
    st = pg.evaluate('window.__ws'); v = pg.evaluate('window.__roundsVoice')
    q = st['url'] or ''
    check('C socket URL has token, multilingual, medical, 16k, keyterms',
          all(k in q for k in ['token=tmp-test', 'speech_model=universal-streaming-multilingual', 'domain=medical-v1', 'sample_rate=16000', 'keyterms_prompt=', 'format_turns=true', 'language_detection=true']), q[:160])
    from urllib.parse import urlparse, parse_qs
    kt = json.loads(parse_qs(urlparse(q).query).get('keyterms_prompt', ['[]'])[0])
    check('C keyterms include names + meds, ≤100', 'Robert' in kt and 'azithromycin' in kt and len(kt) <= 100, f'{len(kt)} terms')
    check('C real PCM audio frames sent', st['frames'] > 3 and st['bytes'] > 3000, f"{st['frames']} frames, {st['bytes']} bytes")
    check('C Terminate sent after the turn', any('Terminate' in s for s in st['sent']), st['sent'])
    check('C engine = private-line, plan from heard text', v and v['engine'] == 'private-line' and v['plan']['kind'] == 'flag' and v['plan']['client'], v)
    pg.screenshot(path=SHOTS + 'c_cloud_plan.png')
    check('C no JS errors', not errs, errs[:3])
    pg.context.close()

    # D. Private line hears Spanish → regex can't → Claude route (mocked reply) → helped plan → Do it → "Listo"
    reply = {'kind': 'vital', 'clientId': None, 'vital': 'bp', 'value': '120/80'}
    pg, errs, calls = page_for(mock_cloud=True, parse_reply=None)
    rid = pg.evaluate("(()=>{ return null })()")
    pg.context.close()
    # need the real client id for Robert
    pg, errs, calls = page_for(mock_cloud=True)
    rob = pg.evaluate("fetch('/api/clients').then(r=>r.json()).then(j=>j.clients.find(c=>c.display.startsWith('Robert')).id)")
    pg.context.close()
    reply['clientId'] = rob
    pg, errs, calls = page_for(mock_cloud=True, parse_reply=reply)
    pg.evaluate("window.__script={text:'Presión 120 sobre 80 para Roberto.',lang:'es'}")
    pg.click('#micBtn'); pg.wait_for_function('window.__roundsVoice', timeout=10000); pg.wait_for_timeout(600)
    plan = pg.inner_text('#vPlan')
    check('D Claude route called with text, digits, clients', calls and calls[0].get('text', '').startswith('Presión') and '120' in calls[0].get('digits', '') and len(calls[0].get('clients', [])) >= 10, (calls[0] if calls else None) and {k: (v if k != 'clients' else len(v)) for k, v in calls[0].items()})
    check('D helped plan shows BP for Robert + check-it note', 'blood pressure 120/80' in plan and 'Robert' in plan and 'Claude' in plan, plan.replace('\n', ' | ')[:160])
    pg.screenshot(path=SHOTS + 'd_spanish_helped.png')
    pg.click('#vDo'); pg.wait_for_timeout(300)
    check('D Do it plays done-es (Listo)', pg.evaluate('window.__roundsLastSaid') == 'done-es', pg.evaluate('window.__roundsLastSaid'))
    lines=pg.evaluate("[...document.querySelectorAll('.lines li')].map(e=>e.textContent.trim())"); who=pg.evaluate("(document.querySelector('.who h2')||{}).textContent")
    check('D line landed on Robert sheet', any('BP 120/80' in l for l in lines) and 'Robert' in (who or ''), (who, lines[-3:]))
    check('D no JS errors', not errs, errs[:3])
    pg.context.close()

    # E. Sound toggle persists; with sound off nothing plays
    pg, errs, _ = page_for()
    pg.click('#micBtn'); pg.wait_for_timeout(300); pg.click('#vSound')
    check('E toggle shows Sound off', pg.inner_text('#vSound') == 'Sound off')
    pg.evaluate('window.__roundsLastSaid=null'); pg.fill('#vText', 'gibberish words'); pg.click('#vGo'); pg.wait_for_timeout(600)
    check('E sound off → nothing played', pg.evaluate('window.__roundsLastSaid') is None)
    pg.reload(); pg.wait_for_timeout(600); pg.click('#micBtn'); pg.wait_for_timeout(200)
    check('E preference survives reload', pg.inner_text('#vSound') == 'Sound off')
    pg.context.close()

    # F. Phone width: voice bar fits, no horizontal overflow
    pg, errs, _ = page_for(width=390, height=844)
    pg.click('#micBtn'); pg.wait_for_timeout(400)
    ov = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    hd = pg.evaluate("(()=>{const r=document.querySelector('.vhd').getBoundingClientRect();return [r.left,r.right,window.innerWidth]})()")
    check('F phone: no overflow, header inside screen', ov <= 0 and hd[0] >= 0 and hd[1] <= hd[2], (ov, hd))
    pg.screenshot(path=SHOTS + 'f_phone.png')
    pg.context.close()
    b.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
