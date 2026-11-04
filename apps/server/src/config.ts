import { z } from "zod";

/** Vite dev server (5173) and preview (4173), on both localhost spellings. */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export interface ServerConfig {
  readonly port: number;
  readonly reconnectWindowMs: number;
  readonly roomIdleMs: number;
  readonly corsOrigins: readonly string[];
}

/** Empty variables count as unset, so `PORT=` falls back to the default. */
const unsetIfEmpty = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const integer = (min: number, max: number, fallback: number) =>
  z.preprocess(unsetIfEmpty, z.coerce.number().int().min(min).max(max).default(fallback));

const envSchema = z.object({
  PORT: integer(0, 65_535, 3001),
  RECONNECT_WINDOW_SEC: integer(1, 3600, 60),
  ROOM_IDLE_MIN: integer(1, 24 * 60, 15),
  CORS_ORIGINS: z.preprocess(unsetIfEmpty, z.string().optional()),
});

/** Reads and validates the server environment. Throws with the offending variable names. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid server environment: ${problems.join("; ")}`);
  }
  const { PORT, RECONNECT_WINDOW_SEC, ROOM_IDLE_MIN, CORS_ORIGINS } = parsed.data;
  const origins = (CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return {
    port: PORT,
    reconnectWindowMs: RECONNECT_WINDOW_SEC * 1000,
    roomIdleMs: ROOM_IDLE_MIN * 60_000,
    corsOrigins: origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS,
  };
}
