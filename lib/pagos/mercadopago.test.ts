import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProveedorMercadoPago, _test } from "./mercadopago";

/**
 * Verificación de la firma del webhook.
 *
 * Es la primera barrera del endpoint: sin ella, cualquiera manda un POST
 * diciendo que un pedido se pagó.
 */

const SECRETO = "secreto-de-prueba-para-firmar";
const proveedor = new ProveedorMercadoPago();

/**
 * Arma una notificación firmada como la firmaría Mercado Pago.
 *
 * El manifest es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y el hash es
 * HMAC-SHA256 con el secreto de la aplicación.
 */
function notificacion(opciones: {
  dataId?: string;
  requestId?: string;
  ts?: number;
  secretoFirma?: string;
  tipo?: string;
} = {}) {
  const dataId = opciones.dataId ?? "1234567890";
  const requestId = opciones.requestId ?? "req-abc-123";
  const ts = opciones.ts ?? Math.floor(Date.now() / 1000);

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = createHmac("sha256", opciones.secretoFirma ?? SECRETO)
    .update(manifest)
    .digest("hex");

  return {
    headers: new Headers({
      "x-signature": `ts=${ts},v1=${hash}`,
      "x-request-id": requestId,
    }),
    query: new URLSearchParams({
      "data.id": dataId,
      type: opciones.tipo ?? "payment",
    }),
    cuerpo: { type: opciones.tipo ?? "payment", data: { id: dataId } },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verificarWebhook", () => {
  it("acepta una notificación bien firmada", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    const r = proveedor.verificarWebhook(notificacion());

    expect(r.valido).toBe(true);
    if (r.valido) {
      expect(r.idPago).toBe("1234567890");
      expect(r.tipo).toBe("payment");
    }
  });

  it("rechaza una firma hecha con otro secreto", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    /*
     * Es el caso central: sin esto, cualquiera que sepa la URL del endpoint
     * manda un POST diciendo que un pedido se pagó y se lleva los jugos.
     */
    const r = proveedor.verificarWebhook(
      notificacion({ secretoFirma: "secreto-del-atacante" }),
    );

    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe("SignatureMismatch");
  });

  it("rechaza si falta el header de firma", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    const n = notificacion();
    n.headers.delete("x-signature");

    const r = proveedor.verificarWebhook(n);
    expect(r.valido).toBe(false);
  });

  it("rechaza una firma con formato roto", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    const n = notificacion();
    n.headers.set("x-signature", "esto-no-es-una-firma");

    const r = proveedor.verificarWebhook(n);
    expect(r.valido).toBe(false);
  });

  it("rechaza un timestamp viejo (replay)", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    // Firma perfectamente válida, pero de hace una hora.
    const hace1h = Math.floor(Date.now() / 1000) - 3600;
    const r = proveedor.verificarWebhook(notificacion({ ts: hace1h }));

    /*
     * Sin la ventana de tolerancia, una notificación legítima capturada se
     * puede reenviar para siempre. Como la firma es correcta, este es el único
     * control que la frena.
     */
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe("TimestampOutOfTolerance");
  });

  it("una firma de un data.id no vale para otro", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    const n = notificacion({ dataId: "111" });
    // El atacante cambia el id del pago pero deja la firma que tenía.
    n.query.set("data.id", "999");

    expect(proveedor.verificarWebhook(n).valido).toBe(false);
  });

  it("sin MP_WEBHOOK_SECRET rechaza TODO", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", "");

    /*
     * Aceptar "porque no está configurado" convertiría el endpoint en uno donde
     * cualquiera marca pedidos como pagados. Falla cerrado.
     */
    const r = proveedor.verificarWebhook(notificacion());
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toMatch(/MP_WEBHOOK_SECRET/);
  });

  it("rechaza si no viene data.id", () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", SECRETO);

    const r = proveedor.verificarWebhook({
      headers: new Headers({ "x-signature": "ts=1,v1=abc" }),
      query: new URLSearchParams(),
      cuerpo: {},
    });

    expect(r.valido).toBe(false);
  });
});

describe("normalizarEstado", () => {
  it("sólo 'approved' cuenta como aprobado", () => {
    expect(_test.normalizarEstado("approved")).toBe("aprobado");
  });

  it("'in_process' NO es aprobado", () => {
    // Es revisión manual de MP y todavía puede caerse. Tratarlo como aprobado
    // sería entregar jugos por un pago que puede no concretarse.
    expect(_test.normalizarEstado("in_process")).toBe("pendiente");
    expect(_test.normalizarEstado("pending")).toBe("pendiente");
    expect(_test.normalizarEstado("authorized")).toBe("pendiente");
  });

  it("mapea rechazos y devoluciones", () => {
    expect(_test.normalizarEstado("rejected")).toBe("rechazado");
    expect(_test.normalizarEstado("cancelled")).toBe("rechazado");
    expect(_test.normalizarEstado("refunded")).toBe("reembolsado");
    expect(_test.normalizarEstado("charged_back")).toBe("contracargo");
  });

  it("un estado desconocido NUNCA es aprobado", () => {
    // Si MP agrega un estado nuevo, preferimos no entregar el pedido antes que
    // entregarlo de más.
    expect(_test.normalizarEstado("estado_que_no_existe")).toBe("pendiente");
    expect(_test.normalizarEstado("")).toBe("pendiente");
  });
});

describe("conversión de montos", () => {
  it("centésimos a pesos y vuelta, sin perder nada", () => {
    // MP trabaja en pesos con decimales; el dominio en centésimos enteros.
    // Un centésimo de diferencia hace que el webhook rechace un pago bueno.
    expect(_test.aPesos(132000)).toBe(1320);
    expect(_test.aCentesimos(1320)).toBe(132000);
    expect(_test.aCentesimos(_test.aPesos(132050))).toBe(132050);
  });

  it("redondea bien los casos que rompen en float", () => {
    // 11.001 * 100 da 1100.0999... en coma flotante.
    expect(_test.aCentesimos(11.001)).toBe(1100);
    expect(_test.aCentesimos(0.07 * 3)).toBe(21);
  });
});
