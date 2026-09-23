import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as esquema from "./esquema";

/**
 * Conexión a Neon.
 *
 * [decisión] Driver WebSocket (`neon-serverless`) y no el HTTP.
 *
 * El HTTP es más rápido para una query suelta, pero no hace transacciones
 * interactivas. Acá hacen falta de verdad en dos lugares: crear usuario +
 * cuenta OAuth, y fundir el carrito anónimo en el del usuario al loguearse. Sin
 * transacción, una falla a la mitad deja un usuario sin cuenta OAuth (no puede
 * volver a entrar) o un carrito duplicado.
 *
 * El costo es abrir un WebSocket por invocación. A la escala de este negocio es
 * irrelevante; la corrección no.
 */

// Node 24 ya trae WebSocket global, así que no hace falta el paquete `ws`.
// Se deja explícito porque si esto corre en un runtime más viejo, falla acá y
// no en una query al azar.
if (typeof WebSocket === "undefined") {
  throw new Error(
    "No hay WebSocket global: se necesita Node >= 22, o instalar `ws` y asignarlo a neonConfig.webSocketConstructor.",
  );
}
neonConfig.webSocketConstructor = WebSocket;

function urlDeConexion(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Copiá .env.example a .env.local y completalo.",
    );
  }
  return url;
}

// Un pool por proceso. En dev, Next recarga los módulos en cada cambio: sin
// esto quedan pools colgados hasta agotar las conexiones de Neon.
const global_ = globalThis as unknown as {
  _pool?: Pool;
  _db?: ReturnType<typeof construir>;
};

function construir() {
  global_._pool ??= new Pool({ connectionString: urlDeConexion() });
  return drizzle(global_._pool, { schema: esquema });
}

/**
 * Se conecta en la primera query, no al importar el módulo.
 *
 * Importa para el build: `next build` importa cada página para prerenderizarla,
 * y varias importan esto en cadena. Si la conexión se armara en el import, el
 * build fallaría entero en cualquier entorno sin DATABASE_URL —incluido CI, que
 * no necesita la base para compilar.
 */
export const db = new Proxy({} as ReturnType<typeof construir>, {
  get(_destino, propiedad, receptor) {
    global_._db ??= construir();
    return Reflect.get(global_._db, propiedad, receptor);
  },
});

export type DB = ReturnType<typeof construir>;
