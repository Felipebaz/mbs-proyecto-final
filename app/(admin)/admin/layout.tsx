import Link from "next/link";
import { redirect } from "next/navigation";
import { forbidden } from "next/navigation";
import { usuarioActual } from "@/lib/auth/dal";

/**
 * Chrome del panel.
 *
 * [decisión] El layout exige sesión y rol admin, pero NO el segundo factor.
 *
 * Las pantallas de 2FA viven abajo de este layout, y si el layout exigiera el
 * segundo factor no habría forma de llegar a activarlo — un ciclo. Así que acá
 * se cierra la puerta grande (¿sos admin?) y cada página del panel llama a
 * `requerirAdmin()`, que además exige 2FA y edad de sesión.
 *
 * Eso NO es redundancia: el layout no es una frontera de seguridad. Next puede
 * renderizar una página sin volver a ejecutar el layout en una navegación del
 * cliente, y las server actions no pasan por el layout en absoluto.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login?destino=/admin");
  if (usuario.rol !== "admin") forbidden();

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
      <nav aria-label="Panel" className="mb-8 border-b border-foreground/10 pb-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Enlace href="/admin">Resumen</Enlace>
          <Enlace href="/admin/pedidos">Pedidos</Enlace>
          <Enlace href="/admin/compras">Lista de compra</Enlace>
          <Enlace href="/admin/ingredientes">Ingredientes</Enlace>
          <Enlace href="/admin/recetas">Recetas</Enlace>
          <Enlace href="/admin/rentabilidad">Rentabilidad</Enlace>
          <Enlace href="/admin/auditoria">Bitácora</Enlace>
        </ul>
      </nav>

      {children}
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="underline-offset-4 hover:underline">
        {children}
      </Link>
    </li>
  );
}
