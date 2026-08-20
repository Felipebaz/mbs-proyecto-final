import { esPack, esShot, type Producto } from "@/types/producto";

/**
 * Placeholder mientras no hay fotos.
 *
 * No es un adorno: el pack dibuja las botellas que realmente trae, así que
 * "5 botellas" se ve antes de leerlo. Si mañana el pack pasa a 6, el dibujo
 * cambia solo.
 *
 * SVG inline y no un archivo: son 3 paths, hereda el color del contenedor y
 * no cuesta un request.
 */

/** Botella de jugo, dibujada de (0,0) a (48,76) para poder repetirla. */
const BOTELLA = "M14 7 L14 22 C14 26 4 30 4 40 L4 68 C4 73 7 76 12 76 L36 76 C41 76 44 73 44 68 L44 40 C44 30 34 26 34 22 L34 7 Z";
const BOTELLA_TAPA = { x: 16, y: 0, w: 16, h: 7 };

/** El shot va en botella baja: se distingue del jugo de un vistazo. */
const SHOT = "M14 6 L14 18 C14 22 6 26 6 34 L6 46 C6 50 9 52 13 52 L35 52 C39 52 42 50 42 46 L42 34 C42 26 34 22 34 18 L34 6 Z";
const SHOT_TAPA = { x: 16, y: 0, w: 16, h: 6 };

const ANCHO = 48;

function cantidadBotellas(producto: Producto): number {
  if (!esPack(producto)) return 1;
  const variante =
    producto.variantes.find((v) => v.id === producto.varianteDefaultId) ??
    producto.variantes[0];
  return variante.botellas;
}

export function ProductoSimbolo({ producto }: { producto: Producto }) {
  const cantidad = cantidadBotellas(producto);
  const shot = esShot(producto);

  const path = shot ? SHOT : BOTELLA;
  const tapa = shot ? SHOT_TAPA : BOTELLA_TAPA;
  const alto = shot ? 52 : 76;

  // Achica las botellas para que la fila entre siempre, con aire a los lados.
  const escala = Math.min(1, 92 / (ANCHO * cantidad + 12));
  const anchoFila = ANCHO * escala * cantidad;
  const x0 = (100 - anchoFila) / 2;
  const y0 = (100 - alto * escala) / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: cantidad }, (_, i) => (
        <g
          key={i}
          transform={`translate(${x0 + i * ANCHO * escala} ${y0}) scale(${escala})`}
          fill="rgba(255,255,255,0.32)"
        >
          <rect x={tapa.x} y={tapa.y} width={tapa.w} height={tapa.h} rx="2" />
          <path d={path} />
        </g>
      ))}
    </svg>
  );
}
