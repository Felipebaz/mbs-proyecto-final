import { describe, expect, it } from "vitest";
import { decidirPorHost, esRutaPanel } from "./host";

const base = {
  hostPanel: "admin.jugosanima.com.uy",
  urlTienda: "https://jugosanima.com.uy",
};

function tienda(pathname: string, search = "") {
  return decidirPorHost({ ...base, host: "jugosanima.com.uy", pathname, search });
}

function panel(pathname: string, search = "") {
  return decidirPorHost({ ...base, host: "admin.jugosanima.com.uy", pathname, search });
}

describe("esRutaPanel", () => {
  it("reconoce el panel y su API", () => {
    expect(esRutaPanel("/admin")).toBe(true);
    expect(esRutaPanel("/admin/pedidos")).toBe(true);
    expect(esRutaPanel("/api/admin/export/pedidos")).toBe(true);
  });

  it("no confunde rutas que sólo empiezan parecido", () => {
    // Un producto que se llame "administrador" no es el panel.
    expect(esRutaPanel("/administrador")).toBe(false);
    expect(esRutaPanel("/api/administrar")).toBe(false);
    expect(esRutaPanel("/productos/admin")).toBe(false);
  });
});

describe("decidirPorHost en el dominio de la tienda", () => {
  it("el panel da 404, no un redirect que revele el subdominio", () => {
    expect(tienda("/admin")).toEqual({ tipo: "no-encontrado" });
    expect(tienda("/admin/pedidos")).toEqual({ tipo: "no-encontrado" });
    expect(tienda("/api/admin/export/pedidos")).toEqual({ tipo: "no-encontrado" });
  });

  it("la tienda sigue normal", () => {
    for (const ruta of ["/", "/productos/jugo-verde", "/carrito", "/login"]) {
      expect(tienda(ruta)).toEqual({ tipo: "seguir", esHostPanel: false });
    }
  });

  it("el webhook de Mercado Pago sigue llegando", () => {
    expect(tienda("/api/webhooks/mercadopago")).toEqual({
      tipo: "seguir",
      esHostPanel: false,
    });
  });
});

describe("decidirPorHost en el subdominio del panel", () => {
  it("la raíz lleva al panel", () => {
    expect(panel("/")).toEqual({ tipo: "redirigir", url: "/admin" });
  });

  it("el panel y su API funcionan", () => {
    expect(panel("/admin/pedidos")).toEqual({ tipo: "seguir", esHostPanel: true });
    expect(panel("/api/admin/export/pedidos")).toEqual({
      tipo: "seguir",
      esHostPanel: true,
    });
  });

  it("login y recuperación funcionan: el admin tiene que poder entrar", () => {
    for (const ruta of ["/login", "/recuperar", "/reset", "/verificar"]) {
      expect(panel(ruta)).toEqual({ tipo: "seguir", esHostPanel: true });
    }
  });

  it("las páginas de la tienda mandan a la tienda, con query", () => {
    expect(panel("/productos/jugo-verde", "?tamano=1l")).toEqual({
      tipo: "redirigir",
      url: "https://jugosanima.com.uy/productos/jugo-verde?tamano=1l",
    });
    expect(panel("/carrito")).toEqual({
      tipo: "redirigir",
      url: "https://jugosanima.com.uy/carrito",
    });
  });
});

describe("decidirPorHost: detalles del host", () => {
  it("ignora puerto y mayúsculas", () => {
    expect(
      decidirPorHost({ ...base, host: "ADMIN.jugosanima.com.uy:443", pathname: "/admin" }),
    ).toEqual({ tipo: "seguir", esHostPanel: true });
  });

  it("un subdominio parecido NO es el panel", () => {
    // Si se comparara con `includes` o `endsWith`, esto pasaría como panel.
    expect(
      decidirPorHost({ ...base, host: "admin.jugosanima.com.uy.evil.com", pathname: "/admin" }),
    ).toEqual({ tipo: "no-encontrado" });
  });

  it("funciona en desarrollo con admin.localhost", () => {
    const dev = { hostPanel: "admin.localhost", urlTienda: "http://localhost:3000" };

    expect(decidirPorHost({ ...dev, host: "admin.localhost:3000", pathname: "/" })).toEqual({
      tipo: "redirigir",
      url: "/admin",
    });
    expect(decidirPorHost({ ...dev, host: "localhost:3000", pathname: "/admin" })).toEqual({
      tipo: "no-encontrado",
    });
  });

  it("sin ADMIN_HOST no separa nada: el panel sigue en /admin", () => {
    for (const hostPanel of [undefined, ""]) {
      expect(
        decidirPorHost({
          host: "jugosanima.com.uy",
          pathname: "/admin/pedidos",
          hostPanel,
          urlTienda: base.urlTienda,
        }),
      ).toEqual({ tipo: "seguir", esHostPanel: false });
    }
  });
});
