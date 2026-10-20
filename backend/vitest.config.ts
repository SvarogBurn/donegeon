import { defineConfig } from "vitest/config";

// `npm test`: the unit tests, which need nothing running. `npm run test:int`: the routes against the database
// (`docker compose up -d`), one file at a time.
const routes = process.env.INT === "1";

export default defineConfig({
  test: {
    include: routes ? ["src/**/*.int.test.ts"] : ["src/**/*.test.ts"],
    exclude: routes ? [] : ["src/**/*.int.test.ts"],
    fileParallelism: false,
  },
});
