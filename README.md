# Battleships: Naval Warfare

Batalla naval para el navegador con estética de centro de información de combate: océano vivo, radar con barrido, explosiones y audio generado en tiempo real. Se juega contra tres comandantes de IA con estrategias medibles o contra otra persona en línea, con un servidor que es la única autoridad de la partida.

![Batalla contra la IA: radar enemigo a la izquierda, tu flota a la derecha y un disparo en curso](docs/screenshots/battle.jpg)

## Inicio rápido

Requisitos: Node 24 o superior y pnpm 10.

```bash
pnpm install
pnpm dev                                   # cliente en http://localhost:5173
```

Para jugar en línea, levanta también el servidor en otra terminal y abre el juego en dos pestañas:

```bash
pnpm --filter @battleships/server start    # servidor en el puerto 3001
```

1. Pulsa **Pulsa para comenzar** (activa el audio) y elige **Multijugador**.
2. Crea una sala privada y comparte el código o el enlace de invitación.
3. En la otra pestaña, abre el enlace, escribe tu alias y pulsa **Unirse**.

## Qué incluye

| Área | Detalle |
|---|---|
| Contra la IA | Tres comandantes: Fácil dispara al azar, Normal barre en damero y remata impactos, Difícil usa un mapa de probabilidad. Promedian 95,5, 52,6 y 38,5 disparos para ganar en 1.000 partidas simuladas ([métricas](docs/AI_METRICS.md)). |
| Multijugador | Servidor autoritativo con Socket.IO: salas con código de 6 caracteres, temporizador de turno opcional, reacciones rápidas, reconexión con la partida congelada, reclamo de victoria y revancha. |
| Progresión | Rango de Grumete a Almirante de Flota, estadísticas con mapa de calor y 10 desafíos con insignia. Todo es cosmético o estadístico: nunca cambia el equilibrio de la partida. |
| Tutorial | "Cómo jugar" interactivo de unos 60 segundos sobre un tablero de práctica. |
| Accesibilidad | Tablero navegable con flechas, disparo con Enter o Espacio, foco visible, anuncios `aria-live`, subtítulos para cada sonido, movimiento reducido, alto contraste, modo daltonismo y texto escalable hasta el 200 %. |
| Presentación | Océano en Canvas 2D que se pausa con la pestaña oculta y baja de calidad si caen los fotogramas, partículas con un pool de 150 y audio 100 % procedural con Web Audio. |
| Persistencia | `localStorage` con esquema versionado y migraciones; se borra desde Configuración. |

La interfaz está en español y los textos están centralizados en `apps/client/src/i18n/` para añadir otros idiomas.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Cliente en modo desarrollo (Vite) |
| `pnpm --filter @battleships/server start` | Servidor multijugador |
| `pnpm build` | Build de producción |
| `pnpm test` | Pruebas unitarias y de integración (Vitest) |
| `pnpm test:e2e` | E2E con Playwright en Chromium y WebKit; levanta el servidor y un build de producción |
| `pnpm typecheck` | TypeScript estricto en todos los paquetes |
| `pnpm lint` / `pnpm format` | Biome: revisar o corregir lint y formato |
| `pnpm simulate` | 1.000 partidas por dificultad; reescribe `docs/AI_METRICS.md` |
| `pnpm screenshots` | Regenera la imagen de este README (necesita `vite preview` en el puerto 4173) |

## Configuración

Servidor (`apps/server/src/config.ts`), todas opcionales:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP y WebSocket |
| `RECONNECT_WINDOW_SEC` | `60` | Segundos que la partida espera a un jugador desconectado |
| `ROOM_IDLE_MIN` | `15` | Minutos hasta borrar una sala inactiva |
| `CORS_ORIGINS` | `localhost` y `127.0.0.1` en los puertos 5173 y 4173 | Lista separada por comas de orígenes permitidos |

Cliente: `VITE_SERVER_URL` apunta al servidor; si no se define, usa el mismo host de la página en el puerto 3001.

## Arquitectura

```text
packages/shared   Dominio puro: reglas, máquina de estados, IA y protocolo (Zod)
apps/client       React 19 + Vite: pantallas, tableros, audio, efectos y progresión
apps/server       Node + Socket.IO: salas, validación y reconexión
e2e/              Playwright: partidas completas en uno y dos navegadores
```

- **Un solo dominio.** `reduce(estado, acción)` es puro y lo usan el cliente (contra la IA), el servidor y la simulación.
- **El servidor decide.** Valida esquema, sala, fase, turno y flota; cada jugador solo recibe su vista (`viewFor`), nunca la flota rival.
- **La IA juega limpio.** Solo ve el tablero público del rival (`publicBoardView`).
- **Presentación separada del estado.** La partida se resuelve al instante; `ShotQueue` decide cuándo cada resultado se ve, suena y se anuncia.

El protocolo está en [docs/PROTOCOL.md](docs/PROTOCOL.md) y el plan original en [docs/PLAN.md](docs/PLAN.md).

## Pruebas

- **Vitest:** 399 pruebas del dominio, la IA, el protocolo, el servidor con clientes Socket.IO reales y las pantallas del cliente.
- **Playwright (Chromium y WebKit):** partida completa contra la IA; dos navegadores jugando en línea con revancha; recarga en mitad de la batalla; solo teclado con foco visible; vista móvil; texto al 200 %; ida y vuelta de un disparo por debajo de 150 ms.

## Estado

Fases 1 a 5 terminadas; el despliegue público es la Fase 6. El estado detallado, los presupuestos de rendimiento medidos y las desviaciones conocidas están en [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Créditos

Audio generado en tiempo real, sin muestras grabadas. Fuentes Chakra Petch e IBM Plex Sans (SIL Open Font License 1.1). Detalle en [CREDITS.md](CREDITS.md).
