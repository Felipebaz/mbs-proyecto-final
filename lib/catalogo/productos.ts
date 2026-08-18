import type { Producto } from "@/types/producto";

/**
 * Fuente de verdad del catálogo.
 *
 * Nadie importa este archivo directo: todo pasa por queries.ts. El día que
 * el catálogo se mude a un CMS, cambia este archivo y nada más.
 *
 * PRECIOS PROVISORIOS: en centésimos de peso uruguayo (29000 = $290).
 * IMÁGENES PROVISORIAS: las rutas de /public/productos/ todavía no existen.
 */

export const PRODUCTOS: readonly Producto[] = [
  {
    slug: "jugo-verde",
    nombre: "Jugo Verde",
    categoria: "jugos",
    tagline: "Verde de verdad, sin atajos.",
    descripcion:
      "Hoja, raíz y fruta prensadas en frío el mismo día. Sin pasteurizar, sin azúcar agregada, sin agua: lo que hay en la botella es lo que salió de la prensa.",
    colorToken: "--color-jugo-verde",
    ingredientes: [
      "Pepino",
      "Manzana verde",
      "Espinaca",
      "Apio",
      "Limón",
      "Kale",
      "Brócoli",
      "Jengibre",
    ],
    beneficios: [
      "Clorofila y hierro de hoja verde",
      "Digestión liviana, sin fibra pesada",
      "Prensado en frío: sin calor que degrade nutrientes",
    ],
    imagenes: [
      {
        src: "/productos/jugo-verde.jpg",
        alt: "Botella de vidrio con Jugo Verde prensado en frío",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "330ml",
        nombre: "330 ml",
        volumenMl: 330,
        precio: 29000,
        sku: "JV-330",
        disponible: true,
      },
      {
        id: "910ml",
        nombre: "910 ml",
        volumenMl: 910,
        precio: 69000,
        sku: "JV-910",
        disponible: true,
      },
    ],
    varianteDefaultId: "330ml",
    destacado: true,
  },
  {
    slug: "jugo-naranja",
    nombre: "Jugo Naranja",
    categoria: "jugos",
    tagline: "Cítrico, raíz y una punta de picante.",
    descripcion:
      "Naranja y zanahoria de productores uruguayos, con cúrcuma y jengibre para que no quede solo en dulce. Prensado en frío y embotellado en vidrio el mismo día.",
    colorToken: "--color-jugo-naranja",
    ingredientes: [
      "Naranja",
      "Zanahoria",
      "Limón",
      "Cúrcuma",
      "Jengibre",
      "Menta",
    ],
    beneficios: [
      "Betacaroteno de zanahoria",
      "Vitamina C sin pasteurizar",
      "Cúrcuma y jengibre en crudo",
    ],
    imagenes: [
      {
        src: "/productos/jugo-naranja.jpg",
        alt: "Botella de vidrio con Jugo Naranja prensado en frío",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "330ml",
        nombre: "330 ml",
        volumenMl: 330,
        precio: 29000,
        sku: "JN-330",
        disponible: true,
      },
      {
        id: "910ml",
        nombre: "910 ml",
        volumenMl: 910,
        precio: 69000,
        sku: "JN-910",
        disponible: true,
      },
    ],
    varianteDefaultId: "330ml",
    destacado: true,
  },
  {
    slug: "jugo-rojo",
    nombre: "Jugo Rojo",
    categoria: "jugos",
    tagline: "Remolacha, para cuando hay que rendir.",
    descripcion:
      "Remolacha prensada en frío con manzana verde, apio y cítrico. Denso, terroso y sin una gota de agua agregada.",
    colorToken: "--color-jugo-rojo",
    ingredientes: [
      "Pepino",
      "Remolacha",
      "Manzana verde",
      "Limón",
      "Apio",
      "Jengibre",
      "Cúrcuma",
    ],
    beneficios: [
      "Nitratos naturales de remolacha",
      "Elegido por corredores antes de entrenar",
      "Sin azúcar agregada",
    ],
    imagenes: [
      {
        src: "/productos/jugo-rojo.jpg",
        alt: "Botella de vidrio con Jugo Rojo de remolacha prensado en frío",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "330ml",
        nombre: "330 ml",
        volumenMl: 330,
        precio: 29000,
        sku: "JR-330",
        disponible: true,
      },
      {
        id: "910ml",
        nombre: "910 ml",
        volumenMl: 910,
        precio: 69000,
        sku: "JR-910",
        disponible: true,
      },
    ],
    varianteDefaultId: "330ml",
    destacado: true,
  },

  // Shots: una sola variante cada uno. El selector de tamaño se oculta solo.
  // NOMBRES Y RECETAS PROVISORIOS.
  {
    slug: "shot-curcuma-jengibre",
    nombre: "Shot de Cúrcuma y Jengibre",
    categoria: "shots",
    tagline: "Un trago, todos los días.",
    descripcion:
      "Cúrcuma y jengibre en crudo, cortados con naranja y limón. La pimienta negra no es sabor: la piperina multiplica la absorción de la curcumina.",
    colorToken: "--color-shot-curcuma",
    ingredientes: ["Cúrcuma", "Jengibre", "Limón", "Naranja", "Pimienta negra"],
    beneficios: [
      "Piperina: sube la absorción de la curcumina",
      "Jengibre en crudo, sin calor",
      "Dosis concentrada en 60 ml",
    ],
    dosisSugerida: "1 por día, preferentemente en ayunas.",
    imagenes: [
      {
        src: "/productos/shot-curcuma-jengibre.jpg",
        alt: "Shot de cúrcuma y jengibre en botella de vidrio",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "unico",
        nombre: "60 ml",
        volumenMl: 60,
        precio: 18000,
        sku: "SH-CJ-60",
        disponible: true,
      },
    ],
    varianteDefaultId: "unico",
    destacado: true,
  },
  {
    slug: "shot-jengibre-limon",
    nombre: "Shot de Jengibre y Limón",
    categoria: "shots",
    tagline: "Directo, sin vueltas.",
    descripcion:
      "Jengibre prensado en frío con limón y un toque de naranja. Pica lo que tiene que picar.",
    colorToken: "--color-shot-jengibre",
    ingredientes: ["Jengibre", "Limón", "Naranja"],
    beneficios: [
      "Jengibre en crudo, sin pasteurizar",
      "Vitamina C de cítrico uruguayo",
      "Dosis concentrada en 60 ml",
    ],
    dosisSugerida: "1 por día, en ayunas o después de entrenar.",
    imagenes: [
      {
        src: "/productos/shot-jengibre-limon.jpg",
        alt: "Shot de jengibre y limón en botella de vidrio",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "unico",
        nombre: "60 ml",
        volumenMl: 60,
        precio: 18000,
        sku: "SH-JL-60",
        disponible: true,
      },
    ],
    varianteDefaultId: "unico",
    destacado: false,
  },
  {
    slug: "shot-curcuma-naranja",
    nombre: "Shot de Cúrcuma y Naranja",
    categoria: "shots",
    tagline: "El más amable de los tres.",
    descripcion:
      "Cúrcuma con naranja y limón, redondeado con pimienta negra. Menos picante, misma concentración.",
    colorToken: "--color-shot-curcuma",
    ingredientes: ["Cúrcuma", "Naranja", "Limón", "Pimienta negra"],
    beneficios: [
      "Piperina: sube la absorción de la curcumina",
      "Entrada suave para quien no banca el jengibre",
      "Dosis concentrada en 60 ml",
    ],
    dosisSugerida: "1 por día, preferentemente en ayunas.",
    imagenes: [
      {
        src: "/productos/shot-curcuma-naranja.jpg",
        alt: "Shot de cúrcuma y naranja en botella de vidrio",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "unico",
        nombre: "60 ml",
        volumenMl: 60,
        precio: 18000,
        sku: "SH-CN-60",
        disponible: true,
      },
    ],
    varianteDefaultId: "unico",
    destacado: false,
  },
];
