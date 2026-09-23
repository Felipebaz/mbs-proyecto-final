"use server";

import { redirect } from "next/navigation";
import { registrar } from "@/lib/auditoria";
import { sesionActual, usuarioActual } from "@/lib/auth/dal";
import { consumir } from "@/lib/auth/rate-limit";
import { marcarFactor2 } from "@/lib/auth/sesion";
import { confirmarAlta, verificarFactor2 } from "@/lib/auth/totp";
import { headers } from "next/headers";

/**
 * Acciones del segundo factor.
 *
 * Ninguna usa `requerirAdmin()`: esa función redirige a estas pantallas, así
 * que llamarla acá sería un ciclo. Se exige sesión y rol a mano.
 */

export interface EstadoFactor2 {
  error?: string;
  codigosRespaldo?: string[];
}

async function ipActual(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";
}

/** Confirma el alta con un código de la app y devuelve los códigos de respaldo. */
export async function confirmarAltaTotp(
  _estado: EstadoFactor2 | undefined,
  formData: FormData,
): Promise<EstadoFactor2> {
  const usuario = await usuarioActual();
  if (!usuario || usuario.rol !== "admin") redirect("/login");

  const codigo = String(formData.get("codigo") ?? "");

  // Mismo límite que el login: seis dígitos se prueban rápido.
  if (!(await consumir("loginPorCuenta", `2fa-alta:${usuario.id}`)).permitido) {
    return { error: "Demasiados intentos. Esperá unos minutos." };
  }

  const resultado = await confirmarAlta(usuario, codigo);
  if (!resultado) {
    return { error: "Ese código no es válido. Fijate que el reloj esté en hora." };
  }

  const s = await sesionActual();
  if (s) await marcarFactor2(s.sesionId);

  await registrar(usuario, { accion: "2fa_activado" });

  // Los códigos se devuelven UNA sola vez: no se vuelven a poder ver.
  return { codigosRespaldo: resultado.codigosRespaldo };
}

/** Valida el segundo factor para esta sesión. */
export async function verificarTotp(
  _estado: EstadoFactor2 | undefined,
  formData: FormData,
): Promise<EstadoFactor2> {
  const usuario = await usuarioActual();
  if (!usuario || usuario.rol !== "admin") redirect("/login");

  const codigo = String(formData.get("codigo") ?? "");
  const ip = await ipActual();

  // Por cuenta y por IP: seis dígitos son un millón de combinaciones, que sin
  // tope se prueban enteras en poco tiempo.
  const [porCuenta, porIp] = await Promise.all([
    consumir("loginPorCuenta", `2fa:${usuario.id}`),
    consumir("loginPorIp", `2fa:${ip}`),
  ]);

  if (!porCuenta.permitido || !porIp.permitido) {
    return { error: "Demasiados intentos. Esperá unos minutos." };
  }

  const resultado = await verificarFactor2(usuario, codigo);
  if (!resultado.ok) {
    // Mensaje único: no se dice si falló el código de la app o el de respaldo.
    return { error: "Código incorrecto." };
  }

  const s = await sesionActual();
  if (s) await marcarFactor2(s.sesionId);

  await registrar(usuario, {
    accion: "login_admin",
    detalle: {
      conRespaldo: resultado.usoRespaldo,
      ...(resultado.usoRespaldo
        ? { respaldosRestantes: resultado.respaldosRestantes }
        : {}),
    },
  });

  redirect("/admin");
}
