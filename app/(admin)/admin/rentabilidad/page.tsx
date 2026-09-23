import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth/dal";
import { rentabilidad, semanaDe } from "@/lib/costos/rentabilidad";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Rentabilidad",
  robots: { index: false, follow: false },
};

export default async function RentabilidadPage({
  searchParams,
}: PageProps<"/admin/rentabilidad">) {
  await requerirAdmin();

  const { semana } = await searchParams;
  const referencia = typeof semana === "string" ? new Date(semana) : new Date();
  const { desde, hasta } = semanaDe(
    Number.isNaN(referencia.getTime()) ? new Date() : referencia,
  );

  const r = await rentabilidad(desde, hasta);

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
          <h1 className="font-display text-3xl">Rentabilidad</h1>
          <p className="mt-1 text-sm text-muted">
            {formatoFecha(desde)} al {formatoFecha(new Date(hasta.getTime() - 1))} ·{" "}
            {r.pedidos} {r.pedidos === 1 ? "pedido" : "pedidos"} cobrados
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/admin/rentabilidad?semana=${anterior.toISOString().slice(0, 10)}`}
            className="rounded-full border border-foreground/20 px-3 py-2 text-sm"
          >
            ← anterior
          </Link>
          <Link
            href={`/admin/rentabilidad?semana=${siguiente.toISOString().slice(0, 10)}`}
            className="rounded-full border border-foreground/20 px-3 py-2 text-sm"
          >
            siguiente →
          </Link>
          <a
            href={`/api/admin/export/rentabilidad?semana=${desde.toISOString().slice(0, 10)}`}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            CSV
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Dato titulo="Vendido" valor={formatPrecio(r.ingresos)} />
        <Dato titulo="Costo de ingredientes" valor={formatPrecio(r.costos)} />
        <Dato
          titulo="Margen"
          valor={
            r.margenPorcentaje === null
              ? "—"
              : `${formatPrecio(r.margen)} (${r.margenPorcentaje}%)`
          }
        />
      </div>

      {r.skusIncompletos > 0 && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {r.skusIncompletos} de {r.porSku.length} productos tienen el costo
          incompleto —falta receta o falta precio de algún ingrediente—. Esos
          márgenes están <strong>más altos que los reales</strong>. No decidas
          precios con este número hasta completarlos.
        </p>
      )}

      {r.porSku.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          No hay ventas cobradas en esta semana. Los pedidos pendientes no cuentan:
          contarlos infla el número.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-foreground/15 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4 text-right">Unidades</th>
                <th className="py-2 pr-4 text-right">Vendido</th>
                <th className="py-2 pr-4 text-right">Costo</th>
                <th className="py-2 pr-4 text-right">Margen</th>
                <th className="py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {r.porSku.map((f) => (
                <tr key={f.sku} className="border-b border-foreground/10">
                  <td className="py-2.5 pr-4">
                    {f.descripcion}
                    {f.incompleto && (
                      <span
                        title="Falta receta o precio de algún ingrediente"
                        className="ml-2 text-xs text-amber-700"
                      >
                        incompleto
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {f.unidades}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {formatPrecio(f.ingresos)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted">
                    {formatPrecio(f.costos)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {formatPrecio(f.margen)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium">
                    {f.margenPorcentaje === null ? "—" : `${f.margenPorcentaje}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        El margen se calcula sobre el precio del contenido, sin el envase: el
        envase se cobra y se devuelve, no es ganancia. Los costos son los que
        regían cuando se vendió, no los de hoy.
      </p>
    </main>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{titulo}</p>
      <p className="mt-2 font-display text-2xl tabular-nums">{valor}</p>
    </div>
  );
}
