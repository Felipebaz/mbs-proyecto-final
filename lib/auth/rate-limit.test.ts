import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumir, liberar, LIMITES, _test } from "./rate-limit";

beforeEach(() => {
  _test.reiniciar();
  vi.useRealTimers();
});

describe("consumir", () => {
  it("deja pasar hasta el máximo y después corta", () => {
    const limite = { maximo: 3, ventanaMs: 60_000 };

    expect(consumir("a", limite).permitido).toBe(true);
    expect(consumir("a", limite).permitido).toBe(true);
    expect(consumir("a", limite).permitido).toBe(true);
    expect(consumir("a", limite).permitido).toBe(false);
  });

  it("cuenta cada clave por separado", () => {
    const limite = { maximo: 1, ventanaMs: 60_000 };

    expect(consumir("ip-1", limite).permitido).toBe(true);
    // Que una IP se pase no puede dejar afuera a otra.
    expect(consumir("ip-2", limite).permitido).toBe(true);
    expect(consumir("ip-1", limite).permitido).toBe(false);
  });

  it("dice cuánto falta para poder reintentar", () => {
    const limite = { maximo: 1, ventanaMs: 60_000 };
    consumir("b", limite);

    const r = consumir("b", limite);
    expect(r.permitido).toBe(false);
    expect(r.esperaSegundos).toBeGreaterThan(0);
    expect(r.esperaSegundos).toBeLessThanOrEqual(60);
  });

  it("se libera sola cuando pasa la ventana", () => {
    vi.useFakeTimers();
    const limite = { maximo: 1, ventanaMs: 1000 };

    expect(consumir("c", limite).permitido).toBe(true);
    expect(consumir("c", limite).permitido).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(consumir("c", limite).permitido).toBe(true);
  });
});

describe("liberar", () => {
  it("borra el contador tras un login exitoso", () => {
    const limite = { maximo: 2, ventanaMs: 60_000 };

    consumir("d", limite);
    consumir("d", limite);
    expect(consumir("d", limite).permitido).toBe(false);

    // Si entró bien, los intentos fallidos de antes no cuentan más.
    liberar("d");
    expect(consumir("d", limite).permitido).toBe(true);
  });
});

describe("LIMITES", () => {
  it("el de cuenta es más apretado que el de IP", () => {
    /*
     * Es lo que frena el credential stuffing. El de IP tiene que ser generoso
     * porque atrás de un NAT hay muchas personas legítimas; el de cuenta tiene
     * que ser bajo porque nadie escribe mal su contraseña veinte veces.
     */
    expect(LIMITES.loginPorCuenta.maximo).toBeLessThan(LIMITES.loginPorIp.maximo);
  });

  it("todos tienen ventana y máximo razonables", () => {
    for (const [nombre, limite] of Object.entries(LIMITES)) {
      expect(limite.maximo, nombre).toBeGreaterThan(0);
      expect(limite.ventanaMs, nombre).toBeGreaterThanOrEqual(60_000);
    }
  });
});
