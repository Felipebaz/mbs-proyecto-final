import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fraunces es la display de la marca: se usa en títulos vía `font-display`
// (ver globals.css), no en el cuerpo del texto.
//
// Va por next/font y no por el <link> de Google: el archivo se descarga en el
// build y se sirve desde nuestro dominio, así no hay request a Google en el
// navegador ni salto de tipografía al cargar.
//
// `axes: ["opsz"]` porque next/font, por peso del archivo, sólo incluye el eje
// wght salvo que pidas más. Sin opsz el `font-optical-sizing: auto` no tendría
// nada que ajustar y los títulos grandes perderían el contraste fino que hace
// interesante a esta fuente. SOFT y WONK quedan afuera: sus valores por defecto
// (0 y 0) son los que queremos, incluirlos sólo agregaría bytes.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

// El título arranca con la búsqueda que hay que ganar ("jugos orgánicos
// Montevideo"); el nombre de marca todavía no la trae sola.
export const metadata: Metadata = {
  title: {
    default: "Anima Jugos orgánicos prensados en frío ",
    template: "%s | Anima",
  },
  description:
    "Anima: jugos orgánicos prensados en frío, sin pasteurizar y sin azúcar agregada. Entrega en Montevideo.",
  applicationName: "Anima",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
