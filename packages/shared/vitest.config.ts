import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "shared",
    environment: "node",
    // Property tests and AI simulations run hundreds of placements or games; under the fully
    // parallel suite they can exceed the default 5 s without being slow on their own.
    testTimeout: 30_000,
  },
});
