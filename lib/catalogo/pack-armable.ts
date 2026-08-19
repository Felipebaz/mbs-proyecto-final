import { PRODUCTOS } from "./productos";
import type {
  LineaPack,
  PackArmable,
  PrecioUYU,
  Variante,
  VariantePack,
} from "@/types/producto";
import { precioTotal } from "@/types/producto";

/**
 * Validación de un pack armado por el cliente.
 *
 * El precio NO se calcula acá: vive en la variante del pack ("4 botellas",
 * "5 botellas"), igual que en cualquier otro producto. Como todos los jugos de
 * 330 valen lo mismo, la composición no mueve el precio — solo la cantidad.
 *
 * Lo que sí pasa acá es lo único que no se le puede delegar al navegador:
 * verificar que lo que eligió el cliente sea una selección legal.
 */

export interface LineaArmada {
  variante: Variante;
  nombreProducto: string;
  cantidad: number;
}

export interface PackArmado {
  lineas: LineaArmada[];
  botellas: number;
  /** Lo que costaría botella por botella, sin pack. */
  precioSuelto: PrecioUYU;
  precio: PrecioUYU;
  envase: PrecioUYU;
  total: PrecioUYU;
  ahorro: PrecioUYU;
}

export type ResultadoArmado =
  | { ok: true; pack: PackArmado }
  | { ok: false; errores: string[] };

function buscarVariantePorSku(
  sku: string,
): { nombreProducto: string; variante: Variante } | null {
  for (const producto of PRODUCTOS) {
    const variante = producto.variantes.find((v) => v.sku === sku);
    if (variante) return { nombreProducto: producto.nombre, variante };
  }
  return null;
}

/**
 * Valida la selección contra la variante elegida. Nunca confía en el cliente:
 * el navegador manda qué eligió, jamás cuánto sale.
 */
export function armarPack(
  pack: PackArmable,
  varianteId: string,
  seleccion: readonly LineaPack[],
): ResultadoArmado {
  const variante: VariantePack | undefined = pack.variantes.find(
    (v) => v.id === varianteId,
  );
  if (!variante) {
    return {
      ok: false,
      errores: [
        `"${varianteId}" no es un tamaño de pack. Opciones: ${pack.variantes
          .map((v) => v.id)
          .join(", ")}.`,
      ],
    };
  }
  if (!variante.disponible) {
    return { ok: false, errores: [`${variante.nombre} no está disponible.`] };
  }

  const errores: string[] = [];
  const lineas: LineaArmada[] = [];
  const skusVistos = new Set<string>();

  for (const linea of seleccion) {
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) {
      errores.push(
        `"${linea.sku}": la cantidad tiene que ser un entero de 1 o más.`,
      );
      continue;
    }

    if (skusVistos.has(linea.sku)) {
      errores.push(`"${linea.sku}" aparece dos veces. Sumá las cantidades.`);
      continue;
    }
    skusVistos.add(linea.sku);

    if (!pack.skusElegibles.includes(linea.sku)) {
      errores.push(`"${linea.sku}" no se puede elegir para este pack.`);
      continue;
    }

    const encontrado = buscarVariantePorSku(linea.sku);
    if (!encontrado) {
      errores.push(`"${linea.sku}" no existe en el catálogo.`);
      continue;
    }

    if (!encontrado.variante.disponible) {
      errores.push(`${encontrado.nombreProducto} no está disponible.`);
      continue;
    }

    lineas.push({ ...encontrado, cantidad: linea.cantidad });
  }

  const botellas = lineas.reduce((total, l) => total + l.cantidad, 0);

  if (botellas !== variante.botellas) {
    errores.push(
      `${variante.nombre}: elegiste ${botellas}. Faltan o sobran ${Math.abs(
        variante.botellas - botellas,
      )}.`,
    );
  }

  if (errores.length > 0) return { ok: false, errores };

  const precioSuelto = lineas.reduce(
    (total, l) => total + precioTotal(l.variante) * l.cantidad,
    0,
  );

  return {
    ok: true,
    pack: {
      lineas,
      botellas,
      precioSuelto,
      precio: variante.precio,
      envase: variante.envase,
      total: precioTotal(variante),
      ahorro: precioSuelto - precioTotal(variante),
    },
  };
}

/** Los jugos que el cliente puede elegir, para pintar el selector. */
export function opcionesPack(pack: PackArmable): LineaArmada[] {
  return pack.skusElegibles.flatMap((sku) => {
    const encontrado = buscarVariantePorSku(sku);
    return encontrado ? [{ ...encontrado, cantidad: 0 }] : [];
  });
}
