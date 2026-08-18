import type { Producto } from "@/types/producto";

/**
 * Fuente de verdad del catálogo.
 *
 * Nadie importa este archivo directo: todo pasa por queries.ts. El día que
 * el catálogo se mude a un CMS, cambia este archivo y nada más.
 *
 * Precios reales, en centésimos de peso uruguayo (25000 = $250). Incluyen IVA.
 * `precio` es el contenido; `envase` es la botella y se cobra siempre aparte.
 *
 * IMÁGENES PROVISORIAS: las rutas de /public/productos/ todavía no existen.
 * ENVASE TRANSITORIO: el shot va en botella de 330 ml hasta que haya una
 * botella de shot propia. Cambiar volumenMl recalcula solo las dosis.
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
        precio: 25000,
        envase: 2000,
        sku: "JV-330",
        disponible: true,
      },
      {
        id: "910ml",
        nombre: "910 ml",
        volumenMl: 910,
        precio: 50000,
        envase: 3000,
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
        precio: 25000,
        envase: 2000,
        sku: "JN-330",
        disponible: true,
      },
      {
        id: "910ml",
        nombre: "910 ml",
        volumenMl: 910,
        precio: 50000,
        envase: 3000,
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
        precio: 25000,
        envase: 2000,
        sku: "JR-330",
        disponible: true,
      },
      {
        id: "910ml",
        nombre: "910 ml",
        volumenMl: 910,
        precio: 50000,
        envase: 3000,
        sku: "JR-910",
        disponible: true,
      },
    ],
    varianteDefaultId: "330ml",
    destacado: true,
  },

  // Shot: una sola variante. El selector de tamaño se oculta solo.
  // RECETA PROVISORIA.
  {
    slug: "shot-jengibre-curcuma",
    nombre: "Shot de Jengibre y Cúrcuma",
    categoria: "shots",
    tagline: "Un trago, todos los días.",
    descripcion:
      "Jengibre y cúrcuma en crudo, cortados con naranja y limón. La pimienta negra no es sabor: la piperina multiplica la absorción de la curcumina. Un trago por día, preferentemente en ayunas.",
    colorToken: "--color-shot-curcuma",
    ingredientes: ["Jengibre", "Cúrcuma", "Limón", "Naranja", "Pimienta negra"],
    beneficios: [
      "Piperina: sube la absorción de la curcumina",
      "Jengibre en crudo, sin calor",
      "Concentrado, sin diluir",
    ],
    dosisMl: 55,
    imagenes: [
      {
        src: "/productos/shot-jengibre-curcuma.jpg",
        alt: "Shot de jengibre y cúrcuma en botella de vidrio",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "unico",
        nombre: "330 ml",
        volumenMl: 330,
        precio: 35000,
        envase: 2000,
        sku: "SH-JC-330",
        disponible: true,
      },
    ],
    varianteDefaultId: "unico",
    destacado: true,
  },

  // Packs: envoltorio sobre variantes que ya existen. El precio del pack se
  // escribe; el ahorro contra comprar suelto se calcula (ver queries.ts).
  //
  // La rotación no es estética: la espinaca del Verde es alta en oxalatos, así
  // que va un solo día y nunca pegado a otro día de carga alta. Ver
  // docs/beneficios-evidencia.md.
  {
    slug: "pack-lunes-a-viernes",
    nombre: "Lunes a Viernes",
    categoria: "packs",
    dias: 5,
    tagline: "Cinco días, una botella por día.",
    descripcion:
      "Un jugo por día, de lunes a viernes, rotando los tres. Va con el desayuno: no reemplaza comidas ni es una limpieza. Es la forma de tomar verdura todos los días sin pensarlo.",
    colorToken: "--color-pack-semana",
    contenido: [
      { sku: "JR-330", cantidad: 2 },
      { sku: "JN-330", cantidad: 2 },
      { sku: "JV-330", cantidad: 1 },
    ],
    imagenes: [
      {
        src: "/productos/pack-lunes-a-viernes.jpg",
        alt: "Cinco botellas de vidrio de 330 ml en una caja",
        width: 1200,
        height: 1600,
      },
    ],
    variantes: [
      {
        id: "unico",
        nombre: "5 botellas",
        volumenMl: 1650,
        precio: 110000,
        envase: 10000,
        sku: "PACK-5D",
        disponible: true,
      },
    ],
    varianteDefaultId: "unico",
    destacado: true,
  },
];
