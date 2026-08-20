import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
