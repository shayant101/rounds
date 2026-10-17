# Rounds

> The LVN or medical assistant's own whiteboard for the shift: who has come for med pass and who hasn't, what's due today, what's still missing, and a note for each room drafted from her own words. You tap. You sign.

**Team:** Rounds
**Members:** [names]
**Challenge:** 3 · Make AI approachable
**Built at:** Orange County | Claude Impact Lab, October 17, 2026, with Illumination Health + Home

## The problem

An LVN or MA at IHH's largest site covers up to 150 clients with four other staff. Clients live dorm-style and manage their own care; staff monitor, teach, coordinate and document. The day's core is med pass: clients come to the office at set times, staff watch them self-administer and log it. Anyone who doesn't show has to be found. Daily vitals, appointment coordination and a note per contact come on top, often written at the end of the shift from memory. The payers (Kaiser, L.A. Care, Blue Shield, Molina, CalOptima) key on exactly these records: every med administration, the goals, and what was done. A missed log can mean a missed payment. Today, finding what was missed means reading back through everything by hand. IHH has no AI in staff hands yet; staff fear it will replace them and have no room to learn it.

## What we built

Rounds is her shift on one screen. No install (add to home screen), no login, no microphone, no connection to Kipu. The word "AI" appears nowhere in it. Documentation is the byproduct of doing the work in it, not a separate task.

![My shift](docs/screenshot-shift.png)

**My shift**
- **The floor:** beds laid out like the wing, the way a restaurant host sees tables. Each bed's color says what it needs: teal breathes slowly for "needs you now" (an open pass not logged), green for caught up, coral for a missed pass, a dot for flagged, dashed for an open bed. Tap a bed to work it. (The layout and the twelve beds are made up.)

![The floor](docs/screenshot-floor.png)

- **Med rec: ordered vs. taken.** Kipu can export two lists: what the doctor ordered and what was actually taken. Today nobody compares them, and a missed dose surfaces when a payer audits. Drop both CSVs in (or use the samples); Rounds matches by client ID and medication, reads expected doses off the frequency (BID = 2, QID = 4, PRN = as needed, "per INR schedule" = can't tell), and shows missed doses, refused doses, meds taken with no order, and orders it couldn't read. Column names are guessed from the headers and can be corrected. Beds with a gap turn coral on the floor. "Copy the discrepancy list" gives the follow-up list. Nothing is uploaded; the files never leave the browser.

![Med rec](docs/screenshot-medrec.png)

- **One line that matters now:** "2 clients haven't come for the 12pm pass yet: Robert, Dolores."
- **Med pass board:** rooms by pass times. Tap a cell: *Took it, I watched* / *Didn't come* / *Side effect*. That tap is the med log.
- **Go find:** who to chase for the open pass, and who missed earlier.
- **Due today:** per room, meds done out of open passes, vitals, note, appointment; plus two flags that are hers: *doctor should look* and *ready soon*.
- **Hand off:** at the end of the shift, "Prepare handoff" writes the handoff from the day (missed and unlogged passes, side effects, med rec gaps, doctor / ready flags, unconfirmed appointments), she adds what only she knows per client and for the floor, then "Hand off." The next person opens Rounds and sees it at the top of their floor, item by item, ticking each one as read. Copy and print for the paper people.
- **Send:** *Message the team* drafts the shift update ("Ready to move out soon: …, A doctor should look at: …, Missed a med pass: …"). *What's still missing* builds the list a reviewer would build later, now. Both copy to the clipboard; Rounds sends nothing.

**Writing up a room**

1. **The whiteboard.** Rooms across the top, like the unit board. Tap a room. The client's care plan goals show as chips.
2. **Tap, don't type.** Nine tiles: blood sugar, blood pressure, temp, watched meds, dressing, walked, they said, I taught, next. A tile asks only for the number or a few words, with one-tap context ("before lunch", "with walker"). Each tap becomes a line on the sheet, with an icon. Free text is still there for anything else.
3. **What leaves your phone.** Names and ID-like numbers are removed in the browser before anything is sent, and the sheet says so in one line.
4. **Make my note.** The draft slides in, grouped as *What I saw / What they told me / What I taught or did / What's next*. Touch any line and the sheet line it came from lights up yellow, like a highlighter. The same touch shows which box on the CalOptima care plan that line fills. A deterministic checker, not the AI, flags:
   - **red**: a line with no jotting behind it, a number that isn't in your jottings, or a filler phrase you didn't write ("tolerated well", "denies pain")
   - **amber**: interpretation an LVN doesn't document ("indicates", "consistent with", diagnosis words)
   You remove or keep each flagged line. The note cannot be copied until every flag has your decision.
5. **A reviewer might ask.** Up to three questions. Rounds never answers them for you.
6. **Where it goes.** Your sheet → Kipu (your chart note) → CalOptima (care plan, every 30 days). Nurses are rarely shown this; it is why the note matters.
7. **For the client to keep.** The same sheet becomes a plain-language teach sheet, English and Spanish, containing only the teaching you actually gave. Print it. This is aimed at the other time sink staff named: repeating the same counseling client after client.
8. **Sign.** "This is what I saw and did. Nothing more." Copy for Kipu, paste into the progress note. Mark noted, and the room gets a check on the whiteboard: noted at the time, not at 6pm.

### Why it looks the way it does

- Nunito for the interface (rounded, big x-height, reads at a glance); Atkinson Hyperlegible for the note text itself, a face designed for legibility. No handwriting font: nurses read fast under bad light.
- One brand color (scrub teal), highlighter yellow for the trace, coral only for "not your words". 48px touch targets, one-hand phone layout.
- Two motions only: the lines sliding into the note, and the highlighter. Reduced-motion respected.
- Copy says "your sheet", "your words", "make my note". Never "AI", "model", "generate".

### The path to the systems IHH can't change

- **Kipu (EMR):** Phase 1 is copy and paste into the progress note; the note is already structured JSON, so a Kipu integration is a mapping job, not a rewrite. We have not verified IHH's Kipu contract or API access.
- **The payers:** IHH named Kaiser, L.A. Care, Blue Shield, Molina and CalOptima. We verified one in detail.
- **CalOptima Health (Medi-Cal clients):** verified from CalOptima's Community Supports Provider Program Guide (Jan 2026): recuperative care is auto-authorized for 30 days; days 31–60 and 61–90 need a reauthorization in **CalOptima Health Connect** with the **care plan, including discharge planning notes**, uploaded. The care plan form (Appendix I) has the boxes our sections map to: Vital Signs; Care Preferences and Concerns Voiced by Member; Health Education/Interventions Provided; Interventions with status; Member Appointments. Phase 2 of Rounds assembles the signed notes into that field order at day 25/55/85 for whoever uploads. The nurse never touches Health Connect.

**Demo video:** [link]

![Draft view](docs/screenshot-draft.png)

<img src="docs/screenshot-phone.png" width="320" alt="Phone view">

## How Claude is used

- Built with Claude Code during the event.
- At run time, Claude turns the stripped jottings and the care plan goals into structured JSON: sections, sentences, and for each sentence the exact source text it came from and the goal it supports. The prompt is in [`server/prompt.js`](server/prompt.js), readable by any nurse or supervisor.
- What a person checks: everything. The browser re-verifies every sentence against the jottings with plain string and number matching ([`public/verify.js`](public/verify.js)). The AI's own claim of a source is not trusted; it is checked.

## Try it

```bash
git clone <this repo>
cd rounds
npm install
npm start
# open http://localhost:3000
```

Needs Node 18 or newer. Without an API key it runs in **demo mode**: the three sample clients work with hand-written outputs so anyone can see the full flow in 60 seconds. To draft your own jottings with Claude:

```bash
cp .env.example .env
# put your Anthropic API key in .env
npm start
```

Run the checks on all samples: `npm run eval` (writes `eval/results.md`).

## What is real and what is mocked

| Part | Status |
|---|---|
| Privacy strip (names, DOB, MRN, phone, SSN-like, long numbers) in the browser | working |
| Line-by-line verification: source match, number match, filler and scope words | working, deterministic |
| Review gate: no copy until every flagged line is decided | working |
| Care plan goal linking, "not in your jottings" questions, bilingual teach sheet | working (live) / hand-written (demo mode) |
| Claude drafting | working when `ANTHROPIC_API_KEY` is set; **demo mode uses hand-written outputs** for the three sample clients, written to imitate real model output including one added sentence and one interpretation so the checks can be seen working |
| Clients and care plan goals | made up; three samples |
| Kipu integration | none, by design. Output is text you paste. Rounds never reads or writes IHH systems |
| Med pass log, due-today ticks, flags, name | stored in the browser only, per day |
| Pass times, med names, appointments, MRNs | made up for the three sample clients |
| Med rec matcher | working on CSV; the two sample exports are made up because IHH could not pull up Kipu's real export format today. The column guesser is built to absorb header differences; real files may still need the manual mapping |
| Tile composing, highlighter, CalOptima box mapping | working; the mapping is our reading of CalOptima's Appendix I, not confirmed with CalOptima or IHH |

## Where it gets things wrong

- Med rec matches on client ID + first word of the medication name. Brand vs. generic names (Tylenol vs. acetaminophen) will not match until a synonym list is added. Weekly and INR-driven orders are reported as "can't tell", not guessed.
- The checker only knows what you typed. If you jot "BS 142" and meant 124, the note says 142 and nothing catches it.
- The scope-word list is short and English-only. A model can interpret without using any of those words.
- Spanish teach-sheet lines are not verified against the English ones beyond numbers.
- The privacy strip is pattern-based. A name it hasn't been told about, or an unusual ID format, gets through. For sample clients it knows the names; for real use IHH would supply the list.
- The med-pass log fields and note template in Kipu are unknown to us; Rounds holds the data in a sensible order, and the paste or a Kipu API mapping carries it. We do not claim it fills Kipu's form.
- We have not tested on real IHH note templates or against what CalOptima actually asks for at reauthorization. The sections here are our best guess from the role card.
- Live model output varies. In demo mode the flagged lines are planted; in live mode they appear when the model slips, which in our experience is sometimes, not always.

## Next steps

What it would take to pilot: IHH's real note template and goal list for one site; a review by one LVN and one supervisor of ten drafts; a client-name list for the strip; hosting behind IHH's login. With one more week: offline-first on a shared tablet, a per-nurse phrase library, and the check that matters most, which is whether a note drafted this way carries the 30-day review.

## Data and privacy

This project uses only made-up clients and the event repo. It contains no real patient or client information. It does not connect to any Illumination Health + Home system. Nothing typed into Rounds is stored by Rounds; the API call to Claude carries only the stripped jottings and the care plan goals.

## License

[MIT](LICENSE)
