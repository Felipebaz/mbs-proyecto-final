import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db/cliente";
import { sesion, usuario, type Usuario } from "@/lib/db/esquema";

/**
 * Sesiones: token opaco en cookie, hash en la base.
 *
 * [decisión] Token opaco y no JWT. Un JWT no se puede revocar sin una lista
 * negra, y si tenés lista negra ya tenés una tabla de sesiones — el JWT no te
 * dio nada y encima el estado quedó en dos lugares. Con token opaco, cerrar
 * sesión es un DELETE.
 *
 * El flujo:
 *   1. token = 32 bytes de CSPRNG en base64url  → va a la cookie
 *   2. id    = sha256(token)                    → va a la base
 *
 * [decisión] sha256 y no Argon2 para el token. El token ya es aleatorio de 256
 * bits: no hay nada que adivinar por fuerza bruta, así que la función lenta no
 * agrega seguridad y sí agregaría ~50ms a cada request. Argon2 es para
 * contraseñas, que las elige un humano.
 */

const NOMBRE_COOKIE = "__Host-sesion";

/** Inactividad tolerada antes de tener que volver a entrar. */
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;

/** Pasada la mitad de la vida, se renueva. Evita un UPDATE por request. */
const RENOVAR_DESDE_MS = DURACION_MS / 2;

function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* ---------------------------------------------------------------- cookie */

/**
 * Por qué cada flag:
 *
 *   httpOnly  JS no la lee. Un XSS no se lleva la sesión.
 *   secure    sólo viaja por HTTPS.
 *   sameSite  'lax' bloquea el POST cross-site (CSRF) pero deja pasar la
 *             navegación top-level GET, que es lo que necesita la vuelta de
 *             Google al callback. 'strict' rompería ese flujo.
 *   path      '/' — toda la app.
 *   sin domain  no se comparte con subdominios. Un subdominio comprometido no
 *               ve la cookie.
 *
 * El prefijo `__Host-` hace que el navegador EXIJA secure + path=/ + sin
 * domain: aunque alguien se equivoque más abajo, el navegador rechaza la
 * cookie en vez de aceptarla insegura.
 *
 * `__Host-` requiere HTTPS. En dev (http://localhost) el navegador la
 * rechazaría, así que ahí se usa el nombre sin prefijo.
 */
const EN_PRODUCCION = process.env.NODE_ENV === "production";

function nombreCookie(): string {
  return EN_PRODUCCION ? NOMBRE_COOKIE : "sesion";
}

export async function escribirCookieSesion(token: string, expiraEn: Date) {
  const store = await cookies();
  store.set(nombreCookie(), token, {
    httpOnly: true,
    secure: EN_PRODUCCION,
    sameSite: "lax",
    path: "/",
    expires: expiraEn,
  });
}

export async function borrarCookieSesion() {
  const store = await cookies();
  store.set(nombreCookie(), "", {
    httpOnly: true,
    secure: EN_PRODUCCION,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function leerCookieSesion(): Promise<string | null> {
  const store = await cookies();
  return store.get(nombreCookie())?.value ?? null;
}

/* ------------------------------------------------------------ ciclo de vida */

export interface SesionCreada {
  token: string;
  expiraEn: Date;
}

/**
 * Siempre emite una sesión NUEVA.
 *
 * Nunca se "promueve" una sesión anónima a autenticada reusando su id: eso es
 * session fixation. Un atacante que logre fijarle una cookie a la víctima
 * (subdominio, red hostil) se quedaría con una sesión válida en cuanto la
 * víctima entra.
 */
export async function crearSesion(
  usuarioId: string,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SesionCreada> {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + DURACION_MS);

  await db.insert(sesion).values({
    id: hashDeToken(token),
    usuarioId,
    expiraEn,
    ip: contexto.ip ?? null,
    userAgent: contexto.userAgent?.slice(0, 512) ?? null,
  });

  return { token, expiraEn };
}

export interface SesionValidada {
  usuario: Usuario;
  sesionId: string;
  expiraEn: Date;
  /** true si se extendió el vencimiento: hay que reescribir la cookie. */
  renovada: boolean;
}

/**
 * Valida contra la base, no contra la cookie.
 *
 * Una sesión vencida se borra al detectarla, así la tabla no crece con basura
 * aunque nunca corra el cron de limpieza.
 */
export async function validarToken(
  token: string | null,
): Promise<SesionValidada | null> {
  if (!token) return null;

  const id = hashDeToken(token);

  const filas = await db
    .select({ sesion, usuario })
    .from(sesion)
    .innerJoin(usuario, eq(sesion.usuarioId, usuario.id))
    .where(eq(sesion.id, id))
    .limit(1);

  const fila = filas[0];
  if (!fila) return null;

  if (fila.sesion.expiraEn.getTime() <= Date.now()) {
    await db.delete(sesion).where(eq(sesion.id, id));
    return null;
  }

  // Renovación deslizante: mientras use la app, no lo echamos.
  let expiraEn = fila.sesion.expiraEn;
  let renovada = false;
  if (expiraEn.getTime() - Date.now() < RENOVAR_DESDE_MS) {
    expiraEn = new Date(Date.now() + DURACION_MS);
    await db.update(sesion).set({ expiraEn }).where(eq(sesion.id, id));
    renovada = true;
  }

  return { usuario: fila.usuario, sesionId: id, expiraEn, renovada };
}

export async function invalidarSesion(sesionId: string) {
  await db.delete(sesion).where(eq(sesion.id, sesionId));
}

/**
 * Todas las sesiones del usuario. Se llama al cambiar contraseña o email: si
 * alguien le robó la sesión, cambiar la contraseña tiene que echarlo.
 */
export async function invalidarSesionesDe(usuarioId: string) {
  await db.delete(sesion).where(eq(sesion.usuarioId, usuarioId));
}

/** Para el cron de limpieza. Ver `lib/db/limpieza.ts`. */
export async function purgarSesionesVencidas(): Promise<void> {
  await db.delete(sesion).where(lt(sesion.expiraEn, new Date()));
}

export const _test = { hashDeToken, DURACION_MS, RENOVAR_DESDE_MS };
