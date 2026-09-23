import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/cliente";
import { pedido, pedidoItem, type Pedido } from "@/lib/db/esquema";
import { calcularCarrito, type LineaPedida } from "@/lib/carrito/calculo";

/**
 * Creación del pedido.
 *
 * Acá se revalida TODO contra el catálogo, otra vez, aunque el carrito ya lo
 * haya hecho al mostrarse. Entre que la persona vio el carrito y apretó pagar
 * pudo pasar cualquier cosa: un producto se dio de baja, un precio cambió, o
 * alguien editó el POST a mano.
 *
 * [decisión] No hay reserva de stock.
 *
 * El plan original la pedía, pero Anima prepara a pedido: toma los pedidos y
 * después compra los ingredientes. No hay inventario que reservar ni tope de
 * producción por día. Lo único que se valida es que la variante siga
 * disponible. Si algún día hay tope, entra acá.
 */

export interface DatosEntrega {
  nombre: string;
  telefono: string;
  direccion: string;
  notas?: string | null;
}

export class ErrorPedido extends Error {}

/**
 * Referencia pública del pedido.
 *
 * Aleatoria y no correlativa: viaja a Mercado Pago como `external_reference` y
 * aparece en URLs. Con `pedido-3` cualquiera deduce cuántas ventas hubo y
 * prueba `pedido-4` para ver el de otro.
 */
function nuevaReferencia(): string {
  return `ped_${randomBytes(12).toString("base64url")}`;
}

export interface PedidoCreado {
  pedido: Pedido;
  items: {
    sku: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
  }[];
}

export async function crearPedido(
  lineas: readonly LineaPedida[],
  entrega: DatosEntrega,
  opciones: {
    usuarioId?: string | null;
    botellasDevueltas?: number;
    origen?: "web" | "manual";
  } = {},
): Promise<PedidoCreado> {
  const botellasDevueltas = Math.max(0, Math.floor(opciones.botellasDevueltas ?? 0));

  // Revalidación: el precio sale del catálogo, nunca del navegador.
  const calculado = calcularCarrito(lineas, botellasDevueltas);

  if (calculado.lineas.length === 0) {
    throw new ErrorPedido(
      calculado.rechazadas[0]?.motivo ?? "No hay nada para cobrar.",
    );
  }

  /*
   * Si algo se cayó del catálogo entre el carrito y el pago, se frena el pedido
   * entero en vez de cobrar lo que quedó. Cobrar de menos y mandar menos jugos
   * de los que la persona creía pedir es peor que hacerla volver al carrito.
   */
  if (calculado.rechazadas.length > 0) {
    throw new ErrorPedido(
      `Algo cambió mientras comprabas: ${calculado.rechazadas[0].motivo} ` +
        "Revisá el carrito antes de pagar.",
    );
  }

  const total = calculado.total;
  if (total <= 0) {
    throw new ErrorPedido("El total tiene que ser mayor que cero.");
  }

  return db.transaction(async (tx) => {
    const [creado] = await tx
      .insert(pedido)
      .values({
        referencia: nuevaReferencia(),
        usuarioId: opciones.usuarioId ?? null,
        origen: opciones.origen ?? "web",
        estado: "pendiente",
        total,
        moneda: "UYU",
        nombreEntrega: entrega.nombre,
        telefono: entrega.telefono,
        direccion: entrega.direccion,
        notas: entrega.notas ?? null,
        botellasDevueltas: calculado.envases.devueltasAplicadas,
      })
      .returning();

    // Precios congelados: si mañana sube el jugo verde, este pedido sigue
    // diciendo lo que la persona pagó.
    await tx.insert(pedidoItem).values(
      calculado.lineas.map((l) => ({
        pedidoId: creado.id,
        sku: l.sku,
        descripcion: `${l.producto.nombre} ${l.variante.nombre}`,
        cantidad: l.cantidad,
        precioUnitario: l.variante.precio,
        envaseUnitario: l.envasePorBotella,
        botellas: l.botellas,
        configuracion: l.configuracion ? [...l.configuracion] : null,
      })),
    );

    /*
     * Los items que se le mandan al proveedor tienen que SUMAR el total exacto
     * del pedido. Mercado Pago cobra la suma de los items, no el campo total;
     * si no coinciden, el webhook rechaza un pago que en realidad estuvo bien.
     *
     * El envase va como una línea aparte en vez de sumarse al precio del jugo,
     * así el cliente ve en la pantalla de MP el mismo desglose que en el
     * carrito.
     */
    const items = calculado.lineas.map((l) => ({
      sku: l.sku,
      descripcion: `${l.producto.nombre} ${l.variante.nombre}`,
      cantidad: l.cantidad,
      precioUnitario: l.variante.precio,
    }));

    if (calculado.envases.totalEnvase > 0) {
      items.push({
        sku: "ENVASE",
        descripcion:
          calculado.envases.devueltasAplicadas > 0
            ? `Envases (descontando ${calculado.envases.devueltasAplicadas} devueltos)`
            : "Envases retornables",
        cantidad: 1,
        precioUnitario: calculado.envases.totalEnvase,
      });
    }

    const suma = items.reduce((t, i) => t + i.precioUnitario * i.cantidad, 0);
    if (suma !== total) {
      // Si esto salta, hay un bug en el cálculo. Mejor romper acá que cobrar
      // un importe distinto al que se guardó en el pedido.
      throw new ErrorPedido(
        `Descuadre interno: los items suman ${suma} y el total es ${total}.`,
      );
    }

    return { pedido: creado, items };
  });
}
