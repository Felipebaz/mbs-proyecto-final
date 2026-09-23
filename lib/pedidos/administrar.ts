import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import {
  pedido,
  pedidoItem,
  usuario,
  type EstadoPedido,
  type Pedido,
} from "@/lib/db/esquema";

/**
 * Lectura y cambio de estado de pedidos, para el panel.
 *
 * Nada de acá verifica permisos: eso lo hace la server action que llama, con
 * `requerirAdmin()`. Este módulo asume que quien llegó ya está autorizado.
 */

export class ErrorAdmin extends Error {}

/**
 * Transiciones permitidas.
 *
 * No es cualquier estado a cualquier estado. Un pedido entregado no vuelve a
 * pendiente, y uno rechazado no salta a entregado sin pasar por pagado. Sin
 * esta tabla, un click equivocado deja el pedido en un estado que no describe
 * nada de lo que pasó, y después nadie entiende el historial.
 */
const TRANSICIONES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  pendiente: ["pagado", "cancelado"],
  pagado: ["entregado", "reembolsado"],
  entregado: ["reembolsado"],
  rechazado: ["pendiente", "cancelado"],
  cancelado: [],
  reembolsado: [],
};

export function transicionesDe(estado: EstadoPedido): readonly EstadoPedido[] {
  return TRANSICIONES[estado] ?? [];
}

export interface PedidoConDetalle extends Pedido {
  correoCliente: string | null;
  items: {
    sku: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
  }[];
}

export async function listarPedidos(opciones: {
  estados?: readonly EstadoPedido[];
  limite?: number;
} = {}): Promise<PedidoConDetalle[]> {
  const limite = Math.min(opciones.limite ?? 100, 500);

  const base = db
    .select({ pedido, correoCliente: usuario.email })
    .from(pedido)
    .leftJoin(usuario, eq(pedido.usuarioId, usuario.id))
    .orderBy(desc(pedido.creadoEn))
    .limit(limite);

  const filas = opciones.estados?.length
    ? await base.where(inArray(pedido.estado, [...opciones.estados]))
    : await base;

  if (filas.length === 0) return [];

  // Una consulta para todos los items, no una por pedido.
  const items = await db
    .select()
    .from(pedidoItem)
    .where(inArray(pedidoItem.pedidoId, filas.map((f) => f.pedido.id)));

  return filas.map((f) => ({
    ...f.pedido,
    correoCliente: f.correoCliente,
    items: items
      .filter((i) => i.pedidoId === f.pedido.id)
      .map((i) => ({
        sku: i.sku,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
      })),
  }));
}

export async function buscarPedido(id: string): Promise<Pedido | null> {
  const filas = await db.select().from(pedido).where(eq(pedido.id, id)).limit(1);
  return filas[0] ?? null;
}

export interface CambioEstado {
  anterior: EstadoPedido;
  nuevo: EstadoPedido;
}

/**
 * Cambia el estado de un pedido.
 *
 * La transición se valida contra la tabla Y se aplica de forma condicional en
 * SQL: el `where estado = anterior` hace que si dos admins tocan el mismo
 * pedido a la vez, el segundo falle en vez de pisar el cambio del primero.
 */
export async function cambiarEstadoPedido(
  pedidoId: string,
  nuevo: EstadoPedido,
): Promise<CambioEstado> {
  const actual = await buscarPedido(pedidoId);
  if (!actual) throw new ErrorAdmin("Ese pedido no existe.");

  if (actual.estado === nuevo) {
    throw new ErrorAdmin(`El pedido ya está "${nuevo}".`);
  }

  if (!transicionesDe(actual.estado).includes(nuevo)) {
    throw new ErrorAdmin(
      `No se puede pasar de "${actual.estado}" a "${nuevo}".`,
    );
  }

  const actualizados = await db
    .update(pedido)
    .set({
      estado: nuevo,
      ...(nuevo === "pagado" && !actual.pagadoEn ? { pagadoEn: new Date() } : {}),
    })
    .where(and(eq(pedido.id, pedidoId), eq(pedido.estado, actual.estado)))
    .returning({ id: pedido.id });

  if (actualizados.length === 0) {
    throw new ErrorAdmin(
      "Alguien más cambió el pedido mientras mirabas. Recargá y probá de nuevo.",
    );
  }

  return { anterior: actual.estado, nuevo };
}

/** Totales para el tablero. Una consulta, no una por estado. */
export async function resumenPedidos(): Promise<
  { estado: EstadoPedido; cantidad: number; total: number }[]
> {
  return db
    .select({
      estado: pedido.estado,
      cantidad: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${pedido.total}), 0)::int`,
    })
    .from(pedido)
    .groupBy(pedido.estado);
}
