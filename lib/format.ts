import type { PrecioUYU } from "@/types/producto";

/**
 * Los precios se guardan en centésimos y se formatean acá. Un solo lugar
 * donde vive la conversión: si mañana hay que mostrar USD o sumar IVA, se
 * toca este archivo.
 */

const formatterUYU = new Intl.NumberFormat("es-UY", {
  style: "currency",
  currency: "UYU",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPrecio(precio: PrecioUYU): string {
  return formatterUYU.format(precio / 100);
}

export function formatVolumen(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toLocaleString("es-UY")} L` : `${ml} ml`;
}

/** "Pepino, manzana verde y espinaca" — para la card del carrusel. */
export function formatLista(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
