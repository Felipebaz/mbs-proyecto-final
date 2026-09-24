import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logError } from "@/lib/log";

/**
 * Limitador de intentos.
 *
 * Frena el credential stuffing: sin esto, probar 10.000 contraseñas contra un
 * correo conocido no cuesta nada.
 *
 * [decisión] Upstash Redis cuando hay credenciales, memoria cuando no.
 *
 * El limitador en memoria es por instancia. En serverless con N instancias, un
 * atacante tiene N veces el presupuesto, y un redeploy limpia los contadores —
 * o sea que en producción no limita casi nada. Por eso ahí es obligatorio
 * Redis: `verificarConfiguracion()` lo exige al arrancar.
 *
 * La memoria queda para desarrollo y tests, donde levantar Upstash para probar
 * un formulario sería fricción sin ganancia.
 *
 * Se limita por IP *y* por cuenta. Sólo por IP, un atacante con IPs rotativas
 * pasa; sólo por cuenta, cualquiera puede dejar afuera a un cliente tocándole
 * el correo a propósito.
 */

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

export type NombreLimite = keyof typeof LIMITES;

export interface Resultado {
  permitido: boolean;
  /** Segundos hasta que se libere. Para el mensaje al usuario. */
  esperaSegundos: number;
}

/* ----------------------------------------------------------- en memoria */

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

function consumirEnMemoria(clave: string, limite: Limite): Resultado {
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

/* -------------------------------------------------------------- Upstash */

let redis: Redis | null = null;
const limitadores = new Map<string, Ratelimit>();

function hayUpstash(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/**
 * Un `Ratelimit` por configuración de límite: el algoritmo y la ventana se
 * fijan al construirlo, así que no se puede reusar uno para todos.
 */
function limitador(nombre: string, limite: Limite): Ratelimit {
  const existente = limitadores.get(nombre);
  if (existente) return existente;

  redis ??= Redis.fromEnv();

  const creado = new Ratelimit({
    redis,
    // Ventana deslizante y no fija: con ventana fija, alguien mete `maximo`
    // intentos al final de una ventana y otros tantos al principio de la
    // siguiente — el doble del límite en un instante.
    limiter: Ratelimit.slidingWindow(limite.maximo, `${limite.ventanaMs} ms`),
    prefix: `anima:${nombre}`,
    // Recuerda en memoria quién ya está bloqueado: un atacante que insiste deja
    // de costar una ida y vuelta a Redis por intento.
    ephemeralCache: new Map(),
    analytics: false,
  });

  limitadores.set(nombre, creado);
  return creado;
}

/* ------------------------------------------------------------- fachada */

/**
 * Consume un intento.
 *
 * @param nombre Cuál de los `LIMITES` aplicar. Es el nombre y no el objeto
 * porque Upstash necesita una clave estable para agrupar en Redis.
 * @param identificador Qué se está limitando: una IP, un correo.
 */
export async function consumir(
  nombre: NombreLimite,
  identificador: string,
): Promise<Resultado> {
  const limite = LIMITES[nombre];
  const clave = `${nombre}:${identificador}`;

  if (!hayUpstash()) return consumirEnMemoria(clave, limite);

  try {
    const r = await limitador(nombre, limite).limit(identificador);
    return {
      permitido: r.success,
      esperaSegundos: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)),
    };
  } catch (e) {
    /*
     * [decisión] Si Redis no responde, se deja pasar.
     *
     * Es el lado incómodo del trade-off y está elegido a propósito: con
     * "denegar ante la duda", una caída de Upstash deja a todos los clientes
     * sin poder entrar ni comprar. Con "permitir ante la duda", una caída deja
     * el rate limit flojo mientras dura.
     *
     * Para una juguería, un rato sin rate limit es mucho menos grave que un
     * rato sin poder vender. Para el panel admin la cuenta cambia, y por eso
     * ahí además hay segundo factor (FASE 4).
     */
    // El error de Upstash puede traer la clave, que en los límites por cuenta
    // es el correo del usuario.
    logError("[rate-limit] Redis no respondió, se deja pasar", e, { limite: nombre });
    return { permitido: true, esperaSegundos: 0 };
  }
}

/** Tras un login exitoso: que un error viejo no cuente contra el usuario. */
export async function liberar(
  nombre: NombreLimite,
  identificador: string,
): Promise<void> {
  if (!hayUpstash()) {
    cubetas.delete(`${nombre}:${identificador}`);
    return;
  }

  try {
    await limitador(nombre, LIMITES[nombre]).resetUsedTokens(identificador);
  } catch (e) {
    // No poder limpiar el contador no puede tirar abajo un login exitoso.
    logError("[rate-limit] no se pudo liberar", e, { limite: nombre });
  }
}

/**
 * Se llama al arrancar. En producción, quedarse con el limitador en memoria es
 * una falla silenciosa: parece que hay rate limit y no lo hay.
 */
export function verificarConfiguracion(): void {
  if (process.env.NODE_ENV === "production" && !hayUpstash()) {
    throw new Error(
      "Faltan UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN. " +
        "En producción el limitador en memoria no sirve: es por instancia y " +
        "se reinicia en cada deploy.",
    );
  }
}

export const _test = {
  reiniciar: () => {
    cubetas.clear();
    limitadores.clear();
    redis = null;
  },
  hayUpstash,
};
