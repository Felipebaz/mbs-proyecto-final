import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { baseDePrueba } from "../prueba";
import { carrito, carritoLinea, cuentaOauth, sesion, usuario } from "../esquema";

/**
 * Verifica que las migraciones apliquen y que las reglas que pusimos en la base
 * efectivamente frenen datos malos. Son la última red: si mañana aparece un
 * camino de escritura que no pasa por el dominio, esto lo para igual.
 */

let db: Awaited<ReturnType<typeof baseDePrueba>>["db"];
let cerrar: () => Promise<void>;

beforeAll(async () => {
  const entorno = await baseDePrueba();
  db = entorno.db;
  cerrar = entorno.cerrar;
}, 60_000);

afterAll(async () => {
  await cerrar();
});

/**
 * Drizzle envuelve el error de Postgres: el nombre de la restricción queda en
 * `cause`, no en el mensaje de arriba. Sin recorrer la cadena, el test pasaría
 * ante cualquier fallo de insert y no probaría que saltó LA restricción.
 */
async function violacion(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    let texto = "";
    let actual: unknown = e;
    while (actual instanceof Error) {
      texto += ` ${actual.message}`;
      actual = actual.cause;
    }
    return texto;
  }
  throw new Error("Se esperaba que la base rechazara esto, y lo aceptó.");
}

async function crearUsuario(email = "ana@ejemplo.com") {
  const [u] = await db.insert(usuario).values({ email }).returning();
  return u;
}

describe("migraciones", () => {
  it("aplican y dejan las 5 tablas usables", async () => {
    const u = await crearUsuario("aplican@ejemplo.com");
    expect(u.id).toBeTruthy();
    expect(u.emailVerificado).toBe(false);
    expect(u.passwordHash).toBeNull(); // usuario sólo-Google
  });
});

describe("usuario", () => {
  it("rechaza un email con mayúsculas", async () => {
    // El código normaliza antes de escribir; esto lo hace cumplir igual. Sin
    // esto, "Ana@x.com" y "ana@x.com" serían dos cuentas de la misma persona.
    expect(
      await violacion(db.insert(usuario).values({ email: "Mayus@Ejemplo.com" })),
    ).toMatch(/usuario_email_minusculas/);
  });

  it("rechaza dos cuentas con el mismo email", async () => {
    await crearUsuario("repetido@ejemplo.com");
    await expect(
      db.insert(usuario).values({ email: "repetido@ejemplo.com" }),
    ).rejects.toThrow();
  });
});

describe("sesion", () => {
  it("se borra sola cuando se borra el usuario (ON DELETE CASCADE)", async () => {
    const u = await crearUsuario("cascada@ejemplo.com");

    await db.insert(sesion).values({
      id: "hash-de-token-de-prueba",
      usuarioId: u.id,
      expiraEn: new Date(Date.now() + 1000),
    });

    await db.delete(usuario).where(eq(usuario.id, u.id));

    // Sin la cascada quedarían sesiones apuntando a un usuario que no existe:
    // filas válidas para un atacante y ningún usuario para revocarlas.
    const quedan = await db
      .select()
      .from(sesion)
      .where(eq(sesion.id, "hash-de-token-de-prueba"));
    expect(quedan).toHaveLength(0);
  });

  it("no acepta una sesión de un usuario inexistente", async () => {
    await expect(
      db.insert(sesion).values({
        id: "huerfana",
        usuarioId: "00000000-0000-0000-0000-000000000000",
        expiraEn: new Date(),
      }),
    ).rejects.toThrow();
  });
});

describe("cuenta_oauth", () => {
  it("no deja vincular el mismo sub de Google a dos usuarios", async () => {
    const a = await crearUsuario("oauth-a@ejemplo.com");
    const b = await crearUsuario("oauth-b@ejemplo.com");

    await db.insert(cuentaOauth).values({
      proveedor: "google",
      proveedorUsuarioId: "sub-123",
      usuarioId: a.id,
    });

    // Si esto pasara, una cuenta Google entraría a dos cuentas distintas.
    await expect(
      db.insert(cuentaOauth).values({
        proveedor: "google",
        proveedorUsuarioId: "sub-123",
        usuarioId: b.id,
      }),
    ).rejects.toThrow();
  });
});

describe("carrito", () => {
  it("exige exactamente un dueño", async () => {
    const u = await crearUsuario("carrito@ejemplo.com");

    // Sin dueño: nadie lo puede recuperar.
    expect(await violacion(db.insert(carrito).values({}))).toMatch(
      /carrito_un_solo_dueno/,
    );

    // Con los dos: sería de dos personas a la vez.
    expect(
      await violacion(
        db.insert(carrito).values({ usuarioId: u.id, cookieId: "hash" }),
      ),
    ).toMatch(/carrito_un_solo_dueno/);

    // Uno solo: bien.
    const [anonimo] = await db
      .insert(carrito)
      .values({ cookieId: "hash-anonimo" })
      .returning();
    expect(anonimo.id).toBeTruthy();
  });

  it("un usuario no puede tener dos carritos", async () => {
    const u = await crearUsuario("un-carrito@ejemplo.com");
    await db.insert(carrito).values({ usuarioId: u.id });

    await expect(
      db.insert(carrito).values({ usuarioId: u.id }),
    ).rejects.toThrow();
  });
});

describe("carrito_linea", () => {
  async function carritoVacio(cookie: string) {
    const [c] = await db
      .insert(carrito)
      .values({ cookieId: cookie })
      .returning();
    return c;
  }

  it("frena cantidades fuera de rango", async () => {
    const c = await carritoVacio("lineas-rango");

    expect(
      await violacion(
        db.insert(carritoLinea).values({
          carritoId: c.id,
          sku: "JG-VD-330",
          cantidad: 0,
        }),
      ),
    ).toMatch(/carrito_linea_cantidad/);

    expect(
      await violacion(
        db.insert(carritoLinea).values({
          carritoId: c.id,
          sku: "JG-VD-330",
          cantidad: 9999,
        }),
      ),
    ).toMatch(/carrito_linea_cantidad/);
  });

  it("la PK deja dos packs armables distintos del mismo SKU", async () => {
    const c = await carritoVacio("lineas-huella");

    await db.insert(carritoLinea).values({
      carritoId: c.id,
      sku: "PACK-ARM-5",
      huella: "a|b",
      configuracion: ["a", "b"],
      cantidad: 1,
    });

    // Mismo SKU, contenido distinto: son dos líneas.
    await db.insert(carritoLinea).values({
      carritoId: c.id,
      sku: "PACK-ARM-5",
      huella: "c|d",
      configuracion: ["c", "d"],
      cantidad: 1,
    });

    const lineas = await db
      .select()
      .from(carritoLinea)
      .where(eq(carritoLinea.carritoId, c.id));
    expect(lineas).toHaveLength(2);

    // Mismo SKU y misma huella: choca, y el upsert del repositorio lo suma.
    await expect(
      db.insert(carritoLinea).values({
        carritoId: c.id,
        sku: "PACK-ARM-5",
        huella: "a|b",
        configuracion: ["a", "b"],
        cantidad: 1,
      }),
    ).rejects.toThrow();
  });
});
