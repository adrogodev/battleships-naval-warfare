# Phase 3 — AI difficulties

Objective: Normal and Hard AI, commanders, simulation with documented, differentiated metrics. Branch: `feat/phase-3-ai` (stacked on `feat/phase-2-identity`). Delivery: `ask-on-risk`, work-unit commits. Test runner: Vitest 5 (`pnpm test`).

## Specs

- **S1** Normal — Capitán: "Modo caza (aleatorio con patrón de tablero de ajedrez) y modo objetivo: tras un impacto prueba casillas adyacentes y, al tener dos impactos alineados, sigue esa línea hasta hundir."
- **S2** Hard — Almirante: "Mapa de probabilidad: en cada turno calcula, para cada casilla, cuántas posiciones válidas de los barcos restantes la cubren, considerando fallos, impactos abiertos, barcos ya hundidos y la regla de no contacto. Dispara a la casilla de mayor densidad, con desempate aleatorio para no ser predecible."
- **S3** Placement: "La IA también coloca su flota con estrategia según dificultad: aleatoria en Fácil, variada en Normal y evitando patrones obvios en Difícil."
- **S4** Information: "La IA recibe exactamente la misma información que tendría un jugador humano … el módulo de IA solo recibe una vista pública del tablero rival; nunca una referencia al estado completo. Una prueba debe demostrarlo." Tests: "Fácil nunca repite; Normal persigue un impacto hasta hundir; Difícil elige siempre una casilla de máxima probabilidad; ninguna dificultad accede a información oculta."
- **S5** Think delay: "retardo de "pensamiento" de 400–900 ms con indicador visual … Configurable y reducible."
- **S6** Simulation: "incluye un script de simulación que juegue al menos 1.000 partidas por dificultad contra flotas aleatorias y reporte la media de disparos para ganar. Objetivo orientativo: Fácil cerca de 95, Normal entre 55 y 65, Difícil por debajo de 50. Documenta los valores reales obtenidos."
- **S7** Selection: "La dificultad se elige antes de cada partida y se recuerda la última usada." Screen: "Selección de dificultad: tarjetas de los tres comandantes con descripción en una línea."
- **S8** Commanders: "Cada dificultad de IA tiene un comandante con nombre e insignia, que comenta brevemente momentos clave. Opcional y desactivable."

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T0 | S4 (contract) | inline | done | `Difficulty` widened to easy/normal/hard, `chooseShot(view, rules, rng)`; typecheck clean, shared 48/48 |
| T1 | S1–S4, S6 | delegated (unit A: `packages/shared/src/ai/**`, `scripts/**`, `docs/AI_METRICS.md`, `apps/client/src/adapters/localAiGame*`) | done | 04ba726 (RED → GREEN; shared 76 tests) |
| T2 | S5, S7, S8 | delegated (unit B: client UI surfaces) | done | f4fb75b (RED → GREEN) |

Route evidence: T1 (AI algorithms + simulation) and T2 (difficulty screen, commanders, settings) are independent units with disjoint edit surfaces, each several files and well over 100 changed lines; the parent also passed the ~150k context backstop. T0 fixes the shared contract first so both start from a compiling tree.

## Log

- **L1** (2026-11-04) User: "Si, continua con la fase" — approves Phase 2 and starts Phase 3.
- **L2** tsx 4.23.15 added (highest semver ≥14 days) to run `scripts/simulate-ai.ts`: it resolves the extensionless TypeScript imports of `packages/shared`; alternative discarded: Node's native type stripping, which requires `.ts` extensions on every import.
- **L3** (2026-11-04) User, before T1/T2 launched: "Si, continua con la siguiente fase solo si solo si la fase anterior ya esta lista y terminada". Checked: Phase 2 commits complete, working tree clean, suite 165/165 exit 0; only manual verifications remained (audio by ear, vibration, real touch, console), recorded in PROJECT_STATUS. Continued.
- **L4** T1 and T2 launched as parallel writers on disjoint surfaces.- **L5** Unit A result: Easy 95.51, Normal 44.21, Hard 38.48 (1000 games each, seed 20261104). Normal was too strong because the parent's brief added "never shoot next to sunk ships", which S1 does not ask for. Parent removed it (RED test "normal does not reason about the no-contact rule" → GREEN): Normal now 52.62, outside the 55–65 orientative range by 2.4; no artificial weakening added. Documented in `docs/AI_METRICS.md`. Open question for the user at phase close.
- **L6** Seam check after both units: diffs inside declared surfaces; full suite 220/220 exit 0; typecheck and Biome clean.
- **L7** Bug found in the browser: the boot screen never left when `AudioContext.resume()` stayed pending (untrusted first click or hidden tab), because `boot` awaited `unlock()` and later clicks reused the pending promise. RED test "leaves the boot screen even when the browser never resumes audio" → fix: boot navigates immediately and starts music when unlock resolves; `unlock` retries `resume()` on a later gesture (e9b8b34, f4fb75b).
- **L8** Real-browser check (Chrome, production preview): difficulty cards with "Última usada" and focus on the remembered one; Almirante game persisted `lastDifficulty: "hard"`; header "vs Almirante Castellanos"; start transmission and five varied, non-humiliating transmissions through a full automated game to the results screen; no console errors. FPS not measurable this run (tab in background throttles rAF).
- **L9** Final: suite 221/221 exit 0; bundle 115.66 kB gzip; review assessment `medium`, `review_due: false` (`under_budget`).