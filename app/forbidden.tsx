import Link from "next/link";

/**
 * Lo que se ve cuando `forbidden()` corta el render: 403.
 *
 * No dice qué había del otro lado ni qué rol haría falta. A quien tiene permiso
 * no le sirve saberlo, y a quien no lo tiene le estaría dibujando el mapa.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-20 text-center sm:px-8">
      <p className="font-mono text-sm text-muted">403</p>
      <h1 className="mt-2 font-display text-3xl">No tenés acceso a esto</h1>
      <p className="mt-3 text-sm text-muted">
        Si creés que es un error, escribinos.
      </p>

      <Link
        href="/"
        className="mt-8 inline-block rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
