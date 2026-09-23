import "server-only";

import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db/cliente";
import { auditoria, type AccionAuditada, type Auditoria } from "@/lib/db/esquema";
import type { Usuario } from "@/lib/db/esquema";

/**
 * Bitácora de acciones sensibles.
 *
 * Responde tres preguntas cuando algo sale mal: quién, qué y cuándo. Sin esto,
 * "el precio del jugo verde cambió" no tiene autor ni fecha, y un pedido que
 * aparece como entregado sin haberse entregado no tiene a quién preguntarle.
 *
 * La tabla es sólo-inserción, con un trigger en la base que hace fallar
 * cualquier UPDATE o DELETE. Una bitácora que se puede editar no es evidencia
 * de nada.
 */

export interface DatosAuditoria {
  accion: AccionAuditada;
  /** Sobre qué: un id de pedido, un SKU. */
  objetivo?: string | null;
  /** Valor anterior y nuevo, cuántas filas se exportaron. */
  detalle?: Record<string, unknown> | null;
}

/**
 * Registra una acción. **Nunca tira.**
 *
 * Si falla escribir la bitácora, se registra en el log del servidor y la acción
 * sigue. Es una decisión: que no se pueda cambiar el estado de un pedido porque
 * la tabla de auditoría está caída sería peor que perder una línea de bitácora.
 *
 * La contracara es que un fallo silencioso deja un hueco. Por eso el
 * `console.error` es ruidoso: es lo que habría que alertar.
 */
export async function registrar(
  usuario: Pick<Usuario, "id" | "email">,
  datos: DatosAuditoria,
): Promise<void> {
  try {
    const h = await headers();

    await db.insert(auditoria).values({
      usuarioId: usuario.id,
      // Copia del correo: si mañana se borra el usuario, el registro tiene que
      // seguir diciendo quién fue.
      usuarioEmail: usuario.email,
      accion: datos.accion,
      objetivo: datos.objetivo ?? null,
      detalle: datos.detalle ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
    });
  } catch (e) {
    console.error(
      `[auditoria] NO SE PUDO REGISTRAR "${datos.accion}" de ${usuario.email}:`,
      e,
    );
  }
}

/**
 * Lee la bitácora. Sólo para el panel, que ya exige admin.
 *
 * `detalle` puede traer datos de clientes, así que esto nunca se expone en una
 * ruta pública.
 */
export async function leerAuditoria(opciones: {
  limite?: number;
  usuarioId?: string;
} = {}): Promise<Auditoria[]> {
  const consulta = db
    .select()
    .from(auditoria)
    .orderBy(desc(auditoria.ocurridoEn))
    .limit(Math.min(opciones.limite ?? 100, 500));

  if (opciones.usuarioId) {
    return consulta.where(eq(auditoria.usuarioId, opciones.usuarioId));
  }
  return consulta;
}
