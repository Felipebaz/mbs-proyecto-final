import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Flujos completos de correo contra Postgres real (PGlite).
 *
 * Se mockean sólo las APIs de request de Next (cookies, headers, redirect) y
 * el cliente de base. La lógica de las acciones corre entera.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

/** Cookies en memoria, una por "navegador". */
const cookies = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) =>
      cookies.has(n) ? { name: n, value: cookies.get(n) } : undefined,
    set: (n: string, v: string) => {
      cookies.set(n, v);
    },
    delete: (n: string) => cookies.delete(n),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
}));

/** `redirect` tira en Next para cortar el flujo. Se imita para poder afirmarlo. */
class Redirigido extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirigido(destino);
  },
}));

const { ProveedorFalso, usarProveedorEmail } = await import("@/lib/email");
const { sesion, tokenCorreo, usuario } = await import("@/lib/db/esquema");
const { validarToken } = await import("@/lib/auth/sesion");
const { crearToken } = await import("@/lib/auth/tokens");
const { _test: rateLimit } = await import("@/lib/auth/rate-limit");
const { registrarse, pedirReset, cambiarPassword, reenviarVerificacion } =
  await import("./auth");

const db = entorno.db;
const correo = new ProveedorFalso();

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** Captura el destino de un `redirect`, o null si la acción devolvió normal. */
async function destinoDe(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (e) {
    if (e instanceof Redirigido) return e.destino;
    throw e;
  }
}

beforeAll(() => {
  usarProveedorEmail(correo);
  process.env.APP_URL = "https://anima.uy";
}, 60_000);

beforeEach(async () => {
  correo.limpiar();
  cookies.clear();
  rateLimit.reiniciar();
  await db.delete(tokenCorreo);
  await db.delete(sesion);
  await db.delete(usuario);
});

afterAll(async () => {
  usarProveedorEmail(null);
  await entorno.cerrar();
});

const PASSWORD = "una contraseña larga y tranquila";

describe("registrarse", () => {
  it("crea la cuenta sin verificar y manda el mail de verificación", async () => {
    const r = await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));

    expect(r.ok).toBeTruthy();

    const [u] = await db
      .select()
      .from(usuario)
      .where(eq(usuario.email, "ana@ejemplo.com"));
    expect(u.emailVerificado).toBe(false);

    const mail = correo.ultimoPara("ana@ejemplo.com");
    expect(mail?.asunto).toMatch(/[Cc]onfirmá/);
    expect(correo.linkDe(mail!, "/verificar")).toContain("token=");
  });

  it("NO inicia sesión: sin eso el registro sería enumerable", async () => {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));

    /*
     * Con auto-login, un correo nuevo te deja adentro y uno existente no: esa
     * diferencia delata qué direcciones son clientes nuestros por más genérico
     * que sea el mensaje en pantalla.
     */
    expect(await db.select().from(sesion)).toHaveLength(0);
  });

  it("normaliza el correo a minúsculas", async () => {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "  ANA@Ejemplo.COM ", password: PASSWORD }));

    const filas = await db.select().from(usuario);
    expect(filas[0].email).toBe("ana@ejemplo.com");
  });

  it("con un correo que ya existe: misma respuesta, sin cuenta nueva", async () => {
    const primera = await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    correo.limpiar();

    const segunda = await registrarse(undefined,
      form({ nombre: "Impostor", email: "ana@ejemplo.com", password: "otra contraseña larga" }));

    // Indistinguible desde afuera.
    expect(segunda.ok).toBe(primera.ok);
    expect(segunda.error).toBeUndefined();
    expect(await db.select().from(usuario)).toHaveLength(1);
  });

  it("y le avisa por mail al dueño legítimo", async () => {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    correo.limpiar();

    await registrarse(undefined,
      form({ nombre: "Impostor", email: "ana@ejemplo.com", password: "otra contraseña larga" }));

    const aviso = correo.ultimoPara("ana@ejemplo.com");
    expect(aviso?.asunto).toMatch(/[Aa]lguien intentó/);
    // El mail trae la salida: recuperar la contraseña.
    expect(aviso?.texto).toContain("/recuperar");
  });

  it("no le cambia la contraseña a la cuenta existente", async () => {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    const [antes] = await db.select().from(usuario);

    await registrarse(undefined,
      form({ nombre: "Impostor", email: "ana@ejemplo.com", password: "otra contraseña larga" }));
    const [despues] = await db.select().from(usuario);

    // Si el segundo registro pisara el hash, sería toma de cuenta directa.
    expect(despues.passwordHash).toBe(antes.passwordHash);
    expect(despues.nombre).toBe("Ana");
  });

  it("rechaza una contraseña corta sin crear nada", async () => {
    const r = await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: "corta" }));

    expect(r.errores?.password).toBeTruthy();
    expect(await db.select().from(usuario)).toHaveLength(0);
    expect(correo.enviados).toHaveLength(0);
  });
});

describe("pedirReset", () => {
  async function crearAna() {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    correo.limpiar();
  }

  it("manda el link cuando la cuenta existe", async () => {
    await crearAna();
    const r = await pedirReset(undefined, form({ email: "ana@ejemplo.com" }));

    expect(r.ok).toBeTruthy();
    const mail = correo.ultimoPara("ana@ejemplo.com");
    expect(correo.linkDe(mail!, "/reset")).toContain("token=");
  });

  it("responde IGUAL cuando la cuenta no existe, y no manda nada", async () => {
    const conCuenta = await (async () => {
      await crearAna();
      return pedirReset(undefined, form({ email: "ana@ejemplo.com" }));
    })();

    correo.limpiar();
    const sinCuenta = await pedirReset(undefined, form({ email: "nadie@ejemplo.com" }));

    // Misma respuesta: no se puede deducir qué direcciones tienen cuenta.
    expect(sinCuenta.ok).toBe(conCuenta.ok);
    expect(correo.enviados).toHaveLength(0);
  });

  it("corta después de 3 pedidos para la misma cuenta", async () => {
    await crearAna();
    for (let i = 0; i < 3; i++) {
      await pedirReset(undefined, form({ email: "ana@ejemplo.com" }));
    }
    const antes = correo.enviados.length;

    await pedirReset(undefined, form({ email: "ana@ejemplo.com" }));

    // Sin tope, esto es una forma de inundar la casilla de alguien usando
    // nuestro dominio, y de quemar nuestra reputación de envío.
    expect(correo.enviados.length).toBe(antes);
  });
});

describe("cambiarPassword", () => {
  async function anaConToken() {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    const [u] = await db.select().from(usuario);
    const { token } = await crearToken(u.id, "reset");
    correo.limpiar();
    return { usuarioId: u.id, token };
  }

  it("cambia la contraseña y redirige a login", async () => {
    const { usuarioId, token } = await anaConToken();
    const [antes] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));

    const destino = await destinoDe(
      cambiarPassword(undefined, form({ token, password: "otra contraseña bien larga" })),
    );

    expect(destino).toBe("/login?cambiada=1");
    const [despues] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
    expect(despues.passwordHash).not.toBe(antes.passwordHash);
  });

  it("CIERRA TODAS las sesiones del usuario", async () => {
    const { usuarioId, token } = await anaConToken();

    const { crearSesion } = await import("@/lib/auth/sesion");
    const a = await crearSesion(usuarioId);
    const b = await crearSesion(usuarioId);
    expect(await validarToken(a.token)).not.toBeNull();

    await destinoDe(
      cambiarPassword(undefined, form({ token, password: "otra contraseña bien larga" })),
    );

    /*
     * Es lo que hace útil al cambio de contraseña. Si alguien le robó la
     * sesión, cambiarla tiene que echarlo: sin esto, el atacante sigue adentro
     * con la sesión vieja aunque la víctima haya cambiado la clave.
     */
    expect(await validarToken(a.token)).toBeNull();
    expect(await validarToken(b.token)).toBeNull();
  });

  it("deja el correo verificado: abrir el link prueba la casilla", async () => {
    const { usuarioId, token } = await anaConToken();

    await destinoDe(
      cambiarPassword(undefined, form({ token, password: "otra contraseña bien larga" })),
    );

    // Es lo que le permite al dueño recuperar una cuenta que otro registró con
    // su correo y nunca verificó.
    const [u] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
    expect(u.emailVerificado).toBe(true);
  });

  it("avisa por mail que la contraseña cambió", async () => {
    const { token } = await anaConToken();

    await destinoDe(
      cambiarPassword(undefined, form({ token, password: "otra contraseña bien larga" })),
    );

    // Única señal que recibe el dueño si el que la cambió no fue él.
    const aviso = correo.ultimoPara("ana@ejemplo.com");
    expect(aviso?.asunto).toMatch(/contraseña cambió/i);
  });

  it("rechaza un token ya usado", async () => {
    const { token } = await anaConToken();
    await destinoDe(
      cambiarPassword(undefined, form({ token, password: "otra contraseña bien larga" })),
    );

    const r = await cambiarPassword(undefined,
      form({ token, password: "tercera contraseña larga" }));
    expect(r.error).toBeTruthy();
  });

  it("rechaza un token inventado sin tocar la cuenta", async () => {
    const { usuarioId } = await anaConToken();
    const [antes] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));

    const r = await cambiarPassword(undefined,
      form({ token: "token-que-no-existe-12345", password: "otra contraseña larga" }));

    expect(r.error).toBeTruthy();
    const [despues] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
    expect(despues.passwordHash).toBe(antes.passwordHash);
  });

  it("el token de Ana no cambia la contraseña de Beto", async () => {
    const { token } = await anaConToken();
    const [beto] = await db
      .insert(usuario)
      .values({ email: "beto@ejemplo.com", passwordHash: "hash-de-beto" })
      .returning();

    await destinoDe(
      cambiarPassword(undefined, form({ token, password: "otra contraseña bien larga" })),
    );

    // El token lleva a SU dueño; no hay forma de apuntarlo a otra cuenta.
    const [sinTocar] = await db.select().from(usuario).where(eq(usuario.id, beto.id));
    expect(sinTocar.passwordHash).toBe("hash-de-beto");
  });
});

describe("reenviarVerificacion", () => {
  it("reenvía sólo si la cuenta existe y está sin verificar", async () => {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    correo.limpiar();

    await reenviarVerificacion(undefined, form({ email: "ana@ejemplo.com" }));
    expect(correo.ultimoPara("ana@ejemplo.com")).toBeDefined();
  });

  it("no manda nada si ya está verificada, con la misma respuesta", async () => {
    await registrarse(undefined,
      form({ nombre: "Ana", email: "ana@ejemplo.com", password: PASSWORD }));
    await db.update(usuario).set({ emailVerificado: true });
    correo.limpiar();

    const r = await reenviarVerificacion(undefined, form({ email: "ana@ejemplo.com" }));

    expect(r.ok).toBeTruthy();
    expect(correo.enviados).toHaveLength(0);
  });

  it("responde igual para una dirección sin cuenta", async () => {
    const r = await reenviarVerificacion(undefined, form({ email: "nadie@ejemplo.com" }));
    expect(r.ok).toBeTruthy();
    expect(correo.enviados).toHaveLength(0);
  });
});
