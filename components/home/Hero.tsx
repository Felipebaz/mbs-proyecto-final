import Link from "next/link";

export function Hero() {
  return (
    <header className="panel reveal relative">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <p className="text-sm uppercase tracking-[0.2em] text-muted">
          100% uruguayo
        </p>

        <h1 className="mt-4 font-display text-5xl leading-[1.05] sm:text-7xl">
          Anima
        </h1>

        <p className="mt-4 max-w-xl text-xl leading-relaxed text-muted sm:text-2xl">
          Jugos prensados en frío. De la chacra a tu botella, sin pasteurizar y
          sin agregados.
        </p>

        <Link
          href="/productos"
          className="mt-8 inline-block rounded-full bg-foreground px-6 py-3
                     text-sm font-medium text-background transition-opacity
                     hover:opacity-90"
        >
          Ver productos <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {/* Señal de que hay más abajo. Decorativa: el teclado y el lector de
          pantalla ya tienen el link de arriba. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-8 text-center text-sm text-muted"
      >
        &darr;
      </span>
    </header>
  );
}
