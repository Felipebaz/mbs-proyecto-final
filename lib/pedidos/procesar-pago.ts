import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import { pago, pedido } from "@/lib/db/esquema";
import type { EstadoConsultado } from "@/lib/pagos";

/**
 * Aplica al pedido lo que el proveedor dice que pasó con el pago.
 *
 * Esta función es la única que puede mover un pedido a `pagado`. No la llama la
 * página de retorno del cliente: esa URL la abre cualquiera, y confiar en ella
 * sería regalar los jugos a quien sepa la dirección.
 */

export type ResultadoProceso =
  | { ok: true; accion: "aplicado" | "sin-cambios"; pedidoId: string }
  | { ok: false; motivo: MotivoRechazo; detalle: string };

export type MotivoRechazo =
  | "pedido-inexistente"
  | "monto-no-coincide"
  | "moneda-no-coincide"
  | "pago-de-otro-pedido";

/** Cómo se traduce el estado del pago al estado del pedido. */
function estadoPedidoPara(estado: EstadoConsultado["estado"]) {
  switch (estado) {
    case "aprobado":
      return "pagado" as const;
    case "rechazado":
      return "rechazado" as const;
    case "reembolsado":
    case "contracargo":
      return "reembolsado" as const;
    case "pendiente":
      // Sigue pendiente: `in_process` es revisión manual y todavía puede caerse.
      return null;
  }
}

export async function procesarPago(
  consultado: EstadoConsultado,
): Promise<ResultadoProceso> {
  if (!consultado.referencia) {
    return {
      ok: false,
      motivo: "pedido-inexistente",
      detalle: "el pago no trae external_reference",
    };
  }

  const encontrados = await db
    .select()
    .from(pedido)
    .where(eq(pedido.referencia, consultado.referencia))
    .limit(1);

  const p = encontrados[0];
  if (!p) {
    return {
      ok: false,
      motivo: "pedido-inexistente",
      detalle: `no hay pedido con referencia ${consultado.referencia}`,
    };
  }

  /*
   * El monto tiene que coincidir con lo que calculamos.
   *
   * Sin este chequeo, alguien que logre crear un pago de $1 apuntando a
   * nuestra referencia se lleva el pedido entero. La firma del webhook prueba
   * que el aviso vino de Mercado Pago, no que se haya pagado lo correcto.
   */
  if (consultado.monto !== p.total) {
    return {
      ok: false,
      motivo: "monto-no-coincide",
      detalle: `se pagaron ${consultado.monto} y el pedido es de ${p.total}`,
    };
  }

  if (consultado.moneda !== p.moneda) {
    // 1.000 pesos uruguayos no son 1.000 pesos argentinos.
    return {
      ok: false,
      motivo: "moneda-no-coincide",
      detalle: `llegó ${consultado.moneda} y el pedido es en ${p.moneda}`,
    };
  }

  /*
   * Idempotencia.
   *
   * Mercado Pago reintenta la misma notificación varias veces, y a veces manda
   * dos a la vez. El PRIMARY KEY sobre `id_pago_mp` es lo que hace que el
   * segundo intento actualice en vez de insertar.
   */
  const existentes = await db
    .select({ pedidoId: pago.pedidoId })
    .from(pago)
    .where(eq(pago.idPagoMp, consultado.idPago))
    .limit(1);

  if (existentes[0] && existentes[0].pedidoId !== p.id) {
    // El mismo id de pago apuntando a dos pedidos distintos no puede pasar.
    return {
      ok: false,
      motivo: "pago-de-otro-pedido",
      detalle: `el pago ${consultado.idPago} ya está asociado a otro pedido`,
    };
  }

  const estadoNuevo = estadoPedidoPara(consultado.estado);

  return db.transaction(async (tx) => {
    await tx
      .insert(pago)
      .values({
        idPagoMp: consultado.idPago,
        pedidoId: p.id,
        estado: consultado.estadoCrudo,
        detalleEstado: consultado.detalle ?? null,
        monto: consultado.monto,
        moneda: consultado.moneda,
      })
      .onConflictDoUpdate({
        target: pago.idPagoMp,
        set: {
          estado: consultado.estadoCrudo,
          detalleEstado: consultado.detalle ?? null,
          actualizadoEn: new Date(),
        },
      });

    if (estadoNuevo === null) {
      return { ok: true as const, accion: "sin-cambios" as const, pedidoId: p.id };
    }

    /*
     * La transición es atómica y condicional: el UPDATE sólo aplica si el
     * pedido todavía está en un estado del que se pueda salir.
     *
     * Sin el `where`, dos notificaciones simultáneas para el mismo pago
     * marcarían el pedido dos veces. Y un aviso viejo de "pendiente" que
     * llegue tarde no puede pisar un pedido ya entregado.
     */
    const desde =
      estadoNuevo === "reembolsado"
        ? ["pagado", "entregado"]
        : ["pendiente", "rechazado"];

    const actualizados = await tx
      .update(pedido)
      .set({
        estado: estadoNuevo,
        ...(estadoNuevo === "pagado" ? { pagadoEn: new Date() } : {}),
      })
      .where(
        and(
          eq(pedido.id, p.id),
          sql`${pedido.estado} in ${desde}`,
        ),
      )
      .returning({ id: pedido.id });

    return {
      ok: true as const,
      // "sin-cambios" cuando el pedido ya estaba en ese estado: es el caso
      // normal de un reintento de Mercado Pago, no un error.
      accion: actualizados.length > 0 ? ("aplicado" as const) : ("sin-cambios" as const),
      pedidoId: p.id,
    };
  });
}
