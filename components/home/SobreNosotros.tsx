/**
 * Sección de origen de la marca. Copy propuesto: revisar y corregir con la
 * historia real — nombres, años, de dónde salen los ingredientes.
 */
export function SobreNosotros() {
  return (
    <section
      id="sobre-nosotros"
      aria-labelledby="sobre-nosotros-titulo"
      className="panel reveal"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-20 sm:grid-cols-2 sm:px-8">
        {/* TODO fotos: acá va la chacra o el prensado. Mientras tanto, un
            panel del verde de la marca para que la sección no quede coja. */}
        <div
          className="aspect-[4/3] rounded-lg bg-jugo-verde"
          role="presentation"
        />

        <div>
          <h2
            id="sobre-nosotros-titulo"
            className="font-display text-2xl sm:text-3xl"
          >
            Sobre nosotros
          </h2>

          <p className="mt-4 leading-relaxed">
            Anima es una empresa familiar. Empezó como empieza casi todo lo que
            dura: por algo que ya hacíamos en casa. Hace años que comemos
            orgánico, que compramos en ferias y que le preguntamos al productor
            de dónde salió cada cosa.
          </p>

          <p className="mt-4 leading-relaxed">
            De tanto buscar un jugo que estuviera a la altura de esa comida, nos
            cansamos de no encontrarlo. Los de góndola vienen pasteurizados, con
            azúcar agregada o con agua para estirar el rendimiento. Así que
            compramos una prensa y empezamos a hacerlo para nosotros.
          </p>

          <p className="mt-4 leading-relaxed">
            Lo que tomás hoy es eso mismo, sin cambiarle nada: fruta y verdura de
            productores uruguayos certificados, prensada en frío, embotellada en
            vidrio y entregada en Montevideo. Lo que le damos a nuestra familia
            es lo que te damos a vos.
          </p>
        </div>
      </div>
    </section>
  );
}
