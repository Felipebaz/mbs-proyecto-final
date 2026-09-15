"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { fusionarCarritoAnonimo } from "@/lib/carrito/repositorio";
import { db } from "@/lib/db/cliente";
import { usuario } from "@/lib/db/esquema";
import { sesionActual } from "@/lib/auth/dal";
import { hashearPassword, verificarPassword } from "@/lib/auth/password";
import { consumir, liberar, LIMITES } from "@/lib/auth/rate-limit";
import {
  borrarCookieSesion,
  crearSesion,
  escribirCookieSesion,
  invalidarSesion,
} from "@/lib/auth/sesion";
import { LoginSchema, RegistroSchema } from "@/lib/auth/validacion";

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
}

/** El cliente real detrás del proxy de Vercel. */
async function contexto() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

/* ------------------------------------------------------------- registro */

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

  const { ip, userAgent } = await contexto();

  const limite = consumir(`registro:${ip}`, LIMITES.registroPorIp);
  if (!limite.permitido) {
    return { error: "Demasiados intentos. Probá en un rato." };
  }

  const hash = await hashearPassword(campos.data.password);

  let usuarioId: string;

  try {
    const [creado] = await db
      .insert(usuario)
      .values({
        email: campos.data.email,
        nombre: campos.data.nombre,
        passwordHash: hash,
        emailVerificado: false,
      })
      .returning({ id: usuario.id });
    usuarioId = creado.id;
  } catch (e) {
    /*
     * El mail ya existe (viola el UNIQUE).
     *
     * No se dice "ese mail ya está registrado": eso le confirma a cualquiera
     * qué mails son clientes nuestros. El mensaje es el mismo que el del éxito,
     * y quien ya tenga cuenta recibe un mail avisando del intento.
     *
     * TODO(pendiente): mandar ese mail. Hasta que exista, el usuario legítimo
     * que se re-registra no recibe señal — por eso no se puede quedar así.
     */
    if (esViolacionDeUnico(e)) {
      return { error: "Revisá tu correo para terminar de crear la cuenta." };
    }
    throw e;
  }

  const { token, expiraEn } = await crearSesion(usuarioId, { ip, userAgent });
  await escribirCookieSesion(token, expiraEn);
  await fusionarCarritoAnonimo(usuarioId);

  redirect("/");
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

function esViolacionDeUnico(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505" // unique_violation en Postgres
  );
}
