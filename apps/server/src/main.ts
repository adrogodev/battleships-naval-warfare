import { loadConfig } from "./config";
import { createGameServer } from "./gameServer";

const config = loadConfig();
const server = createGameServer({
  reconnectWindowMs: config.reconnectWindowMs,
  roomIdleMs: config.roomIdleMs,
  corsOrigins: config.corsOrigins,
});
const port = await server.listen(config.port);
console.log(`[server] Battleships server listening on port ${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
