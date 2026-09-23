import { connection, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/cliente";
import { eventoPago } from "@/lib/db/esquema";
import { obtenerProveedorPago } from "@/lib/pagos";
import { procesarPago } from "@/lib/pedidos/procesar-pago";

/**
 * Notificaciones de Mercado Pago.
 *
 * Este endpoint es público: cualquiera puede mandarle un POST. Lo que lo hace
 * confiable es, en orden:
 *
 *   1. la firma HMAC del header `x-signature`, con tolerancia de timestamp
 *   2. que el estado y el monto se consultan contra la API de MP, nunca se
 *      leen del cuerpo
 *   3. que el monto tiene que coincidir con el total del pedido
 *
 * Sin el paso 2, una firma válida de un aviso real alcanzaría para que el
 * cuerpo manipulado diga "approved". Sin el 3, un pago de $1 apuntando a
 * nuestra referencia se lleva el pedido.
 */

/** MP corta a los 22 s y reintenta. Se responde mucho antes de eso. */
export async function POST(request: NextRequest) {
  await connection();

  let cuerpo: unknown = null;
  try {
    cuerpo = await request.json();
  } catch {
    // MP siempre manda JSON. Un cuerpo que no lo es no viene de MP.
    cuerpo = null;
  }

  const proveedor = await obtenerProveedorPago();
  const verificacion = proveedor.verificarWebhook({
    headers: request.headers,
    query: request.nextUrl.searchParams,
    cuerpo,
  });

  const requestId = request.headers.get("x-request-id");

  if (!verificacion.valido) {
    /*
     * Se deja rastro de los intentos rechazados: si alguien está probando el
     * endpoint, es lo que se querría mirar. El motivo va a la base y al log,
     * nunca a la respuesta — decirle a quien prueba *por qué* falló su firma
     * es ayudarlo a acertar.
     */
    await registrar({
      requestId,
      firmaValida: false,
      motivoRechazo: verificacion.motivo,
    });

    console.warn(
      `[mercadopago] notificación rechazada (${verificacion.motivo}) request-id=${requestId}`,
    );

    return new NextResponse(null, { status: 401 });
  }

  const evento = await registrar({
    requestId,
    firmaValida: true,
    tipo: verificacion.tipo,
    idPagoMp: verificacion.idPago,
  });

  // Sólo los avisos de pago mueven un pedido. MP manda otros tipos (merchant
  // orders, contracargos) por el mismo endpoint.
  if (verificacion.tipo !== "payment" && verificacion.tipo !== "desconocido") {
    return NextResponse.json({ recibido: true });
  }

  try {
    // Acá está el dato confiable: se lo preguntamos a MP con nuestro token.
    const consultado = await proveedor.consultarEstado(verificacion.idPago);
    const resultado = await procesarPago(consultado);

    if (!resultado.ok) {
      /*
       * Un monto que no coincide o un pedido que no existe NO es un error
       * nuestro: es un intento de fraude o un aviso de otro entorno (el
       * sandbox pegándole a producción). Se responde 200 para que MP deje de
       * reintentar algo que nunca va a andar, y queda en la bitácora.
       */
      console.error(
        `[mercadopago] no se aplicó el pago ${verificacion.idPago}: ` +
          `${resultado.motivo} — ${resultado.detalle}`,
      );

      await marcarProcesado(evento, resultado.motivo);
      return NextResponse.json({ recibido: true });
    }

    await marcarProcesado(evento, resultado.accion);
    return NextResponse.json({ recibido: true });
  } catch (e) {
    /*
     * Falló consultar MP o escribir en la base. Se responde 500 A PROPÓSITO:
     * MP reintenta, y un reintento es exactamente lo que hace falta. Responder
     * 200 acá perdería el pago para siempre.
     */
    console.error(`[mercadopago] error procesando ${verificacion.idPago}:`, e);
    return new NextResponse(null, { status: 500 });
  }
}

async function registrar(datos: {
  requestId: string | null;
  firmaValida: boolean;
  tipo?: string;
  idPagoMp?: string;
  motivoRechazo?: string;
}): Promise<string | null> {
  try {
    const [fila] = await db
      .insert(eventoPago)
      .values({
        requestId: datos.requestId,
        firmaValida: datos.firmaValida,
        tipo: datos.tipo ?? null,
        idPagoMp: datos.idPagoMp ?? null,
        motivoRechazo: datos.motivoRechazo ?? null,
      })
      .returning({ id: eventoPago.id });
    return fila.id;
  } catch (e) {
    // No poder escribir la bitácora no puede impedir procesar el pago.
    console.error("[mercadopago] no se pudo registrar el evento:", e);
    return null;
  }
}

async function marcarProcesado(id: string | null, resultado: string) {
  if (!id) return;
  try {
    const { eq } = await import("drizzle-orm");
    await db
      .update(eventoPago)
      .set({ procesadoEn: new Date(), motivoRechazo: resultado })
      .where(eq(eventoPago.id, id));
  } catch {
    // Igual que arriba: es bitácora, no el camino crítico.
  }
}
