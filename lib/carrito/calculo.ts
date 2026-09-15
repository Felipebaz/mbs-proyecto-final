import { armarPack } from "@/lib/catalogo/pack-armable";
import { buscarPorSku } from "@/lib/catalogo/queries";
import {
  esPackArmable,
  esPackFijo,
  type PrecioUYU,
  type Producto,
  type Variante,
} from "@/types/producto";
import { calcularEnvases, type LineaConEnvase, type ResultadoEnvases } from "./envases";

/**
 * El precio del carrito, calculado desde el catálogo.
 *
 * Esta es la regla que sostiene todo: del navegador llega SKU, cantidad y —para
 * un pack armable— qué eligió. Nunca un precio. Si el precio viajara desde el
 * cliente, alguien edita el POST y compra un pack de $1.100 por $1.
 *
 * Función pura, sin base de datos: se puede testear entera.
 */

/** Lo que el cliente pidió. Es lo único que se persiste de una línea. */
export interface LineaPedida {
  sku: string;
  cantidad: number;
  /** SKUs elegidos, sólo para packs armables. */
  configuracion?: readonly string[] | null;
}

export interface LineaCalculada {
  sku: string;
  huella: string;
  producto: Producto;
  variante: Variante;
  cantidad: number;
  configuracion: readonly string[] | null;
  /** Contenido, sin envase, por la cantidad pedida. */
  subtotal: PrecioUYU;
  /** Botellas físicas que aporta esta línea. Un pack de 5 aporta 5. */
  botellas: number;
  /** Envase de UNA botella de esta línea. */
  envasePorBotella: PrecioUYU;
}

export interface CarritoCalculado {
  lineas: LineaCalculada[];
  /** Líneas descartadas y por qué. El SKU pudo salir del catálogo. */
  rechazadas: { sku: string; motivo: string }[];
  subtotal: PrecioUYU;
  envases: ResultadoEnvases;
  total: PrecioUYU;
  unidades: number;
}

export const CANTIDAD_MAXIMA = 50;

/**
 * Sanea la cantidad. Viene de un input o de un POST crudo: puede ser negativa,
 * decimal, `NaN` o 10^9. El tope no es decorativo — sin él, una cantidad enorme
 * desborda el total y bloquea stock que no existe.
 */
export function sanearCantidad(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.min(CANTIDAD_MAXIMA, Math.max(0, Math.floor(n)));
}

/**
 * Identifica el contenido de un pack armable para poder deduplicar líneas.
 * Se ordena antes de serializar: elegir A,B,C y C,B,A es el mismo pack.
 */
export function huellaDe(configuracion: readonly string[] | null | undefined): string {
  if (!configuracion || configuracion.length === 0) return "";
  return [...configuracion].sort().join("|");
}

function botellasDeVariante(producto: Producto, variante: Variante): number {
  if (esPackFijo(producto) || esPackArmable(producto)) {
    // `VariantePack` trae `botellas`. El envase de la variante es el total del
    // pack, así que el de una botella es esa división.
    const v = variante as Variante & { botellas?: number };
    return v.botellas && v.botellas > 0 ? v.botellas : 1;
  }
  return 1;
}

export function calcularCarrito(
  pedidas: readonly LineaPedida[],
  botellasDevueltas = 0,
): CarritoCalculado {
  const lineas: LineaCalculada[] = [];
  const rechazadas: { sku: string; motivo: string }[] = [];

  for (const pedida of pedidas) {
    const cantidad = sanearCantidad(pedida.cantidad);
    if (cantidad === 0) continue;

    const encontrado = buscarPorSku(pedida.sku);
    if (!encontrado) {
      // El SKU estaba en el carrito y se dio de baja del catálogo. No es un
      // error del cliente: se saca la línea y se le avisa.
      rechazadas.push({ sku: pedida.sku, motivo: "Ya no está disponible." });
      continue;
    }

    const { producto, variante } = encontrado;

    if (!variante.disponible) {
      rechazadas.push({ sku: pedida.sku, motivo: "Sin stock por ahora." });
      continue;
    }

    const configuracion = pedida.configuracion ?? null;
    let subtotal: PrecioUYU;

    if (esPackArmable(producto)) {
      if (!configuracion || configuracion.length === 0) {
        rechazadas.push({
          sku: pedida.sku,
          motivo: "Un pack armable necesita que elijas qué lleva.",
        });
        continue;
      }

      // `armarPack` valida que los SKUs sean elegibles y que la cantidad de
      // botellas coincida con el tamaño. Se reusa acá en vez de repetir la
      // regla: si mañana cambia, cambia en un solo lugar.
      const conteo = new Map<string, number>();
      for (const sku of configuracion) {
        conteo.set(sku, (conteo.get(sku) ?? 0) + 1);
      }
      const seleccion = [...conteo].map(([sku, c]) => ({ sku, cantidad: c }));

      const armado = armarPack(producto, variante.id, seleccion);
      if (!armado.ok) {
        rechazadas.push({ sku: pedida.sku, motivo: armado.errores[0] });
        continue;
      }
      subtotal = armado.pack.precio * cantidad;
    } else {
      subtotal = variante.precio * cantidad;
    }

    const botellasPorUnidad = botellasDeVariante(producto, variante);

    lineas.push({
      sku: pedida.sku,
      huella: huellaDe(configuracion),
      producto,
      variante,
      cantidad,
      configuracion,
      subtotal,
      botellas: botellasPorUnidad * cantidad,
      // El envase de la variante de un pack es el del pack entero; el que se
      // perdona de a uno es el de cada botella.
      envasePorBotella: Math.round(variante.envase / botellasPorUnidad),
    });
  }

  const subtotal = lineas.reduce((t, l) => t + l.subtotal, 0);

  const paraEnvases: LineaConEnvase[] = lineas.map((l) => ({
    sku: l.sku,
    envase: l.envasePorBotella,
    cantidad: l.botellas,
  }));

  const envases = calcularEnvases(paraEnvases, botellasDevueltas);

  return {
    lineas,
    rechazadas,
    subtotal,
    envases,
    total: subtotal + envases.totalEnvase,
    unidades: lineas.reduce((t, l) => t + l.cantidad, 0),
  };
}
