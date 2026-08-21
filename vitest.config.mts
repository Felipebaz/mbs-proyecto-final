import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** .mts para que Vite lo cargue como ESM y no avise por __dirname. */
const raiz = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    // El alias @/ de tsconfig.json no lo lee Vitest solo: hay que repetirlo.
    alias: { "@": raiz },
  },
  test: {
    // Node y no jsdom: acá no se testea ni un componente, solo lógica pura.
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
