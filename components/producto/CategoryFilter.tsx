import Link from "next/link";
import type { Categoria, CategoriaId } from "@/types/producto";

interface CategoryFilterProps {
  categorias: readonly Categoria[];
  /** null = "Todos". */
  activa: CategoriaId | null;
}

/**
 * El filtro son links, no botones con estado.
 *
 * /productos?categoria=jugos es compartible, indexable por Google y sobrevive
 * al refresh. Con useState perdés las tres cosas — y encima hace falta JS.
 */
export function CategoryFilter({ categorias, activa }: CategoryFilterProps) {
  const opciones = [
    { id: null, nombre: "Todos", href: "/productos" },
    ...categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      href: `/productos?categoria=${c.id}`,
    })),
  ];

  return (
    <nav aria-label="Filtrar por categoría" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {opciones.map((opcion) => {
          const seleccionada = opcion.id === activa;
          return (
            <li key={opcion.nombre}>
              <Link
                href={opcion.href}
                // aria-current le dice al lector de pantalla cuál está activo.
                // Sin esto, el filtro seleccionado solo se distingue por color.
                aria-current={seleccionada ? "page" : undefined}
                className={`inline-block rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  seleccionada
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground"
                }`}
              >
                {opcion.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
