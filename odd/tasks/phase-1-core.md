# Phase 1 — Playable core

Objective: playable game vs Easy AI on a pure, tested domain. Branch: `feat/phase-1-core`. Delivery: `ask-on-risk`, work-unit commits. Test runner: Vitest 5 (`pnpm test`).

## Specs

- **S1** Monorepo: "pnpm workspaces", "TypeScript estricto", structure `/packages/shared` (dominio puro), `/apps/client` (presentación). "El dominio no importa nada de React, del DOM ni de Socket.IO. Es determinista y recibe un generador aleatorio inyectable con semilla". Server and e2e are out of scope for this phase.
- **S2** Rules: "Tablero de 10 × 10 por jugador, columnas A–J y filas 1–10." "Flota por defecto: portaaviones (5), acorazado (4), crucero (3), submarino (3) y destructor (2). Total 17 casillas." "Toda la configuración (tamaño de tablero, flota, no contacto, temporizador) vive en un objeto GameRules validado".
- **S3** Placement: "Los barcos no pueden superponerse ni salir del tablero." "Regla de no contacto (ni lados ni esquinas) activa por defecto y configurable. Se aplica de forma idéntica en colocación manual, aleatoria, IA y servidor." Property test: "toda colocación aleatoria es válida".
- **S4** Shots: "No se puede disparar dos veces a la misma casilla." hit, miss, sunk, "Gana quien hunde primero toda la flota rival." "Un impacto no concede turno extra en la regla clásica; ofrécelo como variante opcional desactivada por defecto."
- **S5** State machine: "lobby → placement → battle → finished, con transiciones y acciones válidas por fase." Same machine for AI mode and (later) server.
- **S6** Easy AI: "Disparos aleatorios sin repetir casillas. No persigue impactos." "el módulo de IA solo recibe una vista pública del tablero rival; nunca una referencia al estado completo. Una prueba debe demostrarlo." AI placement "aleatoria en Fácil". Think delay "400–900 ms con indicador visual … Configurable y reducible."
- **S7** Simple UI: deploy (select ship, tap bow cell, rotate with R/button, return to dock, random, reset, "Flota lista" only when valid, ghost preview valid/invalid with reason), battle (own board + attack board, input blocked outside turn, log), results; Spanish UI with centralized texts.
- **S8** Acceptance: "Se juega una partida entera y pasan las pruebas de dominio".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1 | inline | done | 6f89736 |
| T2 | S2, S3 | inline | done | 3b70ee8, df5b953 (RED: module missing → GREEN 17 tests) |
| T3 | S4, S5 | inline | done | 3b70ee8 (RED: module missing → GREEN 41 tests) |
| T4 | S6 | inline | done | 3b70ee8 + 30a92fe (RED → GREEN; hidden-fleet independence test) |
| T5 | S7, S8 | inline | done | 30a92fe (RED → GREEN; full game through UI test) |

Route evidence: tasks depend on each other in sequence (T2→T3→T4→T5), so no Writer-trigger parallelism; parent writes inline.

## Log

- **L1** (2026-11-04) User: "Si, continua con la fase" — approves Phase 0 and starts Phase 1. Open questions in PLAN §12 unanswered: defaults applied as assumptions (location `games/battleships/`, TS 6.0.x, procedural audio, Chromium+WebKit, Render).
- **L2** Pinned versions (highest semver ≥14 days old, checked with `npm view <pkg> time`): react 19.3.1, vite 8.3.5, @vitejs/plugin-react 6.1.2, typescript 6.0.3, zod 4.6.7, vitest 5.0.5, fast-check 4.10.2, @biomejs/biome 2.6.2.
- **L3** Review assessment after 3b70ee8 and 30a92fe: risk `medium`, `review_due: false` (`under_budget`); no native review started.
- **L4** Defect found after committing 30a92fe: the `randomFleet` property test timed out (>5 s) under the full parallel suite. Cause: `validPlacementsFor` rebuilt the occupancy map per candidate. Fix df5b953 precomputes blocked cells once per ship; an equivalence property test pins `validPlacementsFor` to `validatePlacement`. Full suite then passed 3 consecutive runs (64/64).
- **L5** Real-browser check (Chrome, production preview on 127.0.0.1:4173): menu → deploy (invalid ghost shows "Se sale del tablero") → random → "Flota lista" → battle → shot logged ("Agua en E-6", enemy reply "El enemigo falla en D-1"). Layout bug found (boards stacked at 1568 px) and fixed with a 1480 px breakpoint.
- **L6** Bundle: 96.39 kB gzip JS initial (budget 300 kB).
- **L7** Zustand not installed: `useSyncExternalStore` over the `LocalAiGame` adapter covers client state; revisit only if Phase 2 UI state grows.
