/**
 * Intro de marca: 3 pilares + el párrafo de manifiesto.
 *
 * Los pilares viven en un array y se recorren con .map(). Agregar un cuarto
 * es agregar un objeto, no copiar y pegar un bloque de JSX.
 */

interface Pilar {
  titulo: string;
  texto: string;
  Icono: () => React.ReactElement;
}

/** Iconos de trazo: heredan el color del texto y pesan tres líneas cada uno. */
function IconoHoja() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <path d="M20 3c0 9-5.5 14-13 14H4C4 8 9.5 3 17 3h3Z" />
      <path d="M4 21c1.5-5 4.5-8.5 9-11" />
    </svg>
  );
}

function IconoBotella() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <path d="M10 2h4v4l1.6 2.4A4 4 0 0 1 16 10.6V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8.4a4 4 0 0 1 .4-2.2L10 6V2Z" />
      <path d="M8 13h8" />
    </svg>
  );
}

function IconoCiclo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.3-5.9" />
      <path d="M20 12a8 8 0 0 1-13.3 5.9" />
      <path d="M17 3v3.5h-3.5" />
      <path d="M7 21v-3.5h3.5" />
    </svg>
  );
}

const PILARES: readonly Pilar[] = [
  {
    titulo: "Orgánico certificado",
    texto:
      "Ingredientes de productores uruguayos certificados por el MGAP.",
    Icono: IconoHoja,
  },
  {
    titulo: "Cero plástico",
    texto:
      "Envasamos en vidrio retornable. No generamos basura plástica.",
    Icono: IconoBotella,
  },
  {
    titulo: "Cero residuo",
    texto:
      "Todo lo que el jugo genera como descarte vuelve a la tierra como compost.",
    Icono: IconoCiclo,
  },
];

export function Pilares() {
  return (
    <section
      aria-labelledby="pilares-titulo"
      className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8"
    >
      <h2 id="pilares-titulo" className="font-display text-2xl sm:text-3xl">
        Por qué existimos
      </h2>

      {/* <ul> y no <div>: son tres ítems equivalentes, y un lector de pantalla
          anuncia "lista de 3" antes de leerlos. */}
      <ul className="mt-8 grid gap-8 sm:grid-cols-3">
        {PILARES.map(({ titulo, texto, Icono }) => (
          <li key={titulo}>
            <span className="text-jugo-verde">
              <Icono />
            </span>
            <h3 className="mt-3 font-display text-lg">{titulo}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{texto}</p>
          </li>
        ))}
      </ul>

      <p className="mt-12 max-w-3xl text-lg leading-relaxed">
        Todo empieza en el campo: elegimos productores locales certificados
        orgánicos, porque lo que le hace bien a tu cuerpo también le tiene que
        hacer bien a la tierra. Prensamos en frío para no perder nada en el
        camino, embotellamos en vidrio para no dejar nada atrás, y compostamos
        cada resto de fruta y verdura. Un jugo, cero desperdicio.
      </p>
    </section>
  );
}
