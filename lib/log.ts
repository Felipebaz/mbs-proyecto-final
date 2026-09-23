import { createHash } from "node:crypto";

/**
 * Logs sin datos personales ni secretos.
 *
 * El problema que resuelve: los logs se guardan mucho más tiempo que los datos,
 * viajan a servicios de terceros (Vercel, un agregador), y los ve gente que no
 * tiene por qué ver el correo de un cliente. Además un error de un SDK puede
 * traer adentro el cuerpo de la petición —con el token de acceso o los datos del
 * pagador— y volcarlo entero al log sin que nadie lo note.
 *
 * Todo lo que se loguea pasa por acá.
 */

/**
 * Patrones que se tapan. El orden importa: los más específicos primero, así un
 * token con arroba no se reemplaza como si fuera un correo.
 */
const PATRONES: readonly { nombre: string; re: RegExp }[] = [
  // Claves con prefijo reconocible. Es lo más grave que puede aparecer.
  { nombre: "clave-resend", re: /\bre_[A-Za-z0-9_-]{8,}/g },
  { nombre: "token-mp", re: /\b(APP_USR|TEST)-[A-Za-z0-9-]{8,}/g },
  { nombre: "token-github", re: /\bgh[pousr]_[A-Za-z0-9]{8,}/g },
  { nombre: "hash-argon2", re: /\$argon2[a-z]*\$[^\s"']+/g },
  { nombre: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g },

  // Cadena de conexión: tapa usuario y contraseña, deja el host para diagnosticar.
  {
    nombre: "conexion",
    re: /\b(postgres(?:ql)?:\/\/)[^:\s]+:[^@\s]+@/g,
  },

  // Correos. Van después de los tokens para no comerse un prefijo con arroba.
  {
    nombre: "correo",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },

  /*
   * Cadenas largas de base64url o hex: tokens de sesión, de verificación, de
   * reset, secretos TOTP. 32 caracteres es el piso para no tapar un id de
   * Mercado Pago ni un SKU.
   *
   * El lookahead excluye los UUID. Sin él quedaban tapados —un UUID mide 36 y
   * el guión entra en la clase—, y con eso se pierde lo que más sirve para
   * rastrear un pedido o un ingrediente en el log. Funciona porque el `\b`
   * limita dónde puede empezar la coincidencia: los tramos internos de un UUID
   * quedan cortos para llegar a 32.
   */
  {
    nombre: "token",
    re: /\b(?![0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b)[A-Za-z0-9_-]{32,}\b/g,
  },
];

/** Reemplaza lo sensible por una marca que dice qué se tapó. */
export function sanear(texto: string): string {
  let salida = texto;

  for (const { nombre, re } of PATRONES) {
    salida = salida.replace(re, (coincidencia) =>
      nombre === "conexion"
        ? `${coincidencia.split("://")[0]}://[credenciales]@`
        : `[${nombre}]`,
    );
  }

  return salida;
}

/**
 * Identificador estable de un correo, para poder correlacionar sin guardarlo.
 *
 * Sirve para ver "este mismo usuario falló cinco veces" sin que el correo quede
 * en el log. No es reversible: son 8 caracteres de un sha256, así que no se
 * puede volver al correo desde acá — pero sí verificar una sospecha concreta,
 * que es justo lo que se necesita al investigar.
 */
export function idOfuscado(valor: string): string {
  return createHash("sha256").update(valor.toLowerCase().trim())
    .digest("hex")
    .slice(0, 8);
}

/**
 * Saca de un error lo que sirve para diagnosticar, sin lo que no debería estar.
 *
 * No se serializa el error entero: un error de un SDK puede traer la petición
 * completa adentro, con el token de acceso y los datos del cliente.
 */
export function detalleDeError(e: unknown): string {
  if (e instanceof Error) {
    const partes = [`${e.name}: ${sanear(e.message)}`];

    // Sólo la causa inmediata: la cadena completa suele repetir lo mismo.
    if (e.cause instanceof Error) {
      partes.push(`causa: ${e.cause.name}: ${sanear(e.cause.message)}`);
    }

    // Código de Postgres cuando lo hay: es lo más útil para entender el fallo.
    const codigo = (e as { code?: unknown }).code;
    if (typeof codigo === "string") partes.push(`código: ${codigo}`);

    return partes.join(" | ");
  }

  if (typeof e === "string") return sanear(e);

  /*
   * Algo que no es Error ni string. Pasa cuando una librería hace
   * `throw { code: ... }` en vez de `throw new Error(...)`.
   *
   * Se describen las CLAVES, no los valores. `String(e)` daría
   * "[object Object]", que no sirve para nada; volcar el objeto con
   * JSON.stringify sí serviría, pero `sanear` sólo conoce las formas de secreto
   * que puede reconocer —un teléfono o una dirección se le escapan—. Las claves
   * alcanzan para saber qué tirar y de dónde vino.
   */
  if (typeof e === "object" && e !== null) {
    const claves = Object.keys(e).slice(0, 10).map(sanear).join(", ");
    return `desconocido: ${e.constructor?.name ?? "objeto"} con claves [${claves}]`;
  }

  return `desconocido: ${sanear(String(e))}`;
}

/**
 * Único punto de log de errores.
 *
 * @param contexto De dónde viene. Convención: `[modulo] qué pasó`.
 * @param datos Valores extra. Cada string pasa por `sanear`.
 */
export function logError(
  contexto: string,
  e: unknown,
  datos: Readonly<Record<string, string | number | boolean | null>> = {},
): void {
  console.error(`${contexto} — ${detalleDeError(e)}${sufijo(datos)}`);
}

/** Para avisos que no son errores. Mismo saneamiento. */
export function logAviso(
  contexto: string,
  datos: Readonly<Record<string, string | number | boolean | null>> = {},
): void {
  console.warn(`${contexto}${sufijo(datos)}`);
}

/** Serializa los datos extra, saneando cada string. Vacío si no hay ninguno. */
function sufijo(
  datos: Readonly<Record<string, string | number | boolean | null>>,
): string {
  const partes = Object.entries(datos).map(
    ([clave, valor]) =>
      `${clave}=${typeof valor === "string" ? sanear(valor) : valor}`,
  );

  return partes.length > 0 ? ` | ${partes.join(" ")}` : "";
}
