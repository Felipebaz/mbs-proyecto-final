import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** .mts para que Vite lo cargue como ESM y no avise por __dirname. */
const raiz = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // El alias @/ de tsconfig.json no lo lee Vitest solo: hay que repetirlo.
      "@": raiz,

      // `server-only` es un paquete con dos builds: el de cliente tira a
      // propósito para que un import desde un Client Component falle el build.
      // Vitest resuelve ese, así que acá se apunta al de servidor, que es un
      // archivo vacío. Sin esto no se puede testear nada que lo importe.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // Node y no jsdom: acá no se testea ni un componente, solo lógica pura.
    environment: "node",
    include: ["**/*.test.ts"],
    // Argon2 está configurado para tardar; el default de 5s queda corto cuando
    // un test hace varios hashes seguidos.
    testTimeout: 20_000,
  },
});
