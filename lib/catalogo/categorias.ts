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
};
