import "server-only";

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import { pedido, pedidoItem } from "@/lib/db/esquema";
import { buscarPorSku } from "@/lib/catalogo/queries";
import { costoDe, type CostoSku } from "./recetas";

/**
 * Rentabilidad.
 *
 * Todo en centésimos enteros. El margen se calcula sobre el precio del
 * CONTENIDO, sin el envase: el envase se cobra y se devuelve, no es margen.
 *
 * Sólo cuenta lo que se pagó de verdad. Un pedido pendiente o rechazado no es
 * una venta, y contarlo infla el número sobre el que se decide si subir precios.
 */

/** Estados que cuentan como venta concretada. */
const ESTADOS_VENDIDOS = ["pagado", "entregado"] as const;

export interface RentabilidadSku {
  sku: string;
  descripcion: string;
  unidades: number;
  /** Lo facturado de contenido, sin envases. */
  ingresos: number;
  /** Costo de ingredientes por las unidades vendidas. */
  costos: number;
  /** ingresos − costos. */
  margen: number;
  /** margen / ingresos, en porcentaje con un decimal. `null` si no hubo ingresos. */
  margenPorcentaje: number | null;
  /** true si a algún ingrediente le falta el precio: el margen está inflado. */
  incompleto: boolean;
}

export interface Rentabilidad {
  desde: Date;
  hasta: Date;
  porSku: RentabilidadSku[];
  ingresos: number;
  costos: number;
  margen: number;
  margenPorcentaje: number | null;
  pedidos: number;
  /** Cuántos SKUs tienen el costo incompleto. */
  skusIncompletos: number;
}

function porcentaje(ingresos: number, costos: number): number | null {
  if (ingresos <= 0) return null;
  // Un decimal: más precisión en un margen es ruido.
  return Math.round(((ingresos - costos) / ingresos) * 1000) / 10;
}

export async function rentabilidad(desde: Date, hasta: Date): Promise<Rentabilidad> {
  const filas = await db
    .select({
      sku: pedidoItem.sku,
      descripcion: pedidoItem.descripcion,
      cantidad: pedidoItem.cantidad,
      precioUnitario: pedidoItem.precioUnitario,
      pedidoId: pedidoItem.pedidoId,
      pagadoEn: pedido.pagadoEn,
      creadoEn: pedido.creadoEn,
    })
    .from(pedidoItem)
    .innerJoin(pedido, eq(pedidoItem.pedidoId, pedido.id))
    .where(
      and(
        inArray(pedido.estado, [...ESTADOS_VENDIDOS]),
        gte(pedido.creadoEn, desde),
        lt(pedido.creadoEn, hasta),
      ),
    );

  /*
   * Caché de costos por SKU y día.
   *
   * Sin esto, cada línea de cada pedido dispara un cálculo de costo con su
   * propia consulta de precios: un mes con 200 pedidos hace cientos de
   * consultas iguales. El día alcanza como granularidad porque los precios de
   * ingredientes no cambian varias veces en una jornada.
   */
  const cache = new Map<string, CostoSku>();

  async function costoCacheado(sku: string, momento: Date): Promise<CostoSku> {
    const dia = momento.toISOString().slice(0, 10);
    const clave = `${sku}@${dia}`;

    const guardado = cache.get(clave);
    if (guardado) return guardado;

    const calculado = await costoDe(sku, momento);
    cache.set(clave, calculado);
    return calculado;
  }

  const porSku = new Map<string, RentabilidadSku>();
  const pedidosVistos = new Set<string>();

  for (const fila of filas) {
    pedidosVistos.add(fila.pedidoId);

    // El envase no es un producto: se cobra y se devuelve.
    if (fila.sku === "ENVASE") continue;

    /*
     * El costo se calcula con los precios vigentes CUANDO se vendió, no con los
     * de hoy. Si no, el margen de marzo se recalcula con los costos actuales y
     * deja de decir lo que pasó en marzo.
     */
    const costo = await costoCacheado(fila.sku, fila.pagadoEn ?? fila.creadoEn);

    const acumulado = porSku.get(fila.sku) ?? {
      sku: fila.sku,
      descripcion: fila.descripcion,
      unidades: 0,
      ingresos: 0,
      costos: 0,
      margen: 0,
      margenPorcentaje: null,
      incompleto: false,
    };

    acumulado.unidades += fila.cantidad;
    acumulado.ingresos += fila.precioUnitario * fila.cantidad;
    acumulado.costos += costo.costo * fila.cantidad;
    acumulado.incompleto = acumulado.incompleto || costo.incompleto;

    porSku.set(fila.sku, acumulado);
  }

  const lista = [...porSku.values()].map((r) => ({
    ...r,
    margen: r.ingresos - r.costos,
    margenPorcentaje: porcentaje(r.ingresos, r.costos),
  }));

  // Lo que menos margen deja, primero: es lo que hay que mirar. Los que no se
  // pueden calcular van al final, no arriba como si fueran los peores.
  lista.sort(
    (a, b) => (a.margenPorcentaje ?? 9999) - (b.margenPorcentaje ?? 9999),
  );

  const ingresos = lista.reduce((t, r) => t + r.ingresos, 0);
  const costos = lista.reduce((t, r) => t + r.costos, 0);

  return {
    desde,
    hasta,
    porSku: lista,
    ingresos,
    costos,
    margen: ingresos - costos,
    margenPorcentaje: porcentaje(ingresos, costos),
    pedidos: pedidosVistos.size,
    skusIncompletos: lista.filter((r) => r.incompleto).length,
  };
}

/**
 * Semana de lunes a domingo que contiene a `fecha`.
 *
 * Arranca el lunes y no el domingo: es cómo se cuenta una semana de trabajo acá,
 * y los packs se venden de lunes a viernes.
 */
export function semanaDe(fecha: Date): { desde: Date; hasta: Date } {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);

  // getDay() da 0 para domingo; se corre para que el lunes sea 0.
  const diaDesdeLunes = (d.getDay() + 6) % 7;

  const desde = new Date(d);
  desde.setDate(d.getDate() - diaDesdeLunes);

  const hasta = new Date(desde);
  hasta.setDate(desde.getDate() + 7);

  return { desde, hasta };
}

/** El precio de venta del contenido según el catálogo. Para comparar. */
export function precioCatalogo(sku: string): number | null {
  return buscarPorSku(sku)?.variante.precio ?? null;
}
