import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Procesamiento de pagos contra Postgres real (PGlite).
 *
 * Cubre lo que pidió el plan: notificación duplicada, monto que no coincide,
 * external_reference inexistente. Más las transiciones de estado, que es donde
 * un error se traduce en jugos regalados o en un cliente que pagó y no recibe.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

const { pago, pedido, pedidoItem } = await import("@/lib/db/esquema");
const { procesarPago } = await import("./procesar-pago");
import type { EstadoConsultado } from "@/lib/pagos";

const db = entorno.db;

const TOTAL = 132000; // $1.320,00 en centésimos

async function crearPedidoPendiente(referencia = "ped_prueba", total = TOTAL) {
  const [p] = await db
    .insert(pedido)
    .values({
      referencia,
      total,
      moneda: "UYU",
      nombreEntrega: "Ana",
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

  return p;
}

function pagoDe(
  referencia: string,
  extras: Partial<EstadoConsultado> = {},
): EstadoConsultado {
  return {
    idPago: "mp-111",
    estado: "aprobado",
    estadoCrudo: "approved",
    monto: TOTAL,
    moneda: "UYU",
    referencia,
    ...extras,
  };
}

async function estadoDe(id: string) {
  const [p] = await db.select().from(pedido).where(eq(pedido.id, id));
  return p.estado;
}

beforeEach(async () => {
  await db.delete(pago);
  await db.delete(pedido);
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("pago aprobado", () => {
  it("marca el pedido como pagado y deja fecha", async () => {
    const p = await crearPedidoPendiente();
    const r = await procesarPago(pagoDe(p.referencia));

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.accion).toBe("aplicado");

    const [despues] = await db.select().from(pedido).where(eq(pedido.id, p.id));
    expect(despues.estado).toBe("pagado");
    expect(despues.pagadoEn).not.toBeNull();
  });

  it("guarda el pago con su id de Mercado Pago", async () => {
    const p = await crearPedidoPendiente();
    await procesarPago(pagoDe(p.referencia));

    const [guardado] = await db.select().from(pago);
    expect(guardado.idPagoMp).toBe("mp-111");
    expect(guardado.monto).toBe(TOTAL);
    expect(guardado.estado).toBe("approved");
  });
});

describe("idempotencia", () => {
  it("la misma notificación dos veces no duplica nada", async () => {
    const p = await crearPedidoPendiente();

    const primera = await procesarPago(pagoDe(p.referencia));
    const segunda = await procesarPago(pagoDe(p.referencia));

    /*
     * Mercado Pago reintenta la misma notificación varias veces. Sin el PK
     * sobre id_pago_mp, el segundo intento insertaría otra fila y el pedido se
     * contaría dos veces en la facturación.
     */
    expect(primera.ok && primera.accion).toBe("aplicado");
    expect(segunda.ok && segunda.accion).toBe("sin-cambios");
    expect(await db.select().from(pago)).toHaveLength(1);
    expect(await estadoDe(p.id)).toBe("pagado");
  });

  it("dos notificaciones simultáneas: una sola aplica", async () => {
    const p = await crearPedidoPendiente();

    // MP a veces manda dos a la vez. El UPDATE condicional decide.
    const [a, b] = await Promise.all([
      procesarPago(pagoDe(p.referencia)),
      procesarPago(pagoDe(p.referencia)),
    ]);

    const aplicadas = [a, b].filter((r) => r.ok && r.accion === "aplicado");
    expect(aplicadas).toHaveLength(1);
    expect(await db.select().from(pago)).toHaveLength(1);
  });

  it("un aviso viejo de 'pendiente' no pisa un pedido ya pagado", async () => {
    const p = await crearPedidoPendiente();
    await procesarPago(pagoDe(p.referencia));

    await procesarPago(
      pagoDe(p.referencia, { idPago: "mp-222", estado: "pendiente", estadoCrudo: "in_process" }),
    );

    // Las notificaciones pueden llegar desordenadas. Un pedido pagado no
    // vuelve a pendiente porque llegó tarde un aviso viejo.
    expect(await estadoDe(p.id)).toBe("pagado");
  });
});

describe("controles de seguridad", () => {
  it("rechaza un monto que no coincide", async () => {
    const p = await crearPedidoPendiente();

    const r = await procesarPago(pagoDe(p.referencia, { monto: 100 }));

    /*
     * Es el control que impide llevarse el pedido pagando $1. La firma del
     * webhook prueba que el aviso vino de Mercado Pago, NO que se haya pagado
     * lo correcto: eso se verifica acá.
     */
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("monto-no-coincide");
    expect(await estadoDe(p.id)).toBe("pendiente");
    expect(await db.select().from(pago)).toHaveLength(0);
  });

  it("rechaza un monto mayor al del pedido", async () => {
    const p = await crearPedidoPendiente();
    const r = await procesarPago(pagoDe(p.referencia, { monto: TOTAL + 1 }));

    // Tampoco se acepta de más: un descuadre en cualquier dirección es un bug
    // o un intento de confundirnos, no una venta.
    expect(r.ok).toBe(false);
    expect(await estadoDe(p.id)).toBe("pendiente");
  });

  it("rechaza otra moneda por el mismo número", async () => {
    const p = await crearPedidoPendiente();
    const r = await procesarPago(pagoDe(p.referencia, { moneda: "ARS" }));

    // 1.320 pesos argentinos no son 1.320 pesos uruguayos.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("moneda-no-coincide");
    expect(await estadoDe(p.id)).toBe("pendiente");
  });

  it("rechaza una referencia que no existe", async () => {
    const r = await procesarPago(pagoDe("ped_inventado"));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("pedido-inexistente");
  });

  it("rechaza un pago sin referencia", async () => {
    const r = await procesarPago(pagoDe("x", { referencia: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("pedido-inexistente");
  });

  it("un mismo id de pago no puede saltar a otro pedido", async () => {
    const a = await crearPedidoPendiente("ped_a");
    const b = await crearPedidoPendiente("ped_b");

    await procesarPago(pagoDe(a.referencia));
    const r = await procesarPago(pagoDe(b.referencia)); // mismo idPago mp-111

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("pago-de-otro-pedido");
    expect(await estadoDe(b.id)).toBe("pendiente");
  });
});

describe("otros estados", () => {
  it("'in_process' deja el pedido pendiente", async () => {
    const p = await crearPedidoPendiente();

    const r = await procesarPago(
      pagoDe(p.referencia, { estado: "pendiente", estadoCrudo: "in_process" }),
    );

    /*
     * `in_process` es revisión manual de MP: todavía puede terminar aprobado o
     * rechazado. Tratarlo como aprobado sería entregar jugos por un pago que
     * puede caerse.
     */
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.accion).toBe("sin-cambios");
    expect(await estadoDe(p.id)).toBe("pendiente");

    // Igual se guarda, para poder ver qué pasó.
    expect(await db.select().from(pago)).toHaveLength(1);
  });

  it("'rejected' marca rechazado", async () => {
    const p = await crearPedidoPendiente();
    await procesarPago(
      pagoDe(p.referencia, { estado: "rechazado", estadoCrudo: "rejected" }),
    );
    expect(await estadoDe(p.id)).toBe("rechazado");
  });

  it("un rechazado puede pasar a pagado si reintenta", async () => {
    const p = await crearPedidoPendiente();
    await procesarPago(
      pagoDe(p.referencia, { idPago: "mp-fallo", estado: "rechazado", estadoCrudo: "rejected" }),
    );

    // La persona reintenta con otra tarjeta: el pedido tiene que poder cobrarse.
    await procesarPago(pagoDe(p.referencia, { idPago: "mp-ok" }));
    expect(await estadoDe(p.id)).toBe("pagado");
  });

  it("'refunded' sobre un pedido pagado lo marca reembolsado", async () => {
    const p = await crearPedidoPendiente();
    await procesarPago(pagoDe(p.referencia));

    await procesarPago(
      pagoDe(p.referencia, { estado: "reembolsado", estadoCrudo: "refunded" }),
    );
    expect(await estadoDe(p.id)).toBe("reembolsado");
  });

  it("'charged_back' también", async () => {
    const p = await crearPedidoPendiente();
    await procesarPago(pagoDe(p.referencia));

    await procesarPago(
      pagoDe(p.referencia, { estado: "contracargo", estadoCrudo: "charged_back" }),
    );
    expect(await estadoDe(p.id)).toBe("reembolsado");
  });

  it("un reembolso NO puede aplicarse a un pedido que nunca se pagó", async () => {
    const p = await crearPedidoPendiente();

    await procesarPago(
      pagoDe(p.referencia, { estado: "reembolsado", estadoCrudo: "refunded" }),
    );

    // Sin la transición condicional, un pedido pendiente quedaría marcado como
    // reembolsado sin que nadie haya pagado nunca.
    expect(await estadoDe(p.id)).toBe("pendiente");
  });
});
