"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrar } from "@/lib/auditoria";
import { requerirAdmin, requerirReautenticacion } from "@/lib/auth/dal";
import { ESTADOS_PEDIDO, UNIDADES } from "@/lib/db/esquema";
import {
  crearIngrediente,
  desactivarIngrediente,
  ErrorCosto,
  registrarPrecio,
} from "@/lib/costos/ingredientes";
import { guardarReceta } from "@/lib/costos/recetas";
import { cambiarEstadoPedido, ErrorAdmin } from "@/lib/pedidos/administrar";
import { crearPedido, ErrorPedido } from "@/lib/pedidos/crear";

/**
 * Acciones del panel.
 *
 * **Cada una llama a `requerirAdmin()` en su primera línea.** No alcanza con
 * que la página lo haga: una server action es un POST contra la ruta, y
 * cualquiera puede mandarlo sin pasar por la UI. Que el botón no se renderice
 * para un cliente no impide nada.
 *
 * Las que no se pueden deshacer —cambiar precios, exportar— usan
 * `requerirReautenticacion()`, que además exige que el segundo factor se haya
 * verificado hace poco.
 *
 * Todas registran en la bitácora. El registro va DESPUÉS de que la operación
 * salió bien: anotar intenciones que fallaron ensuciaría el historial.
 */

export interface EstadoAdmin {
  error?: string;
  ok?: string;
}

/* ------------------------------------------------------------- pedidos */

const CambiarEstadoSchema = z.object({
  pedidoId: z.string().uuid(),
  estado: z.enum(ESTADOS_PEDIDO),
});

export async function cambiarEstado(
  _estado: EstadoAdmin | undefined,
  formData: FormData,
): Promise<EstadoAdmin> {
  const admin = await requerirAdmin();

  const campos = CambiarEstadoSchema.safeParse({
    pedidoId: formData.get("pedidoId"),
    estado: formData.get("estado"),
  });

  if (!campos.success) return { error: "Datos inválidos." };

  try {
    const cambio = await cambiarEstadoPedido(
      campos.data.pedidoId,
      campos.data.estado,
    );

    await registrar(admin, {
      accion: "pedido_estado_cambiado",
      objetivo: campos.data.pedidoId,
      detalle: { de: cambio.anterior, a: cambio.nuevo },
    });

    revalidatePath("/admin/pedidos");
    return { ok: `Pedido marcado como "${cambio.nuevo}".` };
  } catch (e) {
    if (e instanceof ErrorAdmin) return { error: e.message };
    throw e;
  }
}

const PedidoManualSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  telefono: z.string().trim().min(8).max(20),
  direccion: z.string().trim().min(8).max(300),
  notas: z.string().trim().max(500).optional(),
  devueltas: z.coerce.number().int().min(0).max(200).default(0),
  // "SKU:cantidad" por línea. Es un textarea porque el admin carga esto por
  // teléfono, mirando el mensaje del cliente, y escribir es más rápido que
  // clickear en una grilla.
  lineas: z.string().trim().min(3).max(2000),
});

/** Carga un pedido tomado por WhatsApp o por teléfono. */
export async function crearPedidoManual(
  _estado: EstadoAdmin | undefined,
  formData: FormData,
): Promise<EstadoAdmin> {
  const admin = await requerirAdmin();

  const campos = PedidoManualSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
    direccion: formData.get("direccion"),
    notas: formData.get("notas") ?? undefined,
    devueltas: formData.get("devueltas") ?? 0,
    lineas: formData.get("lineas"),
  });

  if (!campos.success) {
    return { error: "Revisá los campos: falta algo o está mal escrito." };
  }

  // Formato "SKU cantidad" o "SKU:cantidad", una por línea.
  const lineas: { sku: string; cantidad: number }[] = [];

  for (const cruda of campos.data.lineas.split("\n")) {
    const limpia = cruda.trim();
    if (!limpia) continue;

    const partes = limpia.split(/[:\s,]+/).filter(Boolean);
    const sku = partes[0]?.toUpperCase();
    const cantidad = Number(partes[1] ?? 1);

    if (!sku || !Number.isInteger(cantidad) || cantidad < 1) {
      return { error: `No entendí la línea "${limpia}". Usá: SKU cantidad` };
    }

    lineas.push({ sku, cantidad });
  }

  if (lineas.length === 0) return { error: "No hay ninguna línea." };

  try {
    /*
     * Pasa por el MISMO `crearPedido` que el checkout web: los precios salen
     * del catálogo también acá. Un camino aparte para pedidos manuales sería un
     * segundo lugar donde el precio se puede escribir a mano, y el número de la
     * rentabilidad dejaría de ser comparable.
     */
    const { pedido } = await crearPedido(
      lineas,
      {
        nombre: campos.data.nombre,
        telefono: campos.data.telefono,
        direccion: campos.data.direccion,
        notas: campos.data.notas ?? null,
      },
      {
        usuarioId: null, // el cliente puede no tener cuenta
        botellasDevueltas: campos.data.devueltas,
        origen: "manual",
      },
    );

    await registrar(admin, {
      accion: "pedido_manual_creado",
      objetivo: pedido.id,
      detalle: { referencia: pedido.referencia, total: pedido.total },
    });

    revalidatePath("/admin/pedidos");
    return { ok: `Pedido ${pedido.referencia} creado. Queda pendiente de pago.` };
  } catch (e) {
    if (e instanceof ErrorPedido) return { error: e.message };
    throw e;
  }
}

/* -------------------------------------------------------- ingredientes */

const IngredienteSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  unidad: z.enum(UNIDADES),
  proveedor: z.string().trim().max(80).optional(),
});

export async function agregarIngrediente(
  _estado: EstadoAdmin | undefined,
  formData: FormData,
): Promise<EstadoAdmin> {
  const admin = await requerirAdmin();

  const campos = IngredienteSchema.safeParse({
    nombre: formData.get("nombre"),
    unidad: formData.get("unidad"),
    proveedor: formData.get("proveedor") ?? undefined,
  });

  if (!campos.success) return { error: "Revisá el nombre y la unidad." };

  let creado;
  try {
    creado = await crearIngrediente(campos.data);
  } catch {
    // El único error esperable acá es el UNIQUE del nombre. El try envuelve
    // sólo el insert para no convertir cualquier otra falla en este mensaje.
    return { error: `Ya existe un ingrediente llamado "${campos.data.nombre}".` };
  }

  await registrar(admin, {
    accion: "ingrediente_creado",
    objetivo: creado.id,
    detalle: { nombre: creado.nombre, unidad: creado.unidad },
  });

  revalidatePath("/admin/ingredientes");
  return { ok: `"${campos.data.nombre}" agregado.` };
}

const PrecioSchema = z.object({
  ingredienteId: z.string().uuid(),
  /**
   * Lo que se pagó y por cuánta cantidad. Se pide así y no "precio por gramo"
   * porque nadie compra por gramo: se compra una bolsa de 5 kg a $900. La
   * división la hace el servidor.
   */
  montoPagado: z.coerce.number().positive().max(10_000_000),
  cantidadComprada: z.coerce.number().positive().max(10_000_000),
  nota: z.string().trim().max(200).optional(),
});

export async function cambiarPrecio(
  _estado: EstadoAdmin | undefined,
  formData: FormData,
): Promise<EstadoAdmin> {
  // Cambiar un precio mueve el margen de todo lo que lleve ese ingrediente:
  // se pide el segundo factor de nuevo.
  const admin = await requerirReautenticacion(15);

  const campos = PrecioSchema.safeParse({
    ingredienteId: formData.get("ingredienteId"),
    montoPagado: formData.get("montoPagado"),
    cantidadComprada: formData.get("cantidadComprada"),
    nota: formData.get("nota") ?? undefined,
  });

  if (!campos.success) return { error: "Revisá el monto y la cantidad." };

  // A centésimos por unidad base. Se redondea porque el precio unitario casi
  // nunca da entero, y la nota deja constancia de lo que se pagó realmente.
  const centesimos = Math.round(campos.data.montoPagado * 100);
  const precioPorUnidad = Math.round(centesimos / campos.data.cantidadComprada);

  try {
    await registrarPrecio({
      ingredienteId: campos.data.ingredienteId,
      precioPorUnidad,
      nota:
        campos.data.nota ??
        `$${campos.data.montoPagado} por ${campos.data.cantidadComprada}`,
      registradoPor: admin.id,
    });

    await registrar(admin, {
      accion: "precio_cambiado",
      objetivo: campos.data.ingredienteId,
      detalle: {
        precioPorUnidad,
        montoPagado: centesimos,
        cantidadComprada: campos.data.cantidadComprada,
      },
    });
  } catch (e) {
    if (e instanceof ErrorCosto) return { error: e.message };
    throw e;
  }

  revalidatePath("/admin/ingredientes");
  revalidatePath("/admin/rentabilidad");
  return { ok: "Precio registrado. El anterior queda en el historial." };
}

export async function darDeBajaIngrediente(
  _estado: EstadoAdmin | undefined,
  formData: FormData,
): Promise<EstadoAdmin> {
  const admin = await requerirAdmin();

  const id = z.string().uuid().safeParse(formData.get("ingredienteId"));
  if (!id.success) return { error: "Ingrediente inválido." };

  // Se desactiva, no se borra: borrarlo haría incalculable el costo de los
  // pedidos viejos que lo llevaban.
  await desactivarIngrediente(id.data);

  await registrar(admin, {
    accion: "ingrediente_dado_de_baja",
    objetivo: id.data,
  });

  revalidatePath("/admin/ingredientes");
  return { ok: "Ingrediente dado de baja. Las recetas que lo usan no cambian." };
}

/* -------------------------------------------------------------- recetas */

const RecetaSchema = z.object({
  sku: z.string().trim().min(1).max(40),
  // "ingredienteId:cantidad" por línea, armado por el formulario.
  lineas: z.string().max(4000),
});

export async function guardarRecetaAccion(
  _estado: EstadoAdmin | undefined,
  formData: FormData,
): Promise<EstadoAdmin> {
  const admin = await requerirAdmin();

  const campos = RecetaSchema.safeParse({
    sku: formData.get("sku"),
    lineas: formData.get("lineas") ?? "",
  });

  if (!campos.success) return { error: "Datos inválidos." };

  const lineas: { ingredienteId: string; cantidad: number }[] = [];

  for (const cruda of campos.data.lineas.split("\n")) {
    const limpia = cruda.trim();
    if (!limpia) continue;

    const [ingredienteId, cantidadCruda] = limpia.split(":");
    const cantidad = Number(cantidadCruda);

    if (!ingredienteId || !Number.isInteger(cantidad) || cantidad <= 0) continue;
    lineas.push({ ingredienteId, cantidad });
  }

  try {
    await guardarReceta(campos.data.sku, lineas);

    await registrar(admin, {
      accion: "receta_cambiada",
      objetivo: campos.data.sku,
      detalle: { ingredientes: lineas.length },
    });
  } catch (e) {
    if (e instanceof ErrorCosto) return { error: e.message };
    throw e;
  }

  revalidatePath("/admin/recetas");
  revalidatePath("/admin/rentabilidad");
  return { ok: "Receta guardada." };
}
