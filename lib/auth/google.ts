import "server-only";

import { decodeIdToken, generateCodeVerifier, generateState, Google } from "arctic";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db/cliente";
import { cuentaOauth, usuario, type Usuario } from "@/lib/db/esquema";

/**
 * Login con Google: Authorization Code + PKCE.
 *
 * No se usa el flujo implícito: está deprecado y devuelve el token en el
 * fragmento de la URL, donde lo ve cualquier script de la página.
 *
 * PKCE aunque seamos un cliente confidencial (tenemos client_secret): es lo que
 * recomienda OAuth 2.1 y cubre el caso de que el `code` se filtre por el
 * Referer o por un log del proxy.
 */

const PROVEEDOR = "google";

// El scope mínimo que sirve. `openid email profile` da sub, mail y nombre. No
// pedir más: cada scope extra es más datos nuestros que proteger y una pantalla
// de consentimiento que asusta.
const SCOPES = ["openid", "email", "profile"];

const COOKIE_ESTADO = "oauth_estado";
const COOKIE_VERIFIER = "oauth_verifier";
const COOKIE_DESTINO = "oauth_destino";

// 10 minutos: lo que tarda una persona en elegir cuenta y aceptar. Más tiempo
// es más ventana para reusar un estado robado.
const VIDA_ESTADO_S = 600;

const EN_PRODUCCION = process.env.NODE_ENV === "production";

function cliente(): Google {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
    process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI.",
    );
  }

  return new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

/* ------------------------------------------------------------------ ida */

/**
 * @param destino A dónde volver después de entrar. Se valida acá y no al
 * volver: un `?destino=https://sitio-atacante.com` convertiría nuestro login en
 * un open redirect, que es la mitad de un phishing creíble.
 */
export async function iniciarLoginGoogle(destino: string | null): Promise<URL> {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const store = await cookies();
  const opciones = {
    httpOnly: true,
    secure: EN_PRODUCCION,
    sameSite: "lax" as const,
    path: "/",
    maxAge: VIDA_ESTADO_S,
  };

  store.set(COOKIE_ESTADO, state, opciones);
  store.set(COOKIE_VERIFIER, codeVerifier, opciones);
  store.set(COOKIE_DESTINO, destinoSeguro(destino), opciones);

  return cliente().createAuthorizationURL(state, codeVerifier, SCOPES);
}

/**
 * Sólo rutas internas. Tiene que empezar con una barra y no con dos: `//evil.com`
 * es una URL protocol-relative y el navegador la trata como externa.
 */
export function destinoSeguro(destino: string | null): string {
  if (!destino) return "/";
  if (!destino.startsWith("/")) return "/";
  if (destino.startsWith("//")) return "/";
  return destino;
}

/* --------------------------------------------------------------- vuelta */

export class ErrorOauth extends Error {}

/**
 * Los claims que nos importan del id_token.
 *
 * `email_verified` llega como boolean o como el string "true" según el
 * proveedor; se normaliza. No se asume que venga: si falta, es false.
 */
const ClaimsGoogle = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === true || v === "true"),
  name: z.string().optional(),
});

export interface ResultadoCallback {
  usuario: Usuario;
  destino: string;
}

export async function completarLoginGoogle(
  code: string | null,
  stateRecibido: string | null,
): Promise<ResultadoCallback> {
  const store = await cookies();
  const stateGuardado = store.get(COOKIE_ESTADO)?.value ?? null;
  const codeVerifier = store.get(COOKIE_VERIFIER)?.value ?? null;
  const destino = destinoSeguro(store.get(COOKIE_DESTINO)?.value ?? null);

  // Se limpian pase lo que pase: un state es de un solo uso.
  for (const c of [COOKIE_ESTADO, COOKIE_VERIFIER, COOKIE_DESTINO]) {
    store.set(c, "", { path: "/", maxAge: 0 });
  }

  if (!code || !stateRecibido || !stateGuardado || !codeVerifier) {
    throw new ErrorOauth("Faltan parámetros del flujo OAuth.");
  }

  // CSRF de OAuth. Sin este chequeo, un atacante te manda a nuestro callback
  // con SU code y quedás logueado en la cuenta de él sin darte cuenta: todo lo
  // que cargues después (dirección, teléfono, pedidos) queda en su cuenta.
  if (stateRecibido !== stateGuardado) {
    throw new ErrorOauth("El state no coincide.");
  }

  const tokens = await cliente().validateAuthorizationCode(code, codeVerifier);

  /*
   * [decisión] `decodeIdToken` decodifica sin verificar la firma, y acá está bien.
   *
   * Este id_token no vino del navegador: lo trajo `validateAuthorizationCode`,
   * que es un POST nuestro al endpoint de Google, sobre TLS, autenticado con
   * nuestro client_secret. La cadena ya está verificada por el transporte.
   *
   * Si el token llegara por cualquier otro camino —del cliente, de un redirect,
   * de un header— habría que verificar firma contra el JWKS de Google, `iss`,
   * `aud` y `exp`. Sin eso, cualquiera arma un JWT y es quien quiera.
   */
  const claims = ClaimsGoogle.safeParse(decodeIdToken(tokens.idToken()));
  if (!claims.success) {
    throw new ErrorOauth("El id_token de Google no tiene los claims esperados.");
  }

  const { sub, email, email_verified, name } = claims.data;
  const emailNormalizado = email.toLowerCase().trim();

  return {
    usuario: await vincularOCrear({
      sub,
      email: emailNormalizado,
      emailVerificado: email_verified,
      nombre: name ?? null,
    }),
    destino,
  };
}

interface DatosGoogle {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string | null;
}

async function vincularOCrear(datos: DatosGoogle): Promise<Usuario> {
  // 1. ¿Ya entró antes por Google? El `sub` es la identidad estable.
  const yaVinculado = await db
    .select({ usuario })
    .from(cuentaOauth)
    .innerJoin(usuario, eq(cuentaOauth.usuarioId, usuario.id))
    .where(
      and(
        eq(cuentaOauth.proveedor, PROVEEDOR),
        eq(cuentaOauth.proveedorUsuarioId, datos.sub),
      ),
    )
    .limit(1);

  if (yaVinculado[0]) return yaVinculado[0].usuario;

  /*
   * 2. No vino nunca por Google. ¿Hay una cuenta local con ese mail?
   *
   * Acá está la toma de cuentas clásica de "Sign in with Google": si vinculamos
   * por mail sin exigir que Google lo haya verificado, alguien crea una cuenta
   * Google con el mail de nuestro cliente, entra, y se lleva la cuenta.
   *
   * Google sólo pone email_verified en true para cuentas Gmail o de Workspace
   * cuyo dominio controla. Sin ese true, el mail es texto que escribió alguien.
   */
  if (!datos.emailVerificado) {
    throw new ErrorOauth(
      "Google no confirmó que ese correo sea tuyo. Entrá con tu contraseña.",
    );
  }

  return db.transaction(async (tx) => {
    const existentes = await tx
      .select()
      .from(usuario)
      .where(eq(usuario.email, datos.email))
      .limit(1);

    let destino = existentes[0];

    if (destino) {
      // El mail está verificado por Google y coincide con una cuenta nuestra:
      // es la misma persona. Se vincula y, si la cuenta local nunca había
      // verificado el mail, ahora queda verificada.
      if (!destino.emailVerificado) {
        const [actualizado] = await tx
          .update(usuario)
          .set({ emailVerificado: true })
          .where(eq(usuario.id, destino.id))
          .returning();
        destino = actualizado;
      }
    } else {
      const [creado] = await tx
        .insert(usuario)
        .values({
          email: datos.email,
          emailVerificado: true,
          nombre: datos.nombre,
          passwordHash: null, // entra sólo por Google hasta que defina una
        })
        .returning();
      destino = creado;
    }

    await tx.insert(cuentaOauth).values({
      proveedor: PROVEEDOR,
      proveedorUsuarioId: datos.sub,
      usuarioId: destino.id,
    });

    return destino;
  });
}
