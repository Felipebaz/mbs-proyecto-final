import { connection, NextResponse, type NextRequest } from "next/server";
import { registrar } from "@/lib/auditoria";
import { requerirReautenticacion } from "@/lib/auth/dal";
import { cabecerasCsv, fechaCsv, generarCsv, montoCsv } from "@/lib/csv";
import { listarPedidos } from "@/lib/pedidos/administrar";

/**
 * Export de pedidos en CSV.
 *
 * Exige reautenticación: el archivo lleva nombre, teléfono y dirección de cada
 * cliente. Es la operación con más datos personales de todo el panel, y una vez
 * descargada no hay forma de recuperarla.
 *
 * Queda registrada en la bitácora con cuántas filas salieron.
 */
export async function GET(request: NextRequest) {
  await connection();

  // Un route handler es tan alcanzable como una server action: el chequeo va
  // acá, no en la página que muestra el botón.
  const admin = await requerirReautenticacion(15);

  const limite = Number(request.nextUrl.searchParams.get("limite")) || 500;
  const pedidos = await listarPedidos({ limite });

  const csv = generarCsv(pedidos, [
    { encabezado: "Referencia", valor: (p) => p.referencia },
    { encabezado: "Fecha", valor: (p) => fechaCsv(p.creadoEn) },
    { encabezado: "Estado", valor: (p) => p.estado },
    { encabezado: "Origen", valor: (p) => p.origen },
    { encabezado: "Cliente", valor: (p) => p.nombreEntrega },
    { encabezado: "Correo", valor: (p) => p.correoCliente ?? "" },
    { encabezado: "Teléfono", valor: (p) => p.telefono },
    { encabezado: "Dirección", valor: (p) => p.direccion },
    { encabezado: "Notas", valor: (p) => p.notas ?? "" },
    { encabezado: "Botellas devueltas", valor: (p) => p.botellasDevueltas },
    { encabezado: "Total", valor: (p) => montoCsv(p.total) },
    { encabezado: "Moneda", valor: (p) => p.moneda },
    { encabezado: "Pagado", valor: (p) => fechaCsv(p.pagadoEn) },
    {
      encabezado: "Items",
      valor: (p) =>
        p.items.map((i) => `${i.cantidad}× ${i.descripcion}`).join(" | "),
    },
  ]);

  await registrar(admin, {
    accion: "datos_exportados",
    objetivo: "pedidos",
    detalle: { filas: pedidos.length, formato: "csv" },
  });

  const hoy = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: cabecerasCsv(`anima-pedidos-${hoy}.csv`),
  });
}
