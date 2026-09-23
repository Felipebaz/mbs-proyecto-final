import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth/dal";

export const instant = false;

export const metadata: Metadata = {
  title: "Panel",
  robots: { index: false, follow: false },
};

/**
 * Raíz del panel.
 *
 * Por ahora es un marcador: las pantallas llegan en la FASE 5. Existe para que
 * el flujo de 2FA tenga a dónde volver, y para que `requerirAdmin()` esté
 * probado de punta a punta antes de que haya algo valioso atrás.
 */
export default async function AdminPage() {
  const usuario = await requerirAdmin();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl">Panel</h1>
      <p className="mt-2 text-sm text-muted">Hola, {usuario.nombre ?? usuario.email}.</p>

      <p className="mt-8 rounded-2xl border border-foreground/15 p-6 text-sm text-muted">
        Las pantallas de pedidos, ingredientes, recetas y rentabilidad llegan en
        la próxima fase. La autorización y la bitácora ya están puestas.
      </p>
    </main>
  );
}
