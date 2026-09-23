"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarCantidad,
  agregarAlCarrito,
  ErrorCarrito,
  vaciarCarrito,
} from "@/lib/carrito/repositorio";
import { ActualizarSchema, AgregarSchema } from "@/lib/auth/validacion";

/**
 * Acciones del carrito.
 *
 * El carrito NO exige sesión: el visitante anónimo compra igual. Pero eso no
 * lo hace menos sensible — el repositorio decide de qué carrito se trata leyendo
 * la cookie o la sesión del servidor, nunca un id que venga en el formulario.
 * Si el carrito viniera por parámetro, cualquiera editaría el de cualquiera.
 *
 * Lo que sí viaja del navegador: SKU, cantidad y la configuración de un pack
 * armable. Jamás un precio.
 */

export interface EstadoCarrito {
  error?: string;
  ok?: boolean;
}

export async function agregar(
  _estado: EstadoCarrito | undefined,
  formData: FormData,
): Promise<EstadoCarrito> {
  const campos = AgregarSchema.safeParse({
    sku: formData.get("sku"),
    cantidad: formData.get("cantidad") ?? 1,
    configuracion: formData.getAll("configuracion").map(String).filter(Boolean),
  });

  if (!campos.success) {
    return { error: "Pedido inválido." };
  }

  try {
    await agregarAlCarrito(
      campos.data.sku,
      campos.data.cantidad,
      campos.data.configuracion?.length ? campos.data.configuracion : null,
    );
  } catch (e) {
    // `ErrorCarrito` es un mensaje pensado para el cliente ("sin stock").
    // Cualquier otra excepción se propaga: no se convierte un bug en un
    // mensajito amable que esconda el problema.
    if (e instanceof ErrorCarrito) return { error: e.message };
    throw e;
  }

  revalidatePath("/carrito");
  return { ok: true };
}

export async function cambiarCantidad(
  _estado: EstadoCarrito | undefined,
  formData: FormData,
): Promise<EstadoCarrito> {
  const campos = ActualizarSchema.safeParse({
    sku: formData.get("sku"),
    huella: formData.get("huella") ?? "",
    cantidad: formData.get("cantidad"),
  });

  if (!campos.success) return { error: "Pedido inválido." };

  try {
    await actualizarCantidad(
      campos.data.sku,
      campos.data.huella,
      campos.data.cantidad,
    );
  } catch (e) {
    if (e instanceof ErrorCarrito) return { error: e.message };
    throw e;
  }

  revalidatePath("/carrito");
  return { ok: true };
}

export async function vaciar(): Promise<EstadoCarrito> {
  await vaciarCarrito();
  revalidatePath("/carrito");
  return { ok: true };
}
