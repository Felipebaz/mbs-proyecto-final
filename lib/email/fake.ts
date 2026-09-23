import type { MensajeEmail, ProveedorEmail, ResultadoEnvio } from "./tipos";

/**
 * Proveedor de mentira para tests: guarda lo que se le manda en vez de
 * mandarlo.
 *
 * Que los tests puedan leer el mail es lo que permite verificar el flujo
 * completo —token generado, link armado, mail al dueño legítimo— sin depender
 * de la red ni de una cuenta de Resend.
 */
export class ProveedorFalso implements ProveedorEmail {
  nombre = "falso";
  enviados: MensajeEmail[] = [];

  /** Cuando es true, `enviar` falla. Para probar qué pasa si el mail no sale. */
  fallar = false;

  async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio> {
    if (this.fallar) return { ok: false, error: "falla simulada" };
    this.enviados.push(mensaje);
    return { ok: true, id: `falso-${this.enviados.length}` };
  }

  limpiar() {
    this.enviados = [];
    this.fallar = false;
  }

  /** El último mandado a esa dirección. */
  ultimoPara(para: string): MensajeEmail | undefined {
    return [...this.enviados].reverse().find((m) => m.para === para);
  }

  /** Extrae el primer link que apunte a una ruta de la app. */
  linkDe(mensaje: MensajeEmail, ruta: string): string | null {
    const encontrado = mensaje.texto.match(
      new RegExp(`https?://[^\\s<>"]*${ruta}[^\\s<>"]*`),
    );
    return encontrado ? encontrado[0] : null;
  }
}
