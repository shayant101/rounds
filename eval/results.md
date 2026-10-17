# Eval results (mock outputs) — 2026-10-17T18:45:32.509Z

| Client | Model | Lines | Traced to jottings | Red (added/wrong) | Amber (interpretation) | Goal-linked |
|---|---|---|---|---|---|---|
| robert | hand-written sample | 8 | 7 | 1 | 0 | 7 |
| dolores | hand-written sample | 6 | 6 | 0 | 1 | 4 |
| marcus | hand-written sample | 6 | 6 | 0 | 0 | 5 |

## What the checks flagged
### robert
- RED: "Client tolerated the dressing check well." (no-source, default)
### dolores
- AMBER: "Client says she gets dizzy when she stands up fast, which may indicate orthostatic changes." (scope)
### marcus
- nothing flagged

A red line is one the nurse must decide on before the note can be copied. The checker is deterministic string and number matching, not a second AI.