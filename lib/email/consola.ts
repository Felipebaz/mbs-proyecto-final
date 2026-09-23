import type { MensajeEmail, ProveedorEmail, ResultadoEnvio } from "./tipos";

/**
 * Proveedor de desarrollo: imprime el mail en la terminal.
 *
 * Permite trabajar en el flujo de verificación y de reset sin cuenta de Resend
 * ni dominio verificado. Se elige solo cuando no hay RESEND_API_KEY, y
 * `obtenerProveedor()` se niega a usarlo en producción.
 */
export class ProveedorConsola implements ProveedorEmail {
  nombre = "consola";

  async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
    console.info(
      [
        "",
        "┌─────────────────────── CORREO (modo desarrollo) ───────────────────────",
        `│ Para:   ${mensaje.para}`,
        `│ Asunto: ${mensaje.asunto}`,
        "├────────────────────────────────────────────────────────────────────────",
        ...mensaje.texto.split("\n").map((l) => `│ ${l}`),
        "└────────────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return { ok: true, id: "consola" };
  }
}
