# PROJECT_STATUS — Battleships: Naval Warfare

**Fase actual: 5 (calidad) — entregada, esperando aprobación.** Rango de Grumete a Almirante de Flota, estadísticas con mapa de calor, 10 desafíos con insignia, historial de 10 disparos por bando, tutorial interactivo, borrar datos, alto contraste, modo daltonismo, reglas por defecto, tablero escalable al 200 % y audio y efectos fuera del bundle inicial. El E2E cubre las cinco rutas de la sección 12 y los presupuestos medibles.

## Retomar en otra sesión

1. Leer este archivo, `docs/PLAN.md`, `docs/PROTOCOL.md` y la bitácora de la fase en `odd/tasks/phase-5-quality.md` (fases anteriores en `odd/tasks/`).
2. `pnpm install`, `pnpm test`; para jugar online: `pnpm --filter @battleships/server start` y `pnpm dev`.
3. Si la Fase 5 está aprobada, empezar la Fase 6 (despliegue y README) según `docs/PLAN.md`.

Ramas apiladas: `feat/phase-1-core` → … → `feat/phase-4-multiplayer` → `feat/phase-5-quality`. No hay push ni PR.

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
| `pnpm screenshots` | Juega en Chromium y regenera las capturas del README en `docs/screenshots/` (necesita el servidor y `vite preview` en el puerto 4173) |

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
| Hecho (F5) | Rango de comandante por experiencia (victoria, precisión, hundimientos), visible en el menú; todo es cosmético o estadístico |
| Hecho (F5) | Estadísticas: partidas, victorias por modo y dificultad, precisión media, mejor racha, partida más corta y mapa de calor |
| Hecho (F5) | 10 desafíos con insignia (incluidos "Gana en Difícil con menos de 45 disparos" y "Hunde el portaaviones primero") |
| Hecho (F5) | Historial: últimos 10 disparos de cada bando con coordenada y resultado |
| Hecho (F5) | Tutorial "Cómo jugar" interactivo: colocar un barco, disparar y ver un hundimiento |
| Hecho (F5) | Configuración: alto contraste, modo daltonismo (paleta Okabe–Ito y forma propia del hundido), regla de no contacto por defecto, borrar datos con confirmación |
| Hecho (F5) | Tablero y cortes de diseño en `rem`/`em`: el texto al 200 % agranda las casillas y apila los tableros sin desborde |
| Hecho (F5) | Motor de audio y lienzos de efectos cargados después (`LazyAudio`, `React.lazy`); el océano queda quieto hasta "Pulsa para comenzar" |
| Pendiente (F6) | Despliegue y README |

## Pruebas y resultados

`pnpm test` (exit 0):

```text
Test Files  44 passed (44)
     Tests  396 passed (396)
```

`pnpm test:e2e` (exit 0), contra el servidor real y el build de producción:

```text
18 passed, 2 skipped (8.1m)
chromium + webkit: partida online completa y revancha · recarga en mitad de la batalla ·
  ida y vuelta de un disparo < 150 ms · partida completa contra la IA con estadísticas ·
  solo teclado con foco visible · texto al 200 % · océano quieto hasta el primer toque ·
  vista móvil (Pixel 7) con doble toque
chromium: respuesta al clic < 100 ms · 60 fps en batalla con GPU real
```

Presupuestos de la sección 12, medidos en esta máquina:

| Presupuesto | Resultado |
|---|---|
| 60 fps en batalla (escritorio) | 60,1 fps con GPU real (Intel Iris Xe); con render por software (SwiftShader) 17–25 fps, no representativo |
| ≥ 50 fps en móvil de gama media | No medido en un dispositivo real |
| Respuesta visual al clic < 100 ms | Chromium 13–70 ms hasta el siguiente fotograma; WebKit: ver desviaciones |
| JS inicial < 300 kB gzip | 142,2 kB; audio (3,7 kB), océano (2,5 kB) y partículas (1,9 kB) en chunks aparte |
| Partículas ≤ 150 con pool | Pool fijo de 150 (`ParticlePool`) |
| Lighthouse ≥ 90 | Accesibilidad 100 (móvil y escritorio). Rendimiento con gzip: escritorio 99–100, móvil 81 / 88 / 94 en tres pasadas |
| Ida y vuelta multijugador local < 150 ms | 1,6–24,2 ms (10 disparos) |

Otras verificaciones:

- `pnpm typecheck` (incluye `e2e/`) y `pnpm lint`: sin errores.
- Recorrido manual en Brave (Chromium 157) con la extensión de Claude, sobre el build de producción y el servidor real, sin errores en consola: tutorial completo con teclado; configuración (alto contraste, daltonismo, sombreado, persistencia); colocación por clic, arrastre y rechazo por contacto; partida completa contra la IA Normal (victoria en 54 disparos, +261 PE, ascenso a Cabo, 3 desafíos); estadísticas con mapa de calor; multijugador en dos pestañas (enlace de invitación, validación de alias, temporizador que pasa el turno, reacción, recarga en mitad de la batalla, partida completa, revancha, desconexión en el despliegue y reclamo de victoria); 390 px y texto al 200 % sin desborde; foco visible; borrar datos con cancelar y confirmar.
- Corregido tras el recorrido: la marca "✓" del tutorial salía como "âœ“" (codificación); el foco no se veía en los botones biselados (`clip-path` recortaba el anillo); en el despliegue online no había aviso de rival desconectado ni forma de salir.
- Lighthouse 12.8.2 por `npx` (no es dependencia del repo), sin el script que inyecta el antivirus Kaspersky de esta máquina (`--blocked-url-patterns`) y con un servidor estático con gzip, como en un hosting real; `vite preview` no comprime.

## Errores conocidos y desviaciones

- La IA Normal promedia 52,62 disparos, 2,4 por debajo del rango orientativo 55–65; está implementada tal como la describe la especificación (ver `docs/AI_METRICS.md`).
- Corregido en la Fase 3: la pantalla de arranque no avanzaba si el navegador dejaba `AudioContext.resume()` pendiente.

- No verifiqué el audio a oído (solo pruebas unitarias con un AudioContext falso), la vibración en un dispositivo real, la confirmación de disparo en una pantalla táctil real ni la consola del navegador durante la partida automática.
- A 360 px con una barra de desplazamiento de escritorio quedan 8 px de desborde; en teléfonos (barras superpuestas) entra.
- La racha no tiene sonido propio: la música sube de intensidad y el indicador se anima.
- Corregido en la Fase 5: audio y efectos ya no van en el bundle inicial.
- `App.test.tsx` tarda unos 40 s porque juega una partida completa en jsdom. Con el disco lleno llegó a 230 s; no era una regresión.
- Fase 5 · Lighthouse móvil: mediana 88 (81–94), por debajo de 90. El primer pintado depende de descargar el JS (2,2–2,3 s en 4G simulada) y el TBT varía de 129 a 472 ms según la carga de la máquina. Una mejora posible es una pantalla de arranque estática en `index.html`.
- Fase 5 · Lighthouse mide la pantalla de arranque: el océano queda quieto hasta "Pulsa para comenzar". Con el océano animado desde la carga, el móvil bajaba a 64.
- Fase 5 · WebKit de Playwright en Windows pinta el primer fotograma tras un disparo con 200–300 ms de retraso, aunque el DOM se actualiza en menos de 10 ms. Descarté el audio, los lienzos, los blur y clip-path, el layout y la velocidad de JavaScript (igual en ambos motores). No sé la causa. La prueba de 100 ms se salta en WebKit y no probé en Safari real.
- Fase 5 · Las partículas mantienen sus colores en modo daltonismo: son decoración pasajera, no indican estado.
- Fase 5 · Ganar por abandono suma la experiencia de victoria y puede completar desafíos ("Gana sin perder ningún barco") aunque no se haya disparado. Con dos pestañas se puede subir de rango sin jugar. Pendiente de decisión.
- Fase 5 · En el tutorial y en el despliegue, R gira la vista previa; un barco ya colocado se gira volviendo a tocar la casilla.
- Fase 5 · No hay selector de idioma: solo existe el español y un selector de una opción sería decorativo. Los textos están centralizados en `i18n/`.
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

1. Aprobación de las Fases 4 y 5.
2. Fase 6: despliegue y README.
