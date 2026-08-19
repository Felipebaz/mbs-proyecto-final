import { CATEGORIAS_DATA } from "./categorias";
import { PRODUCTOS } from "./productos";
import type {
  Categoria,
  CategoriaId,
  PackFijo,
  PrecioUYU,
  Producto,
  Variante,
} from "@/types/producto";
import { CATEGORIAS, esPackArmable, esPackFijo, precioTotal } from "@/types/producto";

/**
 * Única puerta de entrada al catálogo. Los componentes nunca importan
 * productos.ts directo.
 *
 * Son async aunque hoy resuelvan en memoria: cuando el catálogo se mude a un
 * CMS o a una base, la firma no cambia y no hay que tocar ningún componente.
 */

export async function getProductos(): Promise<Producto[]> {
  return [...PRODUCTOS];
}

export async function getProductoBySlug(
  slug: string,
): Promise<Producto | null> {
  return PRODUCTOS.find((p) => p.slug === slug) ?? null;
}

export async function getProductosPorCategoria(
  categoria: CategoriaId,
): Promise<Producto[]> {
  return PRODUCTOS.filter((p) => p.categoria === categoria);
}

/** Los del carrusel de la landing. */
export async function getProductosDestacados(): Promise<Producto[]> {
  return PRODUCTOS.filter((p) => p.destacado);
}

/** Para generateStaticParams: prerenderiza toda ficha de producto. */
export async function getSlugs(): Promise<string[]> {
  return PRODUCTOS.map((p) => p.slug);
}

/** Solo las categorías activas, ordenadas. Alimenta el filtro del catálogo. */
export async function getCategorias(): Promise<Categoria[]> {
  return CATEGORIAS.map((id) => CATEGORIAS_DATA[id])
    .filter((c) => c.activa)
    .sort((a, b) => a.orden - b.orden);
}

/** Valida un ?categoria= de la URL antes de usarlo como filtro. */
export function esCategoriaValida(valor: string): valor is CategoriaId {
  return (CATEGORIAS as readonly string[]).includes(valor);
}

export async function getVariante(
  slug: string,
  varianteId: string,
): Promise<{ producto: Producto; variante: Variante } | null> {
  const producto = await getProductoBySlug(slug);
  if (!producto) return null;

  const variante = producto.variantes.find((v) => v.id === varianteId);
  if (!variante) return null;

  return { producto, variante };
}

/* -------------------------------------------------------------------------
 * Packs
 *
 * El contenido se guarda por SKU y se resuelve acá. Los precios del pack no
 * duplican los de los jugos: si mañana sube el Rojo, el ahorro se corrige solo.
 * ---------------------------------------------------------------------- */

function buscarPorSku(
  sku: string,
): { producto: Producto; variante: Variante } | null {
  for (const producto of PRODUCTOS) {
    const variante = producto.variantes.find((v) => v.sku === sku);
    if (variante) return { producto, variante };
  }
  return null;
}

export interface LineaPackResuelta {
  producto: Producto;
  variante: Variante;
  cantidad: number;
}

/** Qué jugos hay adentro, listos para la ficha del pack. */
export async function getContenidoPack(
  pack: PackFijo,
): Promise<LineaPackResuelta[]> {
  return pack.contenido.map((linea) => {
    const encontrado = buscarPorSku(linea.sku);
    if (!encontrado) {
      throw new Error(
        `Pack "${pack.slug}": el SKU "${linea.sku}" no existe en el catálogo.`,
      );
    }
    return { ...encontrado, cantidad: linea.cantidad };
  });
}

/** Lo que costaría comprar el contenido botella por botella. */
export async function precioSueltoPack(pack: PackFijo): Promise<PrecioUYU> {
  const contenido = await getContenidoPack(pack);
  return contenido.reduce(
    (total, l) => total + precioTotal(l.variante) * l.cantidad,
    0,
  );
}

/** El argumento de venta: "ahorrás $150". Nunca escrito a mano. */
export async function ahorroPack(pack: PackFijo): Promise<PrecioUYU> {
  const suelto = await precioSueltoPack(pack);
  return suelto - precioTotal(pack.variantes[0]);
}

/**
 * Un SKU mal tipeado apunta a la nada y TypeScript no lo ve: es un string.
 * Esto lo caza. Correr en tests o al levantar, no en cada request.
 */
export function validarCatalogo(): string[] {
  const errores: string[] = [];
  const vistos = new Map<string, string>();

  for (const producto of PRODUCTOS) {
    for (const v of producto.variantes) {
      const duenoPrevio = vistos.get(v.sku);
      if (duenoPrevio) {
        errores.push(
          `SKU duplicado "${v.sku}": lo usan "${duenoPrevio}" y "${producto.slug}".`,
        );
      }
      vistos.set(v.sku, producto.slug);
    }

    if (!producto.variantes.some((v) => v.id === producto.varianteDefaultId)) {
      errores.push(
        `"${producto.slug}": varianteDefaultId "${producto.varianteDefaultId}" no existe entre sus variantes.`,
      );
    }
  }

  for (const producto of PRODUCTOS) {
    if (esPackFijo(producto)) {
      let botellas = 0;

      for (const linea of producto.contenido) {
        if (!vistos.has(linea.sku)) {
          errores.push(
            `Pack "${producto.slug}": el SKU "${linea.sku}" no existe en el catálogo.`,
          );
        }
        if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) {
          errores.push(
            `Pack "${producto.slug}": el SKU "${linea.sku}" tiene cantidad ${linea.cantidad}.`,
          );
        }
        botellas += linea.cantidad;
      }

      // El precio está en la variante y el contenido acá: si se despegan, el
      // cliente paga por 5 botellas y le llegan 4.
      for (const v of producto.variantes) {
        if (v.botellas !== botellas) {
          errores.push(
            `Pack "${producto.slug}": la variante "${v.id}" dice ${v.botellas} botellas pero el contenido suma ${botellas}.`,
          );
        }
      }
    }

    if (esPackArmable(producto)) {
      for (const sku of producto.skusElegibles) {
        if (!vistos.has(sku)) {
          errores.push(
            `Pack "${producto.slug}": el SKU elegible "${sku}" no existe.`,
          );
        }
      }
    }
  }

  return errores;
}
