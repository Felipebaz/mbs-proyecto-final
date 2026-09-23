import "server-only";

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import { ingrediente, pedido, pedidoItem, receta } from "@/lib/db/esquema";
import { esPackFijo } from "@/types/producto";
import { buscarPorSku, getProductoBySlug } from "@/lib/catalogo/queries";
import { preciosVigentes } from "./ingredientes";

/**
 * Lista de compra.
 *
 * Es el flujo real del negocio: Anima toma pedidos y DESPUÉS compra los
 * ingredientes. Esta pantalla responde la única pregunta que importa el día
 * antes de producir: qué hay que ir a comprar y cuánto va a salir.
 *
 * Por eso cuenta los pedidos **pendientes** además de los pagados: un pedido sin
 * confirmar todavía puede concretarse, y quedarse corto de fruta es peor que
 * comprar un poco de más. Se muestran separados para poder decidir.
 */

/** Cuentan para la compra: lo pagado es seguro, lo pendiente puede caerse. */
const ESTADOS_A_PRODUCIR = ["pendiente", "pagado"] as const;

export interface LineaCompra {
  ingredienteId: string;
  nombre: string;
  unidad: string;
  proveedor: string | null;
  /** Cantidad total en unidad base, de pedidos ya pagados. */
  cantidadConfirmada: number;
  /** Cantidad adicional si se concretan los pendientes. */
  cantidadPendiente: number;
  /** Suma de las dos: lo que conviene comprar. */
  cantidadTotal: number;
  /** Centésimos por unidad base. `null` si falta cargar el precio. */
  precioPorUnidad: number | null;
  /** cantidadTotal × precio. `null` si falta el precio. */
  costoEstimado: number | null;
}

export interface ListaCompra {
  desde: Date;
  hasta: Date;
  lineas: LineaCompra[];
  /** Suma de los costos que se pudieron calcular. */
  costoTotal: number;
  /** Ingredientes sin precio: el total está incompleto. */
  faltanPrecios: string[];
  /** SKUs vendidos que no tienen receta: no se pueden incluir. */
  skusSinReceta: string[];
  pedidosConfirmados: number;
  pedidosPendientes: number;
}

/**
 * Expande un SKU a las botellas que realmente se producen.
 *
 * Un pack fijo no tiene receta propia: lo que se produce son los jugos que
 * trae. Sin esta expansión, la lista de compra ignora todo lo vendido en packs
 * — que es buena parte de las ventas.
 */
async function expandirSku(
  sku: string,
  cantidad: number,
): Promise<{ sku: string; cantidad: number }[]> {
  const encontrado = buscarPorSku(sku);
  if (!encontrado) return [];

  const { producto } = encontrado;

  if (esPackFijo(producto)) {
    return producto.contenido.map((linea) => ({
      sku: linea.sku,
      cantidad: linea.cantidad * cantidad,
    }));
  }

  return [{ sku, cantidad }];
}

export async function listaDeCompra(
  desde: Date,
  hasta: Date,
): Promise<ListaCompra> {
  const filas = await db
    .select({
      sku: pedidoItem.sku,
      cantidad: pedidoItem.cantidad,
      configuracion: pedidoItem.configuracion,
      pedidoId: pedidoItem.pedidoId,
      estado: pedido.estado,
    })
    .from(pedidoItem)
    .innerJoin(pedido, eq(pedidoItem.pedidoId, pedido.id))
    .where(
      and(
        inArray(pedido.estado, [...ESTADOS_A_PRODUCIR]),
        gte(pedido.creadoEn, desde),
        lt(pedido.creadoEn, hasta),
      ),
    );

  /** sku → { confirmadas, pendientes } de botellas a producir. */
  const botellas = new Map<string, { confirmadas: number; pendientes: number }>();
  const confirmados = new Set<string>();
  const pendientes = new Set<string>();

  for (const fila of filas) {
    if (fila.estado === "pagado") confirmados.add(fila.pedidoId);
    else pendientes.add(fila.pedidoId);

    if (fila.sku === "ENVASE") continue;

    /*
     * Un pack armable lleva lo que eligió el cliente, que está en
     * `configuracion`. Sin esto, se produciría la receta del pack —que no
     * existe— y no los jugos que pidió.
     */
    const aProducir =
      fila.configuracion && fila.configuracion.length > 0
        ? fila.configuracion.map((s) => ({ sku: s, cantidad: fila.cantidad }))
        : await expandirSku(fila.sku, fila.cantidad);

    for (const item of aProducir) {
      const acumulado = botellas.get(item.sku) ?? { confirmadas: 0, pendientes: 0 };
      if (fila.estado === "pagado") acumulado.confirmadas += item.cantidad;
      else acumulado.pendientes += item.cantidad;
      botellas.set(item.sku, acumulado);
    }
  }

  // Recetas de todos los SKUs involucrados, en una sola consulta.
  const skus = [...botellas.keys()];

  const recetas = skus.length
    ? await db
        .select({
          sku: receta.sku,
          ingredienteId: receta.ingredienteId,
          cantidad: receta.cantidad,
          nombre: ingrediente.nombre,
          unidad: ingrediente.unidad,
          proveedor: ingrediente.proveedor,
        })
        .from(receta)
        .innerJoin(ingrediente, eq(receta.ingredienteId, ingrediente.id))
        .where(inArray(receta.sku, skus))
    : [];

  const conReceta = new Set(recetas.map((r) => r.sku));
  const skusSinReceta = skus.filter((s) => !conReceta.has(s));

  const porIngrediente = new Map<string, LineaCompra>();

  for (const r of recetas) {
    const b = botellas.get(r.sku);
    if (!b) continue;

    const linea = porIngrediente.get(r.ingredienteId) ?? {
      ingredienteId: r.ingredienteId,
      nombre: r.nombre,
      unidad: r.unidad,
      proveedor: r.proveedor,
      cantidadConfirmada: 0,
      cantidadPendiente: 0,
      cantidadTotal: 0,
      precioPorUnidad: null,
      costoEstimado: null,
    };

    linea.cantidadConfirmada += r.cantidad * b.confirmadas;
    linea.cantidadPendiente += r.cantidad * b.pendientes;
    porIngrediente.set(r.ingredienteId, linea);
  }

  const precios = await preciosVigentes();

  const lineas = [...porIngrediente.values()]
    .map((l) => {
      const precio = precios.get(l.ingredienteId) ?? null;
      const total = l.cantidadConfirmada + l.cantidadPendiente;

      return {
        ...l,
        cantidadTotal: total,
        precioPorUnidad: precio,
        costoEstimado: precio === null ? null : precio * total,
      };
    })
    // Por proveedor y después por nombre: así la lista se recorre en el orden
    // en que se hacen las compras.
    .sort(
      (a, b) =>
        (a.proveedor ?? "zzz").localeCompare(b.proveedor ?? "zzz") ||
        a.nombre.localeCompare(b.nombre),
    );

  return {
    desde,
    hasta,
    lineas,
    costoTotal: lineas.reduce((t, l) => t + (l.costoEstimado ?? 0), 0),
    faltanPrecios: lineas.filter((l) => l.precioPorUnidad === null).map((l) => l.nombre),
    skusSinReceta,
    pedidosConfirmados: confirmados.size,
    pedidosPendientes: pendientes.size,
  };
}

/** Nombre legible de un SKU, para avisar de los que no tienen receta. */
export async function nombreDeSku(sku: string): Promise<string> {
  const encontrado = buscarPorSku(sku);
  if (!encontrado) return sku;

  const producto = await getProductoBySlug(encontrado.producto.slug);
  return producto
    ? `${producto.nombre} ${encontrado.variante.nombre}`
    : sku;
}
