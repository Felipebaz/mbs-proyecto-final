import "server-only";

import { hash, verify } from "@node-rs/argon2";

/**
 * Contraseñas.
 *
 * Se HASHEAN, no se cifran. Cifrar es reversible: si se filtra la clave, se
 * filtran todas las contraseñas de todos los clientes. Un hash con función
 * lenta no se revierte ni con la base entera en la mano.
 *
 * La contraseña sí viaja por la red, una vez, en el body de un POST sobre TLS.
 * No hay forma de evitarlo: el servidor tiene que verla para verificarla.
 * Hashearla en el navegador no ayuda, empeora: el hash pasa a ser la
 * contraseña efectiva y quien lo intercepte lo reenvía tal cual.
 *
 * Lo que sí se controla:
 *   - nunca en la URL ni en query string (quedan en logs, en Referer, en el
 *     historial del navegador)
 *   - nunca logueada: no pasar `formData` crudo a un logger
 *   - nunca guardada en claro, nunca devuelta en una respuesta
 */

// Parámetros mínimos de OWASP para Argon2id (m=19 MiB, t=2, p=1).
// Subir `memoryCost` es lo que más encarece el crackeo; medir antes de tocar.
// `Algorithm.Argon2id` es un const enum y `isolatedModules` no deja leerlo en
// tiempo de ejecución, así que va el valor literal. Está fijado por el test.
const ARGON2ID = 2;

const OPCIONES = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash con el que comparar cuando el usuario NO existe.
 *
 * Sin esto, "email inexistente" responde en 1ms y "contraseña incorrecta" en
 * 50ms: la diferencia de tiempo le dice a un atacante qué mails están
 * registrados, que es justo lo que el mensaje de error genérico esconde.
 *
 * Se calcula una vez al levantar, no en cada request.
 */
let hashSeñuelo: Promise<string> | null = null;

function señuelo(): Promise<string> {
  hashSeñuelo ??= hash("contraseña que no le sirve a nadie", OPCIONES);
  return hashSeñuelo;
}

export async function hashearPassword(plano: string): Promise<string> {
  return hash(plano, OPCIONES);
}

/**
 * @param hashGuardado `null` cuando el usuario no existe o entra sólo por
 * Google. En ambos casos se verifica igual contra el señuelo y se devuelve
 * false: el tiempo de respuesta es el mismo que el de una contraseña errada.
 */
export async function verificarPassword(
  hashGuardado: string | null,
  plano: string,
): Promise<boolean> {
  if (hashGuardado === null) {
    await verify(await señuelo(), plano, OPCIONES);
    return false;
  }

  try {
    return await verify(hashGuardado, plano, OPCIONES);
  } catch {
    // Hash corrupto o de un algoritmo viejo: no es motivo para tirar un 500 con
    // stack trace al cliente. Es un login fallido.
    return false;
  }
}
