import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [tsconfigPaths()],
    resolve: {
        alias: {
            // Next.js provides this module at build time; unit tests need a stub.
            "server-only": path.join(rootDir, "tests/stubs/server-only.ts"),
        },
    },
    test: {
        environment: "node",
        clearMocks: true,
        restoreMocks: true,
        unstubEnvs: true,
        // Keep coverage focused on our backend/auth code. Expand later as we add DB-backed features.
        coverage: {
            provider: "v8",
            include: ["lib/auth/**/*.ts", "app/**/route.ts"],
            exclude: ["**/*.d.ts"],
        },
    },
});
