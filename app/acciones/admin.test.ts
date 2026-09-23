import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Autorización del panel, contra Postgres real (PGlite).
 *
 * Hay un test por CADA server action y por CADA route handler del panel. No es
 * repetición ociosa: cada uno es un endpoint público distinto, y alcanza con que
 * a uno se le olvide el `requerirAdmin()` para que todo el panel tenga una
 * puerta abierta. Un test por acción es lo que hace que agregar una nueva sin
 * protección falle en CI.
 *
 * Además se verifica que las tres acciones que no se pueden deshacer exijan
 * reautenticación, no sólo sesión.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

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
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { ingrediente, sesion, usuario } = await import("@/lib/db/esquema");
const { crearSesion, escribirCookieSesion, marcarFactor2 } = await import(
  "@/lib/auth/sesion"
);
const acciones = await import("./admin");

const db = entorno.db;

/**
 * Deja una sesión en la cookie.
 *
 * @param factor2 si la sesión pasó el segundo factor. Sin él, `requerirAdmin`
 * redirige a la pantalla de verificación.
 */
async function entrarComo(
  rol: "cliente" | "admin",
  opciones: { factor2?: boolean; factor2Hace?: number } = {},
) {
  const [u] = await db
    .insert(usuario)
    .values({
      email: `${rol}-${Math.random().toString(36).slice(2, 8)}@ejemplo.com`,
      rol,
      ...(rol === "admin"
        ? { totpSecreto: "cifrado-de-mentira", totpActivadoEn: new Date() }
        : {}),
    })
    .returning();

  const { token, expiraEn } = await crearSesion(u.id);
  await escribirCookieSesion(token, expiraEn);

  const [s] = await db.select().from(sesion).where(eq(sesion.usuarioId, u.id));

  if (opciones.factor2 ?? rol === "admin") {
    await marcarFactor2(s.id);

    if (opciones.factor2Hace) {
      await db
        .update(sesion)
        .set({ factor2En: new Date(Date.now() - opciones.factor2Hace) })
        .where(eq(sesion.id, s.id));
    }
  }

  return u;
}

/** Corre algo y devuelve qué pasó: 403, un redirect, o nada. */
async function resultado(fn: () => Promise<unknown>) {
  try {
    await fn();
    return { tipo: "paso" as const };
  } catch (e) {
    if (e instanceof Prohibido) return { tipo: "403" as const };
    if (e instanceof Redirigido) {
      return { tipo: "redirect" as const, destino: e.destino };
    }
    throw e;
  }
}

function form(campos: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

beforeEach(async () => {
  cookies.clear();
  await db.delete(ingrediente);
  await db.delete(usuario);
});

afterAll(async () => {
  await entorno.cerrar();
});

/* Todas las server actions del panel, con datos mínimos. */
const ACCIONES: readonly {
  nombre: string;
  correr: () => Promise<unknown>;
  exigeReautenticacion?: boolean;
}[] = [
  {
    nombre: "cambiarEstado",
    correr: () =>
      acciones.cambiarEstado(undefined, form({ pedidoId: crypto.randomUUID(), estado: "pagado" })),
  },
  {
    nombre: "crearPedidoManual",
    correr: () =>
      acciones.crearPedidoManual(
        undefined,
        form({
          nombre: "Ana",
          telefono: "099123456",
          direccion: "Rivera 1234",
          lineas: "JG-VD-330 1",
        }),
      ),
  },
  {
    nombre: "agregarIngrediente",
    correr: () =>
      acciones.agregarIngrediente(undefined, form({ nombre: "Naranja", unidad: "g" })),
  },
  {
    nombre: "cambiarPrecio",
    exigeReautenticacion: true,
    correr: () =>
      acciones.cambiarPrecio(
        undefined,
        form({
          ingredienteId: crypto.randomUUID(),
          montoPagado: "900",
          cantidadComprada: "5000",
        }),
      ),
  },
  {
    nombre: "darDeBajaIngrediente",
    correr: () =>
      acciones.darDeBajaIngrediente(undefined, form({ ingredienteId: crypto.randomUUID() })),
  },
  {
    nombre: "guardarRecetaAccion",
    correr: () =>
      acciones.guardarRecetaAccion(undefined, form({ sku: "JG-VD-330", lineas: "" })),
  },
];

describe("sin sesión, ninguna acción del panel corre", () => {
  for (const accion of ACCIONES) {
    it(`${accion.nombre} manda a /login`, async () => {
      const r = await resultado(accion.correr);

      expect(r.tipo).toBe("redirect");
      if (r.tipo === "redirect") expect(r.destino).toBe("/login");
    });
  }
});

describe("un cliente logueado recibe 403 en cada acción", () => {
  for (const accion of ACCIONES) {
    it(`${accion.nombre} da 403`, async () => {
      await entrarComo("cliente");

      /*
       * Una server action es un POST contra la ruta: cualquiera puede mandarlo
       * sin pasar por la UI. Que el botón no se renderice para un cliente no
       * impide nada — la barrera es esta.
       */
      expect((await resultado(accion.correr)).tipo).toBe("403");
    });
  }
});

describe("un admin sin verificar el segundo factor no pasa", () => {
  for (const accion of ACCIONES) {
    it(`${accion.nombre} pide el código`, async () => {
      await entrarComo("admin", { factor2: false });

      const r = await resultado(accion.correr);
      expect(r.tipo).toBe("redirect");
      if (r.tipo === "redirect") {
        expect(r.destino).toContain("/admin/2fa/verificar");
      }
    });
  }
});

describe("reautenticación para lo que no se puede deshacer", () => {
  const conReauth = ACCIONES.filter((a) => a.exigeReautenticacion);

  it("hay al menos una acción que la exige", () => {
    expect(conReauth.length).toBeGreaterThan(0);
  });

  for (const accion of conReauth) {
    it(`${accion.nombre} la pide si el 2FA se verificó hace rato`, async () => {
      // Verificado hace 30 minutos: pasó la ventana de 15.
      await entrarComo("admin", { factor2Hace: 30 * 60_000 });

      const r = await resultado(accion.correr);
      expect(r.tipo).toBe("redirect");
      if (r.tipo === "redirect") {
        expect(r.destino).toContain("reautenticar");
      }
    });
  }

  for (const accion of conReauth) {
    it(`${accion.nombre} pasa si se verificó recién`, async () => {
      await entrarComo("admin");
      // Pasa la autorización; después puede fallar por datos, que es otra cosa.
      expect((await resultado(accion.correr)).tipo).toBe("paso");
    });
  }
});

describe("un admin verificado sí puede operar", () => {
  it("agrega un ingrediente", async () => {
    await entrarComo("admin");

    const r = await acciones.agregarIngrediente(
      undefined,
      form({ nombre: "Naranja", unidad: "g", proveedor: "Mercado Modelo" }),
    );

    expect(r.ok).toBeTruthy();
    const filas = await db.select().from(ingrediente);
    expect(filas).toHaveLength(1);
    expect(filas[0].nombre).toBe("Naranja");
  });

  it("no puede crear dos ingredientes con el mismo nombre", async () => {
    await entrarComo("admin");

    await acciones.agregarIngrediente(undefined, form({ nombre: "Naranja", unidad: "g" }));
    const r = await acciones.agregarIngrediente(
      undefined,
      form({ nombre: "Naranja", unidad: "g" }),
    );

    expect(r.error).toMatch(/[Yy]a existe/);
    expect(await db.select().from(ingrediente)).toHaveLength(1);
  });

  it("registra un precio convirtiendo lo pagado a unidad base", async () => {
    await entrarComo("admin");
    await acciones.agregarIngrediente(undefined, form({ nombre: "Naranja", unidad: "g" }));

    const [ing] = await db.select().from(ingrediente);

    // $900 por 5000 g → 90000 centésimos / 5000 = 18 centésimos por gramo.
    const r = await acciones.cambiarPrecio(
      undefined,
      form({
        ingredienteId: ing.id,
        montoPagado: "900",
        cantidadComprada: "5000",
      }),
    );

    expect(r.ok).toBeTruthy();

    const { preciosVigentes } = await import("@/lib/costos/ingredientes");
    expect((await preciosVigentes()).get(ing.id)).toBe(18);
  });

  it("rechaza una línea mal escrita en el pedido manual", async () => {
    await entrarComo("admin");

    const r = await acciones.crearPedidoManual(
      undefined,
      form({
        nombre: "Ana",
        telefono: "099123456",
        direccion: "Rivera 1234",
        lineas: "esto no es un sku válido para nada",
      }),
    );

    expect(r.error).toBeTruthy();
  });
});
