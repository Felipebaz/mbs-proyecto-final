import type { Metadata } from "next";
import { leerAuditoria } from "@/lib/auditoria";
import { requerirAdmin } from "@/lib/auth/dal";

export const instant = false;

export const metadata: Metadata = {
  title: "Bitácora",
  robots: { index: false, follow: false },
};

const NOMBRE_ACCION: Record<string, string> = {
  precio_cambiado: "cambió un precio",
  receta_cambiada: "cambió una receta",
  ingrediente_creado: "agregó un ingrediente",
  ingrediente_dado_de_baja: "dio de baja un ingrediente",
  pedido_estado_cambiado: "cambió el estado de un pedido",
  pedido_manual_creado: "cargó un pedido manual",
  datos_exportados: "exportó datos",
  rol_cambiado: "cambió un rol",
  "2fa_activado": "activó su segundo factor",
  "2fa_desactivado": "desactivó su segundo factor",
  login_admin: "entró al panel",
};

export default async function AuditoriaPage() {
  await requerirAdmin();
  const registros = await leerAuditoria({ limite: 200 });

  return (
    <main>
      <h1 className="font-display text-3xl">Bitácora</h1>
      <p className="mt-2 text-sm text-muted">
        Quién hizo qué y cuándo. Esta tabla es sólo-inserción: la base rechaza
        cualquier intento de modificar o borrar una línea, incluso desde la
        aplicación.
      </p>

      {registros.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Todavía no hay nada registrado.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {registros.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-foreground/10 pb-3 text-sm"
            >
              <time
                dateTime={r.ocurridoEn.toISOString()}
                className="w-32 shrink-0 tabular-nums text-muted"
              >
                {r.ocurridoEn.toLocaleString("es-UY", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>

              <span className="font-medium">{r.usuarioEmail ?? "—"}</span>
              <span>{NOMBRE_ACCION[r.accion] ?? r.accion}</span>

              {r.objetivo && (
                <span className="font-mono text-xs text-muted">{r.objetivo}</span>
              )}

              {r.detalle && (
                <span className="text-xs text-muted">
                  {Object.entries(r.detalle)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(", ")}
                </span>
              )}

              {r.ip && <span className="text-xs text-muted">desde {r.ip}</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
