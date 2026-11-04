# PROJECT_STATUS — Battleships: Naval Warfare

**Fase actual: 3 (IA) — entregada, esperando aprobación.** Hay tres dificultades jugables con comandante propio (Alférez Ruiz, Capitán Varela, Almirante Castellanos), selección recordada y métricas reales de 1.000 partidas por dificultad en `docs/AI_METRICS.md`.

## Retomar en otra sesión

1. Leer este archivo, `docs/PLAN.md` y la bitácora de la fase en `odd/tasks/phase-3-ai.md` (fases anteriores en `odd/tasks/`).
2. `pnpm install`, `pnpm test`, `pnpm dev`.
3. Si la Fase 3 está aprobada, empezar la Fase 4 (servidor, salas, protocolo, reconexión, revancha) según `docs/PLAN.md` §6 y §11.

Ramas apiladas: `feat/phase-1-core` → `feat/phase-2-identity` → `feat/phase-3-ai`. No hay push ni PR.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias (pnpm 10, Node ≥ 24) |
| `pnpm dev` | Cliente en modo desarrollo (Vite) |
| `pnpm test` | Todas las pruebas (Vitest: `shared` y `client`) |
| `pnpm typecheck` | TypeScript estricto en todos los paquetes |
| `pnpm lint` | Biome (lint + formato) |
| `pnpm build` | Build de producción del cliente |
| `pnpm simulate` | 1.000 partidas por dificultad; reescribe `docs/AI_METRICS.md` (admite `--games N`) |

## Objetivo

Juego de batalla naval para navegador, completo y real: modo contra IA (tres dificultades medibles) y multijugador online con servidor autoritativo, con identidad visual de consola táctica naval (CIC) y océano animado.

## Arquitectura y decisiones

| Tema | Decisión |
|---|---|
| Estructura | Monorepo pnpm: `packages/shared` (dominio puro) y `apps/client`. `apps/server` y `e2e` llegan en las Fases 4 y 5 |
| Dominio | `reduce(state, action)` puro con eventos y errores tipados; RNG con semilla; la IA solo ve `publicBoardView` |
| Presentación | El estado de la partida se resuelve al instante; `ShotQueue` decide cuándo cada resultado se ve, suena y se anuncia |
| Tokens | Colores, tipografía, espaciado, capas y curvas en `theme/tokens.css`; duraciones en `theme/motion.ts`, volcadas a variables `--dur-*` |
| Secuencia de disparo | Fuego 0–150 ms, suspense 150–450, impacto 450–700, pausa de 300 ms antes de revelar un hundido; con movimiento reducido menos de 200 ms |
| Audio | Web Audio procedural sin archivos (`audio/`): 11 efectos, música en 4 capas con fundidos, ambiente opcional; se activa con "Pulsa para comenzar" |
| Efectos | Océano en Canvas 2D (pausa con la pestaña oculta, calidad adaptativa) y partículas en pool de 150 (`fx/`) |
| Persistencia | `localStorage` con esquema versionado, migraciones y recuperación campo a campo (`settings/settingsStore.ts`) |
| Fuentes | Chakra Petch e IBM Plex Sans autoalojadas con Fontsource (OFL) |
| Versiones | Semver más alta con al menos 14 días: react 19.3.1, vite 8.3.5, typescript 6.0.3, zod 4.6.7, vitest 5.0.5, fast-check 4.10.2, biome 2.6.2, @fontsource 5.3.0 |

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
| Pendiente (F4–F6) | Servidor y multijugador, progresión y desafíos, tutorial, estadísticas, accesibilidad completa, despliegue |

## Pruebas y resultados

`pnpm test` (exit 0):

```text
Test Files  26 passed (26)
     Tests  221 passed (221)
```

Nuevas en la Fase 2: motor de audio (34), océano y partículas (38), cola de disparos y tiempos (8), narrativa (4), ajustes persistidos (8), presentación de tableros (5), hápticos (2) y pruebas de la App (arranque, secuencia y bloqueo de entrada, confirmación de disparo, ajustes persistidos y partida completa).

Otras verificaciones:

- `pnpm typecheck` y `pnpm lint`: sin errores.
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

## Decisiones aprobadas

- Fase 0 aprobada el 2026-11-04: plan, stack y dirección de arte del prototipo.
- Fase 1 aprobada el 2026-11-04.
- Fase 2 aprobada el 2026-11-04 (continuar solo con la fase anterior terminada).

## Supuestos

- Ubicación `games/battleships/` con repositorio git propio.
- TypeScript 6.0.x en lugar de 7.0.
- Audio 100 % procedural (documentado en `CREDITS.md`).
- E2E en Chromium + WebKit; despliegue previsto en Render (a confirmar en la Fase 6).
- Sin Zustand ni Motion: `useSyncExternalStore` y CSS con tokens alcanzan.

## Próximos pasos

1. Aprobación de la Fase 3 y decisión sobre la IA Normal (dejarla así o debilitarla para entrar en 55–65).
2. Fase 4: `apps/server` con Socket.IO, salas con código, protocolo con Zod, `viewFor`, reconexión, temporizador, revancha, reacciones y E2E con dos navegadores.
