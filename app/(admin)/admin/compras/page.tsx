import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth/dal";
import { listaDeCompra, nombreDeSku } from "@/lib/costos/compras";
import { semanaDe } from "@/lib/costos/rentabilidad";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Lista de compra",
  robots: { index: false, follow: false },
};

/** Muestra la cantidad en la unidad que se compra, no en la base. */
function formatCantidad(cantidad: number, unidad: string): string {
  if (unidad === "g" && cantidad >= 1000) {
    return `${(cantidad / 1000).toLocaleString("es-UY", { maximumFractionDigits: 2 })} kg`;
  }
  if (unidad === "ml" && cantidad >= 1000) {
    return `${(cantidad / 1000).toLocaleString("es-UY", { maximumFractionDigits: 2 })} L`;
  }
  return `${cantidad.toLocaleString("es-UY")} ${unidad}`;
}

export default async function ComprasPage({
  searchParams,
}: PageProps<"/admin/compras">) {
  await requerirAdmin();

  const { semana } = await searchParams;
  const referencia = typeof semana === "string" ? new Date(semana) : new Date();
  const { desde, hasta } = semanaDe(
    Number.isNaN(referencia.getTime()) ? new Date() : referencia,
  );

  const lista = await listaDeCompra(desde, hasta);

  const sinReceta = await Promise.all(lista.skusSinReceta.map(nombreDeSku));

  const anterior = new Date(desde);
  anterior.setDate(desde.getDate() - 7);
  const siguiente = new Date(desde);
  siguiente.setDate(desde.getDate() + 7);

  const formatoFecha = (d: Date) =>
    d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Lista de compra</h1>
          <p className="mt-1 text-sm text-muted">
            {formatoFecha(desde)} al {formatoFecha(new Date(hasta.getTime() - 1))} ·{" "}
            {lista.pedidosConfirmados} pagados, {lista.pedidosPendientes} sin
            confirmar
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/admin/compras?semana=${anterior.toISOString().slice(0, 10)}`}
            className="rounded-full border border-foreground/20 px-3 py-2 text-sm"
          >
            ← semana anterior
          </Link>
          <Link
            href={`/admin/compras?semana=${siguiente.toISOString().slice(0, 10)}`}
            className="rounded-full border border-foreground/20 px-3 py-2 text-sm"
          >
            siguiente →
          </Link>
          <a
            href={`/api/admin/export/compras?semana=${desde.toISOString().slice(0, 10)}`}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            CSV
          </a>
        </div>
      </div>

      {sinReceta.length > 0 && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          Se vendieron productos sin receta, así que sus ingredientes NO están en
          esta lista: {sinReceta.join(", ")}.{" "}
          <Link href="/admin/recetas" className="underline">
            Cargar recetas
          </Link>
        </p>
      )}

      {lista.lineas.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          No hay pedidos para producir en esta semana.
        </p>
      ) : (
        <>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-foreground/15 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4">Ingrediente</th>
                  <th className="py-2 pr-4">Proveedor</th>
                  <th className="py-2 pr-4 text-right">Confirmado</th>
                  <th className="py-2 pr-4 text-right">Sin confirmar</th>
                  <th className="py-2 pr-4 text-right">A comprar</th>
                  <th className="py-2 text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {lista.lineas.map((l) => (
                  <tr key={l.ingredienteId} className="border-b border-foreground/10">
                    <td className="py-2.5 pr-4">{l.nombre}</td>
                    <td className="py-2.5 pr-4 text-muted">
                      {l.proveedor ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">
                      {formatCantidad(l.cantidadConfirmada, l.unidad)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted">
                      {l.cantidadPendiente > 0
                        ? formatCantidad(l.cantidadPendiente, l.unidad)
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium tabular-nums">
                      {formatCantidad(l.cantidadTotal, l.unidad)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {l.costoEstimado === null ? (
                        <span className="text-amber-700">sin precio</span>
                      ) : (
                        formatPrecio(l.costoEstimado)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td colSpan={5} className="py-3 pr-4 text-right">
                    Total estimado
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatPrecio(lista.costoTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-4 text-xs text-muted">
            Incluye los pedidos sin confirmar: todavía pueden concretarse, y
            quedarse corto de fruta es peor que comprar un poco de más.
            {lista.faltanPrecios.length > 0 &&
              ` El total está incompleto: faltan precios de ${lista.faltanPrecios.join(", ")}.`}
          </p>
        </>
      )}
    </main>
  );
}
