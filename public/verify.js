// Deterministic checks on an AI draft. Runs in the browser and in Node (eval).
// The point: we do not trust the model's self-report. Every sentence is checked
// against the nurse's own jottings with plain string and number matching.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoundsVerify = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Words that mean the sentence is interpreting, not describing. An LVN/MA documents
  // observations; interpretation belongs to a clinician. Flagged amber, not removed.
  const SCOPE_WORDS = [
    'indicates', 'indicate', 'consistent with', 'suggests', 'suggest', 'likely', 'rule out',
    'diagnos', 'infection', 'infected', 'hypotension', 'hypertension', 'hypoglycemi', 'hyperglycemi',
    'sepsis', 'cellulitis', 'orthostatic', 'appears to be', 'secondary to', 'due to', 'assessment', 'patient'
  ];

  // Normal-sounding filler that a model adds when the nurse said nothing. Flagged red.
  const DEFAULT_PHRASES = [
    'denies pain', 'tolerated well', 'tolerated the', 'no complaints', 'no acute distress',
    'alert and oriented', 'within normal limits', 'no concerns', 'resting comfortably', 'in good spirits'
  ];

  function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function numbersIn(s) {
    // 138/84, 98.4, 142, 120ft, 9am -> ["138","84","98.4","142","120","9"]
    const m = String(s || '').match(/\d+(?:\.\d+)?/g);
    return m ? m : [];
  }

  function checkSentence(sentence, jottings) {
    const problems = [];
    const text = sentence.text || '';
    const src = sentence.source;
    const nj = norm(jottings);

    if (src === null || src === undefined || norm(src) === '') {
      problems.push({ level: 'red', code: 'no-source', msg: 'Added by AI. Not in your jottings.' });
    } else if (!nj.includes(norm(src))) {
      problems.push({ level: 'red', code: 'source-not-found', msg: 'The AI cited a source that is not in your jottings.' });
    }

    // Numbers in the sentence must appear in the jottings. Checked against the whole
    // jottings, not only the cited source, so "138/84" from one line and "76" from another both pass.
    const jotNums = new Set(numbersIn(jottings));
    const bad = numbersIn(text).filter(n => !jotNums.has(n));
    if (bad.length) {
      problems.push({ level: 'red', code: 'number', msg: 'Number not in your jottings: ' + bad.join(', ') });
    }

    const lt = norm(text);
    const lsrc = norm(src || '');
    const scope = SCOPE_WORDS.filter(w => lt.includes(w) && !lsrc.includes(w) && !nj.includes(w));
    if (scope.length) {
      problems.push({ level: 'amber', code: 'scope', msg: 'Interpretation you did not write: "' + scope[0] + '"' });
    }

    const defaults = DEFAULT_PHRASES.filter(p => lt.includes(p) && !nj.includes(p));
    if (defaults.length) {
      problems.push({ level: 'red', code: 'default', msg: 'Filler phrase you did not write: "' + defaults[0] + '"' });
    }

    return problems;
  }

  function checkDraft(draft, jottings) {
    const out = { sentences: 0, clean: 0, red: 0, amber: 0, goalLinked: 0, items: [] };
    const sections = (draft && draft.note && draft.note.sections) || [];
    sections.forEach(sec => {
      (sec.sentences || []).forEach(s => {
        const problems = checkSentence(s, jottings);
        out.sentences++;
        if (s.goal) out.goalLinked++;
        const worst = problems.some(p => p.level === 'red') ? 'red' : problems.length ? 'amber' : 'clean';
        out[worst === 'clean' ? 'clean' : worst]++;
        out.items.push({ section: sec.title, text: s.text, source: s.source, goal: s.goal || null, status: worst, problems });
      });
    });
    return out;
  }

  // Privacy strip. Runs before anything leaves the browser. Conservative on purpose.
  function stripIdentifiers(text, names) {
    const removed = [];
    let t = String(text || '');
    (names || []).filter(Boolean).forEach(n => {
      const re = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'s)?\\b", 'gi');
      if (re.test(t)) { removed.push({ kind: 'name', value: n }); t = t.replace(re, 'client'); }
    });
    const patterns = [
      { kind: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/g },
      { kind: 'phone', re: /\b\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g },
      { kind: 'date of birth', re: /\b(?:dob|d\.o\.b\.?|born)\s*:?\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/gi },
      { kind: 'record number', re: /\b(?:mrn|id|acct|account)\s*#?\s*:?\s*[A-Z0-9-]{5,}\b/gi },
      { kind: 'long number', re: /\b\d{7,}\b/g }
    ];
    patterns.forEach(p => {
      const hits = t.match(p.re);
      if (hits) { hits.forEach(h => removed.push({ kind: p.kind, value: h })); t = t.replace(p.re, '[removed]'); }
    });
    return { text: t, removed };
  }

  return { checkSentence, checkDraft, stripIdentifiers, numbersIn, SCOPE_WORDS, DEFAULT_PHRASES };
});
