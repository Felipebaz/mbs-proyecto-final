/**
 * Grilla de 4 claims.
 *
 * Cada uno tiene que ser verificable contra docs/beneficios-evidencia.md.
 * NO va "enzimas vivas" (§7: mito — el ácido del estómago las desnaturaliza)
 * ni "detox" (§0: rechazado por EFSA, prohibido por el RBN).
 */

interface Beneficio {
  /** El número es el gancho: se lee antes que el texto. */
  dato: string;
  titulo: string;
  texto: string;
}

const BENEFICIOS: readonly Beneficio[] = [
  {
    dato: "0°",
    titulo: "Sin calor, nunca",
    texto:
      "Prensado en frío y sin pasteurizar. El calor degrada vitaminas y polifenoles; acá no hay calor en ningún paso.",
  },
  {
    dato: "0 g",
    titulo: "Azúcar agregada",
    texto:
      "El dulce sale de la fruta. No se agrega azúcar, ni miel, ni jugo concentrado.",
  },
  {
    dato: "100%",
    titulo: "Fruta y verdura",
    texto:
      "Sin agua, sin concentrados, sin relleno. Lo que hay en la botella es lo que salió de la prensa.",
  },
  {
    dato: "✓",
    titulo: "Sin conservantes",
    texto:
      "Nada de aditivos ni colorantes. Por eso dura días y no meses: es la contra de hacerlo bien.",
  },
];

export function Beneficios() {
  return (
    <section
      aria-labelledby="beneficios-titulo"
      className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8"
    >
      <h2 id="beneficios-titulo" className="font-display text-2xl sm:text-3xl">
        Por qué orgánico, por qué prensado en frío
      </h2>

      {/* <dl> y no <ul>: cada ítem es un par dato → definición. El lector de
          pantalla lee "0 g, azúcar agregada" como una unidad. */}
      <dl className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFICIOS.map(({ dato, titulo, texto }) => (
          <div key={titulo} className="border-t border-border pt-4">
            <dt className="font-display text-4xl text-jugo-verde">{dato}</dt>
            <dd>
              <p className="mt-2 font-display text-lg">{titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{texto}</p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
