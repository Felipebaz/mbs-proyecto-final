import type { Categoria, CategoriaId } from "@/types/producto";

export const CATEGORIAS_DATA: Record<CategoriaId, Categoria> = {
  jugos: {
    id: "jugos",
    nombre: "Jugos",
    descripcion:
      "Prensados en frío, sin pasteurizar. En 330 ml y 910 ml, en vidrio retornable.",
    orden: 1,
    activa: true,
  },
  shots: {
    id: "shots",
    nombre: "Shots",
    descripcion: "Dosis concentrada, formato chico. Un trago, todos los días.",
    orden: 2,
    activa: true,
  },
  geles: {
    id: "geles",
    nombre: "Geles",
    descripcion: "Carbohidratos para correr y competir. Próximamente.",
    orden: 3,
    // Se activa cuando exista la línea. Mientras tanto no aparece
    // en el filtro ni en el sitemap.
    activa: false,
  },
};
