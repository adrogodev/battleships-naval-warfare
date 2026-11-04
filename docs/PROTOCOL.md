# Protocolo multijugador

Protocolo Socket.IO entre el cliente y el servidor autoritativo (`apps/server`). Los tipos y esquemas viven en `packages/shared/src/protocol/protocol.ts` y se importan desde `@battleships/shared`.

## Principios

- **El servidor es la única autoridad.** El cliente solo envía intenciones ("disparar a C-7"). El servidor valida, aplica la acción con el `reduce` del dominio y comunica el resultado.
- **Proyección por jugador.** Todo estado enviado a un jugador (`room:state`) se construye con `viewFor(state, seat)`. Nunca contiene la posición de barcos rivales no hundidos. La flota rival completa (`revealedOpponentFleet`) solo se envía cuando la partida ha terminado.
- **Reglas fijas.** El servidor usa `DEFAULT_RULES`. El creador de la sala solo elige `turnTimerSec` (15–120 s, o sin temporizador).
- **Campos desconocidos se ignoran.** Los esquemas Zod eliminan cualquier campo extra: un cliente que envíe resultados, asientos, ganador o datos del rival no altera nada.

## Respuestas (ack)

Cada evento cliente → servidor se responde **siempre** mediante su callback de ack:

```ts
type Ack = { ok: true } | { ok: false; error: ErrorCode; message?: string };
type JoinAck = { ok: true; code: string; token: string; seat: 0 | 1 } | { ok: false; error: ErrorCode; message?: string };
```

El ack llega antes que los eventos que la acción provoca (`shot:result`, `room:state`, ...). Un fallo interno inesperado responde `SERVER_ERROR`; un manejador nunca deja una petición sin respuesta.

## Validación (en este orden)

1. **Límite de frecuencia** por conexión → `RATE_LIMITED`.
2. **Esquema** del mensaje → `INVALID_PAYLOAD`.
3. **Pertenencia a la sala** (el socket ocupa un asiento) → `NOT_IN_ROOM`.
4. **Idempotencia**: un `actionId` repetido devuelve la respuesta guardada sin repetir el efecto.
5. **Fase** → `WRONG_PHASE`; **turno** → `NOT_YOUR_TURN`; **coordenadas** → `OUT_OF_BOUNDS`; **casilla ya disparada** → `ALREADY_FIRED`; **flota** según `GameRules` → `INVALID_FLEET`. Estas comprobaciones las decide el dominio y el servidor traduce sus errores.

## Eventos cliente → servidor

| Evento | Payload | Ack | Errores posibles |
|---|---|---|---|
| `room:create` | `{ alias, turnTimerSec?: number \| null }` | `JoinAck` (asiento 0) | `INVALID_PAYLOAD`, `ALREADY_IN_ROOM` |
| `room:join` | `{ code, alias }` (asiento nuevo) o `{ token }` (reconexión) | `JoinAck` | `ROOM_NOT_FOUND`, `ROOM_FULL`, `INVALID_TOKEN`, `ALREADY_IN_ROOM` |
| `room:ready` | `{ actionId }` | `Ack` | `NOT_IN_ROOM`, `WRONG_PHASE` |
| `fleet:submit` | `{ actionId, fleet: Placement[] }` | `Ack` | `WRONG_PHASE`, `INVALID_FLEET` (`message` = motivo del dominio), `ALREADY_SUBMITTED` |
| `shot:fire` | `{ actionId, coord: { col, row } }` | `Ack` | `WRONG_PHASE`, `GAME_FROZEN`, `NOT_YOUR_TURN`, `OUT_OF_BOUNDS`, `ALREADY_FIRED` |
| `reaction:send` | `{ actionId, reaction }` (`good_shot`, `close`, `well_played`, `ouch`) | `Ack` | `INVALID_PAYLOAD` si la reacción no está predefinida |
| `room:leave` | `{ actionId }` | `Ack` | `NOT_IN_ROOM` |
| `rematch:request` | `{ actionId }` | `Ack` | `WRONG_PHASE`, `ALREADY_REQUESTED`, `OPPONENT_GONE` |
| `victory:claim` | `{ actionId }` | `Ack` | `CANNOT_CLAIM` |

- Código de sala: 6 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin O/0 ni I/1). Se acepta en minúsculas y con espacios alrededor.
- Alias: 2–16 caracteres, letras, números, espacio, `_` y `-`.
- `actionId`: 8–64 caracteres `[A-Za-z0-9_-]`, único por intención (por ejemplo `crypto.randomUUID()`).
- Todos los eventos con `actionId` requieren ocupar un asiento; `room:create` y `room:join` no.

## Eventos servidor → cliente

| Evento | Payload | Cuándo |
|---|---|---|
| `room:state` | `RoomState` (proyección del jugador) | Tras cualquier cambio de la sala; a cada jugador el suyo |
| `shot:result` | `ShotRecord { id, seat, coord, result, shipId? }` | Tras cada disparo válido, a ambos. `shipId` solo cuando `result` es `sunk`. `id` es incremental por sala |
| `turn:changed` | `{ turn, deadline: number \| null }` | Al empezar la batalla y en cada cambio de turno (disparo o temporizador agotado) |
| `game:over` | `{ winner, reason: "fleet_destroyed" \| "forfeit" \| "abandoned" }` | Al terminar la partida |
| `player:disconnected` | `{ seat, alias, deadline }` | Al rival, cuando un jugador pierde la conexión |
| `player:reconnected` | `{ seat }` | Al rival, cuando el jugador vuelve |
| `reaction:received` | `{ seat, reaction }` | A ambos jugadores |
| `error` | `{ code, message? }` | `SESSION_REPLACED` (otra pestaña tomó el asiento) o `ROOM_CLOSED` (sala eliminada por inactividad) |

### `RoomState`

| Campo | Significado |
|---|---|
| `code`, `you` | Sala y asiento propio |
| `players` | Jugadores con `alias`, `connected`, `ready`, `fleetSubmitted`, `rematchRequested` |
| `view` | `viewFor(state, you)`; `null` mientras la sala de espera no ha empezado |
| `log` | Historial público de disparos (`ShotRecord[]`) |
| `turnTimerSec`, `turnDeadline` | Temporizador elegido y fin del turno actual en ms epoch (`null` sin temporizador o en pausa) |
| `reconnect` | `{ seat, deadline }` del rival desconectado, o `null` |
| `canClaimVictory` | `true` cuando la ventana de reconexión del rival expiró durante colocación o batalla |
| `endReason` | Motivo del final o `null` |
| `revealedOpponentFleet` | Flota rival, solo con la partida terminada |

## Flujo de una sala

1. **Crear**: `room:create` → asiento 0 y token de sesión.
2. **Unirse**: `room:join { code, alias }` → primer asiento libre. Una sala con partida empezada responde `ROOM_FULL`.
3. **Sala de espera**: cada jugador envía `room:ready`. Cuando ambos asientos están ocupados y listos, empieza la colocación.
4. **Colocación**: `fleet:submit` privado. Cuando ambos han enviado una flota válida empieza la batalla; abre el asiento 0 (en revancha, quien perdió).
5. **Batalla**: `shot:fire` en tu turno. Cada disparo emite `shot:result`, `turn:changed` (si cambia el turno) y `room:state` a cada jugador.
6. **Final**: `game:over` y `room:state` con `revealedOpponentFleet`.
7. **Revancha**: si ambos envían `rematch:request`, nueva colocación en la misma sala con los mismos alias; el historial se vacía.

## Garantías

### Idempotencia
Cada jugador guarda las últimas 64 respuestas por `actionId`. Repetir un `actionId` devuelve exactamente la misma respuesta (éxito o error) y no produce ningún efecto ni evento nuevo.

### Límites
- **Frecuencia**: como máximo 10 mensajes por conexión en cualquier ventana de 1 s (ventana deslizante). Los mensajes rechazados responden `RATE_LIMITED`, no cuentan en la ventana y no se procesan.
- **Tamaño**: `maxHttpBufferSize` = 4096 bytes. Un mensaje mayor cierra la conexión (comportamiento de Socket.IO); el cliente puede reconectar con su token.

### Temporizador de turno
Opcional (`turnTimerSec` del creador). Al agotarse, el turno pasa al rival sin disparo (acción `timeout` del dominio) y se emite `turn:changed`. El plazo se reinicia en cada disparo válido.

### Identidad y reconexión
- El token de sesión es opaco (24 bytes aleatorios en base64url). El cliente lo guarda en `sessionStorage` y lo envía con `room:join { token }` para recuperar el asiento y el estado.
- **Desconexión**: el jugador queda desconectado, se emite `player:disconnected` al rival con `deadline` = ahora + ventana de reconexión, y la partida queda **congelada**: `shot:fire` responde `GAME_FROZEN` y el temporizador de turno se pausa conservando el tiempo restante (`turnDeadline: null`). La colocación de flota sigue permitida porque es privada y no tiene tiempo.
- **Reconexión** (dentro o fuera de la ventana, mientras la sala exista y el jugador no la haya abandonado con `room:leave`; si el rival ya reclamó la victoria, el jugador vuelve a la pantalla de resultados): recupera el asiento, emite `player:reconnected`, reanuda el temporizador con el tiempo restante y reenvía `room:state`.
- **Expiración**: no hay victoria automática. El jugador presente recibe `canClaimVictory: true` y puede enviar `victory:claim` (fin con `reason: "abandoned"`) o seguir esperando. Antes de la expiración, `victory:claim` responde `CANNOT_CLAIM`. En la sala de espera, la expiración libera el asiento.
- **Dos pestañas con el mismo token**: la conexión más reciente se queda el asiento; la anterior recibe `error { code: "SESSION_REPLACED" }` y se desconecta. El rival no ve ninguna desconexión.

### Abandono
- En la sala de espera, `room:leave` libera el asiento.
- En colocación o batalla, `room:leave` es una rendición: `game:over` con `reason: "forfeit"` a favor del rival.
- Tras la partida, `room:leave` marca al jugador como ido. Su token deja de valer y la revancha del rival responde `OPPONENT_GONE`. También responde `OPPONENT_GONE` si el rival está desconectado en ese momento.

### Limpieza
Una sala se elimina, con todos sus timers, cuando:
- no hay actividad durante `ROOM_IDLE_MIN` (los jugadores conectados reciben `error { code: "ROOM_CLOSED" }`), o
- ningún jugador está conectado ni dentro de su ventana de reconexión (ambos se fueron o expiraron).

## Variables de entorno

| Variable | Defecto | Descripción |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP/Socket.IO |
| `RECONNECT_WINDOW_SEC` | `60` | Ventana de reconexión en segundos |
| `ROOM_IDLE_MIN` | `15` | Minutos sin actividad antes de eliminar una sala |
| `CORS_ORIGINS` | `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173` | Orígenes permitidos, separados por comas |

Arranque: `pnpm --filter @battleships/server start`. Comprobación de salud: `GET /health` → `200 ok`.
