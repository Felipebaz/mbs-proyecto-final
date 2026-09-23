import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Autorización por rol, contra Postgres real (PGlite).
 *
 * Lo central: que un cliente reciba 403 en algo protegido, y que NINGÚN camino
 * de escritura de la app pueda subir a alguien a admin.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

/** Cookies en memoria: la sesión del "navegador" del test. */
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

/** `forbidden()` y `redirect()` cortan el render tirando. Se imitan para afirmarlo. */
class Prohibido extends Error {}
class Redirigido extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}

vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Prohibido("403");
  },
  redirect: (destino: string) => {
    throw new Redirigido(destino);
  },
}));

const { sesion, usuario } = await import("@/lib/db/esquema");
const { crearSesion, escribirCookieSesion, marcarFactor2, _test: sesionTest } =
  await import("./sesion");
const { requerirAdmin, requerirReautenticacion, usuarioActual, aPublico } =
  await import("./dal");

const db = entorno.db;

/**
 * Crea el usuario y deja su sesión en la cookie, como si hubiera entrado.
 *
 * A un admin se le activa el 2FA y se marca la sesión como verificada: es el
 * estado normal después de entrar, y es lo que dejan probar los tests de rol
 * sin mezclarse con los del segundo factor.
 */
async function entrarComo(email: string, rol: "cliente" | "admin" = "cliente") {
  const [u] = await db
    .insert(usuario)
    .values({
      email,
      rol,
      ...(rol === "admin"
        ? { totpSecreto: "cifrado-de-mentira", totpActivadoEn: new Date() }
        : {}),
    })
    .returning();

  const { token, expiraEn } = await crearSesion(u.id);
  await escribirCookieSesion(token, expiraEn);

  const [s] = await db.select().from(sesion).where(eq(sesion.usuarioId, u.id));
  if (rol === "admin") await marcarFactor2(s.id);

  return { ...u, sesionId: s.id };
}

beforeEach(async () => {
  cookies.clear();
  await db.delete(usuario);
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("columna rol", () => {
  it("arranca en 'cliente' sin que nadie lo pida", async () => {
    const [u] = await db
      .insert(usuario)
      .values({ email: "nueva@ejemplo.com" })
      .returning();

    expect(u.rol).toBe("cliente");
  });

  it("la base rechaza un rol inventado", async () => {
    let mensaje = "";
    try {
      // El cast es a propósito: así llegaría un UPDATE escrito a mano, sin
      // pasar por los tipos. Lo que se prueba es que la base lo frena igual.
      await db.insert(usuario).values({
        email: "raro@ejemplo.com",
        rol: "superadmin" as "cliente",
      });
    } catch (e) {
      let actual: unknown = e;
      while (actual instanceof Error) {
        mensaje += ` ${actual.message}`;
        actual = actual.cause;
      }
    }
    expect(mensaje).toMatch(/usuario_rol/);
  });
});

describe("requerirAdmin", () => {
  it("deja pasar a un admin y devuelve su usuario", async () => {
    const admin = await entrarComo("jefa@ejemplo.com", "admin");
    const r = await requerirAdmin();
    expect(r.id).toBe(admin.id);
  });

  it("un cliente logueado recibe 403", async () => {
    await entrarComo("cliente@ejemplo.com", "cliente");

    /*
     * 403 y no redirect: quien tiene cuenta pero no permiso tiene que ver que
     * el permiso no le alcanza, no una página distinta como si la ruta no
     * existiera. Para depurar un permiso mal puesto, esa diferencia es todo.
     */
    await expect(requerirAdmin()).rejects.toBeInstanceOf(Prohibido);
  });

  it("sin sesión manda a /login, no a 403", async () => {
    // No es lo mismo "no sé quién sos" que "sé quién sos y no te alcanza".
    await expect(requerirAdmin()).rejects.toBeInstanceOf(Redirigido);
  });

  it("con una cookie de sesión inventada manda a /login", async () => {
    cookies.set("sesion", "token-que-no-existe-en-la-base");
    await expect(requerirAdmin()).rejects.toBeInstanceOf(Redirigido);
  });

  it("degradar a alguien surte efecto SIN que cierre sesión", async () => {
    const jefa = await entrarComo("jefa@ejemplo.com", "admin");
    expect((await requerirAdmin()).id).toBe(jefa.id);

    await db.update(usuario).set({ rol: "cliente" }).where(eq(usuario.id, jefa.id));

    /*
     * El rol se lee de la base en cada request, nunca de la cookie. Si viviera
     * en la sesión, sacarle el permiso a alguien no tendría efecto hasta que
     * cerrara sesión — justo lo contrario de lo que se necesita cuando hay que
     * sacárselo rápido.
     */
    await expect(requerirAdmin()).rejects.toBeInstanceOf(Prohibido);
  });
});

describe("el rol no se puede tocar desde la app", () => {
  it("el registro por correo crea siempre un cliente", async () => {
    const { registrarse } = await import("@/app/acciones/auth");
    const { ProveedorFalso, usarProveedorEmail } = await import("@/lib/email");
    usarProveedorEmail(new ProveedorFalso());

    const fd = new FormData();
    fd.set("nombre", "Impostor");
    fd.set("email", "impostor@ejemplo.com");
    fd.set("password", "una contraseña larga y tranquila");
    // Así llegaría un POST manipulado: la server action es alcanzable sin
    // pasar por el formulario.
    fd.set("rol", "admin");

    await registrarse(undefined, fd);

    const [u] = await db
      .select()
      .from(usuario)
      .where(eq(usuario.email, "impostor@ejemplo.com"));

    expect(u.rol).toBe("cliente");
    usarProveedorEmail(null);
  });

  it("ningún archivo de app/ ni lib/ escribe la columna rol", async () => {
    const { execSync } = await import("node:child_process");

    /*
     * Es un test raro pero es el que sostiene la regla. Los otros prueban los
     * caminos que existen hoy; este avisa cuando alguien agregue uno nuevo.
     *
     * Se permite sólo en el esquema (donde se declara el default) y en el
     * script de promoción, que corre a mano contra la base.
     */
    const salida = execSync(
      "grep -rln 'rol:' app lib --include=*.ts --include=*.tsx || true",
      { encoding: "utf8" },
    );

    const permitidos = new Set([
      "lib/db/esquema.ts", // la declaración de la columna
      "lib/auth/dal.ts", // la LECTURA en requerirAdmin y aPublico
    ]);

    const infractores = salida
      .split("\n")
      .filter(Boolean)
      // Los tests crean usuarios con rol a propósito: es la única forma de
      // probar la autorización. Lo que se vigila es el código de la aplicación.
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      .filter((f) => !permitidos.has(f));

    expect(infractores).toEqual([]);
  });
});

describe("segundo factor en el panel", () => {
  it("un admin SIN 2FA activado va a la pantalla de alta", async () => {
    const [u] = await db
      .insert(usuario)
      .values({ email: "sin2fa@ejemplo.com", rol: "admin" })
      .returning();
    const { token, expiraEn } = await crearSesion(u.id);
    await escribirCookieSesion(token, expiraEn);

    /*
     * Es el motivo por el que esta fase va ANTES del panel: una pantalla de
     * admin protegida sólo con contraseña está a una contraseña filtrada de
     * los pedidos, los precios y los datos de los clientes.
     */
    await expect(requerirAdmin()).rejects.toBeInstanceOf(Redirigido);
    await requerirAdmin().catch((e) => {
      expect(e.destino).toBe("/admin/2fa/alta");
    });
  });

  it("con 2FA activado pero SIN verificar en esta sesión, pide el código", async () => {
    const [u] = await db
      .insert(usuario)
      .values({
        email: "conf@ejemplo.com",
        rol: "admin",
        totpSecreto: "cifrado",
        totpActivadoEn: new Date(),
      })
      .returning();
    const { token, expiraEn } = await crearSesion(u.id);
    await escribirCookieSesion(token, expiraEn);

    /*
     * El segundo factor vive en la SESIÓN, no en el usuario. Si viviera en el
     * usuario, validarlo una vez dejaría entrar a todas las sesiones abiertas
     * —incluida la de quien robó la contraseña—.
     */
    await requerirAdmin().catch((e) => {
      expect(e.destino).toBe("/admin/2fa/verificar");
    });
  });

  it("con 2FA verificado, entra", async () => {
    const jefa = await entrarComo("jefa@ejemplo.com", "admin");
    expect((await requerirAdmin()).id).toBe(jefa.id);
  });
});

describe("vida máxima de la sesión admin", () => {
  it("a las 8 horas hay que volver a entrar, aunque la sesión siga viva", async () => {
    const jefa = await entrarComo("jefa@ejemplo.com", "admin");

    // Se envejece la sesión a mano, como si hubieran pasado 9 horas.
    await db
      .update(sesion)
      .set({
        creadaEn: new Date(Date.now() - sesionTest.VIDA_MAXIMA_ADMIN_MS - 60_000),
      })
      .where(eq(sesion.id, jefa.sesionId));

    /*
     * La sesión de cliente se desliza mientras haya actividad; esta no. Una
     * sesión de cliente robada compra jugos; una de admin ve todos los pedidos,
     * cambia precios y exporta datos.
     */
    await requerirAdmin().catch((e) => {
      expect(e).toBeInstanceOf(Redirigido);
      expect(e.destino).toContain("vencida");
    });
  });

  it("dentro de las 8 horas sigue entrando", async () => {
    const jefa = await entrarComo("jefa@ejemplo.com", "admin");

    await db
      .update(sesion)
      .set({ creadaEn: new Date(Date.now() - 7 * 60 * 60 * 1000) })
      .where(eq(sesion.id, jefa.sesionId));

    expect((await requerirAdmin()).id).toBe(jefa.id);
  });

  it("un cliente NO tiene ese tope: su sesión se desliza", async () => {
    const ana = await entrarComo("ana@ejemplo.com", "cliente");

    await db
      .update(sesion)
      .set({ creadaEn: new Date(Date.now() - 20 * 60 * 60 * 1000) })
      .where(eq(sesion.usuarioId, ana.id));

    // Pedirle la contraseña a un cliente cada 8 horas sería fricción sin
    // ganancia: lo peor que hace una sesión de cliente robada es comprar jugos.
    expect(await usuarioActual()).not.toBeNull();
  });
});

describe("requerirReautenticacion", () => {
  it("deja pasar si el 2FA se verificó recién", async () => {
    const jefa = await entrarComo("jefa@ejemplo.com", "admin");
    expect((await requerirReautenticacion(15)).id).toBe(jefa.id);
  });

  it("pide el código de nuevo si pasó la ventana", async () => {
    const jefa = await entrarComo("jefa@ejemplo.com", "admin");

    await db
      .update(sesion)
      .set({ factor2En: new Date(Date.now() - 30 * 60_000) })
      .where(eq(sesion.id, jefa.sesionId));

    /*
     * Para lo que no se puede deshacer: cambiar precios, exportar datos de
     * clientes. Estar logueado hace seis horas no alcanza — si alguien se
     * sentó en la computadora abierta, la sesión sigue siendo válida.
     */
    await requerirReautenticacion(15).catch((e) => {
      expect(e.destino).toContain("reautenticar");
    });
  });
});

describe("aPublico", () => {
  it("nunca deja salir el hash de la contraseña", async () => {
    await entrarComo("ana@ejemplo.com", "cliente");
    const u = await usuarioActual();
    const publico = aPublico(u!);

    // Todo lo que cruza a un Client Component se serializa y viaja al
    // navegador. La fila cruda trae passwordHash.
    expect(Object.keys(publico)).not.toContain("passwordHash");
    expect(JSON.stringify(publico)).not.toContain("argon2");
  });

  it("incluye el rol, que es info de UI y no una autorización", async () => {
    await entrarComo("jefa@ejemplo.com", "admin");
    const u = await usuarioActual();

    // La UI lo usa para decidir si muestra el link al panel. Que el navegador
    // mienta sobre esto no cambia nada: quien decide es requerirAdmin().
    expect(aPublico(u!).rol).toBe("admin");
  });
});
