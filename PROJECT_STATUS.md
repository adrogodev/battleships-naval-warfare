# PROJECT_STATUS — Battleships: Naval Warfare

**Fase actual: 1 (Núcleo jugable) — entregada, esperando aprobación.** Se juega una partida completa contra la IA Fácil con una interfaz sencilla y pasan todas las pruebas de dominio.

## Retomar en otra sesión

1. Leer este archivo, `docs/PLAN.md` y `odd/tasks/phase-1-core.md` (especificaciones, tareas, commits y bitácora de la fase).
2. `pnpm install`, luego `pnpm test` y `pnpm dev`.
3. Si la Fase 1 está aprobada, empezar la Fase 2 (identidad e inmersión) según `docs/PLAN.md` §11.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala dependencias (pnpm 10, Node ≥ 24) |
| `pnpm dev` | Cliente en modo desarrollo (Vite) |
| `pnpm test` | Todas las pruebas (Vitest: `shared` y `client`) |
| `pnpm typecheck` | TypeScript estricto en todos los paquetes |
| `pnpm lint` | Biome (lint + formato) |
| `pnpm build` | Build de producción del cliente |

## Objetivo

Juego de batalla naval para navegador, completo y real: modo contra IA (tres dificultades medibles) y multijugador online con servidor autoritativo, con identidad visual de consola táctica naval (CIC) y océano animado.

## Arquitectura y decisiones

| Tema | Decisión |
|---|---|
| Estructura | Monorepo pnpm: `packages/shared` (dominio puro) y `apps/client`. `apps/server` y `e2e` llegan en las Fases 4 y 5 |
| Dominio | `reduce(state, action)` puro: `lobby → placement → battle → finished (→ placement por revancha)`, errores tipados, eventos |
| Pureza del dominio | `shared` compila sin `DOM` en `lib` y Biome prohíbe importar React o Socket.IO (`noRestrictedImports`) |
| Aleatoriedad | Mulberry32 con semilla inyectable (`createRng`); el dominio nunca usa `Math.random` |
| Información oculta | La IA solo recibe `publicBoardView` (congelada en profundidad); `viewFor(seat)` es la única salida de estado hacia un jugador |
| Cliente | `LocalAiGame` corre la máquina en el navegador; React lo lee con `useSyncExternalStore` |
| Versiones | Semver más alta con al menos 14 días: react 19.3.1, vite 8.3.5, typescript 6.0.3, zod 4.6.7, vitest 5.0.5, fast-check 4.10.2, biome 2.6.2 |

## Funcionalidades

| Estado | Elemento |
|---|---|
| Hecho | `GameRules` validado con Zod (10×10, flota de 17 casillas, no contacto, temporizador, turno extra opcional desactivado) |
| Hecho | Colocación: límites, superposición, no contacto (lados y esquinas), colocación aleatoria válida |
| Hecho | Máquina de estados con disparos, impacto, fallo, hundimiento, victoria, abandono y revancha |
| Hecho | IA Fácil: aleatoria sin repetir, colocación aleatoria, retardo de 400–900 ms con indicador |
| Hecho | Despliegue: selección, proa, girar (R o botón), devolver al muelle, aleatorio, reiniciar, fantasma con motivo, teclado |
| Hecho | Batalla: radar y cubierta, turno bloqueado, registro, estado de flotas, región `aria-live`, abandonar con confirmación |
| Hecho | Resultados: victoria o derrota, disparos, precisión, racha máxima, primer hundimiento, duración y mapas finales revelados |
| Pendiente (Fase 2) | Identidad visual final, océano, siluetas SVG, secuencia de disparo, audio, hápticos, menú completo, móvil con selector Radar / Mi flota |
| Pendiente (Fase 3) | IA Normal y Difícil, comandantes, simulación de 1.000 partidas |
| Pendiente (Fases 4–6) | Servidor, multijugador, progresión, tutorial, accesibilidad completa, despliegue |

## Pruebas y resultados

`pnpm test` (última corrida, 3 veces seguidas sin fallos):

```text
Test Files  9 passed (9)
     Tests  64 passed (64)
```

| Archivo | Cubre |
|---|---|
| `shared/src/rules/rules.test.ts` | Reglas por defecto y rechazo de reglas inválidas |
| `shared/src/random/rng.test.ts` | Determinismo y rango del RNG |
| `shared/src/board/placement.test.ts` | Límites, superposición, contacto en lados y esquinas, flota completa; propiedades: toda flota aleatoria es válida (500 corridas) y `validPlacementsFor` ≡ `validatePlacement` |
| `shared/src/game/game.test.ts` | Transiciones, acciones fuera de fase o de turno, disparo repetido, hundimiento, victoria, turno extra, abandono, revancha, inmutabilidad |
| `shared/src/game/view.test.ts` | La vista pública solo expone disparos, hundidos y barcos restantes; congelada |
| `shared/src/ai/ai.test.ts` | Fácil nunca repite; flota válida; con flotas ocultas distintas elige lo mismo (no ve información oculta) |
| `client/src/deploy/deployModel.test.ts` | Despliegue: colocar, girar, motivo de rechazo, fantasma, devolver al muelle, aleatorio |
| `client/src/adapters/localAiGame.test.ts` | Retardo de 400–900 ms, bloqueo del jugador, partida completa, estadísticas, flota revelada al final |
| `client/src/app/App.test.tsx` | Partida completa a través de la UI, bloqueo durante el turno rival, motivo de colocación inválida |

Otras verificaciones:

- `pnpm typecheck` y `pnpm lint`: sin errores.
- `pnpm build`: JS inicial de 96,39 kB gzip (presupuesto: 300 kB).
- Navegador real (Chrome, build de producción): despliegue, fantasma inválido con motivo, despliegue aleatorio, batalla y disparo con respuesta de la IA.

## Errores conocidos

- Corregido en esta fase: la prueba de propiedades de `randomFleet` superaba los 5 s con la suite en paralelo (df5b953).
- Corregido en esta fase: en escritorios de ~1500 px los tableros se apilaban.
- La interfaz es funcional, no la final: sin océano, siluetas, animaciones ni audio (Fase 2).
- En móvil los tableros se apilan; el selector Radar / Mi flota llega en la Fase 2.
- Las fuentes Chakra Petch e IBM Plex Sans no están cargadas todavía (usan fuentes del sistema); se autoalojan en la Fase 2.

## Decisiones aprobadas

- Fase 0 aprobada el 2026-11-04: plan, stack y dirección de arte del prototipo.

## Supuestos (preguntas de PLAN §12 sin respuesta)

- Ubicación `games/battleships/` con repositorio git propio (rama `feat/phase-1-core`).
- TypeScript 6.0.x en lugar de 7.0.
- Audio 100 % procedural.
- E2E en Chromium + WebKit.
- Despliegue previsto en Render (a confirmar en la Fase 6).
- Zustand no se instaló: `useSyncExternalStore` alcanza por ahora.

## Próximos pasos

1. Aprobación de la Fase 1.
2. Fase 2: tokens completos, fuentes autoalojadas, océano en Canvas, siluetas SVG, secuencia de disparo, audio procedural, menú, selector móvil y movimiento reducido.
