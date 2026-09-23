"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth/dal";
import { hashearPassword, verificarPassword } from "@/lib/auth/password";
import { consumir, liberar, LIMITES } from "@/lib/auth/rate-limit";
import {
  borrarCookieSesion,
  crearSesion,
  escribirCookieSesion,
  invalidarSesion,
  invalidarSesionesDe,
} from "@/lib/auth/sesion";
import { crearToken, invalidarTokensDe } from "@/lib/auth/tokens";
import {
  LoginSchema,
  RecuperarSchema,
  ReenviarSchema,
  RegistroSchema,
  ResetSchema,
} from "@/lib/auth/validacion";
import { fusionarCarritoAnonimo } from "@/lib/carrito/repositorio";
import { db } from "@/lib/db/cliente";
import { usuario, type Usuario } from "@/lib/db/esquema";
import { enviarEmail, urlBase } from "@/lib/email";
import {
  plantillaPasswordCambiada,
  plantillaRegistroRepetido,
  plantillaReset,
  plantillaVerificacion,
} from "@/lib/email/plantillas";

/**
 * Server Actions de autenticación.
 *
 * Una Server Action es un POST contra la página que la invoca: es alcanzable
 * para cualquiera que mande el mismo POST, sin pasar por la UI. Next verifica
 * Origin contra Host (CSRF), pero eso no valida nada de lo que viene adentro.
 * Todo lo que llega se valida acá.
 */

export interface EstadoForm {
  error?: string;
  errores?: Record<string, string[] | undefined>;
  /** Mensaje de éxito. En los flujos por correo es siempre genérico. */
  ok?: string;
}

/** El cliente real detrás del proxy de Vercel. */
async function contexto() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

/* --------------------------------------------------------------- correo */

/** Arma el link y manda el mail de verificación. No tira si el envío falla. */
async function mandarVerificacion(u: Usuario) {
  const { token } = await crearToken(u.id, "verificacion");
  const url = `${urlBase()}/verificar?token=${encodeURIComponent(token)}`;
  await enviarEmail(plantillaVerificacion(u.email, u.nombre, url));
}

/* ------------------------------------------------------------- registro */

/**
 * Registro.
 *
 * [decisión] NO inicia sesión al registrarse.
 *
 * La consigna es que el registro no permita enumerar usuarios. Con auto-login
 * eso es imposible de cumplir: con un correo nuevo quedás adentro, con uno que
 * ya existe no. El mensaje en pantalla puede ser idéntico, pero el
 * comportamiento delata igual cuáles direcciones son clientes nuestros, y un
 * mensaje genérico con esa diferencia atrás es seguridad de mentira.
 *
 * Así, los dos caminos son indistinguibles de verdad: misma pantalla, un mail
 * a la misma dirección, sin sesión. Quien se registra entra desde el link del
 * mail; quien ya tenía cuenta recibe el aviso de que alguien lo intentó.
 */
export async function registrarse(
  _estado: EstadoForm | undefined,
  formData: FormData,
): Promise<EstadoForm> {
  const campos = RegistroSchema.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!campos.success) {
    return { errores: z_flatten(campos.error) };
  }

  const { ip } = await contexto();

  if (!consumir(`registro:${ip}`, LIMITES.registroPorIp).permitido) {
    return { error: "Demasiados intentos. Probá en un rato." };
  }

  // Se hashea SIEMPRE, exista o no la cuenta. Es la operación cara del
  // registro: saltearla cuando el correo ya existe haría que ese caso responda
  // mucho más rápido, y el tiempo de respuesta delataría lo que el mensaje
  // genérico esconde.
  const hash = await hashearPassword(campos.data.password);

  try {
    const [creado] = await db
      .insert(usuario)
      .values({
        email: campos.data.email,
        nombre: campos.data.nombre,
        passwordHash: hash,
        emailVerificado: false,
      })
      .returning();

    await mandarVerificacion(creado);
  } catch (e) {
    if (!esViolacionDeUnico(e)) throw e;

    /*
     * El correo ya tiene cuenta. Al que lo intentó no se le dice nada distinto;
     * al dueño se le avisa por mail, que es el único canal donde se puede
     * hablar sin filtrarle nada a un tercero.
     *
     * Vale igual si la cuenta existente está sin verificar. Reenviar la
     * verificación sería peor: si un atacante registró primero esa dirección
     * con SU contraseña, el dueño legítimo verificaría una cuenta ajena. Con el
     * aviso, el dueño usa "recuperar contraseña" y se queda con la cuenta —el
     * reset la marca verificada, porque abrir ese link prueba que la casilla
     * es suya.
     */
    const existentes = await db
      .select()
      .from(usuario)
      .where(eq(usuario.email, campos.data.email))
      .limit(1);

    if (existentes[0]) {
      await enviarEmail(
        plantillaRegistroRepetido(
          existentes[0].email,
          existentes[0].nombre,
          `${urlBase()}/recuperar`,
        ),
      );
    }
  }

  return { ok: "Te mandamos un correo. Abrilo para activar tu cuenta." };
}

/* ------------------------------------------------ reenviar verificación */

/**
 * Reenvía el mail de verificación.
 *
 * Responde lo mismo exista o no la cuenta, y esté o no ya verificada.
 */
export async function reenviarVerificacion(
  _estado: EstadoForm | undefined,
  formData: FormData,
): Promise<EstadoForm> {
  const campos = ReenviarSchema.safeParse({ email: formData.get("email") });
  const generico = {
    ok: "Si esa dirección tiene una cuenta sin verificar, te mandamos el correo.",
  };

  if (!campos.success) return generico;

  const { ip } = await contexto();
  const porIp = consumir(`verif-ip:${ip}`, LIMITES.resetPorIp);
  const porCuenta = consumir(
    `verif-cuenta:${campos.data.email}`,
    LIMITES.verificacionPorCuenta,
  );

  // También acá la respuesta es genérica: decir "demasiados intentos" sólo
  // cuando la cuenta existe volvería a ser un canal de enumeración.
  if (!porIp.permitido || !porCuenta.permitido) return generico;

  const filas = await db
    .select()
    .from(usuario)
    .where(eq(usuario.email, campos.data.email))
    .limit(1);

  const u = filas[0];
  if (u && !u.emailVerificado) await mandarVerificacion(u);

  return generico;
}

/* ------------------------------------------------------- pedir el reset */

export async function pedirReset(
  _estado: EstadoForm | undefined,
  formData: FormData,
): Promise<EstadoForm> {
  const campos = RecuperarSchema.safeParse({ email: formData.get("email") });
  const generico = {
    ok: "Si esa dirección tiene una cuenta, te mandamos un correo para cambiar la contraseña.",
  };

  if (!campos.success) return generico;

  const { ip } = await contexto();
  const porIp = consumir(`reset-ip:${ip}`, LIMITES.resetPorIp);
  const porCuenta = consumir(
    `reset-cuenta:${campos.data.email}`,
    LIMITES.resetPorCuenta,
  );

  if (!porIp.permitido || !porCuenta.permitido) return generico;

  const filas = await db
    .select()
    .from(usuario)
    .where(eq(usuario.email, campos.data.email))
    .limit(1);

  const u = filas[0];

  /*
   * Si la cuenta entra sólo por Google (passwordHash null), el reset igual
   * procede: le define una contraseña. Quien controla la casilla ya controla
   * la cuenta —con Google también se entra por el correo—, así que no se pierde
   * nada, y negarlo delataría que esa dirección usa Google.
   */
  if (u) {
    const { token } = await crearToken(u.id, "reset");
    await enviarEmail(
      plantillaReset(
        u.email,
        u.nombre,
        `${urlBase()}/reset?token=${encodeURIComponent(token)}`,
      ),
    );
  }

  return generico;
}

/* ---------------------------------------------------- cambiar contraseña */

/**
 * Consume el token de reset y cambia la contraseña.
 *
 * Tres cosas pasan juntas y ninguna es opcional:
 *   1. se cierran TODAS las sesiones del usuario
 *   2. se queman los demás tokens de reset sin usar
 *   3. se manda el aviso de que la contraseña cambió
 *
 * La 1 es lo que hace útil al cambio de contraseña: si alguien le robó la
 * sesión, cambiarla tiene que echarlo. La 3 es la única señal que le llega al
 * dueño si el que cambió la contraseña no fue él.
 */
export async function cambiarPassword(
  _estado: EstadoForm | undefined,
  formData: FormData,
): Promise<EstadoForm> {
  const campos = ResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!campos.success) {
    return { errores: z_flatten(campos.error) };
  }

  const { consumirToken } = await import("@/lib/auth/tokens");
  const resultado = await consumirToken(campos.data.token, "reset");

  if (!resultado.ok) {
    return {
      error:
        resultado.motivo === "vencido"
          ? "Ese link venció. Pedí uno nuevo."
          : "Ese link ya no sirve. Pedí uno nuevo.",
    };
  }

  const u = resultado.usuario;
  const hash = await hashearPassword(campos.data.password);

  await db
    .update(usuario)
    .set({
      passwordHash: hash,
      // Abrir el link prueba que la casilla es suya: alcanza para darla por
      // verificada. Es lo que le permite al dueño recuperar una cuenta que
      // alguien registró con su correo y nunca verificó.
      emailVerificado: true,
    })
    .where(eq(usuario.id, u.id));

  await invalidarSesionesDe(u.id);
  await invalidarTokensDe(u.id, "reset");
  await enviarEmail(plantillaPasswordCambiada(u.email, u.nombre, new Date()));

  redirect("/login?cambiada=1");
}

/* ---------------------------------------------------------------- login */

export async function entrar(
  _estado: EstadoForm | undefined,
  formData: FormData,
): Promise<EstadoForm> {
  const campos = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Mensaje genérico también cuando el formato del mail es inválido: cualquier
  // diferencia de respuesta es información.
  if (!campos.success) {
    return { error: "Correo o contraseña incorrectos." };
  }

  const { email, password } = campos.data;
  const { ip, userAgent } = await contexto();

  // Por IP y por cuenta. Sólo por IP, un atacante con IPs rotativas pasa; sólo
  // por cuenta, cualquiera deja afuera a un cliente tocándole el mail.
  const porIp = consumir(`login-ip:${ip}`, LIMITES.loginPorIp);
  const porCuenta = consumir(`login-cuenta:${email}`, LIMITES.loginPorCuenta);

  if (!porIp.permitido || !porCuenta.permitido) {
    const espera = Math.max(porIp.esperaSegundos, porCuenta.esperaSegundos);
    return {
      error: `Demasiados intentos. Esperá ${Math.ceil(espera / 60)} minutos.`,
    };
  }

  const filas = await db
    .select()
    .from(usuario)
    .where(eq(usuario.email, email))
    .limit(1);

  const encontrado = filas[0];

  // Si no existe, `verificarPassword` compara contra un hash señuelo: el tiempo
  // de respuesta es idéntico al de una contraseña errada. Sin eso, la
  // diferencia de latencia delata qué mails están registrados y el mensaje
  // genérico no sirve de nada.
  const ok = await verificarPassword(encontrado?.passwordHash ?? null, password);

  if (!ok || !encontrado) {
    return { error: "Correo o contraseña incorrectos." };
  }

  liberar(`login-cuenta:${email}`);

  // Sesión nueva, siempre: nunca se reusa la anónima (session fixation).
  const { token, expiraEn } = await crearSesion(encontrado.id, { ip, userAgent });
  await escribirCookieSesion(token, expiraEn);
  await fusionarCarritoAnonimo(encontrado.id);

  redirect("/");
}

/* --------------------------------------------------------------- logout */

export async function salir() {
  const s = await sesionActual();
  if (s) await invalidarSesion(s.sesionId);

  // Se borra la cookie aunque la sesión ya no exista: si no, el navegador sigue
  // mandando un token muerto en cada request.
  await borrarCookieSesion();
  redirect("/");
}

/* --------------------------------------------------------------- helpers */

function z_flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const salida: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    (salida[campo] ??= []).push(issue.message);
  }
  return salida;
}

/**
 * ¿Es una violación de UNIQUE de Postgres (23505)?
 *
 * Hay que recorrer la cadena de `cause`: Drizzle envuelve el error del driver
 * en un `DrizzleQueryError` y el `code` queda adentro, no arriba. Mirando sólo
 * el error de arriba, un registro con un correo repetido se escapa como
 * excepción no manejada —o sea, un 500 en vez del aviso por mail al dueño.
 */
function esViolacionDeUnico(e: unknown): boolean {
  let actual: unknown = e;

  // Tope por si alguna vez aparece una cadena circular.
  for (let i = 0; i < 10 && actual != null; i++) {
    if (
      typeof actual === "object" &&
      "code" in actual &&
      (actual as { code?: string }).code === "23505"
    ) {
      return true;
    }
    actual = (actual as { cause?: unknown }).cause;
  }

  return false;
}
