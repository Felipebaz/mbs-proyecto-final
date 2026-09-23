import "server-only";

import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator,
} from "mercadopago";
import type {
  DatosPago,
  EntradaWebhook,
  EstadoConsultado,
  EstadoPago,
  PagoCreado,
  ProveedorPago,
  ResultadoWebhook,
} from "./tipos";

/**
 * Mercado Pago, Checkout Pro.
 *
 * El flujo completo es: creamos una preferencia → el cliente paga en el sitio
 * de MP → MP nos notifica servidor a servidor → nosotros le preguntamos a MP
 * cuánto se pagó de verdad.
 *
 * Nunca confiamos en lo que vuelve por el navegador del cliente.
 */

/**
 * MP trabaja en unidades de peso con decimales; nosotros en centésimos enteros.
 *
 * La conversión vive sólo acá. En el dominio todo es entero: con float,
 * 1100.10 + 2200.20 no da 3300.30, y una diferencia de un centésimo entre lo
 * que cobramos y lo que esperábamos hace que el webhook rechace un pago bueno.
 */
const aPesos = (centesimos: number): number => centesimos / 100;
const aCentesimos = (pesos: number): number => Math.round(pesos * 100);

/** Ventana de tolerancia del timestamp de la firma. Corta los replays. */
const TOLERANCIA_SEGUNDOS = 300;

function config(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Falta MP_ACCESS_TOKEN.");
  }
  return new MercadoPagoConfig({ accessToken });
}

/**
 * Traduce el vocabulario de MP al del dominio.
 *
 * `in_process` cae en "pendiente" a propósito: es un pago en revisión manual,
 * que todavía puede terminar aprobado o rechazado. Tratarlo como aprobado sería
 * entregar jugos por un pago que puede caerse.
 */
function normalizarEstado(estadoMp: string): EstadoPago {
  switch (estadoMp) {
    case "approved":
      return "aprobado";
    case "pending":
    case "in_process":
    case "authorized":
      return "pendiente";
    case "refunded":
      return "reembolsado";
    case "charged_back":
      return "contracargo";
    case "rejected":
    case "cancelled":
      return "rechazado";
    default:
      // Un estado que no conocemos NO es aprobado. Si MP agrega uno nuevo,
      // preferimos no entregar el pedido antes que entregarlo de más.
      return "pendiente";
  }
}

export class ProveedorMercadoPago implements ProveedorPago {
  nombre = "mercadopago";

  async crearPago(datos: DatosPago): Promise<PagoCreado> {
    const preference = new Preference(config());

    const respuesta = await preference.create({
      body: {
        items: datos.items.map((item) => ({
          id: item.sku,
          title: item.descripcion,
          quantity: item.cantidad,
          unit_price: aPesos(item.precioUnitario),
          currency_id: datos.moneda,
        })),

        // Vuelve en la notificación: es cómo encontramos el pedido.
        external_reference: datos.referencia,

        // Servidor a servidor. Es el único canal en el que confiamos.
        notification_url: datos.urlNotificacion,

        back_urls: {
          success: datos.urlRetorno,
          pending: datos.urlRetorno,
          failure: datos.urlRetorno,
        },
        // Que MP redirija solo cuando el pago se aprueba.
        auto_return: "approved",

        ...(datos.email ? { payer: { email: datos.email } } : {}),
      },
    });

    const urlPago = respuesta.init_point;
    if (!urlPago || !respuesta.id) {
      throw new Error("Mercado Pago no devolvió init_point.");
    }

    return { urlPago, idExterno: String(respuesta.id) };
  }

  /**
   * Verifica la firma de la notificación.
   *
   * El SDK arma el manifest (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`),
   * calcula el HMAC-SHA256 con el secreto y compara en tiempo constante. La
   * comparación constante importa: con `===`, la diferencia de microsegundos
   * entre fallar en el primer byte y fallar en el último deja adivinar la firma
   * byte a byte.
   *
   * `toleranceSeconds` rechaza timestamps viejos: sin eso, una notificación
   * legítima capturada se puede reenviar para siempre.
   */
  verificarWebhook(entrada: EntradaWebhook): ResultadoWebhook {
    const secreto = process.env.MP_WEBHOOK_SECRET;
    if (!secreto) {
      // Sin secreto no se puede verificar nada. Aceptar "porque no está
      // configurado" convertiría el endpoint en uno donde cualquiera marca
      // pedidos como pagados.
      return { valido: false, motivo: "MP_WEBHOOK_SECRET sin configurar" };
    }

    // `data.id` puede venir en la query o en el cuerpo según el tipo de aviso.
    const cuerpo = entrada.cuerpo as
      | { data?: { id?: unknown }; type?: unknown; action?: unknown }
      | undefined;

    const dataId =
      entrada.query.get("data.id") ??
      entrada.query.get("id") ??
      (cuerpo?.data?.id !== undefined ? String(cuerpo.data.id) : null);

    if (!dataId) return { valido: false, motivo: "falta data.id" };

    try {
      WebhookSignatureValidator.validate({
        xSignature: entrada.headers.get("x-signature"),
        xRequestId: entrada.headers.get("x-request-id"),
        dataId,
        secret: secreto,
        toleranceSeconds: TOLERANCIA_SEGUNDOS,
      });
    } catch (e) {
      if (e instanceof InvalidWebhookSignatureError) {
        return { valido: false, motivo: e.reason };
      }
      return { valido: false, motivo: "error al validar la firma" };
    }

    const tipo =
      entrada.query.get("type") ??
      entrada.query.get("topic") ??
      (typeof cuerpo?.type === "string" ? cuerpo.type : null) ??
      "desconocido";

    return { valido: true, idPago: dataId, tipo };
  }

  /**
   * Le pregunta a MP cuánto se pagó de verdad.
   *
   * El cuerpo de la notificación NO se usa para esto ni aunque la firma sea
   * válida: la firma prueba que el aviso vino de MP, no que el monto de adentro
   * sea el que se cobró. El monto sale de acá y de ningún otro lado.
   */
  async consultarEstado(idPago: string): Promise<EstadoConsultado> {
    const payment = new Payment(config());
    const p = await payment.get({ id: idPago });

    if (!p.id || !p.status) {
      throw new Error(`Mercado Pago devolvió un pago incompleto (${idPago}).`);
    }

    return {
      idPago: String(p.id),
      estado: normalizarEstado(p.status),
      estadoCrudo: p.status,
      detalle: p.status_detail ?? undefined,
      monto: aCentesimos(p.transaction_amount ?? 0),
      moneda: p.currency_id ?? "UYU",
      referencia: p.external_reference ?? null,
    };
  }
}

export const _test = { normalizarEstado, aPesos, aCentesimos };
