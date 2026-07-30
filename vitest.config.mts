import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Vite resolves the `@/*` alias from tsconfig.json natively; the
  // vite-tsconfig-paths plugin is deprecated in favour of this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      "prisma/**/*.test.ts",
    ],
  },
});
