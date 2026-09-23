"use server";

import { redirect } from "next/navigation";
import { exigirEmailVerificado } from "@/lib/auth/dal";
import { EntregaSchema } from "@/lib/auth/validacion";
import { obtenerCarrito, vaciarCarrito } from "@/lib/carrito/repositorio";
import { obtenerProveedorPago } from "@/lib/pagos";
import { crearPedido, ErrorPedido } from "@/lib/pedidos/crear";
import { urlBase } from "@/lib/email";

/**
 * Checkout.
 *
 * Los tres controles que importan, en orden:
 *
 *   1. `exigirEmailVerificado()` — acá y no sólo en la UI. Esta acción es un
 *      POST que cualquiera puede mandar sin pasar por la pantalla.
 *   2. el precio se recalcula desde el catálogo dentro de `crearPedido()`, no
 *      se lee del formulario
 *   3. el pedido nace `pendiente`; sólo el webhook puede pasarlo a `pagado`
 */

export interface EstadoCheckout {
  error?: string;
  errores?: Record<string, string[] | undefined>;
}

export async function irAPagar(
  _estado: EstadoCheckout | undefined,
  formData: FormData,
): Promise<EstadoCheckout> {
  // Sin correo verificado no se paga: un pedido a una dirección que nadie
  // confirmó no tiene a dónde mandar la confirmación, y es el camino cómodo
  // para pedir a nombre de otro.
  const usuario = await exigirEmailVerificado();

  const campos = EntregaSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
    direccion: formData.get("direccion"),
    notas: formData.get("notas") ?? undefined,
    devueltas: formData.get("devueltas") ?? 0,
  });

  if (!campos.success) {
    const errores: Record<string, string[]> = {};
    for (const issue of campos.error.issues) {
      const campo = String(issue.path[0] ?? "_");
      (errores[campo] ??= []).push(issue.message);
    }
    return { errores };
  }

  // El carrito se lee del servidor —por sesión o cookie—, nunca de un id que
  // venga en el formulario: si viniera por parámetro, cualquiera pagaría el
  // carrito de cualquiera.
  const carrito = await obtenerCarrito(campos.data.devueltas);

  if (carrito.lineas.length === 0) {
    return { error: "Tu carrito está vacío." };
  }

  let urlPago: string;

  try {
    const { pedido, items } = await crearPedido(
      carrito.lineas.map((l) => ({
        sku: l.sku,
        cantidad: l.cantidad,
        configuracion: l.configuracion,
      })),
      {
        nombre: campos.data.nombre,
        telefono: campos.data.telefono,
        direccion: campos.data.direccion,
        notas: campos.data.notas ?? null,
      },
      { usuarioId: usuario.id, botellasDevueltas: campos.data.devueltas },
    );

    const proveedor = await obtenerProveedorPago();
    const creado = await proveedor.crearPago({
      referencia: pedido.referencia,
      items,
      total: pedido.total,
      moneda: pedido.moneda,
      email: usuario.email,
      urlRetorno: `${urlBase()}/pedido/${pedido.referencia}`,
      urlNotificacion: `${urlBase()}/api/webhooks/mercadopago`,
    });

    /*
     * El carrito se vacía ACÁ, antes de ir a pagar.
     *
     * El pedido ya existe con sus líneas y sus precios congelados, así que no
     * se pierde nada. Si se vaciara recién al volver de pagar, quien abandona
     * el pago vuelve con el carrito lleno y genera un pedido pendiente por
     * cada intento.
     */
    await vaciarCarrito();

    urlPago = creado.urlPago;
  } catch (e) {
    if (e instanceof ErrorPedido) return { error: e.message };

    console.error("[checkout] no se pudo iniciar el pago:", e);
    return {
      error: "No pudimos iniciar el pago. Probá de nuevo en un momento.",
    };
  }

  // `redirect` tira para cortar el flujo: va fuera del try o el catch se lo come.
  redirect(urlPago);
}
