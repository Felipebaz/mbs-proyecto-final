/**
 * Corre una vez al arrancar el servidor, antes de atender el primer request.
 *
 * Sirve para fallar temprano y fuerte cuando falta configuración crítica. La
 * alternativa es que el problema aparezca como una degradación silenciosa en
 * producción: un rate limit que no limita, un correo que no sale.
 */
export async function register() {
  // Sólo en el runtime de Node: el de Edge no tiene acceso a todo esto.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { verificarConfiguracion } = await import("@/lib/auth/rate-limit");
  verificarConfiguracion();
}
