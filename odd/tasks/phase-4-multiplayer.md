# Phase 4 — Online multiplayer

Objective: two people play in real time from different devices against an authoritative server. Branch: `feat/phase-4-multiplayer` (stacked on `feat/phase-3-ai`). Delivery: `ask-on-risk`, work-unit commits. Test runner: Vitest 5 (`pnpm test`), Playwright for E2E.

## Specs

- **S1** Rooms: "Crear sala privada con un código de 6 caracteres sin ambigüedades (sin O/0, I/1), copiable con un clic y compartible como enlace directo." "Unirse por código o por enlace." "Alias de jugador (sin registro), con validación de longitud y caracteres." "Sala de espera que muestre a ambos jugadores, su estado de conexión y si están listos."
- **S2** Game: "Colocación privada e independiente; la batalla empieza cuando ambos confirman." "Turnos, disparos, impactos, fallos y hundimientos sincronizados en tiempo real." "Indicador de turno muy visible y temporizador de turno opcional (por ejemplo 30 s, configurable por el creador de la sala)." "Abandono voluntario con confirmación." "Pantalla de resultados con revancha: si ambos aceptan, nueva partida en la misma sala y con los mismos alias." "Reacciones rápidas predefinidas opcionales ("¡Buen tiro!", "Casi"), sin chat libre". "En multijugador, solo menú de opciones sin detener la partida."
- **S3** Authority: "El servidor es la única autoridad. El cliente envía intenciones ("disparar a C-7"); el servidor decide y comunica resultados." Events at least: room:create, room:join, room:ready, fleet:submit, shot:fire, rematch:request, room:leave (client→server) and room:state, shot:result, turn:changed, player:disconnected, player:reconnected, game:over, error (server→client). "Cada estado enviado a un jugador se construye con una función de proyección viewFor(playerId) que solo incluye lo que ese jugador puede saber". "En multijugador, la configuración la fija el servidor."
- **S4** Server validation: "Esquema del mensaje, pertenencia a la sala, fase correcta y turno correcto." "Coordenadas dentro del tablero y casilla no disparada." "Flota enviada válida según GameRules, calculada en el servidor." "Cada acción lleva un actionId único: los duplicados se ignoran y devuelven la misma respuesta (idempotencia)." "Límite de frecuencia por conexión (por ejemplo 10 mensajes por segundo) y tamaño máximo de mensaje." "El cliente nunca envía resultados, estado de victoria ni datos del rival; si lo hace, se ignoran."
- **S5** Identity and reconnection: "Al entrar en una sala, el servidor entrega un token de sesión opaco que el cliente guarda en sessionStorage. Al reconectar, el token recupera el asiento y el estado." "Si un jugador se desconecta, el rival ve "Comandante X ha perdido la conexión" con cuenta atrás. Ventana de reconexión configurable (por defecto 60 s) mediante variable de entorno." "Durante la ventana la partida queda congelada. Al expirar, el jugador presente puede reclamar la victoria o seguir esperando. No se declara victoria automática antes de ese punto." "Salas inactivas se eliminan tras un tiempo configurable (por defecto 15 min) y se limpian todos los timers y listeners."
- **S6** Scenarios: "Recargar la página en mitad de la batalla, perder la red unos segundos, cerrar la pestaña, abrir la misma sala en dos pestañas, unirse a una sala llena o inexistente y pedir revancha cuando el rival ya se fue."
- **S7** States: "Carga, error de red, sin conexión, sala inexistente, sala llena, rival desconectado, acción inválida y servidor no disponible. Cada uno con mensaje claro, en el lenguaje del juego y con una acción de salida ("Reintentar", "Volver al menú")."
- **S8** Tests: server integration "con clientes Socket.IO reales: crear y unirse a sala, sala llena o inexistente, disparo fuera de turno, fuera de fase, duplicado y mal formado, aislamiento de información (ningún mensaje al rival contiene posiciones no reveladas), desconexión, reconexión, expiración y revancha." E2E: "dos contextos de navegador jugando una partida multijugador completa; recarga en mitad de la batalla". Phase done when "La prueba E2E con dos navegadores pasa".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T0 | S1, S3 (contract) | inline | done | protocol schemas, room codes, aliases, `ShotRecord`, domain `timeout`; shared 85/85 |
| T1 | S1–S6, S8 (server) | delegated (unit A: `apps/server/**`, `docs/PROTOCOL.md`) | done | bfb5bb1 (RED → GREEN, 31 server tests incl. leak isolation) |
| T2 | S1, S2, S5–S7 (client) | delegated (unit B: client surfaces) | done | dd5a9e5 (199 client tests) |
| T3 | S8 (E2E) | inline | done | `e2e/multiplayer.spec.ts`: 4/4 (Chromium + WebKit); reload test RED without `adopt` |

Route evidence: server and client are independent units with disjoint edit surfaces, each far over 100 changed lines, sharing only the T0 contract; parent is past the context backstop.

## Log

- **L1** (2026-11-04) User: "Si, continua con la siguiente fase solo si solo si la fase anterior ya esta lista y terminada". Phase 3 checked complete (commits, clean tree, 221/221). The "Si" is taken as approving Phase 3 with Normal kept as specified (52.62 mean), the recommended option.
- **L2** Versions (highest semver ≥14 days): socket.io 4.8.4, socket.io-client 4.8.4 (rooms, acks and reconnection out of the box; alternative discarded: raw `ws`, which would need all of that hand-written), @playwright/test 1.64.1 (not installed yet).
- **L3** Turn timer expiry passes the turn (domain action `timeout`); chosen over auto-firing a random shot so the server never plays for the player.
- **L4** Both writers stopped on a usage-limit error mid-task and were resumed with their saved context after the reset.
- **L5** Contract gaps reported by the server writer and fixed by the parent: default `Ack` type rejected `{ ok: true }` (RED via typecheck → GREEN); new codes `GAME_FROZEN`, `ALREADY_IN_ROOM`, `ROOM_CLOSED` (server tests RED → GREEN, PROTOCOL.md updated).
- **L6** Server choices: frozen game rejects shots with `GAME_FROZEN` and pauses the turn timer; leave in lobby frees the seat, in placement/battle forfeits; sliding-window rate limit (10/s); oversize messages close the socket (client rejoins with its token).
- **L7** `apps/client/.env.example` could not be written (denied by permission settings for both writer and parent); `VITE_SERVER_URL` (default: page host, port 3001) is typed in `vite-env.d.ts` and goes into the README in Phase 6.
- **L8** Seam check: surfaces respected; suite 317/317 exit 0.
- **L9** Real two-tab check (server on 3001 + production preview, 127.0.0.1 and localhost tabs): create room with 30 s timer (code 9T45H8), join by link `?sala=9T45H8`, waiting room with both players, ready, random fleets, full battle to "Derrota"/"Victoria", reload of one tab mid-battle (rival saw "Comandante Ahab ha perdido la conexión · Partida congelada" with countdown; reloaded tab rejoined with its stats), rematch → both back to deployment; no console errors.
- **L10** Bug found in that check: rejoining replayed every past shot as an animation (~18 s blocked). Fix: `ShotQueue.adopt` marks an existing history as presented (RED → GREEN), used when BattleScreen mounts. Verified by tests; not re-verified in the browser yet (the E2E reload test will).
- **L11** Flaky timeouts under the parallel suite in heavy shared AI tests (hard placement property tests); fixed with a 30 s `testTimeout` for the shared project (8e2d0c5); suite then 318/318 three consecutive runs.
- **L12** T3 (Playwright E2E) waits for the user's permission to download Chromium + WebKit (~260 MB).
- **L13** (2026-11-05) User: "Dale, ejcuta lo que se requiera y continua desde donde lo dejaste". Installed @playwright/test 1.64.1 and Chromium + WebKit.
- **L14** E2E (`pnpm test:e2e`, real server on 3001 + production preview on 4173, two browser contexts per test): full game to "Victoria"/"Derrota" + rematch back to deployment; reload mid-battle (rival sees "Comandante Ahab ha perdido la conexión" and "Partida congelada", history visible within 1.5 s, game continues). Result: 4 passed (5.1m): chromium 1.2m + 17.1s, webkit 2.4m + 47.5s. No page errors.
- **L15** RED check of the reload fix: with the `adopt` call commented out, the reload test fails ("Expected: 6, Received: 1"); restored.
- **L16** WebKit first timed out (12 min at shot 83): cause was trace recording (`retain-on-failure` records 2560×1440 screencasts for every action); switched to `on-first-retry`, full game then 2.5 min.
- **L17** Final checks: `pnpm test` 318/318, `pnpm typecheck` (now also `e2e/`) and `pnpm lint` exit 0.