# Phase 5 — Quality: progression, tutorial, accessibility, performance

Objective: meet the acceptance criteria of section 12 of the prompt, or document every deviation. Branch: `feat/phase-5-quality` (stacked on `feat/phase-4-multiplayer`). Delivery: `ask-on-risk`, work-unit commits. Test runner: Vitest 5 (`pnpm test`), Playwright 1.64.1 (`pnpm test:e2e`).

## Specs

- **S1** Rank: "Rango de comandante: experiencia por partida (victoria, precisión, hundimientos) que sube de rango naval, de Grumete a Almirante de Flota. Guardado en local." Menu: "rango del jugador visible."
- **S2** Statistics: "Estadísticas personales: partidas, victorias por modo y dificultad, precisión media, mejor racha, partida más corta y mapa de calor de tus disparos." Screen "Estadísticas" in the main menu.
- **S3** Challenges: "Desafíos opcionales: por ejemplo "Gana en Difícil con menos de 45 disparos" o "Hunde el portaaviones primero". Entre 8 y 12 desafíos, con insignia al completarlos."
- **S4** History: "Historial de movimientos: últimos 10 disparos de cada bando, con coordenada y resultado."
- **S5** Persistence: "Todo lo persistente se guarda en localStorage con esquema versionado y migraciones simples, y se puede borrar desde Configuración." "La progresión da motivos para volver, pero nunca altera el equilibrio competitivo: todo lo desbloqueable es cosmético o estadístico."
- **S6** Menu: "Menú principal: Jugar contra la IA, Multijugador, Cómo jugar, Estadísticas, Configuración. Fondo de océano vivo y rango del jugador visible."
- **S7** Tutorial: "Cómo jugar: tutorial interactivo de 60 segundos (colocar un barco, disparar, ver un hundimiento), no solo texto."
- **S8** Settings: "Estadísticas y Configuración (audio, vibración, movimiento reducido, alto contraste, idioma, reglas por defecto, borrar datos)."
- **S9** Accessibility: "Tablero navegable con flechas, disparo con Enter o Espacio y foco siempre visible." "Cada casilla anuncia coordenada y estado ("C-7, impacto"). Los resultados se anuncian en una región aria-live." "Ajustes de movimiento reducido (respetando prefers-reduced-motion), sin sacudidas de pantalla, alto contraste y modo para daltonismo con formas e iconos distintos por estado." "Subtítulos visuales para cada sonido relevante: el juego se entiende entero sin audio." "Textos escalables hasta el 200 % sin romper la disposición." "Interfaz en español, con textos centralizados para añadir inglés después."
- **S10** Performance budgets: "Fotogramas en batalla: 60 fps en escritorio, ≥ 50 fps en un móvil de gama media" · "Respuesta visual al clic: < 100 ms" · "JavaScript inicial (gzip): < 300 KB; audio y efectos se cargan después" · "Partículas simultáneas: ≤ 150, con pool reutilizable" · "Lighthouse: ≥ 90 en Rendimiento y Accesibilidad" · "Latencia de disparo en multijugador local: < 150 ms de ida y vuelta". "El fondo animado se pausa cuando la pestaña no es visible y baja de calidad automáticamente si los fotogramas caen."
- **S11** E2E: "partida completa contra la IA; dos contextos de navegador jugando una partida multijugador completa; recarga en mitad de la batalla; navegación solo con teclado; vista móvil."
- **S12** Phase done when "Se cumplen los criterios de la sección 12" (checklist of the prompt), or deviations are documented.

Assumptions (not asked by the user, marked as such):
- A1 "idioma": only Spanish exists; a selector with a single option would be a decorative control, so it is left out and documented until English is added.
- A2 "reglas por defecto": default rules for games against the AI (no-contact rule on/off); multiplayer rules stay fixed by the server.
- A3 The colorblind mode keeps the existing distinct shapes per state and adds a palette that does not rely on red/green.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1–S6, S8 (delete data) | delegated, unit A | done | ad26117; assess medium, under_budget |
| T2 | S7 | delegated, unit B | done | d66c4d5 |
| T3 | S8 (contrast, rules), S9 | inline | done | 14e983d; RED 5 tests → GREEN |
| T4 | S10 | inline | done | e5c9905, ccae7b4; RED lazyAudio, deck remount, still ocean → GREEN |
| T5 | S11, S12 | inline | done | 228717f; 18 passed, 2 skipped |
| T6 | S7, S9 (fixes) | inline | done | 9f4432c mojibake + guard test; bad9d15 deploy disconnect; d830b63 focus ring, each RED → GREEN |
| T7 | S1–S11 | inline | done | Brave pass: all listed features exercised, findings in PROJECT_STATUS.md |

Route evidence: T1 and T2 are independent behaviors with disjoint edit surfaces (unit B writes only `tutorial/**` and its own copy module; the parent wires it into the menu), each several files and far over 100 lines, launched together. T3–T5 touch App.tsx, settings and tokens owned by T1, so they follow it.

## Log

- **L1** (2026-11-05) User: "Continua con la siguiente fase, pero por favor antes de continuar dime como te doy permiso y puedas acceder a los .env.example para que lo gestiones por tu cuenta". Taken as Phase 4 approval. Answered: narrow the global `Read(.env.*)` / `Edit(.env.*)` deny rules in `~/.claude/settings.json`; the user changes it.
- **L2** Mapping (explorer): rank, stats, challenges, tutorial, delete-data, extra E2E missing; battle log shows 10 shots combined, not per side; no high contrast / colorblind mode; cells sized `clamp(32px, 3.1vw, 40px)` do not scale with text; no dynamic `import()` (audio and fx in the initial bundle); copy is centralized in `i18n/es.ts`.
- **L3** (2026-11-10) Disk full (0 bytes) had stalled the suite; after the user freed space: 385/385 tests, typecheck and lint green. App.test.tsx timeout was environmental. User: "Dale, continua desde donde lo dejaste hasta finalizar".
- **L4** (2026-11-10) Measured budgets in PROJECT_STATUS.md. Mobile Lighthouse median 88 (deviation). WebKit Windows click → paint 200–300 ms, cause unknown after ruling out audio, canvas, blur, layout and JS speed.
- **L5** (2026-11-10) User: "Una vez termines haz la prueba completa con todas las funcionalidades posibles usando la extension de Claude desde el navegador brave". User: "Dale, continua desde donde quedaste".
- **L6** (2026-11-10) Brave pass found mojibake in `tutorial.css`, `app.css` comments and this file, caused by reading files with PowerShell 5.1 `Get-Content` without `-Encoding utf8`. Repaired byte-exact.
- **L7** (2026-11-10) Brave pass also found: no rival-disconnect notice or exit during online deployment (fixed); focus ring hidden by clip-path on beveled buttons (fixed); forfeit wins award XP and challenges with zero shots (open decision). Full E2E: 18 passed, 2 skipped.
