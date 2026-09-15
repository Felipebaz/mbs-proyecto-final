import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db/cliente";
import { carrito, carritoLinea } from "@/lib/db/esquema";
import { usuarioActual } from "@/lib/auth/dal";
import {
  CANTIDAD_MAXIMA,
  calcularCarrito,
  huellaDe,
  sanearCantidad,
  type CarritoCalculado,
  type LineaPedida,
} from "./calculo";

/**
 * Persistencia del carrito.
 *
 * El carrito NO exige login. Pedir cuenta antes de agregar un jugo mata la
 * conversión, así que el visitante anónimo tiene carrito propio, identificado
 * por una cookie, y al entrar se funde con el suyo.
 *
 * Igual que la sesión: la cookie lleva un token aleatorio y la base guarda su
 * sha256. Un carrito no es tan sensible como una sesión, pero el token
 * igualmente identifica a una persona a lo largo del tiempo.
 */

const COOKIE = "carrito";
const COOKIE_PROD = "__Host-carrito";
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;
const EN_PRODUCCION = process.env.NODE_ENV === "production";

const nombreCookie = () => (EN_PRODUCCION ? COOKIE_PROD : COOKIE);
const hashDeToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Tope por carrito: frena el llenado automatizado de la tabla. */
const LINEAS_MAXIMAS = 40;

export class ErrorCarrito extends Error {}

/* ------------------------------------------------------ resolver el carrito */

async function leerCookie(): Promise<string | null> {
  return (await cookies()).get(nombreCookie())?.value ?? null;
}

/**
 * Devuelve el id del carrito, creándolo si hace falta.
 *
 * Sólo se llama al agregar algo. Crear una fila por visitante llenaría la tabla
 * de carritos vacíos de bots.
 */
async function idDeCarritoParaEscribir(): Promise<string> {
  const usuario = await usuarioActual();

  if (usuario) {
    const existente = await db
      .select({ id: carrito.id })
      .from(carrito)
      .where(eq(carrito.usuarioId, usuario.id))
      .limit(1);
    if (existente[0]) return existente[0].id;

    const [creado] = await db
      .insert(carrito)
      .values({ usuarioId: usuario.id })
      .returning({ id: carrito.id });
    return creado.id;
  }

  const token = await leerCookie();
  if (token) {
    const existente = await db
      .select({ id: carrito.id })
      .from(carrito)
      .where(eq(carrito.cookieId, hashDeToken(token)))
      .limit(1);
    if (existente[0]) return existente[0].id;
  }

  // Sin cookie, o con una que apunta a un carrito que ya se purgó.
  const nuevoToken = randomBytes(32).toString("base64url");
  const [creado] = await db
    .insert(carrito)
    .values({ cookieId: hashDeToken(nuevoToken) })
    .returning({ id: carrito.id });

  const store = await cookies();
  store.set(nombreCookie(), nuevoToken, {
    httpOnly: true,
    secure: EN_PRODUCCION,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + DURACION_MS),
  });

  return creado.id;
}

/** Sólo lectura: no crea nada. */
async function idDeCarritoExistente(): Promise<string | null> {
  const usuario = await usuarioActual();

  if (usuario) {
    const filas = await db
      .select({ id: carrito.id })
      .from(carrito)
      .where(eq(carrito.usuarioId, usuario.id))
      .limit(1);
    return filas[0]?.id ?? null;
  }

  const token = await leerCookie();
  if (!token) return null;

  const filas = await db
    .select({ id: carrito.id })
    .from(carrito)
    .where(eq(carrito.cookieId, hashDeToken(token)))
    .limit(1);
  return filas[0]?.id ?? null;
}

/* -------------------------------------------------------------- lectura */

export async function obtenerCarrito(
  botellasDevueltas = 0,
): Promise<CarritoCalculado> {
  const id = await idDeCarritoExistente();
  if (!id) return calcularCarrito([], botellasDevueltas);

  const filas = await db
    .select()
    .from(carritoLinea)
    .where(eq(carritoLinea.carritoId, id));

  const pedidas: LineaPedida[] = filas.map((f) => ({
    sku: f.sku,
    cantidad: f.cantidad,
    configuracion: f.configuracion,
  }));

  const calculado = calcularCarrito(pedidas, botellasDevueltas);

  // Una línea que el catálogo ya no acepta se borra en cuanto se detecta, así
  // el carrito no le vuelve a avisar lo mismo en cada visita.
  for (const rechazada of calculado.rechazadas) {
    await db
      .delete(carritoLinea)
      .where(
        and(
          eq(carritoLinea.carritoId, id),
          eq(carritoLinea.sku, rechazada.sku),
        ),
      );
  }

  return calculado;
}

/* -------------------------------------------------------------- escritura */

export async function agregarAlCarrito(
  sku: string,
  cantidad: number,
  configuracion: readonly string[] | null = null,
): Promise<CarritoCalculado> {
  const pedida = sanearCantidad(cantidad);
  if (pedida === 0) throw new ErrorCarrito("La cantidad tiene que ser al menos 1.");

  // Se valida ANTES de tocar la base: así un SKU inventado no crea un carrito.
  const prueba = calcularCarrito([{ sku, cantidad: pedida, configuracion }]);
  if (prueba.lineas.length === 0) {
    throw new ErrorCarrito(prueba.rechazadas[0]?.motivo ?? "No se pudo agregar.");
  }

  const id = await idDeCarritoParaEscribir();
  const huella = huellaDe(configuracion);

  const cuantas = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(carritoLinea)
    .where(eq(carritoLinea.carritoId, id));

  if ((cuantas[0]?.n ?? 0) >= LINEAS_MAXIMAS) {
    throw new ErrorCarrito(`Un carrito admite hasta ${LINEAS_MAXIMAS} líneas.`);
  }

  // El mismo SKU con la misma configuración suma en vez de duplicar. El tope se
  // aplica en SQL: sin el LEAST, sumar dos veces 40 pasaría el máximo.
  await db
    .insert(carritoLinea)
    .values({
      carritoId: id,
      sku,
      huella,
      configuracion: configuracion ? [...configuracion] : null,
      cantidad: pedida,
    })
    .onConflictDoUpdate({
      target: [carritoLinea.carritoId, carritoLinea.sku, carritoLinea.huella],
      set: {
        cantidad: sql`least(${carritoLinea.cantidad} + ${pedida}, ${CANTIDAD_MAXIMA})`,
      },
    });

  await db
    .update(carrito)
    .set({ actualizadoEn: new Date() })
    .where(eq(carrito.id, id));

  return obtenerCarrito();
}

export async function actualizarCantidad(
  sku: string,
  huella: string,
  cantidad: number,
): Promise<CarritoCalculado> {
  const id = await idDeCarritoExistente();
  if (!id) throw new ErrorCarrito("No hay carrito.");

  const nueva = sanearCantidad(cantidad);

  const donde = and(
    eq(carritoLinea.carritoId, id),
    eq(carritoLinea.sku, sku),
    eq(carritoLinea.huella, huella),
  );

  if (nueva === 0) {
    await db.delete(carritoLinea).where(donde);
  } else {
    await db.update(carritoLinea).set({ cantidad: nueva }).where(donde);
  }

  await db
    .update(carrito)
    .set({ actualizadoEn: new Date() })
    .where(eq(carrito.id, id));

  return obtenerCarrito();
}

export async function quitarDelCarrito(sku: string, huella: string) {
  return actualizarCantidad(sku, huella, 0);
}

export async function vaciarCarrito(): Promise<void> {
  const id = await idDeCarritoExistente();
  if (!id) return;
  await db.delete(carritoLinea).where(eq(carritoLinea.carritoId, id));
}

/* ---------------------------------------------------------------- fusión */

/**
 * Se llama justo después de crear la sesión, en login y en registro.
 *
 * Cantidades: se SUMAN y se topean. Si tenía 2 jugos verdes anónimo y 1 en su
 * cuenta, quedan 3 — nadie pierde lo que había puesto.
 *
 * Todo en una transacción: si falla a la mitad, el cliente se queda con dos
 * carritos a medio fusionar y líneas duplicadas.
 */
export async function fusionarCarritoAnonimo(usuarioId: string): Promise<void> {
  const token = await leerCookie();
  if (!token) return;

  const cookieId = hashDeToken(token);

  await db.transaction(async (tx) => {
    const anonimos = await tx
      .select({ id: carrito.id })
      .from(carrito)
      .where(eq(carrito.cookieId, cookieId))
      .limit(1);

    const anonimo = anonimos[0];
    if (!anonimo) return;

    const lineas = await tx
      .select()
      .from(carritoLinea)
      .where(eq(carritoLinea.carritoId, anonimo.id));

    if (lineas.length > 0) {
      const propios = await tx
        .select({ id: carrito.id })
        .from(carrito)
        .where(eq(carrito.usuarioId, usuarioId))
        .limit(1);

      let destinoId = propios[0]?.id;
      if (!destinoId) {
        const [creado] = await tx
          .insert(carrito)
          .values({ usuarioId })
          .returning({ id: carrito.id });
        destinoId = creado.id;
      }

      for (const linea of lineas) {
        await tx
          .insert(carritoLinea)
          .values({ ...linea, carritoId: destinoId })
          .onConflictDoUpdate({
            target: [
              carritoLinea.carritoId,
              carritoLinea.sku,
              carritoLinea.huella,
            ],
            set: {
              cantidad: sql`least(${carritoLinea.cantidad} + ${linea.cantidad}, ${CANTIDAD_MAXIMA})`,
            },
          });
      }

      await tx
        .update(carrito)
        .set({ actualizadoEn: new Date() })
        .where(eq(carrito.id, destinoId));
    }

    // El carrito anónimo deja de existir: las líneas caen por ON DELETE CASCADE.
    await tx.delete(carrito).where(eq(carrito.id, anonimo.id));
  });

  const store = await cookies();
  store.set(nombreCookie(), "", { path: "/", maxAge: 0 });
}

/**
 * Para el cron. Un carrito anónimo abandonado hace un mes no le sirve a nadie
 * y la tabla no tiene por qué cargarlo para siempre.
 */
export async function purgarCarritosAbandonados(): Promise<void> {
  await db
    .delete(carrito)
    .where(
      and(
        isNull(carrito.usuarioId),
        lt(carrito.actualizadoEn, new Date(Date.now() - DURACION_MS)),
      ),
    );
}
