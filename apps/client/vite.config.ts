import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "client",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Screen tests render full boards in jsdom; under the fully parallel suite on a loaded
    // machine they can exceed the default 5 s without being slow on their own.
    testTimeout: 30_000,
  },
});
