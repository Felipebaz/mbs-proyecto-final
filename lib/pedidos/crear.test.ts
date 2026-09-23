import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Creación del pedido contra Postgres real (PGlite).
 *
 * Lo central: que el precio salga del catálogo y no del navegador, y que un
 * producto que dejó de estar disponible frene el pedido entero en vez de
 * cobrarse a medias.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

const { pedido, pedidoItem } = await import("@/lib/db/esquema");
const { crearPedido, ErrorPedido } = await import("./crear");
const { PRODUCTOS } = await import("@/lib/catalogo/productos");
const { precioTotal } = await import("@/types/producto");

const db = entorno.db;

const jugo = PRODUCTOS.find((p) => p.categoria === "jugos")!;
const variante = jugo.variantes[0];

const ENTREGA = {
  nombre: "Ana Pérez",
  telefono: "099123456",
  direccion: "Rivera 1234 apto 5",
};

beforeEach(async () => {
  await db.delete(pedido);
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("crearPedido", () => {
  it("calcula el total desde el catálogo", async () => {
    const { pedido: p } = await crearPedido(
      [{ sku: variante.sku, cantidad: 2 }],
      ENTREGA,
    );

    // Dos jugos: contenido + envase de cada uno.
    expect(p.total).toBe(precioTotal(variante) * 2);
    expect(p.estado).toBe("pendiente");
    expect(p.moneda).toBe("UYU");
  });

  it("IGNORA cualquier precio que venga en la entrada", async () => {
    // Así llegaría un POST manipulado.
    const malicioso = {
      sku: variante.sku,
      cantidad: 1,
      precio: 1,
      total: 1,
      precioUnitario: 1,
    } as unknown as { sku: string; cantidad: number };

    const { pedido: p } = await crearPedido([malicioso], ENTREGA);

    expect(p.total).toBe(precioTotal(variante));
    expect(p.total).toBeGreaterThan(1);
  });

  it("nace 'pendiente': sólo el webhook puede pasarlo a pagado", async () => {
    const { pedido: p } = await crearPedido(
      [{ sku: variante.sku, cantidad: 1 }],
      ENTREGA,
    );

    expect(p.estado).toBe("pendiente");
    expect(p.pagadoEn).toBeNull();
  });

  it("congela el precio en los items", async () => {
    const { pedido: p } = await crearPedido(
      [{ sku: variante.sku, cantidad: 3 }],
      ENTREGA,
    );

    const items = await db
      .select()
      .from(pedidoItem)
      .where(eq(pedidoItem.pedidoId, p.id));

    /*
     * A diferencia del carrito, que recalcula en cada carga, el pedido guarda
     * el precio del momento. Si mañana sube el jugo verde, este pedido tiene
     * que seguir diciendo lo que la persona pagó.
     */
    expect(items).toHaveLength(1);
    expect(items[0].precioUnitario).toBe(variante.precio);
    expect(items[0].envaseUnitario).toBe(variante.envase);
    expect(items[0].cantidad).toBe(3);
    expect(items[0].descripcion).toContain(jugo.nombre);
  });

  it("los items para el proveedor suman exactamente el total", async () => {
    const { pedido: p, items } = await crearPedido(
      [{ sku: variante.sku, cantidad: 2 }],
      ENTREGA,
    );

    /*
     * Mercado Pago cobra la suma de los items, no el campo total. Si no
     * coinciden, el cliente paga un importe y el webhook lo rechaza por
     * "monto-no-coincide" — un pago bueno perdido.
     */
    const suma = items.reduce((t, i) => t + i.precioUnitario * i.cantidad, 0);
    expect(suma).toBe(p.total);
  });

  it("el envase va como línea aparte, para que el desglose se entienda", async () => {
    const { items } = await crearPedido(
      [{ sku: variante.sku, cantidad: 1 }],
      ENTREGA,
    );

    expect(items.some((i) => i.sku === "ENVASE")).toBe(true);
  });

  it("descuenta las botellas devueltas del total", async () => {
    const sinDevolver = await crearPedido(
      [{ sku: variante.sku, cantidad: 2 }],
      ENTREGA,
    );
    const devolviendo = await crearPedido(
      [{ sku: variante.sku, cantidad: 2 }],
      ENTREGA,
      { botellasDevueltas: 2 },
    );

    expect(devolviendo.pedido.total).toBeLessThan(sinDevolver.pedido.total);
    expect(devolviendo.pedido.total).toBe(variante.precio * 2);
    expect(devolviendo.pedido.botellasDevueltas).toBe(2);
  });

  it("la referencia es aleatoria, no correlativa", async () => {
    const a = await crearPedido([{ sku: variante.sku, cantidad: 1 }], ENTREGA);
    const b = await crearPedido([{ sku: variante.sku, cantidad: 1 }], ENTREGA);

    /*
     * Viaja a Mercado Pago como external_reference y aparece en URLs. Con
     * "pedido-3" cualquiera deduce cuántas ventas hubo y prueba "pedido-4"
     * para ver el de otro.
     */
    expect(a.pedido.referencia).not.toBe(b.pedido.referencia);
    expect(a.pedido.referencia).toMatch(/^ped_/);
    expect(a.pedido.referencia.length).toBeGreaterThan(12);
  });
});

describe("revalidación", () => {
  it("rechaza un SKU que no existe", async () => {
    await expect(
      crearPedido([{ sku: "NO-EXISTE", cantidad: 1 }], ENTREGA),
    ).rejects.toBeInstanceOf(ErrorPedido);

    expect(await db.select().from(pedido)).toHaveLength(0);
  });

  it("frena el pedido ENTERO si una línea ya no está disponible", async () => {
    const otra = PRODUCTOS.find(
      (p) => p.categoria === "jugos" && p.slug !== jugo.slug,
    )!;

    /*
     * Reemplaza al "stock insuficiente" del plan: Anima prepara a pedido y no
     * maneja inventario, así que lo único que puede cambiar entre el carrito y
     * el pago es que algo se dé de baja.
     *
     * Se frena todo en vez de cobrar lo que quedó: cobrar de menos y mandar
     * menos jugos de los que la persona creía pedir es peor que hacerla volver
     * al carrito.
     */
    const guardado = otra.variantes[0].disponible;
    (otra.variantes[0] as { disponible: boolean }).disponible = false;

    try {
      await expect(
        crearPedido(
          [
            { sku: variante.sku, cantidad: 1 },
            { sku: otra.variantes[0].sku, cantidad: 1 },
          ],
          ENTREGA,
        ),
      ).rejects.toBeInstanceOf(ErrorPedido);

      expect(await db.select().from(pedido)).toHaveLength(0);
    } finally {
      (otra.variantes[0] as { disponible: boolean }).disponible = guardado;
    }
  });

  it("rechaza un carrito vacío", async () => {
    await expect(crearPedido([], ENTREGA)).rejects.toBeInstanceOf(ErrorPedido);
  });

  it("rechaza cantidad 0", async () => {
    await expect(
      crearPedido([{ sku: variante.sku, cantidad: 0 }], ENTREGA),
    ).rejects.toBeInstanceOf(ErrorPedido);
  });

  it("topea una cantidad absurda en vez de aceptarla", async () => {
    const { pedido: p } = await crearPedido(
      [{ sku: variante.sku, cantidad: 999_999 }],
      ENTREGA,
    );

    const items = await db
      .select()
      .from(pedidoItem)
      .where(eq(pedidoItem.pedidoId, p.id));

    // Sin tope, el total desborda y se pide algo que no se puede producir.
    expect(items[0].cantidad).toBe(50);
  });
});

describe("datos de entrega", () => {
  it("se guardan planos en el pedido", async () => {
    const { pedido: p } = await crearPedido(
      [{ sku: variante.sku, cantidad: 1 }],
      { ...ENTREGA, notas: "Timbre roto" },
    );

    // Copiados y no referenciados: si el cliente cambia su dirección mañana, el
    // pedido viejo tiene que seguir diciendo a dónde se mandó.
    expect(p.nombreEntrega).toBe("Ana Pérez");
    expect(p.direccion).toBe("Rivera 1234 apto 5");
    expect(p.notas).toBe("Timbre roto");
  });
});
