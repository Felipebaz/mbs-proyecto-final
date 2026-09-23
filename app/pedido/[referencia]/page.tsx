import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { usuarioActual } from "@/lib/auth/dal";
import { db } from "@/lib/db/cliente";
import { pedido, pedidoItem } from "@/lib/db/esquema";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Tu pedido",
  robots: { index: false, follow: false },
};

/**
 * Página de retorno después de pagar.
 *
 * [decisión] Acá SÓLO se lee el estado de la base. Nunca se marca nada.
 *
 * Mercado Pago manda al cliente de vuelta con parámetros en la URL que dicen
 * cómo salió el pago. Esos parámetros los puede escribir cualquiera: alcanza
 * con abrir la URL a mano con `?status=approved`. Si esta página marcara el
 * pedido como pagado, los jugos serían gratis para quien supiera la dirección.
 *
 * El único que mueve el estado es el webhook, después de preguntarle a MP.
 *
 * Por eso puede pasar que el cliente llegue acá antes que la notificación: se
 * le muestra "estamos confirmando" y la página se refresca sola.
 */
export default async function PedidoPage({
  params,
}: PageProps<"/pedido/[referencia]">) {
  const { referencia } = await params;

  const filas = await db
    .select()
    .from(pedido)
    .where(eq(pedido.referencia, referencia))
    .limit(1);

  const p = filas[0];
  if (!p) notFound();

  /*
   * Sólo el dueño lo ve. La referencia es aleatoria y difícil de adivinar, pero
   * "difícil de adivinar" no es un control de acceso: viaja en la URL, queda en
   * el historial y se comparte sin querer.
   *
   * Un pedido sin usuario (carga manual del admin) no se muestra por acá.
   */
  const usuario = await usuarioActual();
  if (!p.usuarioId || p.usuarioId !== usuario?.id) notFound();

  const items = await db
    .select()
    .from(pedidoItem)
    .where(eq(pedidoItem.pedidoId, p.id));

  const confirmando = p.estado === "pendiente";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:px-8">
      {/* Se refresca sola mientras espera la notificación de MP, que suele
          tardar unos segundos. Sin esto el cliente ve "confirmando" para
          siempre y piensa que algo falló. */}
      {confirmando && <meta httpEquiv="refresh" content="5" />}

      <Estado estado={p.estado} />

      <section className="mt-8 rounded-2xl border border-foreground/10 p-6">
        <h2 className="font-display text-xl">Qué pediste</h2>

        <ul className="mt-4 flex flex-col gap-3 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4">
              <span>
                {item.cantidad > 1 && (
                  <span className="text-muted">{item.cantidad}× </span>
                )}
                {item.descripcion}
              </span>
              <span className="tabular-nums">
                {formatPrecio(item.precioUnitario * item.cantidad)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-between border-t border-foreground/10 pt-3 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatPrecio(p.total)}</span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-foreground/10 p-6 text-sm">
        <h2 className="font-display text-xl">Dónde va</h2>
        <p className="mt-3">{p.nombreEntrega}</p>
        <p className="text-muted">{p.direccion}</p>
        <p className="text-muted">{p.telefono}</p>
        {p.notas && <p className="mt-2 text-muted">“{p.notas}”</p>}
      </section>

      <p className="mt-6 text-xs text-muted">
        Referencia: <span className="font-mono">{p.referencia}</span>
      </p>

      <Link
        href="/productos"
        className="mt-8 inline-block rounded-full border border-foreground/20 px-5 py-3 text-sm"
      >
        Seguir comprando
      </Link>
    </main>
  );
}

function Estado({ estado }: { estado: string }) {
  const textos: Record<string, { titulo: string; detalle: string }> = {
    pendiente: {
      titulo: "Estamos confirmando tu pago",
      detalle:
        "Puede tardar unos segundos. Esta página se actualiza sola — no hace falta que hagas nada.",
    },
    pagado: {
      titulo: "¡Listo, pagaste!",
      detalle: "Te mandamos un correo con el detalle. Coordinamos la entrega por teléfono.",
    },
    rechazado: {
      titulo: "El pago no se aprobó",
      detalle: "No se te cobró nada. Podés intentar con otro medio de pago.",
    },
    cancelado: {
      titulo: "Cancelaste el pago",
      detalle: "No se te cobró nada. Tu pedido quedó sin confirmar.",
    },
    reembolsado: {
      titulo: "Te devolvimos el dinero",
      detalle: "El reintegro puede tardar unos días en aparecer en tu resumen.",
    },
    entregado: {
      titulo: "Entregado",
      detalle: "Gracias por comprarnos. Acordate de guardar las botellas para el cambio.",
    },
  };

  const t = textos[estado] ?? textos.pendiente;

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl">{t.titulo}</h1>
      <p className="mt-3 leading-relaxed text-muted">{t.detalle}</p>
    </div>
  );
}
