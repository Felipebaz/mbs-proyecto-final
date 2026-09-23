import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { entrar } from "@/app/acciones/auth";
import { BotonGoogle } from "@/components/auth/BotonGoogle";
import { FormAuth } from "@/components/auth/FormAuth";
import { Separador } from "@/components/auth/Separador";
import { usuarioActual } from "@/lib/auth/dal";

/**
 * Ruta bloqueante: no hay shell estático que valga.
 *
 * Con `cacheComponents`, Next prerenderiza el shell de cada página y exige que
 * lo que lee cookies esté dentro de <Suspense>. Acá lo que lee cookies decide
 * la página entera —si ya hay sesión, esto redirige—, así que no hay nada útil
 * que mostrar antes de saberlo. `instant = false` dice justamente eso.
 */
export const instant = false;

export const metadata: Metadata = {
  title: "Entrar",
  // Una página de login no aporta nada en Google y sí aparece en búsquedas de
  // marca desplazando a las que venden.
  robots: { index: false, follow: false },
};

const MENSAJES: Record<string, string> = {
  google: "No pudimos completar el ingreso con Google. Probá de nuevo.",
  cancelado: "Cancelaste el ingreso con Google.",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  if (await usuarioActual()) redirect("/");

  const { error, destino } = await searchParams;
  const mensaje = typeof error === "string" ? MENSAJES[error] : undefined;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">Entrar</h1>
      <p className="mt-2 text-sm text-muted">
        Para ver tus pedidos y que el carrito te siga entre dispositivos.
      </p>

      {mensaje && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {mensaje}
        </p>
      )}

      <div className="mt-8">
        <BotonGoogle destino={typeof destino === "string" ? destino : undefined} />
      </div>

      <Separador />

      <FormAuth accion={entrar} modo="login" />

      <p className="mt-6 text-sm text-muted">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/registro" className="underline underline-offset-4">
          Creá una
        </Link>
      </p>
    </main>
  );
}
