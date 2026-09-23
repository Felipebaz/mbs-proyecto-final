import "server-only";

/**
 * Limitador de intentos, en memoria.
 *
 * Frena el credential stuffing: sin esto, probar 10.000 contraseñas contra un
 * mail conocido no cuesta nada.
 *
 * [límite conocido] Es por instancia. En serverless con varias instancias, el
 * atacante tiene N veces el presupuesto, y un reinicio limpia los contadores.
 * Para el tráfico de este negocio alcanza; cuando deje de alcanzar, se mueve a
 * Redis (Upstash) sin cambiar esta firma.
 *
 * Se limita por IP *y* por cuenta. Sólo por IP, un atacante con IPs rotativas
 * pasa; sólo por cuenta, cualquiera puede dejar afuera a un cliente tocándole
 * el mail a propósito.
 */

interface Cubeta {
  intentos: number;
  reiniciaEn: number;
}

const cubetas = new Map<string, Cubeta>();

// Sin esto el Map crece con cada IP que pruebe una vez y nunca vuelva.
let ultimaLimpieza = 0;
function limpiar(ahora: number) {
  if (ahora - ultimaLimpieza < 60_000) return;
  ultimaLimpieza = ahora;
  for (const [clave, c] of cubetas) {
    if (c.reiniciaEn <= ahora) cubetas.delete(clave);
  }
}

export interface Limite {
  maximo: number;
  ventanaMs: number;
}

export const LIMITES = {
  /** Login por IP: generoso, puede haber varias personas tras un NAT. */
  loginPorIp: { maximo: 30, ventanaMs: 15 * 60_000 },
  /** Login por cuenta: apretado, es el que frena el stuffing. */
  loginPorCuenta: { maximo: 5, ventanaMs: 15 * 60_000 },
  /** Registro por IP: frena la creación masiva de cuentas. */
  registroPorIp: { maximo: 5, ventanaMs: 60 * 60_000 },
  /** Inicio del flujo OAuth: cada uno escribe una cookie de estado. */
  oauthPorIp: { maximo: 20, ventanaMs: 15 * 60_000 },

  /*
   * Reset y reenvío de verificación mandan un mail cada vez. Sin tope, son dos
   * cosas a la vez: una forma de usar nuestro dominio para inundar la casilla
   * de alguien, y una forma de quemarnos la reputación de envío con Resend.
   *
   * Por cuenta es el que importa acá: el ataque apunta a UNA casilla.
   */
  resetPorCuenta: { maximo: 3, ventanaMs: 60 * 60_000 },
  resetPorIp: { maximo: 10, ventanaMs: 60 * 60_000 },
  verificacionPorCuenta: { maximo: 3, ventanaMs: 60 * 60_000 },
} as const satisfies Record<string, Limite>;

export interface Resultado {
  permitido: boolean;
  /** Segundos hasta que se libere. Para el mensaje al usuario. */
  esperaSegundos: number;
}

export function consumir(clave: string, limite: Limite): Resultado {
  const ahora = Date.now();
  limpiar(ahora);

  const cubeta = cubetas.get(clave);

  if (!cubeta || cubeta.reiniciaEn <= ahora) {
    cubetas.set(clave, { intentos: 1, reiniciaEn: ahora + limite.ventanaMs });
    return { permitido: true, esperaSegundos: 0 };
  }

  cubeta.intentos += 1;

  if (cubeta.intentos > limite.maximo) {
    return {
      permitido: false,
      esperaSegundos: Math.ceil((cubeta.reiniciaEn - ahora) / 1000),
    };
  }

  return { permitido: true, esperaSegundos: 0 };
}

/** Tras un login exitoso: que un error viejo no cuente contra el usuario. */
export function liberar(clave: string) {
  cubetas.delete(clave);
}

export const _test = { reiniciar: () => cubetas.clear() };
