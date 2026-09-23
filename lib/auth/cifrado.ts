import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Cifrado simétrico para secretos que el servidor necesita PODER LEER.
 *
 * Es la excepción a "todo se hashea". Una contraseña se hashea porque nunca
 * hace falta recuperarla: alcanza con comparar. El secreto TOTP es distinto —
 * el servidor lo necesita en claro para calcular el código de 6 dígitos que
 * espera. Un hash no serviría.
 *
 * Entonces se cifra con AES-256-GCM y la clave vive en el entorno, no en la
 * base. Si se filtra la base, los secretos están cifrados y no alcanzan para
 * generar códigos. Si se filtran las dos cosas, no hay nada que hacer — pero
 * son dos sistemas distintos y eso ya es una barrera.
 *
 * GCM y no CBC: GCM autentica además de cifrar. Con CBC, alguien que pueda
 * escribir en la base podría modificar el texto cifrado y el descifrado
 * devolvería basura sin avisar; con GCM, falla.
 */

const ALGORITMO = "aes-256-gcm";
const LARGO_IV = 12; // 96 bits, el recomendado para GCM
const LARGO_TAG = 16;

function clave(): Buffer {
  const cruda = process.env.CLAVE_CIFRADO;

  if (!cruda) {
    throw new Error(
      "Falta CLAVE_CIFRADO. Generala con:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  const bytes = Buffer.from(cruda, "base64");

  if (bytes.length !== 32) {
    // Una clave corta no da error al cifrar: da cifrado débil en silencio.
    throw new Error(
      `CLAVE_CIFRADO tiene ${bytes.length} bytes y AES-256 necesita 32. ` +
        "Generala de nuevo con randomBytes(32).toString('base64').",
    );
  }

  return bytes;
}

/**
 * Devuelve `iv.textoCifrado.tag`, todo en base64url.
 *
 * El IV es aleatorio en cada llamada: con GCM, reusar un IV con la misma clave
 * rompe la confidencialidad por completo. No se guarda aparte porque no es
 * secreto, sólo tiene que ser único.
 */
export function cifrar(texto: string): string {
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, clave(), iv);

  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    cifrado.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * @throws si el texto fue manipulado, si la clave es otra, o si el formato no
 * es el esperado. Es a propósito: un secreto TOTP que no se puede descifrar
 * tiene que romper, no devolver algo que genere códigos equivocados.
 */
export function descifrar(paquete: string): string {
  const partes = paquete.split(".");
  if (partes.length !== 3) {
    throw new Error("Texto cifrado con formato inválido.");
  }

  const [ivB64, cifradoB64, tagB64] = partes;
  const tag = Buffer.from(tagB64, "base64url");

  if (tag.length !== LARGO_TAG) {
    throw new Error("Texto cifrado con formato inválido.");
  }

  const decipher = createDecipheriv(
    ALGORITMO,
    clave(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(tag);

  // `final()` tira si el tag no valida: ahí es donde GCM detecta manipulación.
  return Buffer.concat([
    decipher.update(Buffer.from(cifradoB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Compara dos strings en tiempo constante.
 *
 * Con `===`, la comparación sale en el primer byte distinto, y esa diferencia
 * de microsegundos deja adivinar un valor byte a byte. Importa para códigos
 * TOTP y de respaldo, que son cortos y se prueban muchas veces.
 */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  // `timingSafeEqual` tira si los largos difieren, y el largo en sí no es
  // secreto: un código TOTP siempre mide 6.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
