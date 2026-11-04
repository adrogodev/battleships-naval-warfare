# PROJECT_STATUS — Battleships: Naval Warfare

**Fase actual: 0 (Plan) — entregada, esperando aprobación.** No hay código de implementación; solo el plan y el prototipo visual estático.

## Retomar en otra sesión

1. Leer `docs/PLAN.md` (plan completo y decisiones) y este archivo.
2. Abrir `prototype/battle.html` en un navegador.
3. Si la Fase 0 está aprobada, empezar la Fase 1 según `docs/PLAN.md` §11.

## Objetivo

Juego de batalla naval para navegador, completo y real: modo contra IA (tres dificultades medibles) y multijugador online con servidor autoritativo, con identidad visual de consola táctica naval (CIC) y océano animado.

## Arquitectura y decisiones (propuestas, pendientes de aprobación)

| Tema | Decisión |
|---|---|
| Estructura | Monorepo pnpm: `packages/shared` (dominio puro), `apps/client`, `apps/server`, `e2e` |
| Dominio | Máquina de estados `lobby → placement → battle → finished`, función pura `reduce`, RNG con semilla inyectable |
| Cliente | React 19 + Vite 8, tableros en DOM/CSS Grid + SVG, océano en Canvas 2D, audio con Web Audio procedural |
| Servidor | Node 24 + Socket.IO 4.8, salas en memoria, Zod en el borde, proyección `viewFor(playerId)` |
| Lenguaje | TypeScript 6.0.x estricto (no 7.0, por estabilidad del tooling) |
| Pruebas | Vitest 5 + fast-check 4 + Playwright 1.6x |

## Funcionalidades

| Estado | Elemento |
|---|---|
| Hecho | Inspección del entorno |
| Hecho | Plan de la Fase 0 (`docs/PLAN.md`) |
| Hecho | Prototipo visual estático (`prototype/battle.html`) |
| Pendiente | Fases 1–6 |

## Pruebas y resultados

No hay pruebas automatizadas todavía (sin código de implementación). Verificaciones del prototipo:

| Comando | Resultado observado |
|---|---|
| `chrome --headless=new --window-size=1440,1300 --screenshot` | Renderiza ambos tableros, paneles, registro, paleta, estados y tipografía |
| Primera captura | Defecto: la silueta hundida del radar no tomaba el color `sunk` (el CSS no atraviesa `<use>`). Corregido con variables CSS heredables |
| `chrome --headless=new --window-size=390,900 --dump-dom` (sonda de viewport) | `VW=500`: headless Chrome no baja de 500 px, la captura móvil sale recortada y no sirve como evidencia |
| Sonda con iframe de 375 px | `SW=360 CW=360`: sin desplazamiento horizontal en móvil |

## Errores conocidos

- El prototipo carga fuentes desde Google Fonts; en producción se autoalojan.
- La captura móvil con headless Chrome no es fiable (ancho mínimo 500 px); en la Fase 2 se usará la emulación de dispositivos de Playwright.

## Decisiones aprobadas

Ninguna todavía.

## Supuestos

- El proyecto vive en `games/battleships/`, independiente de los otros juegos de la carpeta.
- Audio 100 % procedural salvo que se decida lo contrario.
- E2E en Chromium + WebKit.
- Despliegue previsto en Render (a confirmar en la Fase 6).

## Próximos pasos

1. Aprobación (o correcciones) de la Fase 0 y respuesta a las preguntas de `docs/PLAN.md` §12.
2. Fase 1: `git init`, scaffolding del monorepo, dominio con pruebas (incluida la de propiedades), IA Fácil y UI sencilla jugable.

## Comandos

```bash
# Ver el prototipo (Windows)
start prototype/battle.html
```
