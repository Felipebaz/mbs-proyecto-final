import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

/**
 * Autorización de los route handlers de export, contra Postgres real (PGlite).
 *
 * Un route handler es tan alcanzable como una server action: cualquiera puede
 * pegarle un GET. Hay un test por cada uno porque el más sensible del panel
 * —pedidos— lleva nombre, teléfono y dirección de cada cliente.
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

// `connection()` sólo marca la ruta como dinámica; en test no hace falta.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

const { auditoria, pedido, pedidoItem, sesion, usuario } = await import(
  "@/lib/db/esquema"
);
const { crearSesion, escribirCookieSesion, marcarFactor2 } = await import(
  "@/lib/auth/sesion"
);

const exportPedidos = (await import("./pedidos/route")).GET;
const exportCompras = (await import("./compras/route")).GET;
const exportRentabilidad = (await import("./rentabilidad/route")).GET;

const db = entorno.db;

type Handler = (request: never) => Promise<Response>;

const RUTAS: readonly { nombre: string; handler: Handler; reauth: boolean }[] = [
  { nombre: "export/pedidos", handler: exportPedidos as Handler, reauth: true },
  { nombre: "export/compras", handler: exportCompras as Handler, reauth: false },
  {
    nombre: "export/rentabilidad",
    handler: exportRentabilidad as Handler,
    reauth: true,
  },
];

/** Request mínimo con `nextUrl`, que es lo único que usan los handlers. */
function pedirComo(url = "https://anima.uy/api/admin/export/pedidos") {
  return { nextUrl: new URL(url) } as never;
}

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
        ? { totpSecreto: "cifrado", totpActivadoEn: new Date() }
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

async function resultado(fn: () => Promise<unknown>) {
  try {
    return { tipo: "paso" as const, valor: await fn() };
  } catch (e) {
    if (e instanceof Prohibido) return { tipo: "403" as const };
    if (e instanceof Redirigido) {
      return { tipo: "redirect" as const, destino: e.destino };
    }
    throw e;
  }
}

beforeEach(async () => {
  cookies.clear();
  await db.delete(pedido);
  await db.delete(usuario);
  // La bitácora no se puede borrar con DELETE —ese es el punto—, así que entre
  // tests se vacía con TRUNCATE, que no dispara el trigger de fila.
  await db.execute(sql`truncate table auditoria`);
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("sin sesión no se exporta nada", () => {
  for (const ruta of RUTAS) {
    it(`${ruta.nombre} manda a /login`, async () => {
      const r = await resultado(() => ruta.handler(pedirComo()));
      expect(r.tipo).toBe("redirect");
    });
  }
});

describe("un cliente logueado recibe 403", () => {
  for (const ruta of RUTAS) {
    it(`${ruta.nombre} da 403`, async () => {
      await entrarComo("cliente");
      expect((await resultado(() => ruta.handler(pedirComo()))).tipo).toBe("403");
    });
  }
});

describe("los exports con datos sensibles exigen reautenticación", () => {
  for (const ruta of RUTAS.filter((r) => r.reauth)) {
    it(`${ruta.nombre} la pide si el 2FA se verificó hace rato`, async () => {
      await entrarComo("admin", { factor2Hace: 30 * 60_000 });

      const r = await resultado(() => ruta.handler(pedirComo()));
      expect(r.tipo).toBe("redirect");
      if (r.tipo === "redirect") expect(r.destino).toContain("reautenticar");
    });
  }

  it("la lista de compra NO la pide: no lleva datos de clientes", async () => {
    await entrarComo("admin", { factor2Hace: 30 * 60_000 });

    // Pedir el segundo factor para imprimir una lista de fruta sería fricción
    // sin nada del otro lado.
    const r = await resultado(() => exportCompras(pedirComo() as never));
    expect(r.tipo).toBe("paso");
  });
});

describe("un admin verificado exporta", () => {
  async function unPedido() {
    const [p] = await db
      .insert(pedido)
      .values({
        referencia: "ped_export",
        total: 132000,
        estado: "pagado",
        nombreEntrega: "Ana Pérez",
        telefono: "099123456",
        direccion: "Rivera 1234",
      })
      .returning();

    await db.insert(pedidoItem).values({
      pedidoId: p.id,
      sku: "JG-VD-330",
      descripcion: "Jugo Verde 330 ml",
      cantidad: 2,
      precioUnitario: 56000,
      envaseUnitario: 2000,
      botellas: 2,
    });
  }

  it("devuelve un CSV con cabeceras de descarga", async () => {
    await entrarComo("admin");
    await unPedido();

    const res = (await exportPedidos(pedirComo() as never)) as Response;

    expect(res.headers.get("content-type")).toContain("text/csv");
    // `attachment` fuerza la descarga: un CSV renderizado en el navegador desde
    // nuestro dominio es superficie de XSS que no hace falta tener.
    expect(res.headers.get("content-disposition")).toContain("attachment");
    // Son datos de clientes: nunca cacheados.
    expect(res.headers.get("cache-control")).toContain("no-store");

    const csv = await res.text();
    expect(csv).toContain("Ana Pérez");
    expect(csv).toContain("1320.00");
  });

  it("deja el export registrado en la bitácora", async () => {
    const admin = await entrarComo("admin");
    await unPedido();

    await exportPedidos(pedirComo() as never);

    const registros = await db.select().from(auditoria);
    const exportado = registros.find((r) => r.accion === "datos_exportados");

    expect(exportado).toBeDefined();
    expect(exportado!.usuarioEmail).toBe(admin.email);
    expect(exportado!.objetivo).toBe("pedidos");
    // Cuántas filas salieron: es el dato que importa si hay que investigar.
    expect(exportado!.detalle).toMatchObject({ filas: 1 });
  });

  it("neutraliza una fórmula escondida en el nombre del cliente", async () => {
    await entrarComo("admin");

    await db.insert(pedido).values({
      referencia: "ped_malicioso",
      total: 1000,
      estado: "pagado",
      // El nombre lo escribió un desconocido en el checkout.
      nombreEntrega: '=HYPERLINK("http://sitio-malo","Cobrar")',
      telefono: "099",
      direccion: "x",
    });

    const csv = await ((await exportPedidos(pedirComo() as never)) as Response).text();

    // Con el apóstrofo, la planilla lo trata como texto en vez de ejecutarlo.
    expect(csv).toContain("\"'=HYPERLINK");
  });
});
