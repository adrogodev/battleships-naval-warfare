# PROJECT_STATUS — Battleships: Naval Warfare

**Fase actual: 4 (multijugador) — entregada, esperando aprobación.** Dos personas juegan en tiempo real contra un servidor autoritativo (Socket.IO): sala privada con código y enlace, sala de espera, despliegue privado, turnos con temporizador opcional, reacciones, reconexión con partida congelada, reclamo de victoria y revancha. El E2E con dos navegadores pasa en Chromium y WebKit.

## Retomar en otra sesión

1. Leer este archivo, `docs/PLAN.md`, `docs/PROTOCOL.md` y la bitácora de la fase en `odd/tasks/phase-4-multiplayer.md` (fases anteriores en `odd/tasks/`).
2. `pnpm install`, `pnpm test`; para jugar online: `pnpm --filter @battleships/server start` y `pnpm dev`.
3. Si la Fase 4 está aprobada, empezar la Fase 5 (accesibilidad, rendimiento, progresión, tutorial) según `docs/PLAN.md`.

Ramas apiladas: `feat/phase-1-core` → `feat/phase-2-identity` → `feat/phase-3-ai` → `feat/phase-4-multiplayer`. No hay push ni PR.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias (pnpm 10, Node ≥ 24) |
| `pnpm dev` | Cliente en modo desarrollo (Vite) |
| `pnpm test` | Todas las pruebas unitarias e integración (Vitest: `shared`, `client` y `server`) |
| `pnpm test:e2e` | E2E con Playwright (Chromium + WebKit); levanta el servidor y un build de producción del cliente |
| `pnpm --filter @battleships/server start` | Servidor multijugador en el puerto 3001 (`PORT`, `RECONNECT_WINDOW_SEC`, `ROOM_IDLE_MIN`, `CORS_ORIGINS`) |
| `pnpm typecheck` | TypeScript estricto en todos los paquetes |
| `pnpm lint` | Biome (lint + formato) |
| `pnpm build` | Build de producción del cliente |
| `pnpm simulate` | 1.000 partidas por dificultad; reescribe `docs/AI_METRICS.md` (admite `--games N`) |

## Objetivo

Juego de batalla naval para navegador, completo y real: modo contra IA (tres dificultades medibles) y multijugador online con servidor autoritativo, con identidad visual de consola táctica naval (CIC) y océano animado.

## Arquitectura y decisiones

| Tema | Decisión |
|---|---|
| Estructura | Monorepo pnpm: `packages/shared` (dominio puro y protocolo), `apps/client`, `apps/server` y `e2e/` (Playwright) |
| Multijugador | El servidor es la única autoridad: valida esquema (Zod), sala, fase, turno y flota; idempotencia por `actionId`; 10 mensajes/s y tamaño máximo; cada estado sale por `viewFor` |
| Reconexión | Token opaco en `sessionStorage`; ventana de 60 s con la partida congelada; al expirar, el presente puede reclamar la victoria; salas inactivas se borran a los 15 min |
| Dominio | `reduce(state, action)` puro con eventos y errores tipados; RNG con semilla; la IA solo ve `publicBoardView` |
| Presentación | El estado de la partida se resuelve al instante; `ShotQueue` decide cuándo cada resultado se ve, suena y se anuncia |
| Tokens | Colores, tipografía, espaciado, capas y curvas en `theme/tokens.css`; duraciones en `theme/motion.ts`, volcadas a variables `--dur-*` |
| Secuencia de disparo | Fuego 0–150 ms, suspense 150–450, impacto 450–700, pausa de 300 ms antes de revelar un hundido; con movimiento reducido menos de 200 ms |
| Audio | Web Audio procedural sin archivos (`audio/`): 11 efectos, música en 4 capas con fundidos, ambiente opcional; se activa con "Pulsa para comenzar" |
| Efectos | Océano en Canvas 2D (pausa con la pestaña oculta, calidad adaptativa) y partículas en pool de 150 (`fx/`) |
| Persistencia | `localStorage` con esquema versionado, migraciones y recuperación campo a campo (`settings/settingsStore.ts`) |
| Fuentes | Chakra Petch e IBM Plex Sans autoalojadas con Fontsource (OFL) |
| Versiones | Semver más alta con al menos 14 días: react 19.3.1, vite 8.3.5, typescript 6.0.3, zod 4.6.7, vitest 5.0.5, fast-check 4.10.2, biome 2.6.2, @fontsource 5.3.0, socket.io 4.8.4, @playwright/test 1.64.1 |

## Funcionalidades

| Estado | Elemento |
|---|---|
| Hecho (F1) | Reglas, colocación, máquina de estados, IA Fácil, despliegue, batalla y resultados |
| Hecho (F2) | Arranque, menú y configuración (audio, silencio, ambiente, vibración, movimiento, sombreado de casillas descartadas, confirmación de disparo) |
| Hecho (F2) | Tableros finales: cubierta con siluetas SVG (intacto, dañado con fuego y humo, hundido) y radar con barrido que solo muestra lo descubierto |
| Hecho (F2) | Secuencia de disparo con retícula y coordenada, sacudida, proyectil, partículas, sonido, registro narrado y anuncio accesible |
| Hecho (F2) | Hundimiento con pausa, revelado, sonido, vibración y mensaje destacado; alerta de último barco; racha ×3; final de victoria o derrota |
| Hecho (F2) | Nombres de operación y frases del oficial de comunicaciones con variaciones; subtítulos visuales para cada sonido |
| Hecho (F2) | Despliegue con arrastrar y soltar (ratón y táctil) y doble toque para girar |
| Hecho (F2) | Responsive: escritorio y tablet con los tableros lado a lado; móvil con selector Radar / Mi flota y cambio automático de tablero |
| Hecho (F3) | IA Normal (damero + objetivo + línea) y Difícil (mapa de densidad con regla de no contacto), colocación según dificultad |
| Hecho (F3) | Selección de dificultad con tres comandantes e insignias, última usada recordada, comentarios del comandante desactivables, velocidad de la IA configurable |
| Hecho (F3) | Simulación: Fácil 95,51 · Normal 52,62 · Difícil 38,48 disparos de media (1.000 partidas cada una) |
| Hecho (F4) | Servidor Socket.IO autoritativo, salas con código de 6 caracteres y enlace `?sala=`, alias validado, sala de espera con conexión y "Listo" |
| Hecho (F4) | Partida online: despliegue privado, turnos sincronizados, temporizador opcional (el turno pasa al expirar), reacciones rápidas, abandono con confirmación, revancha |
| Hecho (F4) | Reconexión: el rival ve "Comandante X ha perdido la conexión" con cuenta atrás; al volver, el historial aparece sin repetir animaciones |
| Hecho (F4) | Estados con salida: carga, sin conexión, sala inexistente, completa, abierta en otra pestaña, cerrada, servidor no disponible, acción inválida |
| Pendiente (F5–F6) | Progresión y desafíos, tutorial, estadísticas, accesibilidad completa, rendimiento, despliegue |

## Pruebas y resultados

`pnpm test` (exit 0):

```text
Test Files  32 passed (32)
     Tests  318 passed (318)
```

Nuevas en la Fase 4: contrato del protocolo, integración del servidor con clientes Socket.IO reales (31: crear y unirse, sala llena o inexistente, disparo fuera de turno, fuera de fase, duplicado y mal formado, aislamiento de información, desconexión, reconexión, expiración, revancha) y pantallas multijugador del cliente.

`pnpm test:e2e` (exit 0), dos contextos de navegador por prueba contra el servidor real y el build de producción:

```text
ok 1 [chromium] two players play a full online game and accept a rematch (1.2m)
ok 2 [chromium] a reload in the middle of the battle rejoins the same seat without replaying history (17.1s)
ok 3 [webkit]   two players play a full online game and accept a rematch (2.4m)
ok 4 [webkit]   a reload in the middle of the battle rejoins the same seat without replaying history (47.5s)
4 passed (5.1m)
```

La prueba de recarga falla si se quita el arreglo (`ShotQueue.adopt`): "Expected: 6, Received: 1".

Otras verificaciones:

- `pnpm typecheck` (incluye `e2e/`) y `pnpm lint`: sin errores.
- Fase 4 en Chrome real con dos pestañas: crear, unirse por enlace, partida completa, recarga en mitad de la batalla y revancha, sin errores en consola.
- `pnpm build`: JS inicial de 111,55 kB gzip (presupuesto: 300 kB).
- Chrome real con build de producción: partida completa automatizada hasta resultados, a 59 fps de media con 16 de 1.200 fotogramas por encima de 33 ms.
- Móvil medido en un iframe: casillas de 32 px a 360 y 375 px, 35,8 px a 414 px y tablet a 800 px con los dos tableros. Sin desborde a 375 px.

## Errores conocidos y desviaciones

- La IA Normal promedia 52,62 disparos, 2,4 por debajo del rango orientativo 55–65; está implementada tal como la describe la especificación (ver `docs/AI_METRICS.md`).
- Corregido en la Fase 3: la pantalla de arranque no avanzaba si el navegador dejaba `AudioContext.resume()` pendiente.

- No verifiqué el audio a oído (solo pruebas unitarias con un AudioContext falso), la vibración en un dispositivo real, la confirmación de disparo en una pantalla táctil real ni la consola del navegador durante la partida automática.
- A 360 px con una barra de desplazamiento de escritorio quedan 8 px de desborde; en teléfonos (barras superpuestas) entra.
- La racha no tiene sonido propio: la música sube de intensidad y el indicador se anima.
- Audio y efectos van en el bundle inicial en lugar de cargarse después (111,55 kB gzip, dentro del presupuesto).
- `App.test.tsx` tarda unos 40 s porque juega una partida completa en jsdom.
- Corregido en la Fase 4: al recargar en mitad de la batalla se repetían animadas todas las jugadas (~18 s sin poder disparar).
- No hay `apps/client/.env.example`: los permisos de este entorno bloquean escribir archivos `.env*`. `VITE_SERVER_URL` (por defecto, el host de la página en el puerto 3001) se documentará en el README de la Fase 6.
- El E2E no cubre perder la red unos segundos, la sala abierta en dos pestañas ni la revancha con el rival ya fuera; esos casos los cubren las pruebas de integración del servidor y de pantallas.
- WebKit en Windows es la versión de Playwright, no Safari real; no probé en un iPhone ni en un Mac.

## Decisiones aprobadas

- Fase 0 aprobada el 2026-11-04: plan, stack y dirección de arte del prototipo.
- Fase 1 aprobada el 2026-11-04.
- Fase 2 aprobada el 2026-11-04 (continuar solo con la fase anterior terminada).
- Fase 3 aprobada el 2026-11-04, con la IA Normal tal como la describe la especificación (52,62).
- 2026-11-05: autorizada la descarga de los navegadores de Playwright (Chromium y WebKit).

## Supuestos

- Ubicación `games/battleships/` con repositorio git propio.
- TypeScript 6.0.x en lugar de 7.0.
- Audio 100 % procedural (documentado en `CREDITS.md`).
- E2E en Chromium + WebKit; despliegue previsto en Render (a confirmar en la Fase 6).
- Sin Zustand ni Motion: `useSyncExternalStore` y CSS con tokens alcanzan.

## Próximos pasos

1. Aprobación de la Fase 4.
2. Fase 5: accesibilidad completa, rendimiento, progresión y desafíos, tutorial y estadísticas.
