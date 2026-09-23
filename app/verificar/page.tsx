import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { crearSesion, escribirCookieSesion } from "@/lib/auth/sesion";
import { consumirToken } from "@/lib/auth/tokens";
import { fusionarCarritoAnonimo } from "@/lib/carrito/repositorio";
import { db } from "@/lib/db/cliente";
import { usuario } from "@/lib/db/esquema";

export const instant = false;

export const metadata: Metadata = {
  title: "Verificar correo",
  robots: { index: false, follow: false },
};

/**
 * Consume el link de verificación.
 *
 * [decisión] Verifica **y** abre sesión.
 *
 * El token es de un solo uso y vive 24 h. Dejarlo entrar ahorra un paso justo
 * cuando la persona acaba de registrarse, y el riesgo extra es chico: quien
 * tenga acceso a esa casilla ya puede tomar la cuenta con "recuperar
 * contraseña", así que no abre una puerta que no estuviera abierta.
 *
 * `Referrer-Policy: strict-origin-when-cross-origin` (ver next.config.ts) evita
 * que el token se filtre por el Referer al navegar desde acá.
 */
export default async function VerificarPage({
  searchParams,
}: PageProps<"/verificar">) {
  const { token } = await searchParams;

  if (typeof token !== "string") {
    return <Aviso titulo="Link incompleto" />;
  }

  const resultado = await consumirToken(token, "verificacion");

  if (!resultado.ok) {
    return (
      <Aviso
        titulo={
          resultado.motivo === "vencido"
            ? "Ese link venció"
            : "Ese link ya no sirve"
        }
        detalle={
          resultado.motivo === "vencido"
            ? "Los links de verificación duran 24 horas. Pedí uno nuevo."
            : "Puede que ya lo hayas usado. Si ya verificaste, entrá normalmente."
        }
      />
    );
  }

  const u = resultado.usuario;

  await db
    .update(usuario)
    .set({ emailVerificado: true })
    .where(eq(usuario.id, u.id));

  // Sesión nueva, igual que en cualquier login: nunca se reusa una anterior.
  const { token: sesionToken, expiraEn } = await crearSesion(u.id);
  await escribirCookieSesion(sesionToken, expiraEn);
  await fusionarCarritoAnonimo(u.id);

  redirect("/?bienvenida=1");
}

function Aviso({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl">{titulo}</h1>
      {detalle && <p className="mt-3 text-sm text-muted">{detalle}</p>}
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/verificar/pendiente"
          className="rounded-full bg-foreground px-5 py-3 text-center text-sm font-medium text-background"
        >
          Reenviar verificación
        </Link>
        <Link
          href="/login"
          className="text-center text-sm text-muted underline underline-offset-4"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
