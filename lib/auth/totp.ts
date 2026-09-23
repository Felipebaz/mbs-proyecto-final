import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import { db } from "@/lib/db/cliente";
import { codigoRespaldo, usuario, type Usuario } from "@/lib/db/esquema";
import { cifrar, descifrar } from "./cifrado";

/**
 * Segundo factor por TOTP (RFC 6238).
 *
 * [decisión] TOTP y no passkeys.
 *
 * Las passkeys son resistentes a phishing, que es una ventaja real. Pero con
 * uno o dos admins, quedarse afuera del propio negocio porque murió el teléfono
 * es un riesgo más concreto que un phishing dirigido a una juguería de barrio.
 * TOTP anda en cualquier teléfono y los códigos de respaldo dan una salida.
 *
 * El esquema no impide agregar passkeys después como segunda opción.
 */

const EMISOR = "Anima";

/**
 * Ventana de ±1 paso (30 s), o sea que un código vale ~90 segundos.
 *
 * Es el mínimo razonable: los relojes de los teléfonos se desfasan, y con
 * ventana 0 la gente escribe el código correcto y es rechazada. Más ancho
 * alarga la ventana en la que un código robado sirve.
 */
const VENTANA = 1;

const CANTIDAD_RESPALDOS = 8;

function nuevoTotp(secretoBase32: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: EMISOR,
    label: email,
    algorithm: "SHA1", // lo único que soportan todas las apps de autenticación
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretoBase32),
  });
}

/* ------------------------------------------------------------------ alta */

export interface AltaTotp {
  /** Base32, para mostrar al que no puede escanear el QR. */
  secreto: string;
  /** `otpauth://…` — lo que codifica el QR. */
  uri: string;
}

/**
 * Prepara el alta. **No activa nada todavía**: guarda el secreto cifrado y deja
 * `totpActivadoEn` en NULL.
 *
 * La activación recién ocurre cuando la persona escribe un código válido, en
 * `confirmarAlta()`. Si se activara acá, alguien que no logró configurar la app
 * quedaría con el segundo factor prendido y sin poder entrar nunca más.
 */
export async function iniciarAlta(u: Usuario): Promise<AltaTotp> {
  // 160 bits, lo que recomienda el RFC 4226 para el secreto compartido.
  const secreto = new OTPAuth.Secret({ size: 20 }).base32;

  await db
    .update(usuario)
    .set({ totpSecreto: cifrar(secreto), totpActivadoEn: null })
    .where(eq(usuario.id, u.id));

  return { secreto, uri: nuevoTotp(secreto, u.email).toString() };
}

export interface AltaConfirmada {
  /** Los códigos EN CLARO. Es la única vez que se pueden ver. */
  codigosRespaldo: string[];
}

/**
 * Confirma el alta con un código de la app y genera los códigos de respaldo.
 *
 * @returns `null` si el código no es válido.
 */
export async function confirmarAlta(
  u: Usuario,
  codigo: string,
): Promise<AltaConfirmada | null> {
  if (!u.totpSecreto) return null;

  const secreto = descifrar(u.totpSecreto);
  if (!validarCodigo(secreto, u.email, codigo)) return null;

  const codigos = Array.from({ length: CANTIDAD_RESPALDOS }, () =>
    // 10 bytes = 80 bits. Aleatorio de sobra para que no se adivine, y corto
    // para que se pueda escribir a mano.
    randomBytes(10).toString("base64url").slice(0, 12),
  );

  await db.transaction(async (tx) => {
    await tx
      .update(usuario)
      .set({ totpActivadoEn: new Date() })
      .where(eq(usuario.id, u.id));

    // Los viejos se van: activar de nuevo invalida los códigos de antes.
    await tx.delete(codigoRespaldo).where(eq(codigoRespaldo.usuarioId, u.id));

    await tx.insert(codigoRespaldo).values(
      codigos.map((c) => ({ id: hashear(c), usuarioId: u.id })),
    );
  });

  return { codigosRespaldo: codigos };
}

/** Apaga el segundo factor y borra todo lo asociado. */
export async function desactivar(usuarioId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(usuario)
      .set({ totpSecreto: null, totpActivadoEn: null })
      .where(eq(usuario.id, usuarioId));
    await tx.delete(codigoRespaldo).where(eq(codigoRespaldo.usuarioId, usuarioId));
  });
}

/* ------------------------------------------------------------ validación */

function hashear(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

function validarCodigo(secreto: string, email: string, codigo: string): boolean {
  const limpio = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpio)) return false;

  // `validate` de otpauth ya compara en tiempo constante y devuelve el delta
  // de pasos, o null si no coincide con ninguno de la ventana.
  return nuevoTotp(secreto, email).validate({ token: limpio, window: VENTANA }) !== null;
}

export type ResultadoFactor2 =
  | { ok: true; usoRespaldo: boolean; respaldosRestantes?: number }
  | { ok: false };

/**
 * Valida un código de la app o uno de respaldo.
 *
 * Acepta los dos por el mismo campo a propósito: la persona que perdió el
 * teléfono no tiene que buscar otra pantalla, y desde afuera no se distingue
 * cuál se usó.
 */
export async function verificarFactor2(
  u: Usuario,
  codigo: string,
): Promise<ResultadoFactor2> {
  if (!u.totpSecreto || !u.totpActivadoEn) return { ok: false };

  const limpio = codigo.trim();

  if (validarCodigo(descifrar(u.totpSecreto), u.email, limpio)) {
    return { ok: true, usoRespaldo: false };
  }

  /*
   * Código de respaldo: se consume de forma atómica.
   *
   * El `where usadoEn is null` dentro del UPDATE hace que dos intentos
   * simultáneos con el mismo código no pasen los dos. Si fuera "leer,
   * verificar, marcar", el mismo código serviría dos veces.
   */
  const consumidos = await db
    .update(codigoRespaldo)
    .set({ usadoEn: new Date() })
    .where(
      and(
        eq(codigoRespaldo.id, hashear(limpio)),
        eq(codigoRespaldo.usuarioId, u.id),
        isNull(codigoRespaldo.usadoEn),
      ),
    )
    .returning({ id: codigoRespaldo.id });

  if (consumidos.length === 0) return { ok: false };

  const restantes = await db
    .select({ id: codigoRespaldo.id })
    .from(codigoRespaldo)
    .where(
      and(eq(codigoRespaldo.usuarioId, u.id), isNull(codigoRespaldo.usadoEn)),
    );

  return { ok: true, usoRespaldo: true, respaldosRestantes: restantes.length };
}

export const _test = { hashear, validarCodigo, nuevoTotp, CANTIDAD_RESPALDOS };
