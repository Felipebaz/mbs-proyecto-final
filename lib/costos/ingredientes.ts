import "server-only";

import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import {
  ingrediente,
  precioIngrediente,
  type Ingrediente,
  type Unidad,
} from "@/lib/db/esquema";

/**
 * Ingredientes y su historial de precios.
 *
 * Los precios nunca se sobreescriben: cada cambio es una fila nueva con su
 * fecha de vigencia. Es lo que permite calcular la rentabilidad de una semana
 * con los costos que regían ESA semana — si se hiciera UPDATE, el margen de
 * marzo se recalcularía con los precios de hoy y el número dejaría de
 * significar algo.
 */

export class ErrorCosto extends Error {}

export interface IngredienteConPrecio extends Ingrediente {
  /** Centésimos por unidad base. `null` si nunca se le cargó precio. */
  precioActual: number | null;
  notaPrecio: string | null;
  precioDesde: Date | null;
}

export async function listarIngredientes(): Promise<IngredienteConPrecio[]> {
  const ingredientes = await db
    .select()
    .from(ingrediente)
    .orderBy(ingrediente.nombre);

  // Una consulta por ingrediente sería N+1; se traen todos los precios y se
  // resuelve en memoria. Son decenas de ingredientes, no miles.
  const precios = await db
    .select()
    .from(precioIngrediente)
    .orderBy(desc(precioIngrediente.desde));

  const ahora = Date.now();

  return ingredientes.map((ing) => {
    const vigente = precios.find(
      (p) => p.ingredienteId === ing.id && p.desde.getTime() <= ahora,
    );

    return {
      ...ing,
      precioActual: vigente?.precioPorUnidad ?? null,
      notaPrecio: vigente?.nota ?? null,
      precioDesde: vigente?.desde ?? null,
    };
  });
}

export async function crearIngrediente(datos: {
  nombre: string;
  unidad: Unidad;
  proveedor?: string | null;
}): Promise<Ingrediente> {
  const [creado] = await db
    .insert(ingrediente)
    .values({
      nombre: datos.nombre.trim(),
      unidad: datos.unidad,
      proveedor: datos.proveedor?.trim() || null,
    })
    .returning();

  return creado;
}

/**
 * Registra un precio nuevo. **No actualiza el anterior.**
 *
 * @param desde Cuándo empieza a regir. Por defecto ahora. Se puede fechar en el
 * pasado para cargar un precio que ya venía rigiendo sin haberse anotado.
 */
export async function registrarPrecio(datos: {
  ingredienteId: string;
  precioPorUnidad: number;
  nota?: string | null;
  desde?: Date;
  registradoPor?: string | null;
}): Promise<void> {
  if (!Number.isInteger(datos.precioPorUnidad) || datos.precioPorUnidad < 0) {
    throw new ErrorCosto("El precio tiene que ser un entero en centésimos.");
  }

  try {
    await db.insert(precioIngrediente).values({
      ingredienteId: datos.ingredienteId,
      precioPorUnidad: datos.precioPorUnidad,
      nota: datos.nota?.trim() || null,
      desde: datos.desde ?? new Date(),
      registradoPor: datos.registradoPor ?? null,
    });
  } catch (e) {
    /*
     * El ingrediente no existe (viola la foreign key).
     *
     * Pasa si alguien manda el POST con un id inventado, o si el ingrediente se
     * borró mientras el formulario estaba abierto. Sin este catch, el error del
     * driver sube crudo y el admin ve un 500 en vez de un mensaje.
     */
    if (esViolacionDeFk(e)) {
      throw new ErrorCosto("Ese ingrediente no existe. Recargá la página.");
    }
    throw e;
  }
}

/** 23503 = foreign_key_violation. El código viaja en la cadena de `cause`. */
function esViolacionDeFk(e: unknown): boolean {
  let actual: unknown = e;

  for (let i = 0; i < 10 && actual != null; i++) {
    if (
      typeof actual === "object" &&
      "code" in actual &&
      (actual as { code?: string }).code === "23503"
    ) {
      return true;
    }
    actual = (actual as { cause?: unknown }).cause;
  }

  return false;
}

export async function historialPrecios(ingredienteId: string) {
  return db
    .select()
    .from(precioIngrediente)
    .where(eq(precioIngrediente.ingredienteId, ingredienteId))
    .orderBy(desc(precioIngrediente.desde));
}

/**
 * Precios vigentes a una fecha.
 *
 * `momento` es lo que hace posible calcular el margen histórico: con la fecha
 * de un pedido, se obtienen los costos que regían cuando se vendió.
 */
export async function preciosVigentes(
  momento: Date = new Date(),
): Promise<Map<string, number>> {
  const filas = await db
    .select({
      ingredienteId: precioIngrediente.ingredienteId,
      precio: precioIngrediente.precioPorUnidad,
      desde: precioIngrediente.desde,
    })
    .from(precioIngrediente)
    .where(lte(precioIngrediente.desde, momento))
    .orderBy(desc(precioIngrediente.desde));

  const vigentes = new Map<string, number>();
  // Vienen ordenados de más nuevo a más viejo: el primero de cada ingrediente
  // es el que regía.
  for (const fila of filas) {
    if (!vigentes.has(fila.ingredienteId)) {
      vigentes.set(fila.ingredienteId, fila.precio);
    }
  }
  return vigentes;
}

/**
 * Desactiva un ingrediente en vez de borrarlo.
 *
 * Borrarlo rompería las recetas que lo usan (la FK es `restrict`) y, peor,
 * haría incalculable el costo de los pedidos viejos que lo llevaban.
 */
export async function desactivarIngrediente(id: string): Promise<void> {
  await db.update(ingrediente).set({ activo: false }).where(eq(ingrediente.id, id));
}

export async function buscarIngrediente(id: string): Promise<Ingrediente | null> {
  const filas = await db
    .select()
    .from(ingrediente)
    .where(and(eq(ingrediente.id, id)))
    .limit(1);
  return filas[0] ?? null;
}
