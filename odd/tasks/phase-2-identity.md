# Phase 2 — Identity and immersion

Objective: the battle against the AI feels like the final game. Branch: `feat/phase-2-identity` (stacked on `feat/phase-1-core`). Delivery: `ask-on-risk`, work-unit commits. Test runner: Vitest 5 (`pnpm test`).

## Specs

- **S1** Design system: "Define antes de construir pantallas un archivo de design tokens (colores, tipografía, espaciado, radios, sombras, duraciones y curvas de animación). Ningún componente usa valores sueltos." Fonts Chakra Petch + IBM Plex Sans, self-hosted. "Cifras tabulares en marcadores y estadísticas".
- **S2** Ocean layer: "agua oscura animada de forma sutil (shader o canvas ligero), con ondas lentas, reflejos y niebla en los bordes." "El fondo animado se pausa cuando la pestaña no es visible y baja de calidad automáticamente si los fotogramas caen."
- **S3** Boards: "El tablero propio se ve como vista de cubierta: agua con los barcos visibles. El tablero enemigo se ve como pantalla de radar: oscuro, con barrido de radar lento y solo lo descubierto." Ship silhouettes in SVG ("portaaviones con cubierta de vuelo, acorazado con torretas, crucero, submarino con vela, destructor estilizado"); states "intacto, dañado (humo y marcas en la sección impactada), hundido (silueta oscurecida y hundiéndose bajo el agua)". Cell states table of the prompt (§3), including "Bloqueada (regla sin contacto) — Sombreado opcional, activable en ajustes".
- **S4** Shot sequence: "1. Apuntar (0 ms): retícula sobre la casilla, coordenada visible ("C-7"), sonido suave de fijación de blanco. 2. Disparo (0–150 ms): el botón responde al instante, sonido de cañón grave y leve sacudida del panel propio. 3. Suspense (150–450 ms) … 4. Resultado (450–700 ms) … 5. Narración (en paralelo)". "Todas las duraciones salen de los tokens. Con animaciones reducidas, la secuencia completa dura menos de 200 ms y el resultado sigue siendo inequívoco." "La entrada se bloquea fuera de turno y durante la animación del propio disparo, sin alargar la espera."
- **S5** High-impact moments: sinking ("pausa dramática de unos 300 ms, revelado de la silueta, sonido de casco que se parte, vibración más larga y mensaje destacado"), last ship alert, victory, defeat ("Nunca humillante"), streak "a partir de tres impactos seguidos, un indicador "Racha ×3"".
- **S6** Audio: distinct SFX for "fijar blanco, disparo, fallo, impacto, hundimiento, alerta de turno, victoria, derrota, clic de interfaz y colocación de barco"; "Música adaptativa por capas … transiciones con fundido"; optional ambient; "Volúmenes independientes para música, efectos y ambiente, más silencio general. Persistencia de estos ajustes."; "El audio solo se inicia tras la primera interacción del usuario."; procedural, documented in `CREDITS.md`. "Subtítulos visuales para cada sonido relevante".
- **S7** Light narrative: "Nombres de operación generados para cada partida", "Mensajes del oficial de comunicaciones con variaciones". Haptics: "Vibración opcional con patrones distintos para impacto recibido, barco propio hundido y victoria."
- **S8** Screens: Boot ("Pulsa para comenzar" unlocks audio), main menu with ocean and player rank placeholder only if real, settings for audio, vibration, reduced motion, blocked-cell shading, shot confirmation. No decorative buttons.
- **S9** Responsive: desktop side by side; tablet side by side if cells ≥ 32 px; mobile "un tablero principal a ancho completo y un selector claro "Radar / Mi flota". Tras disparar, el juego muestra automáticamente tu flota durante el turno rival y vuelve al radar en tu turno." "confirmación opcional de disparo (tocar para apuntar, tocar otra vez para disparar)". Deploy: "Arrastrar y soltar con ratón y táctil", "Girar con la tecla R, botón dedicado o doble toque", dock lateral (inferior en móvil).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S6 | delegated (parallel unit A: `apps/client/src/audio/**`) | done | 5b77afc (RED: module missing → GREEN 34 tests) |
| T2 | S2, S4 (particles) | delegated (parallel unit B: `apps/client/src/fx/**`) | done | 2a139c5 (RED → GREEN 38 tests) |
| T3 | S1, S3 | inline | done | e5cb4c5 |
| T4 | S4, S5, S7 | inline | done | e5cb4c5 (shotQueue, narrative, settings: RED → GREEN) |
| T5 | S8, S9 + integration of T1/T2 | inline | done | e5cb4c5 (App tests: boot, sequence, confirm shot, settings) |

Route evidence: T1 (audio engine) and T2 (ocean + particle pool) are independent units with disjoint edit surfaces, each several files and well over 100 changed lines, so they run as parallel writers while the parent writes T3–T4 inline. T5 depends on all and stays inline.

## Log

- **L1** (2026-11-04) User: "Si, continua con la fase" — approves Phase 1 and starts Phase 2.
- **L2** Fonts: @fontsource/chakra-petch 5.3.0 and @fontsource/ibm-plex-sans 5.3.0 (highest semver ≥14 days). They solve self-hosting without hand-managed woff2 files; alternative discarded: copying font files manually.
- **L3** Motion library not added: shot sequence uses a token-driven sequencer and CSS animations; Motion would add bundle weight for effects CSS already covers.
- **L4** Writers A (audio) and B (fx) ran in parallel on disjoint surfaces; parent checked both diffs stayed inside `apps/client/src/audio/**` and `apps/client/src/fx/**`. Seam check: full suite 165/165, exit 0.
- **L5** Test-first exception: `battle/presentation.test.ts` was written together with its implementation (RED not observed). All other new modules observed RED first.
- **L6** Real-browser check (Chrome, production preview): boot with ocean, menu, drag-and-drop of the carrier to B-2, double tap rotated it in place, ghost reason "Se superpone con otro barco", battle with radar sweep and deck silhouettes, splash particles, sunk enemy silhouette revealed in sunk colour, fire on damaged sections, captions, full automated game to the results screen. Frame timing during the battle: 59 fps average, 16 of 1200 frames over 33 ms.
- **L7** Bugs found in the browser and fixed: own sunk ships nearly invisible on the final map (lighter sinking style); mobile overflow from `100vw` including the scrollbar (cells now sized with container units, `.screen` uses `minmax(0, 1fr)`); cells were 31.8 px on mobile (now ≥ 32 px). Mobile auto-switch observed: Radar → Mi flota → Radar.
- **L8** Deviations: the streak has no dedicated sound (music rises to intensity 3 and the badge animates); audio and effects are in the initial bundle (111.55 kB gzip, under the 300 kB budget) instead of loaded later; `App.test.tsx` takes ~40 s because the full game renders two 100-cell boards per sequence phase in jsdom (cells are now memoised).
- **L9** Not verified: audible output (only unit tests with a fake AudioContext), vibration on a real device, tap-to-aim confirmation on a real touch screen (verified through the "Siempre" setting), browser console during the automated game.
- **L10** Review assessment after e5cb4c5: risk `medium`, `review_due: false` (`under_budget`).