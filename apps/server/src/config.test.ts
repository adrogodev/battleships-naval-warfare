import { describe, expect, it } from "vitest";
import { DEFAULT_CORS_ORIGINS, loadConfig } from "./config";

describe("loadConfig", () => {
  it("uses the defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      port: 3001,
      reconnectWindowMs: 60_000,
      roomIdleMs: 15 * 60_000,
      corsOrigins: DEFAULT_CORS_ORIGINS,
    });
    expect(DEFAULT_CORS_ORIGINS).toContain("http://localhost:5173");
    expect(DEFAULT_CORS_ORIGINS).toContain("http://127.0.0.1:4173");
  });

  it("reads every variable from the environment", () => {
    expect(
      loadConfig({
        PORT: "4000",
        RECONNECT_WINDOW_SEC: "30",
        ROOM_IDLE_MIN: "5",
        CORS_ORIGINS: " https://a.example , https://b.example ,",
      }),
    ).toEqual({
      port: 4000,
      reconnectWindowMs: 30_000,
      roomIdleMs: 5 * 60_000,
      corsOrigins: ["https://a.example", "https://b.example"],
    });
  });

  it("treats empty values as unset", () => {
    expect(loadConfig({ PORT: "", CORS_ORIGINS: "" }).port).toBe(3001);
  });

  it("rejects invalid values", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ RECONNECT_WINDOW_SEC: "-1" })).toThrow(/RECONNECT_WINDOW_SEC/);
    expect(() => loadConfig({ ROOM_IDLE_MIN: "0" })).toThrow(/ROOM_IDLE_MIN/);
  });
});
