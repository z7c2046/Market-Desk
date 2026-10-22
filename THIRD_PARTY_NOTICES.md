# Third-party components

## G|Flows (adapted source)

Repository: https://github.com/aaguiar10/gflows — MIT, copyright (c) 2023 - present aaguiar10.
Full license: [licenses/gflows-MIT.txt](licenses/gflows-MIT.txt).

`src/options-wall.js` and the Cboe URL mapping in `src/market-workspace.js` adapt the Cboe JSON ingestion and strike-level gamma aggregation from:

- `modules/ticker_dwn.py`, blob `a51f93914cef68fb91a5a63ebdb63d2e6b509471`.
- `modules/calc.py`, blob `e1bbe7e021a45d8bc117beb7e0b111f30d7c4038`.

Changes: JavaScript port; individual OCC parsing instead of alternating call/put rows; fractional strike preservation; exact standard root matching; no volume-for-OI substitution; explicit 100-share multiplier and 1% spot-move scaling; missing Greeks do not become zero; date selection and tied wall reporting. No Vanna/Charm or spot-repriced Gamma flip engine is ported.

## Installed, pinned runtime libraries

- Apache ECharts 6.1.0 — https://github.com/apache/echarts — Apache-2.0. License and notices in `node_modules/echarts/LICENSE` and `node_modules/echarts/NOTICE`.
- Vue 3.5.44 — https://github.com/vuejs/core — MIT. License in `node_modules/vue/LICENSE`.
- fast-xml-parser 5.11.2 — https://github.com/NaturalIntelligence/fast-xml-parser — MIT. License in `node_modules/fast-xml-parser/LICENSE`.
- Transitive dependencies and checksums are recorded in `package-lock.json`. Their licenses remain in installed packages. ECharts' bundled distribution retains its license header.

## Research references (no application code copied)

- OpenStock: https://github.com/Open-Dev-Society/OpenStock — AGPL-3.0. Market overview, news, watchlist workflow reference only.
- OpenBB: https://github.com/openbq-org/OpenBB — LICENSE at inspection declares Apache-2.0. Provider separation reference only.
- EzOptions and gex-tracker were evaluated but not copied: a reusable license was not established at inspection.

Open-source software licenses do not grant market-data redistribution rights. The current runtime uses public provider endpoints for personal observation; a public deployment must use data under the relevant provider's permitted terms.
