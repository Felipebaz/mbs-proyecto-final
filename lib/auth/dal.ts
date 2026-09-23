import "server-only";

import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import type { Usuario } from "@/lib/db/esquema";
import { leerCookieSesion, validarToken } from "./sesion";

/**
 * Capa de acceso a datos: el ÚNICO lugar donde se pregunta quién está logueado.
 *
 * Que un componente se renderice sólo en una página protegida no es una
 * frontera de seguridad: el Server Action que ese componente invoca es un POST
 * que cualquiera puede mandar sin pasar por la UI. Por eso el chequeo va acá,
 * pegado al dato, y se repite en cada acción — no en el layout.
 *
 * `cache()` de React memoiza por pase de render: diez componentes pueden pedir
 * el usuario y la base se consulta una sola vez.
 */

export const sesionActual = cache(async () => {
  const token = await leerCookieSesion();
  return validarToken(token);
});

/** Devuelve el usuario o `null`. Para UI que cambia según si hay sesión. */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const s = await sesionActual();
  return s?.usuario ?? null;
});

/**
 * Exige sesión. Redirige si no hay.
 *
 * Usar en páginas y acciones que no tienen sentido sin usuario (pedidos,
 * "mi cuenta"). Para el carrito NO: el carrito anónimo tiene que funcionar.
 */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}

/**
 * Exige que quien pide sea admin.
 *
 * Tiene que llamarse DENTRO de cada server action y cada route handler del
 * panel, no sólo en la página que los muestra. Una server action es un POST
 * contra la ruta: cualquiera puede mandarlo sin pasar por la UI, y que el
 * botón no se renderice para un cliente no impide nada.
 *
 * Sin sesión → /login. Con sesión pero sin rol → 403, no redirect: un cliente
 * que llega acá tiene que ver que no le alcanza el permiso, no una página
 * distinta como si la ruta no existiera.
 *
 * El rol se lee de la base en cada request, nunca de la cookie: si se guardara
 * en la sesión, degradar a alguien no tendría efecto hasta que cerrara sesión.
 */
export async function requerirAdmin(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "admin") forbidden();
  return usuario;
}

/**
 * Exige sesión Y correo verificado.
 *
 * Para el checkout de la FASE 3: navegar sin verificar se puede, pagar no. Un
 * pedido pagado contra una dirección que nadie confirmó no tiene a dónde mandar
 * la confirmación, y es el camino cómodo para pedir a nombre de otro.
 *
 * Tiene que llamarse dentro de la server action que cobra, no sólo esconder el
 * botón: la action es un POST que cualquiera puede mandar sin pasar por la UI.
 */
export async function exigirEmailVerificado(): Promise<Usuario> {
  const usuario = await exigirUsuario();
  if (!usuario.emailVerificado) redirect("/verificar/pendiente");
  return usuario;
}

/**
 * Lo que se le puede mandar al navegador.
 *
 * `Usuario` trae `passwordHash`. Devolver la fila cruda desde un Server Action
 * o pasarla como prop a un Client Component la serializa y la manda al cliente.
 * Todo lo que cruza a la UI pasa por acá.
 */
export interface UsuarioPublico {
  id: string;
  email: string;
  nombre: string | null;
  emailVerificado: boolean;
  /**
   * Va incluido porque la UI necesita saber si mostrar el link al panel. NO es
   * una autorización: el navegador puede mentir sobre esto y no cambia nada —
   * quien decide es `requerirAdmin()` del lado servidor, contra la base.
   */
  rol: Usuario["rol"];
}

export function aPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    emailVerificado: u.emailVerificado,
    rol: u.rol,
  };
}
