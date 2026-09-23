import { idOfuscado, logError } from "@/lib/log";
import { ProveedorConsola } from "./consola";
import type { MensajeEmail, ProveedorEmail, ResultadoEnvio } from "./tipos";

export type { MensajeEmail, ProveedorEmail, ResultadoEnvio } from "./tipos";
export { ProveedorFalso } from "./fake";

/**
 * Punto único de envío.
 *
 * El proveedor se resuelve una vez y se puede sustituir en tests. Nadie importa
 * Resend directo: así cambiarlo es tocar este archivo y ninguno más.
 */

let proveedor: ProveedorEmail | null = null;

/** Para tests: inyecta el proveedor falso. */
export function usarProveedorEmail(p: ProveedorEmail | null) {
  proveedor = p;
}

async function obtenerProveedor(): Promise<ProveedorEmail> {
  if (proveedor) return proveedor;

  const apiKey = process.env.RESEND_API_KEY;
  const desde = process.env.EMAIL_FROM;

  if (apiKey && desde) {
    // Import dinámico: `resend` sólo se carga si hay credenciales, así el
    // proveedor de consola no arrastra el SDK.
    const { ProveedorResend } = await import("./resend");
    proveedor = new ProveedorResend(apiKey, desde);
    return proveedor;
  }

  /*
   * En producción, quedarse sin correo es una falla grave y silenciosa:
   * nadie verifica su cuenta ni puede recuperar la contraseña, y el log de
   * "modo desarrollo" pasa desapercibido. Mejor romper fuerte y temprano.
   */
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Faltan RESEND_API_KEY y/o EMAIL_FROM. En producción el correo es obligatorio.",
    );
  }

  proveedor = new ProveedorConsola();
  return proveedor;
}

/**
 * Manda un correo. **No tira si falla.**
 *
 * Quien llama decide. En el registro, por ejemplo, que no salga el mail no
 * puede tirar abajo la creación de la cuenta: se registra el problema y el
 * usuario reenvía la verificación.
 */
export async function enviarEmail(
  mensaje: MensajeEmail,
): Promise<ResultadoEnvio> {
  const p = await obtenerProveedor();
  const resultado = await p.enviar(mensaje);

  if (!resultado.ok) {
    /*
     * El asunto sí, el destinatario ofuscado, el cuerpo nunca.
     *
     * El cuerpo lleva links con tokens de un solo uso: si quedaran en el log,
     * quien lo lea puede verificar una cuenta o cambiar una contraseña ajena.
     * Y el correo del destinatario es un dato personal que no tiene por qué
     * quedar guardado meses.
     */
    logError("[email] no se pudo enviar", new Error(resultado.error ?? "sin detalle"), {
      asunto: mensaje.asunto,
      para: idOfuscado(mensaje.para),
    });
  }

  return resultado;
}

/**
 * URL base de la app, para armar los links de los mails.
 *
 * Nunca se deriva de un header del request: el `Host` lo controla quien manda
 * la petición, y un `Host: sitio-atacante.com` haría que el link de reset
 * apunte al atacante. Tiene que venir de configuración.
 */
export function urlBase(): string {
  const url = process.env.APP_URL;
  if (url) return url.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta APP_URL: sin eso los links de los correos apuntan a la nada.");
  }

  return "http://localhost:3000";
}
