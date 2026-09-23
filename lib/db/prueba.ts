import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as esquema from "./esquema";

/**
 * Postgres real, en proceso, sólo para tests.
 *
 * PGlite es Postgres compilado a WASM: corre el SQL de verdad, con los CHECK y
 * las foreign keys. Un mock del cliente de base no probaría nada de eso —
 * pasaría igual con un esquema roto.
 *
 * Aplica las mismas migraciones que van a producción, así que si una migración
 * no corre, el test falla acá y no en el deploy.
 */
export async function baseDePrueba() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema: esquema });

  const dir = join(process.cwd(), "lib/db/migraciones");
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const archivo of archivos) {
    const sql = readFileSync(join(dir, archivo), "utf8");
    // Drizzle separa las sentencias con este marcador.
    for (const sentencia of sql.split("--> statement-breakpoint")) {
      const limpia = sentencia.trim();
      if (limpia) await pg.exec(limpia);
    }
  }

  return { db, pg, cerrar: () => pg.close() };
}
