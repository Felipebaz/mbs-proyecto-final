import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import { ingrediente, receta, type Ingrediente } from "@/lib/db/esquema";
import { buscarPorSku } from "@/lib/catalogo/queries";
import { preciosVigentes } from "./ingredientes";
import { ErrorCosto } from "./ingredientes";

/**
 * Recetas y costo por SKU.
 *
 * El costo NO se guarda: se calcula cada vez desde la receta y los precios
 * vigentes. Guardarlo significaría que cambiar el precio de la naranja deja
 * desactualizados todos los costos hasta que alguien corra un recálculo — y
 * nadie se acuerda de correr recálculos.
 */

export interface LineaReceta {
  ingredienteId: string;
  nombre: string;
  unidad: Ingrediente["unidad"];
  cantidad: number;
  /** Centésimos por unidad base. `null` si el ingrediente no tiene precio. */
  precioPorUnidad: number | null;
  /** cantidad × precio. `null` si falta el precio. */
  costo: number | null;
}

export interface CostoSku {
  sku: string;
  lineas: LineaReceta[];
  /** Suma de los costos. En centésimos. */
  costo: number;
  /**
   * true si algún ingrediente no tiene precio cargado.
   *
   * Importa distinguirlo de "costo 0": un costo incompleto mostrado como si
   * fuera completo da un margen inflado, y sobre eso se toman decisiones de
   * precio.
   */
  incompleto: boolean;
  /** Ingredientes sin precio, para poder avisar qué falta cargar. */
  faltanPrecios: string[];
}

export async function recetaDe(sku: string): Promise<LineaReceta[]> {
  const filas = await db
    .select({
      ingredienteId: receta.ingredienteId,
      cantidad: receta.cantidad,
      nombre: ingrediente.nombre,
      unidad: ingrediente.unidad,
    })
    .from(receta)
    .innerJoin(ingrediente, eq(receta.ingredienteId, ingrediente.id))
    .where(eq(receta.sku, sku))
    .orderBy(ingrediente.nombre);

  const precios = await preciosVigentes();

  return filas.map((f) => {
    const precio = precios.get(f.ingredienteId) ?? null;
    return {
      ...f,
      precioPorUnidad: precio,
      costo: precio === null ? null : precio * f.cantidad,
    };
  });
}

/**
 * Costo de un SKU.
 *
 * @param momento Para calcular con los precios de otra fecha. Es lo que hace
 * posible el margen histórico.
 */
export async function costoDe(
  sku: string,
  momento: Date = new Date(),
): Promise<CostoSku> {
  const filas = await db
    .select({
      ingredienteId: receta.ingredienteId,
      cantidad: receta.cantidad,
      nombre: ingrediente.nombre,
      unidad: ingrediente.unidad,
    })
    .from(receta)
    .innerJoin(ingrediente, eq(receta.ingredienteId, ingrediente.id))
    .where(eq(receta.sku, sku))
    .orderBy(ingrediente.nombre);

  const precios = await preciosVigentes(momento);

  const lineas: LineaReceta[] = filas.map((f) => {
    const precio = precios.get(f.ingredienteId) ?? null;
    return {
      ...f,
      precioPorUnidad: precio,
      costo: precio === null ? null : precio * f.cantidad,
    };
  });

  const faltanPrecios = lineas.filter((l) => l.costo === null).map((l) => l.nombre);

  return {
    sku,
    lineas,
    costo: lineas.reduce((t, l) => t + (l.costo ?? 0), 0),
    // Sin receta también es incompleto: un SKU sin receta no cuesta cero, se
    // desconoce cuánto cuesta.
    incompleto: faltanPrecios.length > 0 || lineas.length === 0,
    faltanPrecios,
  };
}

/** Reemplaza la receta entera de un SKU. */
export async function guardarReceta(
  sku: string,
  lineas: readonly { ingredienteId: string; cantidad: number }[],
): Promise<void> {
  if (!buscarPorSku(sku)) {
    throw new ErrorCosto(`El SKU "${sku}" no existe en el catálogo.`);
  }

  for (const l of lineas) {
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) {
      throw new ErrorCosto("Las cantidades tienen que ser enteros mayores que cero.");
    }
  }

  // Reemplazo completo dentro de una transacción: si se borrara y fallara el
  // insert, el SKU quedaría sin receta y su costo pasaría a desconocido.
  await db.transaction(async (tx) => {
    await tx.delete(receta).where(eq(receta.sku, sku));

    if (lineas.length > 0) {
      await tx.insert(receta).values(
        lineas.map((l) => ({
          sku,
          ingredienteId: l.ingredienteId,
          cantidad: l.cantidad,
        })),
      );
    }
  });
}

/** Costos de varios SKUs en una sola pasada. Para la pantalla de rentabilidad. */
export async function costosDe(
  skus: readonly string[],
  momento: Date = new Date(),
): Promise<Map<string, CostoSku>> {
  const salida = new Map<string, CostoSku>();
  for (const sku of skus) {
    salida.set(sku, await costoDe(sku, momento));
  }
  return salida;
}
