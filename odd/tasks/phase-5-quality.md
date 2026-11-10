# Phase 5 â€” Quality: progression, tutorial, accessibility, performance

Objective: meet the acceptance criteria of section 12 of the prompt, or document every deviation. Branch: `feat/phase-5-quality` (stacked on `feat/phase-4-multiplayer`). Delivery: `ask-on-risk`, work-unit commits. Test runner: Vitest 5 (`pnpm test`), Playwright 1.64.1 (`pnpm test:e2e`).

## Specs

- **S1** Rank: "Rango de comandante: experiencia por partida (victoria, precisiÃ³n, hundimientos) que sube de rango naval, de Grumete a Almirante de Flota. Guardado en local." Menu: "rango del jugador visible."
- **S2** Statistics: "EstadÃ­sticas personales: partidas, victorias por modo y dificultad, precisiÃ³n media, mejor racha, partida mÃ¡s corta y mapa de calor de tus disparos." Screen "EstadÃ­sticas" in the main menu.
- **S3** Challenges: "DesafÃ­os opcionales: por ejemplo "Gana en DifÃ­cil con menos de 45 disparos" o "Hunde el portaaviones primero". Entre 8 y 12 desafÃ­os, con insignia al completarlos."
- **S4** History: "Historial de movimientos: Ãºltimos 10 disparos de cada bando, con coordenada y resultado."
- **S5** Persistence: "Todo lo persistente se guarda en localStorage con esquema versionado y migraciones simples, y se puede borrar desde ConfiguraciÃ³n." "La progresiÃ³n da motivos para volver, pero nunca altera el equilibrio competitivo: todo lo desbloqueable es cosmÃ©tico o estadÃ­stico."
- **S6** Menu: "MenÃº principal: Jugar contra la IA, Multijugador, CÃ³mo jugar, EstadÃ­sticas, ConfiguraciÃ³n. Fondo de ocÃ©ano vivo y rango del jugador visible."
- **S7** Tutorial: "CÃ³mo jugar: tutorial interactivo de 60 segundos (colocar un barco, disparar, ver un hundimiento), no solo texto."
- **S8** Settings: "EstadÃ­sticas y ConfiguraciÃ³n (audio, vibraciÃ³n, movimiento reducido, alto contraste, idioma, reglas por defecto, borrar datos)."
- **S9** Accessibility: "Tablero navegable con flechas, disparo con Enter o Espacio y foco siempre visible." "Cada casilla anuncia coordenada y estado ("C-7, impacto"). Los resultados se anuncian en una regiÃ³n aria-live." "Ajustes de movimiento reducido (respetando prefers-reduced-motion), sin sacudidas de pantalla, alto contraste y modo para daltonismo con formas e iconos distintos por estado." "SubtÃ­tulos visuales para cada sonido relevante: el juego se entiende entero sin audio." "Textos escalables hasta el 200 % sin romper la disposiciÃ³n." "Interfaz en espaÃ±ol, con textos centralizados para aÃ±adir inglÃ©s despuÃ©s."
- **S10** Performance budgets: "Fotogramas en batalla: 60 fps en escritorio, â‰¥ 50 fps en un mÃ³vil de gama media" Â· "Respuesta visual al clic: < 100 ms" Â· "JavaScript inicial (gzip): < 300 KB; audio y efectos se cargan despuÃ©s" Â· "PartÃ­culas simultÃ¡neas: â‰¤ 150, con pool reutilizable" Â· "Lighthouse: â‰¥ 90 en Rendimiento y Accesibilidad" Â· "Latencia de disparo en multijugador local: < 150 ms de ida y vuelta". "El fondo animado se pausa cuando la pestaÃ±a no es visible y baja de calidad automÃ¡ticamente si los fotogramas caen."
- **S11** E2E: "partida completa contra la IA; dos contextos de navegador jugando una partida multijugador completa; recarga en mitad de la batalla; navegaciÃ³n solo con teclado; vista mÃ³vil."
- **S12** Phase done when "Se cumplen los criterios de la secciÃ³n 12" (checklist of the prompt), or deviations are documented.

Assumptions (not asked by the user, marked as such):
- A1 "idioma": only Spanish exists; a selector with a single option would be a decorative control, so it is left out and documented until English is added.
- A2 "reglas por defecto": default rules for games against the AI (no-contact rule on/off); multiplayer rules stay fixed by the server.
- A3 The colorblind mode keeps the existing distinct shapes per state and adds a palette that does not rely on red/green.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1â€“S6, S8 (delete data) | delegated, unit A | in progress | |
| T2 | S7 | delegated, unit B | done | d66c4d5 |
| T3 | S8 (contrast, rules), S9 | inline | done | 14e983d; RED 5 tests → GREEN |
| T4 | S10 | after T1â€“T3 | pending | |
| T5 | S11, S12 | inline | done | 228717f; 18 passed, 2 skipped |

Route evidence: T1 and T2 are independent behaviors with disjoint edit surfaces (unit B writes only `tutorial/**` and its own copy module; the parent wires it into the menu), each several files and far over 100 lines, launched together. T3â€“T5 touch App.tsx, settings and tokens owned by T1, so they follow it.

## Log

- **L1** (2026-11-05) User: "Continua con la siguiente fase, pero por favor antes de continuar dime como te doy permiso y puedas acceder a los .env.example para que lo gestiones por tu cuenta". Taken as Phase 4 approval. Answered: narrow the global `Read(.env.*)` / `Edit(.env.*)` deny rules in `~/.claude/settings.json`; the user changes it.
- **L2** Mapping (explorer): rank, stats, challenges, tutorial, delete-data, extra E2E missing; battle log shows 10 shots combined, not per side; no high contrast / colorblind mode; cells sized `clamp(32px, 3.1vw, 40px)` do not scale with text; no dynamic `import()` (audio and fx in the initial bundle); copy is centralized in `i18n/es.ts`.
- **L3** (2026-11-10) Disk full (0 bytes) had stalled the suite; after the user freed space: 385/385 tests, typecheck and lint green. App.test.tsx timeout was environmental. User: "Dale, continua desde donde lo dejaste hasta finalizar".
- **L4** (2026-11-10) Measured budgets in PROJECT_STATUS.md. Mobile Lighthouse median 88 (deviation). WebKit Windows click → paint 200–300 ms, cause unknown after ruling out audio, canvas, blur, layout and JS speed.
- **L5** (2026-11-10) User: "Una vez termines haz la prueba completa con todas las funcionalidades posibles usando la extension de Claude desde el navegador brave". Next: manual pass in Brave.
