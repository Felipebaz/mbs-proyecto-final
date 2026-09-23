import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { AltaTotp } from "@/components/admin/AltaTotp";
import { usuarioActual } from "@/lib/auth/dal";
import { iniciarAlta } from "@/lib/auth/totp";

export const instant = false;

export const metadata: Metadata = {
  title: "Activar segundo factor",
  robots: { index: false, follow: false },
};

/**
 * Alta del segundo factor.
 *
 * No usa `requerirAdmin()`: esa función redirige acá cuando falta el 2FA, así
 * que llamarla sería un ciclo. Se exige sesión y rol a mano.
 */
export default async function AltaPage() {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "admin") redirect("/");

  // Ya lo tiene activo: no se regenera el secreto por entrar de nuevo a esta
  // página, o cualquiera que abra la URL le rompe el 2FA al admin.
  if (usuario.totpActivadoEn) redirect("/admin/2fa/verificar");

  const { secreto, uri } = await iniciarAlta(usuario);

  // El QR se genera en el servidor y se manda como data URI: el secreto no
  // pasa por ningún servicio de terceros ni se carga nada de afuera.
  const qr = await QRCode.toDataURL(uri, { width: 400, margin: 1 });

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl">Activá el segundo factor</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        El panel maneja pedidos, precios y datos de clientes. Con la contraseña
        sola no alcanza: hace falta un código que cambia cada 30 segundos y que
        vive en tu teléfono.
      </p>

      <div className="mt-8">
        <AltaTotp qr={qr} secreto={secreto} />
      </div>
    </main>
  );
}
