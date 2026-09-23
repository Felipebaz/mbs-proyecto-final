import "server-only";

import { Resend } from "resend";
import type { MensajeEmail, ProveedorEmail, ResultadoEnvio } from "./tipos";

/** El proveedor real. */
export class ProveedorResend implements ProveedorEmail {
  nombre = "resend";
  private cliente: Resend;
  private desde: string;

  constructor(apiKey: string, desde: string) {
    this.cliente = new Resend(apiKey);
    this.desde = desde;
  }

  async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
    try {
      const { data, error } = await this.cliente.emails.send({
        from: this.desde,
        to: mensaje.para,
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
      });

      if (error) return { ok: false, error: error.message };
      return { ok: true, id: data?.id };
    } catch (e) {
      // Que no salga un mail no puede tirar abajo el registro. Quien llama
      // decide qué hacer; acá sólo se reporta.
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
