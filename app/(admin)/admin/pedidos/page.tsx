import type { Metadata } from "next";
import Link from "next/link";
import { cambiarEstado } from "@/app/acciones/admin";
import { BotonAccion } from "@/components/admin/FormAdmin";
import { requerirAdmin } from "@/lib/auth/dal";
import { listarPedidos, transicionesDe } from "@/lib/pedidos/administrar";
import { formatPrecio } from "@/lib/format";

export const instant = false;

export const metadata: Metadata = {
  title: "Pedidos",
  robots: { index: false, follow: false },
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Marcar pagado",
  pagado: "Marcar entregado",
  entregado: "Reembolsar",
  cancelado: "Cancelar",
  rechazado: "Reabrir",
  reembolsado: "Reembolsar",
};

export default async function PedidosPage() {
  await requerirAdmin();
  const pedidos = await listarPedidos({ limite: 200 });

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Pedidos</h1>

        <div className="flex gap-2">
          <Link
            href="/admin/pedidos/nuevo"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Cargar pedido
          </Link>
          {/* Link normal y no fetch: el navegador tiene que descargar el
              archivo, y la ruta valida permisos igual. */}
          <a
            href="/api/admin/export/pedidos"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm"
          >
            Exportar CSV
          </a>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Todavía no hay pedidos.</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-foreground/15 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Qué lleva</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-b border-foreground/10 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap text-muted">
                    {p.creadoEn.toLocaleDateString("es-UY", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                    {p.origen === "manual" && (
                      <span className="ml-1 text-xs">(manual)</span>
                    )}
                  </td>

                  <td className="py-3 pr-4">
                    <p>{p.nombreEntrega}</p>
                    <p className="text-xs text-muted">{p.telefono}</p>
                    <p className="text-xs text-muted">{p.direccion}</p>
                    {p.notas && (
                      <p className="mt-1 text-xs text-muted">“{p.notas}”</p>
                    )}
                  </td>

                  <td className="py-3 pr-4">
                    <ul className="text-xs text-muted">
                      {p.items
                        .filter((i) => i.sku !== "ENVASE")
                        .map((i) => (
                          <li key={i.sku}>
                            {i.cantidad}× {i.descripcion}
                          </li>
                        ))}
                    </ul>
                    {p.botellasDevueltas > 0 && (
                      <p className="mt-1 text-xs">
                        Devuelve {p.botellasDevueltas} botellas
                      </p>
                    )}
                  </td>

                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatPrecio(p.total)}
                  </td>

                  <td className="py-3 pr-4">
                    <Estado estado={p.estado} />
                  </td>

                  <td className="py-3">
                    {/* Sólo se ofrecen las transiciones válidas: un pedido
                        entregado no vuelve a pendiente. La acción lo valida de
                        nuevo del lado servidor. */}
                    <div className="flex flex-wrap gap-1">
                      {transicionesDe(p.estado).map((siguiente) => (
                        <BotonAccion
                          key={siguiente}
                          accion={cambiarEstado}
                          campos={{ pedidoId: p.id, estado: siguiente }}
                          etiqueta={ETIQUETA_ESTADO[siguiente] ?? siguiente}
                          variante={siguiente === "pagado" ? "normal" : "suave"}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Estado({ estado }: { estado: string }) {
  const colores: Record<string, string> = {
    pendiente: "border-amber-500/40 bg-amber-500/10",
    pagado: "border-green-600/40 bg-green-600/10",
    entregado: "border-foreground/20 bg-foreground/5",
    rechazado: "border-red-500/40 bg-red-500/10",
    cancelado: "border-foreground/15",
    reembolsado: "border-foreground/15",
  };

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${colores[estado] ?? ""}`}
    >
      {estado}
    </span>
  );
}
