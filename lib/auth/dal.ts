import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
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
}

export function aPublico(u: Usuario): UsuarioPublico {
  return { id: u.id, email: u.email, nombre: u.nombre };
}
