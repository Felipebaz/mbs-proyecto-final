/**
 * Interfaz del proveedor de correo.
 *
 * Existe para que el dominio no dependa de Resend. Los tests usan el proveedor
 * falso y verifican qué se mandó; cambiar de proveedor es escribir otra
 * implementación de esto y nada más.
 */

export interface MensajeEmail {
  para: string;
  asunto: string;
  html: string;
  /**
   * Versión en texto plano. No es opcional a propósito: un mail sólo-HTML
   * puntúa peor en los filtros de spam, y un mail transaccional que cae en
   * spam es una cuenta que no se puede verificar.
   */
  texto: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** Id del proveedor, para rastrear el envío en su panel. */
  id?: string;
  error?: string;
}

export interface ProveedorEmail {
  nombre: string;
  enviar(mensaje: MensajeEmail): Promise<ResultadoEnvio>;
}
