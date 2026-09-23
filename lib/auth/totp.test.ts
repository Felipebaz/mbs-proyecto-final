import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as OTPAuth from "otpauth";

/**
 * Segundo factor contra Postgres real (PGlite).
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

vi.stubEnv("CLAVE_CIFRADO", randomBytes(32).toString("base64"));

const { codigoRespaldo, usuario } = await import("@/lib/db/esquema");
const { iniciarAlta, confirmarAlta, verificarFactor2, desactivar, _test } =
  await import("./totp");

const db = entorno.db;

/** Genera el código que mostraría la app del usuario en este instante. */
function codigoActual(secreto: string, email: string): string {
  return _test.nuevoTotp(secreto, email).generate();
}

async function traerUsuario(id: string) {
  const [u] = await db.select().from(usuario).where(eq(usuario.id, id));
  return u;
}

let anaId: string;

beforeAll(async () => {
  const [a] = await db
    .insert(usuario)
    .values({ email: "jefa@ejemplo.com", rol: "admin" })
    .returning();
  anaId = a.id;
}, 60_000);

beforeEach(async () => {
  await db.delete(codigoRespaldo);
  await db
    .update(usuario)
    .set({ totpSecreto: null, totpActivadoEn: null })
    .where(eq(usuario.id, anaId));
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("iniciarAlta", () => {
  it("NO activa nada todavía", async () => {
    await iniciarAlta(await traerUsuario(anaId));
    const u = await traerUsuario(anaId);

    /*
     * Si activara acá, alguien que no logró configurar la app quedaría con el
     * segundo factor prendido y sin poder entrar nunca más a su propio panel.
     */
    expect(u.totpSecreto).not.toBeNull();
    expect(u.totpActivadoEn).toBeNull();
  });

  it("guarda el secreto CIFRADO, no en claro", async () => {
    const { secreto } = await iniciarAlta(await traerUsuario(anaId));
    const u = await traerUsuario(anaId);

    // El servidor necesita el valor original para calcular el código, así que
    // no se puede hashear. Se cifra: filtrar la base no alcanza para generar
    // códigos sin la clave, que vive en el entorno.
    expect(u.totpSecreto).not.toBe(secreto);
    expect(u.totpSecreto).not.toContain(secreto);
  });

  it("devuelve una URI otpauth que las apps entienden", async () => {
    const { uri } = await iniciarAlta(await traerUsuario(anaId));

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("issuer=Anima");
    expect(uri).toContain("digits=6");
  });

  it("cada alta genera un secreto distinto", async () => {
    const a = await iniciarAlta(await traerUsuario(anaId));
    const b = await iniciarAlta(await traerUsuario(anaId));
    expect(a.secreto).not.toBe(b.secreto);
  });
});

describe("confirmarAlta", () => {
  it("activa con un código válido y devuelve los respaldos", async () => {
    const { secreto } = await iniciarAlta(await traerUsuario(anaId));
    const u = await traerUsuario(anaId);

    const r = await confirmarAlta(u, codigoActual(secreto, u.email));

    expect(r).not.toBeNull();
    expect(r!.codigosRespaldo).toHaveLength(_test.CANTIDAD_RESPALDOS);
    expect((await traerUsuario(anaId)).totpActivadoEn).not.toBeNull();
  });

  it("rechaza un código incorrecto y NO activa", async () => {
    await iniciarAlta(await traerUsuario(anaId));
    const u = await traerUsuario(anaId);

    expect(await confirmarAlta(u, "000000")).toBeNull();
    expect((await traerUsuario(anaId)).totpActivadoEn).toBeNull();
  });

  it("guarda el HASH de los códigos, nunca los códigos", async () => {
    const { secreto } = await iniciarAlta(await traerUsuario(anaId));
    const u = await traerUsuario(anaId);
    const r = await confirmarAlta(u, codigoActual(secreto, u.email));

    const guardados = await db.select().from(codigoRespaldo);
    const ids = guardados.map((g) => g.id);

    for (const codigo of r!.codigosRespaldo) {
      expect(ids).not.toContain(codigo);
      expect(ids).toContain(_test.hashear(codigo));
    }
  });

  it("volver a activar invalida los códigos viejos", async () => {
    const primera = await iniciarAlta(await traerUsuario(anaId));
    let u = await traerUsuario(anaId);
    const viejos = await confirmarAlta(u, codigoActual(primera.secreto, u.email));

    const segunda = await iniciarAlta(await traerUsuario(anaId));
    u = await traerUsuario(anaId);
    await confirmarAlta(u, codigoActual(segunda.secreto, u.email));

    u = await traerUsuario(anaId);
    // Un código de respaldo viejo no puede seguir sirviendo después de
    // reconfigurar el segundo factor.
    expect((await verificarFactor2(u, viejos!.codigosRespaldo[0])).ok).toBe(false);
  });
});

describe("verificarFactor2", () => {
  async function anaConTotp() {
    const { secreto } = await iniciarAlta(await traerUsuario(anaId));
    const u = await traerUsuario(anaId);
    const r = await confirmarAlta(u, codigoActual(secreto, u.email));
    return { secreto, codigos: r!.codigosRespaldo, u: await traerUsuario(anaId) };
  }

  it("acepta el código de la app", async () => {
    const { secreto, u } = await anaConTotp();
    const r = await verificarFactor2(u, codigoActual(secreto, u.email));

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.usoRespaldo).toBe(false);
  });

  it("acepta un código con espacios, como lo copia la gente", async () => {
    const { secreto, u } = await anaConTotp();
    const codigo = codigoActual(secreto, u.email);

    expect(
      (await verificarFactor2(u, `${codigo.slice(0, 3)} ${codigo.slice(3)}`)).ok,
    ).toBe(true);
  });

  it("rechaza un código de otro secreto", async () => {
    const { u } = await anaConTotp();

    const ajeno = new OTPAuth.TOTP({
      issuer: "Anima",
      label: u.email,
      secret: new OTPAuth.Secret({ size: 20 }),
    }).generate();

    expect((await verificarFactor2(u, ajeno)).ok).toBe(false);
  });

  it("rechaza un código viejo, fuera de la ventana", async () => {
    const { secreto, u } = await anaConTotp();

    // Diez minutos atrás: muy lejos de la ventana de ±30 s.
    const viejo = _test
      .nuevoTotp(secreto, u.email)
      .generate({ timestamp: Date.now() - 10 * 60_000 });

    expect((await verificarFactor2(u, viejo)).ok).toBe(false);
  });

  it("acepta un código de respaldo y avisa cuántos quedan", async () => {
    const { codigos, u } = await anaConTotp();

    const r = await verificarFactor2(u, codigos[0]);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usoRespaldo).toBe(true);
      expect(r.respaldosRestantes).toBe(_test.CANTIDAD_RESPALDOS - 1);
    }
  });

  it("un código de respaldo sirve UNA sola vez", async () => {
    const { codigos, u } = await anaConTotp();

    expect((await verificarFactor2(u, codigos[0])).ok).toBe(true);
    expect((await verificarFactor2(u, codigos[0])).ok).toBe(false);
  });

  it("dos usos simultáneos del mismo respaldo: gana uno solo", async () => {
    const { codigos, u } = await anaConTotp();

    // Sin el UPDATE condicional, los dos pasarían la verificación antes de que
    // cualquiera marcara el código como usado.
    const [a, b] = await Promise.all([
      verificarFactor2(u, codigos[0]),
      verificarFactor2(u, codigos[0]),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it("el código de respaldo de uno no sirve para otro", async () => {
    const { codigos } = await anaConTotp();

    const [beto] = await db
      .insert(usuario)
      .values({ email: `beto-${Date.now()}@ejemplo.com`, rol: "admin" })
      .returning();

    const { secreto } = await iniciarAlta(beto);
    const betoActual = (
      await db.select().from(usuario).where(eq(usuario.id, beto.id))
    )[0];
    await confirmarAlta(betoActual, codigoActual(secreto, betoActual.email));

    const conTotp = (
      await db.select().from(usuario).where(eq(usuario.id, beto.id))
    )[0];

    expect((await verificarFactor2(conTotp, codigos[0])).ok).toBe(false);
  });

  it("rechaza si el 2FA no está activado", async () => {
    await iniciarAlta(await traerUsuario(anaId)); // secreto sí, activado no
    const u = await traerUsuario(anaId);

    expect((await verificarFactor2(u, "123456")).ok).toBe(false);
  });
});

describe("desactivar", () => {
  it("borra el secreto y todos los respaldos", async () => {
    const { secreto } = await iniciarAlta(await traerUsuario(anaId));
    let u = await traerUsuario(anaId);
    await confirmarAlta(u, codigoActual(secreto, u.email));

    await desactivar(anaId);

    u = await traerUsuario(anaId);
    expect(u.totpSecreto).toBeNull();
    expect(u.totpActivadoEn).toBeNull();
    expect(await db.select().from(codigoRespaldo)).toHaveLength(0);
  });
});
