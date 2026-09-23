import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./google";

/**
 * `destinoSeguro` es lo único de google.ts que se puede testear sin red ni
 * base. Es también lo que impide que el login sea un open redirect, así que
 * vale la pena cubrirlo entero.
 */
describe("destinoSeguro", () => {
  it("deja pasar rutas internas", () => {
    expect(destinoSeguro("/carrito")).toBe("/carrito");
    expect(destinoSeguro("/productos?categoria=jugos")).toBe(
      "/productos?categoria=jugos",
    );
  });

  it("cae a la raíz cuando no hay destino", () => {
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro("")).toBe("/");
  });

  it("bloquea URLs absolutas a otro dominio", () => {
    // Sin esto, /api/auth/google?destino=https://anima-falso.com manda al
    // cliente a una copia del sitio justo después de un login exitoso: el
    // momento en que más confía en lo que ve.
    expect(destinoSeguro("https://anima-falso.com")).toBe("/");
    expect(destinoSeguro("http://anima-falso.com")).toBe("/");
  });

  it("bloquea las protocol-relative, que parecen internas y no lo son", () => {
    // `//anima-falso.com` empieza con barra pero el navegador la trata como
    // externa. Es el bypass clásico de un chequeo que sólo mira la primera /.
    expect(destinoSeguro("//anima-falso.com")).toBe("/");
    expect(destinoSeguro("//anima-falso.com/login")).toBe("/");
  });

  it("bloquea javascript: y data:", () => {
    expect(destinoSeguro("javascript:alert(1)")).toBe("/");
    expect(destinoSeguro("data:text/html,<script>alert(1)</script>")).toBe("/");
  });
});
