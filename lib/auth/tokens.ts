import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/cliente";
import { tokenCorreo, usuario, type TipoToken, type Usuario } from "@/lib/db/esquema";

/**
 * Tokens de un solo uso para los links que van por correo.
 *
 * Mismo criterio que las sesiones: el token va en el mail, la base guarda su
 * sha256. sha256 y no Argon2 porque el token ya es aleatorio de 256 bits — no
 * hay nada que adivinar por fuerza bruta.
 */

/** 24 h. Es tiempo de sobra para abrir un mail sin dejar el link vivo una semana. */
export const VIDA_VERIFICACION_MS = 24 * 60 * 60 * 1000;

/**
 * 30 min. Mucho más corto que la verificación a propósito: este token cambia
 * la contraseña, que es tomar la cuenta. Cuanto menos vive, menos ventana hay
 * para usarlo si el mail queda abierto en una máquina ajena.
 */
export const VIDA_RESET_MS = 30 * 60 * 1000;

const VIDA: Record<TipoToken, number> = {
  verificacion: VIDA_VERIFICACION_MS,
  reset: VIDA_RESET_MS,
};

function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Emite un token nuevo y **invalida los anteriores del mismo tipo**.
 *
 * Lo segundo importa: sin eso, pedir tres resets deja tres links vivos a la
 * vez. Cada uno es una llave a la cuenta, y la más vieja puede estar en un
 * mail que ya se reenvió a alguien.
 */
export async function crearToken(
  usuarioId: string,
  tipo: TipoToken,
): Promise<{ token: string; expiraEn: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + VIDA[tipo]);

  await db.transaction(async (tx) => {
    await tx
      .update(tokenCorreo)
      .set({ usadoEn: new Date() })
      .where(
        and(
          eq(tokenCorreo.usuarioId, usuarioId),
          eq(tokenCorreo.tipo, tipo),
          isNull(tokenCorreo.usadoEn),
        ),
      );

    await tx.insert(tokenCorreo).values({
      id: hashDeToken(token),
      tipo,
      usuarioId,
      expiraEn,
    });
  });

  return { token, expiraEn };
}

export type MotivoRechazo = "inexistente" | "vencido" | "usado" | "tipo";

export type ResultadoConsumo =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: MotivoRechazo };

/**
 * Valida y consume un token en una sola operación atómica.
 *
 * Es atómico a propósito. Si fuera "leer, verificar, marcar usado" en pasos
 * separados, dos requests simultáneos con el mismo token pasarían los dos la
 * verificación antes de que cualquiera lo marcara. El `where usadoEn is null`
 * dentro del UPDATE hace que sólo uno gane: el segundo no actualiza ninguna
 * fila y se rechaza.
 */
export async function consumirToken(
  token: string,
  tipoEsperado: TipoToken,
): Promise<ResultadoConsumo> {
  if (!token) return { ok: false, motivo: "inexistente" };

  const id = hashDeToken(token);

  return db.transaction(async (tx) => {
    const filas = await tx
      .select()
      .from(tokenCorreo)
      .where(eq(tokenCorreo.id, id))
      .limit(1);

    const fila = filas[0];
    if (!fila) return { ok: false, motivo: "inexistente" as const };

    /*
     * Un token de verificación no sirve para resetear la contraseña.
     * Sin este chequeo, el link de verificación —que vive 24 h y llega a
     * cualquiera que se registre— valdría para cambiar la contraseña de la
     * cuenta, que es la operación más sensible que hay.
     */
    if (fila.tipo !== tipoEsperado) return { ok: false, motivo: "tipo" as const };

    if (fila.usadoEn !== null) return { ok: false, motivo: "usado" as const };
    if (fila.expiraEn.getTime() <= Date.now()) {
      return { ok: false, motivo: "vencido" as const };
    }

    const marcadas = await tx
      .update(tokenCorreo)
      .set({ usadoEn: new Date() })
      .where(and(eq(tokenCorreo.id, id), isNull(tokenCorreo.usadoEn)))
      .returning({ id: tokenCorreo.id });

    // Otro request ganó la carrera entre el SELECT y el UPDATE.
    if (marcadas.length === 0) return { ok: false, motivo: "usado" as const };

    const usuarios = await tx
      .select()
      .from(usuario)
      .where(eq(usuario.id, fila.usuarioId))
      .limit(1);

    if (!usuarios[0]) return { ok: false, motivo: "inexistente" as const };

    return { ok: true as const, usuario: usuarios[0] };
  });
}

/** Invalida todos los tokens sin usar de un tipo. Se llama al cambiar la contraseña. */
export async function invalidarTokensDe(usuarioId: string, tipo: TipoToken) {
  await db
    .update(tokenCorreo)
    .set({ usadoEn: new Date() })
    .where(
      and(
        eq(tokenCorreo.usuarioId, usuarioId),
        eq(tokenCorreo.tipo, tipo),
        isNull(tokenCorreo.usadoEn),
      ),
    );
}

/**
 * Para el cron. Borra los vencidos hace más de una semana: el margen deja ver
 * en la base por qué falló un link que alguien reporta como roto.
 */
export async function purgarTokensVencidos(): Promise<void> {
  await db
    .delete(tokenCorreo)
    .where(lt(tokenCorreo.expiraEn, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
}

export const _test = { hashDeToken };
