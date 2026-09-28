import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Cambio de estado de pedidos desde el panel, contra Postgres real (PGlite).
 *
 * Lo central: que no se pueda mover un pedido a cualquier estado, y que dos
 * admins tocando el mismo pedido a la vez no se pisen.
 */

const entorno = await (await import("@/lib/db/prueba")).baseDePrueba();
vi.mock("@/lib/db/cliente", () => ({ db: entorno.db }));

const { pedido, pedidoItem } = await import("@/lib/db/esquema");
const {
  cambiarEstadoPedido,
  ErrorAdmin,
  listarPedidos,
  resumenPedidos,
  transicionesDe,
} = await import("./administrar");

const db = entorno.db;

async function crear(estado: "pendiente" | "recibido" | "aceptado" | "entregado" | "rechazado") {
  const [p] = await db
    .insert(pedido)
    .values({
      referencia: `ped_${Math.random().toString(36).slice(2, 12)}`,
      total: 132000,
      estado,
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

async function estadoDe(id: string) {
  const [p] = await db.select().from(pedido).where(eq(pedido.id, id));
  return p.estado;
}

beforeEach(async () => {
  await db.delete(pedido);
});

afterAll(async () => {
  await entorno.cerrar();
});

describe("transicionesDe", () => {
  it("un pendiente puede cobrarse o cancelarse", () => {
    expect(transicionesDe("pendiente")).toEqual(["recibido", "cancelado"]);
  });

  it("un recibido no se cancela: ya hay plata, se devuelve", () => {
    expect(transicionesDe("recibido")).toEqual(["aceptado", "reembolsado"]);
  });

  it("un aceptado se entrega o se devuelve el pago", () => {
    expect(transicionesDe("aceptado")).toEqual(["entregado", "reembolsado"]);
  });

  it("un cancelado y un reembolsado son finales", () => {
    // No hay vuelta atrás: si el cliente vuelve a pedir, es un pedido nuevo.
    expect(transicionesDe("cancelado")).toEqual([]);
    expect(transicionesDe("reembolsado")).toEqual([]);
  });

  it("un entregado sólo puede reembolsarse", () => {
    expect(transicionesDe("entregado")).toEqual(["reembolsado"]);
  });
});

describe("cambiarEstadoPedido", () => {
  it("aplica una transición válida", async () => {
    const p = await crear("pendiente");

    const cambio = await cambiarEstadoPedido(p.id, "recibido");

    expect(cambio).toEqual({ anterior: "pendiente", nuevo: "recibido" });
    expect(await estadoDe(p.id)).toBe("recibido");
  });

  it("marca la fecha de pago al pasar a recibido", async () => {
    const p = await crear("pendiente");
    await cambiarEstadoPedido(p.id, "recibido");

    const [despues] = await db.select().from(pedido).where(eq(pedido.id, p.id));
    expect(despues.pagadoEn).not.toBeNull();
  });

  it("RECHAZA una transición que no tiene sentido", async () => {
    const p = await crear("entregado");

    /*
     * Sin esta tabla de transiciones, un click equivocado deja el pedido en un
     * estado que no describe nada de lo que pasó, y después nadie entiende el
     * historial.
     */
    await expect(cambiarEstadoPedido(p.id, "pendiente")).rejects.toBeInstanceOf(
      ErrorAdmin,
    );
    expect(await estadoDe(p.id)).toBe("entregado");
  });

  it("rechaza pasar al estado en el que ya está", async () => {
    const p = await crear("recibido");
    await expect(cambiarEstadoPedido(p.id, "recibido")).rejects.toThrow(/ya está/);
  });

  it("rechaza un pedido que no existe", async () => {
    await expect(
      cambiarEstadoPedido("00000000-0000-0000-0000-000000000000", "recibido"),
    ).rejects.toThrow(/no existe/);
  });

  it("dos admins a la vez: uno gana y el otro recibe un aviso claro", async () => {
    const p = await crear("pendiente");

    const [a, b] = await Promise.allSettled([
      cambiarEstadoPedido(p.id, "recibido"),
      cambiarEstadoPedido(p.id, "cancelado"),
    ]);

    /*
     * El `where estado = anterior` del UPDATE hace que el segundo falle en vez
     * de pisar el cambio del primero. Sin eso, el pedido queda en el estado de
     * quien escribió último y el otro admin cree que su cambio se aplicó.
     */
    const exitos = [a, b].filter((r) => r.status === "fulfilled");
    expect(exitos).toHaveLength(1);

    const fallo = [a, b].find((r) => r.status === "rejected");
    expect((fallo as PromiseRejectedResult).reason).toBeInstanceOf(ErrorAdmin);
  });

  it("un rechazado puede reabrirse para reintentar el pago", async () => {
    const p = await crear("rechazado");
    await cambiarEstadoPedido(p.id, "pendiente");
    expect(await estadoDe(p.id)).toBe("pendiente");
  });
});

describe("listarPedidos", () => {
  it("trae los items de cada pedido sin una consulta por pedido", async () => {
    await crear("pendiente");
    await crear("recibido");

    const pedidos = await listarPedidos();

    expect(pedidos).toHaveLength(2);
    for (const p of pedidos) {
      expect(p.items).toHaveLength(1);
      expect(p.items[0].descripcion).toBe("Jugo Verde 330 ml");
    }
  });

  it("filtra por estado", async () => {
    await crear("pendiente");
    await crear("recibido");

    const recibidos = await listarPedidos({ estados: ["recibido"] });
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0].estado).toBe("recibido");
  });

  it("topea el límite aunque se pida más", async () => {
    await crear("pendiente");
    // Sin tope, el panel podría traerse la tabla entera a memoria.
    expect((await listarPedidos({ limite: 99_999 })).length).toBeLessThanOrEqual(500);
  });

  it("con cero pedidos no revienta ni consulta items", async () => {
    expect(await listarPedidos()).toEqual([]);
  });
});

describe("resumenPedidos", () => {
  it("cuenta y suma por estado", async () => {
    await crear("pendiente");
    await crear("pendiente");
    await crear("recibido");

    const resumen = await resumenPedidos();
    const pendientes = resumen.find((r) => r.estado === "pendiente");

    expect(pendientes?.cantidad).toBe(2);
    expect(pendientes?.total).toBe(264000);
  });
});
