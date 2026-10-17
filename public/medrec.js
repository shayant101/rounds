// Med rec: compare what was ordered with what was taken. Pure functions, no network.
// Input: two CSV texts (Kipu "orders" export and Kipu "administrations/MAR" export).
// Column names are guessed from headers and can be overridden. Everything runs in the browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MedRec = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    const s = String(text || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    const hdr = (rows.shift() || []).map(h => h.trim());
    return { headers: hdr, rows: rows.filter(r => r.some(c => String(c).trim() !== '')).map(r => Object.fromEntries(hdr.map((h, i) => [h, (r[i] || '').trim()]))) };
  }

  // Guess which header plays which role. Returns {client, med, dose, freq, date, time, status}
  const GUESS = {
    client: [/^mrn$/i, /client.?id/i, /patient.?id/i, /^id$/i, /chart/i, /medical record/i, /mrn/i, /client/i, /patient/i],
    med: [/^medication$/i, /^med(ication)?[ _]?name$/i, /^drug$/i, /order(ed)?[ _]?med/i, /medication/i, /^med$/i, /drug/i],
    dose: [/^dose$/i, /dosage/i, /strength/i, /dose/i],
    freq: [/frequency/i, /^freq$/i, /^sig$/i, /schedule/i, /directions/i, /how often/i],
    date: [/^date$/i, /admin.*date/i, /given.*date/i, /date.*admin/i, /date/i],
    time: [/^time$/i, /admin.*time/i, /time.*admin/i, /scheduled.*time/i, /time/i],
    status: [/^status$/i, /result/i, /action/i, /outcome/i, /taken/i, /given/i]
  };
  function guessColumns(headers) {
    const out = {};
    Object.entries(GUESS).forEach(([role, pats]) => {
      for (const p of pats) { const h = headers.find(h => p.test(h) && !Object.values(out).includes(h)); if (h) { out[role] = h; break; } }
    });
    return out;
  }

  // "BID" -> 2 doses/day. PRN -> 0 (not counted). Unknown -> null (shown as "can't tell").
  function dosesPerDay(freq, timesField) {
    const f = String(freq || '').toLowerCase().trim();
    if (!f && timesField) return String(timesField).split(/[,;/ ]+/).filter(Boolean).length || null;
    if (/prn|as needed/.test(f)) return 0;
    const m = f.match(/(\d+)\s*(?:x|times)\s*(?:a|per|\/)?\s*day/); if (m) return +m[1];
    const q = f.match(/q\s*(\d+)\s*h/); if (q) return Math.max(1, Math.round(24 / +q[1]));
    if (/\bqid\b|four times/.test(f)) return 4;
    if (/\btid\b|three times/.test(f)) return 3;
    if (/\bbid\b|twice|two times/.test(f)) return 2;
    if (/\bqd\b|daily|once|every day|every night|nightly|bedtime|\bhs\b|\bqhs\b|every morning|every evening|at night|qam|qpm/.test(f)) return 1;
    if (/weekly|q\s*week/.test(f)) return null; // weekly orders need a date range; out of scope for a one-day compare
    return null;
  }

  function normMed(s) {
    return String(s || '').toLowerCase().replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|units?|%)/g, ' ').replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0] || '';
  }
  const TAKEN = /^(given|taken|administered|self[- ]?administered|yes|y|done|complete[d]?|true|1)$/i;
  const NOT_TAKEN = /^(refused|missed|held|not given|no|n|omitted|declined|false|0)$/i;

  // Compare for one date. orders/mar are {headers, rows}; map = {orders:{client,med,dose,freq,time}, mar:{client,med,date,time,status}}
  function compare(orders, mar, map, date) {
    const oc = map.orders, mc = map.mar;
    const marRows = mar.rows.filter(r => !mc.date || !date || String(r[mc.date]).slice(0, 10) === date || sameDay(r[mc.date], date));
    const byClient = {};
    const unmatchedMar = [];

    // index MAR rows by client+med
    const marIdx = {};
    marRows.forEach(r => {
      const k = key(r[mc.client], r[mc.med]);
      (marIdx[k] = marIdx[k] || []).push(r);
    });

    orders.rows.forEach(o => {
      const client = o[oc.client] || '(no id)';
      const med = o[oc.med] || '(no medication)';
      const expected = dosesPerDay(o[oc.freq], oc.time ? o[oc.time] : null);
      const k = key(client, med);
      const hits = marIdx[k] || []; marIdx[k] = hits.concat([{ __used: true }]);
      const taken = hits.filter(r => !mc.status || !r[mc.status] || TAKEN.test(r[mc.status])).length;
      const refused = hits.filter(r => mc.status && NOT_TAKEN.test(r[mc.status] || '')).length;
      const item = { client, med, dose: oc.dose ? o[oc.dose] : '', freq: oc.freq ? o[oc.freq] : '', expected, taken, refused,
        missed: expected == null ? null : Math.max(0, expected - taken),
        status: expected == null ? 'unknown' : expected === 0 ? 'prn' : taken >= expected ? 'ok' : taken === 0 ? 'none' : 'partial' };
      (byClient[client] = byClient[client] || { client, items: [], missed: 0, unknown: 0, extra: [] }).items.push(item);
      if (item.missed) byClient[client].missed += item.missed;
      if (item.status === 'unknown') byClient[client].unknown++;
    });
    // MAR rows with no order
    Object.entries(marIdx).forEach(([k, rows]) => {
      if (rows.some(r => r.__used)) return;
      rows.forEach(r => { const client = r[mc.client] || '(no id)'; (byClient[client] = byClient[client] || { client, items: [], missed: 0, unknown: 0, extra: [] }).extra.push({ med: r[mc.med], time: mc.time ? r[mc.time] : '', status: mc.status ? r[mc.status] : '' }); unmatchedMar.push(r); });
    });
    const clients = Object.values(byClient).sort((a, b) => (b.missed - a.missed) || (b.extra.length - a.extra.length));
    const totals = { clients: clients.length, withGaps: clients.filter(c => c.missed > 0).length, missedDoses: clients.reduce((s, c) => s + c.missed, 0), extras: unmatchedMar.length, unknown: clients.reduce((s, c) => s + c.unknown, 0) };
    return { date, clients, totals };
  }
  function key(c, m) { return String(c || '').trim().toLowerCase() + '|' + normMed(m); }
  function sameDay(a, b) { const da = new Date(a), db = new Date(b); return !isNaN(da) && !isNaN(db) && da.toDateString() === db.toDateString(); }
  function datesIn(mar, col) { if (!col) return []; const set = new Set(mar.rows.map(r => { const d = new Date(r[col]); return isNaN(d) ? String(r[col]).slice(0, 10) : d.toISOString().slice(0, 10); }).filter(Boolean)); return [...set].sort(); }

  function discrepancyText(result, nameFor) {
    const lines = [`Med rec for ${result.date || 'the export'}: ${result.totals.missedDoses} missed dose${result.totals.missedDoses === 1 ? '' : 's'} across ${result.totals.withGaps} client${result.totals.withGaps === 1 ? '' : 's'}; ${result.totals.extras} given without a matching order; ${result.totals.unknown} order${result.totals.unknown === 1 ? '' : 's'} where the frequency couldn't be read.`, ''];
    result.clients.forEach(c => {
      const gaps = c.items.filter(i => i.missed || i.status === 'unknown');
      if (!gaps.length && !c.extra.length) return;
      lines.push(`${nameFor ? nameFor(c.client) : c.client}`);
      gaps.forEach(i => lines.push(`  - ${i.med}${i.dose ? ' ' + i.dose : ''} ${i.freq ? '(' + i.freq + ')' : ''}: ${i.status === 'unknown' ? "can't tell expected doses from the frequency" : `taken ${i.taken} of ${i.expected}${i.refused ? ', ' + i.refused + ' recorded as refused/held' : ''}`}`));
      c.extra.forEach(e => lines.push(`  - ${e.med}: recorded as taken${e.time ? ' at ' + e.time : ''} but no matching order`));
    });
    return lines.join('\n');
  }

  return { parseCSV, guessColumns, dosesPerDay, normMed, compare, datesIn, discrepancyText };
});
