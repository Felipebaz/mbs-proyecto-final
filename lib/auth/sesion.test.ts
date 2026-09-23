import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Ciclo de vida de la sesión contra Postgres real (PGlite).
 *
 * Se mockea sólo el cliente de base y `next/headers`. La lógica de sesión —que
 * es lo que se quiere probar— corre entera y sin tocar.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();

vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { sesion, usuario } = await import("@/lib/db/esquema");
const {
  crearSesion,
  validarToken,
  invalidarSesion,
  invalidarSesionesDe,
  purgarSesionesVencidas,
  _test,
} = await import("./sesion");

const db = entorno.db;

let usuarioId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(usuario)
    .values({ email: "sesiones@ejemplo.com" })
    .returning();
  usuarioId = u.id;
}, 60_000);

afterAll(async () => {
  await entorno.cerrar();
});

describe("crearSesion", () => {
  it("guarda el HASH del token, nunca el token", async () => {
    const { token } = await crearSesion(usuarioId);

    const todas = await db.select().from(sesion);
    const ids = todas.map((s) => s.id);

    /*
     * Esto es lo que salva si se filtra la base: el atacante se lleva hashes
     * sha256, que no se pueden revertir a un token que el servidor acepte.
     * Si el token estuviera en claro, cada fila sería una sesión usable.
     */
    expect(ids).not.toContain(token);
    expect(ids).toContain(_test.hashDeToken(token));
  });

  it("emite tokens distintos e impredecibles", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) {
      tokens.add((await crearSesion(usuarioId)).token);
    }

    expect(tokens.size).toBe(20);
    // 32 bytes en base64url son 43 caracteres. Menos que eso es adivinable.
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("nunca reusa una sesión: cada login emite una nueva", async () => {
    // Es la defensa contra session fixation. Si se reusara el id, quien logre
    // fijarle una cookie a la víctima se queda con su sesión al entrar ella.
    const a = await crearSesion(usuarioId);
    const b = await crearSesion(usuarioId);
    expect(a.token).not.toBe(b.token);
  });
});

describe("validarToken", () => {
  it("acepta un token válido y devuelve el usuario", async () => {
    const { token } = await crearSesion(usuarioId);
    const v = await validarToken(token);

    expect(v).not.toBeNull();
    expect(v!.usuario.id).toBe(usuarioId);
  });

  it("rechaza null, vacío y un token inventado", async () => {
    expect(await validarToken(null)).toBeNull();
    expect(await validarToken("")).toBeNull();
    expect(await validarToken("no-soy-un-token")).toBeNull();
  });

  it("rechaza un token vencido y borra la fila", async () => {
    const { token } = await crearSesion(usuarioId);
    const id = _test.hashDeToken(token);

    // Se vence a mano, como si hubiera pasado el tiempo.
    await db
      .update(sesion)
      .set({ expiraEn: new Date(Date.now() - 1000) })
      .where(eq(sesion.id, id));

    expect(await validarToken(token)).toBeNull();

    // No basta con rechazarla: si quedara, la tabla crece con basura.
    const quedan = await db.select().from(sesion).where(eq(sesion.id, id));
    expect(quedan).toHaveLength(0);
  });

  it("la cookie no manda: vence contra la base", async () => {
    const { token } = await crearSesion(usuarioId);
    await db
      .update(sesion)
      .set({ expiraEn: new Date(Date.now() - 1) })
      .where(eq(sesion.id, _test.hashDeToken(token)));

    // El navegador seguiría mandando la cookie feliz. La autoridad es la base.
    expect(await validarToken(token)).toBeNull();
  });

  it("renueva el vencimiento pasada la mitad de la vida", async () => {
    const { token } = await crearSesion(usuarioId);
    const id = _test.hashDeToken(token);

    // Se la pone a punto de vencer: el usuario estuvo activo todo este tiempo.
    const casiVencida = new Date(Date.now() + 60_000);
    await db.update(sesion).set({ expiraEn: casiVencida }).where(eq(sesion.id, id));

    const v = await validarToken(token);

    expect(v!.renovada).toBe(true);
    expect(v!.expiraEn.getTime()).toBeGreaterThan(casiVencida.getTime());
  });

  it("no renueva una sesión recién creada", async () => {
    const { token } = await crearSesion(usuarioId);
    const v = await validarToken(token);

    // Sin esto habría un UPDATE por request para nada.
    expect(v!.renovada).toBe(false);
  });
});

describe("invalidar", () => {
  it("invalidarSesion deja el token inservible", async () => {
    const { token } = await crearSesion(usuarioId);
    const v = await validarToken(token);

    await invalidarSesion(v!.sesionId);

    expect(await validarToken(token)).toBeNull();
  });

  it("invalidarSesionesDe cierra TODAS las del usuario", async () => {
    const otros = await db
      .insert(usuario)
      .values({ email: "otro@ejemplo.com" })
      .returning();

    const a = await crearSesion(usuarioId);
    const b = await crearSesion(usuarioId);
    const ajena = await crearSesion(otros[0].id);

    await invalidarSesionesDe(usuarioId);

    /*
     * Es lo que hace útil al cambio de contraseña: si alguien te robó la
     * sesión, cambiarla tiene que echarlo. Si sólo se cerrara la sesión actual,
     * el atacante seguiría adentro.
     */
    expect(await validarToken(a.token)).toBeNull();
    expect(await validarToken(b.token)).toBeNull();

    // Y no puede tocar las de otra persona.
    expect(await validarToken(ajena.token)).not.toBeNull();
  });
});

describe("purgarSesionesVencidas", () => {
  it("borra las vencidas y deja las vivas", async () => {
    const viva = await crearSesion(usuarioId);
    const muerta = await crearSesion(usuarioId);

    await db
      .update(sesion)
      .set({ expiraEn: new Date(Date.now() - 1000) })
      .where(eq(sesion.id, _test.hashDeToken(muerta.token)));

    await purgarSesionesVencidas();

    expect(await validarToken(muerta.token)).toBeNull();
    expect(await validarToken(viva.token)).not.toBeNull();
  });
});
