/**
 * Promueve o degrada a un usuario. Se corre a mano contra la base.
 *
 *   npm run admin:promover -- correo@ejemplo.com
 *   npm run admin:promover -- correo@ejemplo.com --degradar
 *
 * [decisión] Es un script y no una pantalla.
 *
 * El rol es la llave del panel: pedidos, costos, exportar datos. Si se pudiera
 * cambiar desde la app, esa pantalla sería el blanco más valioso del sistema —
 * una falla de autorización ahí te entrega todo. Como script, promover exige
 * acceso a las credenciales de producción, que es una barrera que no depende
 * de que el código esté bien.
 *
 * Por eso además NINGÚN insert ni update de la app toca la columna `rol`. Hay
 * un test que lo verifica.
 *
 * Corre con el type stripping nativo de Node 24 y `--env-file`, sin tsx ni
 * ts-node: son dependencias que sólo servirían para esto.
 */

import { eq } from "drizzle-orm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { usuario } from "../lib/db/esquema.ts";

function salir(mensaje: string): never {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const correo = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();
const degradar = args.includes("--degradar");

if (!correo) {
  salir(
    "Falta el correo.\n\n" +
      "  npm run admin:promover -- correo@ejemplo.com\n" +
      "  npm run admin:promover -- correo@ejemplo.com --degradar",
  );
}

if (!process.env.DATABASE_URL) {
  salir("Falta DATABASE_URL. Corré con .env.local cargado, o exportala.");
}

neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const rolNuevo = degradar ? "cliente" : "admin";

try {
  const [actualizado] = await db
    .update(usuario)
    .set({ rol: rolNuevo })
    .where(eq(usuario.email, correo))
    .returning({
      email: usuario.email,
      rol: usuario.rol,
      verificado: usuario.emailVerificado,
    });

  if (!actualizado) {
    // Acá sí conviene ser explícito: lo corre alguien con acceso a la base, no
    // un desconocido por internet. Esconder si la cuenta existe sólo lograría
    // que se promueva un correo mal tipeado creyendo que funcionó.
    salir(`No hay ninguna cuenta con el correo "${correo}".`);
  }

  console.info(`\n✓ ${actualizado.email} ahora es "${actualizado.rol}".`);

  if (!actualizado.verificado && rolNuevo === "admin") {
    console.warn(
      "\n⚠ Esa cuenta todavía no verificó su correo.\n" +
        "  Puede entrar al panel igual, pero no va a poder recuperar la\n" +
        "  contraseña hasta confirmar la dirección.",
    );
  }
  console.info("");
} finally {
  await pool.end();
}
