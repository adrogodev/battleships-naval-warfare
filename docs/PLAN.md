# Battleships: Naval Warfare — Plan de la Fase 0

Juego de batalla naval para navegador con dos modos reales (contra IA y multijugador online con servidor autoritativo), construido como monorepo TypeScript con un dominio puro compartido. Este documento es el plan que debe aprobarse antes de escribir código de implementación. El prototipo visual estático está en `prototype/battle.html`.

## Ruta rápida para revisar

1. Abrir `prototype/battle.html` en el navegador y validar paleta, tipografía, los dos tableros y los estados de casilla.
2. Revisar §3 (stack), §5 (máquina de estados) y §6 (protocolo): son las decisiones más caras de cambiar después.
3. Responder las preguntas de §12 y aprobar (o corregir) la Fase 0.

---

## 1. Entorno inspeccionado

| Elemento | Valor observado | Consecuencia |
|---|---|---|
| Sistema | Windows 11 Pro 10.0.26200 | Scripts npm multiplataforma (sin `rm -rf`, sin variables inline de shell) |
| Node.js | v24.15.0 | Se fija `engines.node >= 24` |
| pnpm | 10.7.1 | Disponible: se usa pnpm workspaces como propone el prompt |
| npm / git | 11.12.1 / 2.49.0 | El proyecto nuevo se inicializa como repositorio git propio |
| Proyecto existente | No existe; la carpeta `games/` contiene otros juegos independientes | Se crea `games/battleships/` desde cero, sin tocar los proyectos hermanos |

Últimas versiones publicadas consultadas con `npm view <paquete> version` (4 nov 2026):

| Paquete | Última | Decisión |
|---|---|---|
| react | 19.3.1 | Usar rama 19.x |
| vite | 8.3.5 | Usar rama 8.x |
| typescript | 7.0.2 | **Usar 6.0.x**: la 7 (compilador nativo) es reciente; la 6 es la que ya funciona en `uno-no-mercy` con Vite/Vitest |
| socket.io | 4.8.4 | Usar 4.8.x (cliente y servidor de la misma versión) |
| zod | 4.6.7 | Usar 4.x |
| zustand | 5.0.16 | Usar 5.x |
| vitest | 5.1.0 | Usar 5.x |
| @playwright/test | 1.64.1 | Usar 1.6x |
| motion | 14.9.1 | Usar 14.x |
| fast-check | 4.10.2 | Usar 4.x |
| @biomejs/biome | 2.6.5 | Usar 2.x |

En la Fase 1, antes de instalar, se verifica con `npm view <paquete> time` que cada versión fijada tenga al menos dos semanas de publicación; si la última no las cumple, se fija la anterior.

## 2. Alcance del MVP

El MVP es lo que hace falta para cumplir los criterios de aceptación de la §12 del prompt. Lo opcional se marca y se construye solo si lo esencial está terminado.

| Incluido en el MVP | Opcional (después de lo esencial) | Fuera de alcance |
|---|---|---|
| Reglas clásicas 10×10, flota de 17 casillas, no contacto configurable | Turno extra por impacto (variante, desactivada) | Base de datos, cuentas, autenticación |
| Despliegue por arrastre, táctil, teclado y aleatorio | Temas desbloqueables (Ártico, Pacífico, 1940) | Chat libre |
| IA Fácil, Normal y Difícil con simulación de 1.000 partidas | Repetición acelerada al final | Escalado a varias instancias (solo se documenta: adaptador Redis) |
| Multijugador: salas, reconexión, temporizador, revancha, reacciones | Comentarios de comandantes de IA | Matchmaking público |
| Secuencia de disparo, audio procedural, música por capas, hápticos | Sonido ambiental (mar, radio) | Idiomas distintos al español (solo se deja preparado) |
| Rango, estadísticas, 8–12 desafíos, historial de disparos | Mapa de calor de disparos | |
| Tutorial interactivo de 60 s, accesibilidad completa, responsive | | |

## 3. Stack y justificación

Cada dependencia resuelve un problema concreto; se indica la alternativa descartada.

| Capa | Elección | Problema que resuelve | Alternativa descartada |
|---|---|---|---|
| Monorepo | pnpm workspaces | Compartir `shared` entre cliente y servidor sin publicar paquetes | npm workspaces: funciona, pero pnpm es más estricto con dependencias fantasma |
| Lenguaje | TypeScript 6 estricto | Reglas y mensajes tipados en ambos lados | TS 7: demasiado reciente para el resto del tooling |
| Interfaz | React 19 + Vite 8 | Pantallas, formularios y foco accesibles con DOM | Phaser/PixiJS: canvas puro obliga a reimplementar accesibilidad |
| Tableros | DOM + CSS Grid + SVG | Cada casilla es un `button` con nombre accesible; barcos en SVG escalable | Canvas para el tablero: pierde lectores de pantalla y foco nativo |
| Océano y partículas | Canvas 2D propio con pool | Fondo animado ligero (≤150 partículas) sin dependencia | WebGL/Three.js: excesivo para ondas 2D y pesa en el bundle |
| Animación | CSS + Motion 14 | Secuencias de pantalla y de disparo con duraciones de tokens | GSAP: más potente pero innecesario y con licencia más restrictiva |
| Audio | Web Audio API propio | Efectos procedurales y música por capas con fundidos, sin assets | Howler.js: útil para archivos, pero el audio será generado; se añade solo si se usan archivos CC0 |
| Estado cliente | Zustand 5 | Estado de UI simple; el estado de partida lo gobierna la máquina del dominio | Redux Toolkit: más ceremonia sin beneficio aquí |
| Servidor | Node 24 + Socket.IO 4.8 | Salas, reconexión, ack y transporte con fallback | `ws` puro: habría que reimplementar salas, acks y reconexión |
| Validación | Zod 4 | Rechazar payloads mal formados en el borde del servidor y validar `GameRules` | Validación manual: frágil y no genera tipos |
| Pruebas | Vitest 5 + fast-check 4 + Playwright 1.6x | Unidad, propiedades, integración con sockets reales y E2E con dos navegadores | Jest: más lento y peor integración con Vite |
| Calidad | Biome 2 | Lint y formato con una sola herramienta rápida | ESLint + Prettier: dos herramientas y más configuración |
| Fuentes | Chakra Petch + IBM Plex Sans, autoalojadas | Carácter técnico en cifras y legibilidad en texto | Google Fonts en producción: dependencia externa en tiempo de carga (el prototipo sí usa Google Fonts) |

## 4. Arquitectura y estructura

Arquitectura hexagonal: el dominio (`shared`) no conoce React, el DOM ni Socket.IO. Cliente y servidor son adaptadores alrededor del mismo núcleo.

```text
battleships/
├─ packages/shared/src/
│  ├─ rules/          GameRules (esquema Zod), flota por defecto
│  ├─ board/          coordenadas, colocación, no contacto, colocación aleatoria
│  ├─ game/           máquina de estados, acciones, eventos, proyección viewFor
│  ├─ ai/             PublicBoardView, estrategias easy/normal/hard, colocación de la IA
│  ├─ random/         RNG con semilla (mulberry32) inyectable
│  └─ protocol/       eventos cliente↔servidor y esquemas Zod
├─ apps/client/src/
│  ├─ app/            rutas de pantalla, proveedores
│  ├─ screens/        boot, menu, difficulty, multiplayer, deploy, battle, results, tutorial, stats, settings
│  ├─ components/     átomos y moléculas (Cell, Board, ShipSilhouette, Dock, CombatLog…)
│  ├─ fx/             océano canvas, partículas, secuencia de disparo
│  ├─ audio/          motor Web Audio, efectos procedurales, mezclador de capas
│  ├─ adapters/       LocalAiGame (máquina en cliente), SocketGame (servidor)
│  ├─ persistence/    localStorage versionado y migraciones
│  ├─ i18n/           textos centralizados (es)
│  └─ theme/          tokens.css (fuente única de colores, tipografía, espaciado, duraciones)
├─ apps/server/src/
│  ├─ rooms/          registro de salas en memoria, códigos, caducidad
│  ├─ sessions/       tokens opacos, asientos, ventana de reconexión
│  ├─ transport/      handlers Socket.IO, límite de frecuencia, tamaño máximo
│  └─ config/         variables de entorno validadas con Zod
├─ e2e/               Playwright
├─ scripts/simulate-ai.ts
├─ docs/PLAN.md, docs/PROTOCOL.md, CREDITS.md
└─ PROJECT_STATUS.md
```

Regla de dependencias: `client → shared` y `server → shared`; nunca `shared → *`. Se verifica con una regla de Biome (`noRestrictedImports`) y una prueba que escanea los imports de `shared`.

El cliente consume la partida a través de un puerto único (`GamePort`: `submitFleet`, `fire`, `subscribe`). `LocalAiGame` y `SocketGame` lo implementan, de modo que la pantalla de batalla no sabe si juega contra la IA o contra una persona.

## 5. Modelo de dominio y máquina de estados

### Modelo

| Concepto | Forma |
|---|---|
| `Coord` | `{ col: 0..9, row: 0..9 }`; etiqueta `"C-7"` |
| `GameRules` | `{ boardSize, fleet: ShipSpec[], noContact, turnTimerSec \| null, extraTurnOnHit }`, validado con Zod |
| `ShipSpec` | `{ id: 'carrier' \| 'battleship' \| 'cruiser' \| 'submarine' \| 'destroyer', length }` |
| `Placement` | `{ shipId, bow: Coord, orientation: 'h' \| 'v' }` |
| `Fleet` | `Placement[]` validado: dentro del tablero, sin superposición, no contacto si aplica |
| `ShotResult` | `'miss' \| 'hit' \| { sunk: shipId }` |
| `PlayerState` | flota, disparos recibidos, barcos hundidos |
| `PublicBoardView` | lo que el rival puede saber: disparos, resultados y barcos ya hundidos (con su posición revelada) |
| `Rng` | `() => number` con semilla; único origen de aleatoriedad del dominio |

### Máquina de estados

```text
lobby ──(ambos jugadores presentes)──▶ placement
placement ──(ambas flotas válidas)──▶ battle
battle ──(flota hundida | abandono | reclamo tras expirar reconexión)──▶ finished
finished ──(revancha aceptada por ambos)──▶ placement
```

| Fase | Acciones válidas | Acciones rechazadas |
|---|---|---|
| `lobby` | `join`, `leave` | `fire`, `submitFleet` |
| `placement` | `submitFleet`, `leave` | `fire` |
| `battle` | `fire` (solo el jugador de turno), `leave`, `claimVictory` (solo tras expirar la ventana) | `submitFleet` |
| `finished` | `requestRematch`, `leave` | `fire`, `submitFleet` |

La máquina es una función pura `reduce(state, action) → { state, events[] } | error tipado`. En modo IA corre en el cliente; en multijugador corre en el servidor. Los eventos alimentan el registro de combate, el audio y las animaciones.

## 6. Protocolo multijugador

Documento completo en `docs/PROTOCOL.md` durante la Fase 4. Resumen:

| Dirección | Evento | Payload principal |
|---|---|---|
| C→S | `room:create` | `{ alias, rules? }` → ack `{ code, token }` |
| C→S | `room:join` | `{ code, alias }` o `{ token }` (reconexión) |
| C→S | `room:ready` / `fleet:submit` | `{ actionId, fleet }` |
| C→S | `shot:fire` | `{ actionId, coord }` |
| C→S | `rematch:request`, `room:leave`, `reaction:send`, `victory:claim` | `{ actionId, … }` |
| S→C | `room:state` | `viewFor(playerId)` completo |
| S→C | `shot:result`, `turn:changed`, `game:over` | resultado, turno, resumen |
| S→C | `player:disconnected` / `player:reconnected` | `{ alias, deadline }` |
| S→C | `error` | `{ code, message }` con códigos estables |

Garantías:

- Toda entrada pasa por Zod, pertenencia a sala, fase y turno.
- `actionId` único por acción: un duplicado devuelve la misma respuesta almacenada.
- Límite de 10 mensajes/s por conexión y `maxHttpBufferSize` de 4 KB.
- Lo que el cliente envíe sobre resultados, victoria o rival se descarta: los esquemas no tienen esos campos.
- `viewFor(playerId)` es la única puerta de salida de estado; una prueba recorre todos los mensajes enviados al rival y falla si aparece una casilla de barco no revelada.
- Reconexión por token opaco en `sessionStorage`; ventana `RECONNECT_WINDOW_SEC=60`; partida congelada; reclamo de victoria solo al expirar.
- Salas inactivas eliminadas tras `ROOM_IDLE_MIN=15`, limpiando timers y listeners.
- Dos pestañas con el mismo token: la conexión más reciente toma el asiento y la anterior recibe `error: SESSION_REPLACED`.

## 7. Estrategia de IA

La IA implementa `chooseShot(view: PublicBoardView, rules, rng): Coord`. Nunca recibe el estado completo. Una prueba lo garantiza de dos formas: el tipo no lo permite y, en ejecución, la vista se congela (`Object.freeze`) y no contiene la flota rival.

| Dificultad | Algoritmo | Objetivo (disparos medios) |
|---|---|---|
| Fácil — Alférez | Aleatorio sin repetir | ≈ 95 |
| Normal — Capitán | Caza en patrón de ajedrez + objetivo: adyacentes tras impacto, sigue la línea con dos impactos alineados | 55–65 |
| Difícil — Almirante | Mapa de densidad: cuenta las posiciones válidas de los barcos restantes que cubren cada casilla, con fallos, impactos abiertos, hundidos y no contacto; desempate aleatorio | < 50 |

Colocación de la IA: aleatoria en Fácil; aleatoria con variación de orientación en Normal; en Difícil evita bordes y agrupaciones obvias usando un muestreo que penaliza patrones frecuentes.

`scripts/simulate-ai.ts` juega 1.000 partidas por dificultad con semillas fijas y escribe media, mediana, p90 y tiempo por partida en `docs/AI_METRICS.md`. Los valores reales se documentan aunque no alcancen el objetivo.

## 8. Dirección de arte (validada en el prototipo)

- Dos capas: océano animado (atmósfera) y consola táctica (información).
- Tablero propio = vista de cubierta (agua y barcos). Tablero enemigo = radar (oscuro, barrido lento, solo lo descubierto).
- Tokens de la tabla del prompt, sin cambios de valor; contraste medido en el prototipo (texto `#E6F1FA` sobre `#0B1A2B` ≈ 15:1; `text-dim #8AA3B8` sobre `#0B1A2B` ≈ 7:1).
- Cada estado de casilla tiene forma propia además del color: fallo = punto con anillo, impacto = X, hundido = silueta revelada, bloqueada = rayado.
- Tipografía: Chakra Petch para títulos, coordenadas y cifras (tabulares); IBM Plex Sans para texto.

## 9. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La IA Difícil no baja de 50 disparos | Criterio de aceptación incumplido | Mapa de densidad con impactos abiertos ponderados; medir pronto (Fase 3) y documentar la desviación si persiste |
| Filtración de posiciones ocultas por el servidor | Trampas, criterio incumplido | Proyección `viewFor` única + prueba que inspecciona todo mensaje emitido |
| Reconexión con condiciones de carrera (dos pestañas, timers) | Partidas rotas | Token por asiento, último gana, timers en un único registro por sala con limpieza probada |
| El océano canvas baja los fps en móvil | Presupuesto de rendimiento | Pausa con `visibilitychange`, calidad adaptativa por fps medidos, pool de partículas |
| Bundle inicial > 300 KB gzip | Presupuesto de rendimiento | Carga diferida de audio, efectos y pantallas secundarias; `rollup-plugin-visualizer` solo en análisis |
| Arrastrar y soltar táctil inconsistente | Despliegue frustrante en móvil | Pointer Events propios + alternativa sin arrastre (seleccionar, tocar proa, girar) |
| Autoplay de audio bloqueado | Silencio inesperado | `AudioContext` creado solo tras "Pulsa para comenzar" |
| Prueba con "redes distintas" no automatizable localmente | Criterio sin evidencia automática | E2E con dos contextos de navegador + prueba manual documentada con el servidor desplegado (Fase 6) |
| Animaciones del rAF congeladas en pestañas en segundo plano durante E2E | Pruebas inestables | Modo de movimiento reducido en E2E y esperas por estado, no por tiempo |

## 10. Plan de pruebas y cómo se verifica cada resultado

| Nivel | Herramienta | Qué demuestra | Comando previsto |
|---|---|---|---|
| Dominio | Vitest + fast-check | Colocación, límites, no contacto, disparos, hundimiento, victoria, transiciones; toda colocación aleatoria es válida | `pnpm test --filter shared` |
| IA | Vitest + simulación | Fácil no repite, Normal persigue hasta hundir, Difícil elige el máximo de densidad, ninguna ve información oculta | `pnpm test --filter shared` y `pnpm simulate` |
| Servidor | Vitest + `socket.io-client` real | Salas, errores, fuera de turno/fase, duplicados, mal formados, aislamiento, desconexión, reconexión, expiración, revancha | `pnpm test --filter server` |
| Cliente | Vitest + Testing Library | Componentes de tablero accesibles, persistencia y migraciones | `pnpm test --filter client` |
| E2E | Playwright (Chromium + WebKit) | Partida completa contra IA, partida multijugador con dos contextos, recarga a mitad de batalla, solo teclado, vista móvil | `pnpm e2e` |
| Rendimiento | Lighthouse CI + medición de fps en Playwright | Presupuestos de §11 del prompt | `pnpm perf` |

Al cerrar cada fase se pega en `PROJECT_STATUS.md` el comando ejecutado y su salida real.

## 11. Criterios de aceptación por fase y complejidad relativa

Escala relativa: S (1) · M (2) · L (3) · XL (5).

| Fase | Se acepta cuando | Complejidad |
|---|---|---|
| 0. Plan | Apruebas este plan y el prototipo | S |
| 1. Núcleo jugable | Se juega una partida completa contra IA Fácil con UI sencilla y pasan las pruebas de dominio (incluida la de propiedades) | L |
| 2. Identidad e inmersión | Tokens, menú, tableros finales, secuencia de disparo, audio y responsive; la batalla contra IA se siente final en escritorio y móvil | XL |
| 3. IA | Normal y Difícil implementadas, comandantes, simulación de 3×1.000 partidas documentada y diferenciada | M |
| 4. Multijugador | Servidor, protocolo, reconexión, temporizador, revancha; pasa el E2E con dos navegadores y la prueba de aislamiento | XL |
| 5. Calidad | Accesibilidad, rendimiento, progresión, desafíos, tutorial; checklist de §12 del prompt completo o desviaciones documentadas | L |
| 6. Entrega | README, `.env.example`, build y despliegue; instalable siguiendo solo la documentación | S |

## 12. Preguntas abiertas (no bloquean el prototipo)

Cada una tiene un supuesto por defecto que se aplicará si no hay respuesta.

1. **Ubicación**: ¿el proyecto vive en `games/battleships/` con su propio repositorio git? Supuesto: sí.
2. **TypeScript**: ¿aceptás fijar TypeScript 6.0.x en lugar de 7.0 por estabilidad del tooling? Supuesto: sí.
3. **Despliegue (Fase 6)**: ¿dónde se alojará el servidor para la prueba entre redes distintas (Render, Fly.io, Railway, VPS propio)? Supuesto: Render (plan gratuito, WebSocket soportado), a confirmar en la Fase 6.
4. **Audio**: ¿aceptás efectos y música 100 % procedurales con Web Audio (sin archivos)? Supuesto: sí; si se incorporan archivos CC0, se documentan en `CREDITS.md`.
5. **Navegadores E2E**: ¿Chromium + WebKit son suficientes, o también Firefox? Supuesto: Chromium + WebKit (WebKit cubre Safari móvil).
