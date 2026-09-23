import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Tokens de correo contra Postgres real (PGlite).
 *
 * Cubre lo que pidió el plan: expiración, reuso, token de otro usuario, y que
 * un tipo de token no sirva para el otro flujo.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

const { tokenCorreo, usuario } = await import("@/lib/db/esquema");
const {
  crearToken,
  consumirToken,
  invalidarTokensDe,
  purgarTokensVencidos,
  VIDA_RESET_MS,
  VIDA_VERIFICACION_MS,
  _test,
} = await import("./tokens");

const db = entorno.db;

let ana: string;
let beto: string;

beforeAll(async () => {
  const [a] = await db
    .insert(usuario)
    .values({ email: "ana@ejemplo.com" })
    .returning();
  const [b] = await db
    .insert(usuario)
    .values({ email: "beto@ejemplo.com" })
    .returning();
  ana = a.id;
  beto = b.id;
}, 60_000);

beforeEach(async () => {
  await db.delete(tokenCorreo);
});

afterAll(async () => {
  await entorno.cerrar();
});

/** Vence un token a mano, como si hubiera pasado el tiempo. */
async function vencer(token: string) {
  await db
    .update(tokenCorreo)
    .set({ expiraEn: new Date(Date.now() - 1000) })
    .where(eq(tokenCorreo.id, _test.hashDeToken(token)));
}

describe("crearToken", () => {
  it("guarda el HASH, nunca el token", async () => {
    const { token } = await crearToken(ana, "verificacion");

    const filas = await db.select().from(tokenCorreo);
    const ids = filas.map((f) => f.id);

    // Si el token estuviera en claro, filtrar esta tabla daría links usables
    // para verificar cuentas y cambiar contraseñas ajenas.
    expect(ids).not.toContain(token);
    expect(ids).toContain(_test.hashDeToken(token));
  });

  it("emite tokens impredecibles y distintos", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 10; i++) {
      tokens.add((await crearToken(ana, "reset")).token);
    }
    expect(tokens.size).toBe(10);
    // 32 bytes en base64url son 43 caracteres.
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("el de reset vive mucho menos que el de verificación", () => {
    // El de reset cambia la contraseña: cuanto menos vive, menos ventana hay.
    expect(VIDA_RESET_MS).toBeLessThan(VIDA_VERIFICACION_MS);
    expect(VIDA_RESET_MS).toBe(30 * 60 * 1000);
    expect(VIDA_VERIFICACION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("emitir uno nuevo invalida el anterior del mismo tipo", async () => {
    const viejo = await crearToken(ana, "reset");
    const nuevo = await crearToken(ana, "reset");

    // Sin esto, pedir tres resets deja tres llaves vivas a la vez, y la más
    // vieja puede estar en un mail que ya se reenvió.
    expect((await consumirToken(viejo.token, "reset")).ok).toBe(false);
    expect((await consumirToken(nuevo.token, "reset")).ok).toBe(true);
  });

  it("no toca los tokens del otro tipo", async () => {
    const verificacion = await crearToken(ana, "verificacion");
    await crearToken(ana, "reset");

    // Pedir un reset no puede invalidar la verificación pendiente.
    expect((await consumirToken(verificacion.token, "verificacion")).ok).toBe(true);
  });
});

describe("consumirToken", () => {
  it("acepta uno válido y devuelve su usuario", async () => {
    const { token } = await crearToken(ana, "verificacion");
    const r = await consumirToken(token, "verificacion");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.usuario.id).toBe(ana);
  });

  it("rechaza el reuso: sirve una sola vez", async () => {
    const { token } = await crearToken(ana, "reset");

    expect((await consumirToken(token, "reset")).ok).toBe(true);

    const segundo = await consumirToken(token, "reset");
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.motivo).toBe("usado");
  });

  it("rechaza uno vencido", async () => {
    const { token } = await crearToken(ana, "reset");
    await vencer(token);

    const r = await consumirToken(token, "reset");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("vencido");
  });

  it("rechaza uno inventado", async () => {
    const r = await consumirToken("no-soy-un-token-de-verdad", "reset");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("inexistente");
  });

  it("rechaza el string vacío sin tocar la base", async () => {
    const r = await consumirToken("", "reset");
    expect(r.ok).toBe(false);
  });

  it("un token de verificación NO sirve para resetear", async () => {
    const { token } = await crearToken(ana, "verificacion");

    /*
     * Es el chequeo más importante del módulo. El link de verificación vive
     * 24 h y le llega a cualquiera que se registre; si valiera como token de
     * reset, serviría para cambiar la contraseña de la cuenta.
     */
    const r = await consumirToken(token, "reset");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("tipo");
  });

  it("un token rechazado por tipo NO queda consumido", async () => {
    const { token } = await crearToken(ana, "verificacion");

    await consumirToken(token, "reset"); // rechazado
    // El token legítimo tiene que seguir sirviendo para lo suyo: si no,
    // cualquiera podría quemar verificaciones ajenas pidiéndolas como reset.
    expect((await consumirToken(token, "verificacion")).ok).toBe(true);
  });

  it("el token de un usuario devuelve a ESE usuario, no a otro", async () => {
    const deAna = await crearToken(ana, "reset");
    const deBeto = await crearToken(beto, "reset");

    const rA = await consumirToken(deAna.token, "reset");
    const rB = await consumirToken(deBeto.token, "reset");

    expect(rA.ok && rA.usuario.id).toBe(ana);
    expect(rB.ok && rB.usuario.id).toBe(beto);
  });

  it("dos usos simultáneos: gana uno solo", async () => {
    const { token } = await crearToken(ana, "reset");

    // Sin el UPDATE condicional, los dos pasarían la verificación antes de que
    // cualquiera marcara el token como usado.
    const [a, b] = await Promise.all([
      consumirToken(token, "reset"),
      consumirToken(token, "reset"),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe("invalidarTokensDe", () => {
  it("quema los del tipo pedido y deja los del otro", async () => {
    const reset = await crearToken(ana, "reset");
    const verif = await crearToken(ana, "verificacion");

    await invalidarTokensDe(ana, "reset");

    expect((await consumirToken(reset.token, "reset")).ok).toBe(false);
    expect((await consumirToken(verif.token, "verificacion")).ok).toBe(true);
  });

  it("no toca los de otro usuario", async () => {
    const deAna = await crearToken(ana, "reset");
    const deBeto = await crearToken(beto, "reset");

    await invalidarTokensDe(ana, "reset");

    expect((await consumirToken(deAna.token, "reset")).ok).toBe(false);
    expect((await consumirToken(deBeto.token, "reset")).ok).toBe(true);
  });
});

describe("purgarTokensVencidos", () => {
  it("deja los vencidos hace poco y borra los viejos", async () => {
    const reciente = await crearToken(ana, "reset");
    await vencer(reciente.token);

    await purgarTokensVencidos();
    // Margen de una semana: sirve para diagnosticar un link que alguien
    // reporta como roto.
    expect(await db.select().from(tokenCorreo)).toHaveLength(1);

    await db
      .update(tokenCorreo)
      .set({ expiraEn: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
      .where(eq(tokenCorreo.id, _test.hashDeToken(reciente.token)));

    await purgarTokensVencidos();
    expect(await db.select().from(tokenCorreo)).toHaveLength(0);
  });

  it("borrar el usuario borra sus tokens (ON DELETE CASCADE)", async () => {
    const [temp] = await db
      .insert(usuario)
      .values({ email: "temporal@ejemplo.com" })
      .returning();

    await crearToken(temp.id, "reset");
    await db.delete(usuario).where(eq(usuario.id, temp.id));

    expect(await db.select().from(tokenCorreo)).toHaveLength(0);
  });
});
