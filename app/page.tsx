import { Beneficios } from "@/components/home/Beneficios";
import { Hero } from "@/components/home/Hero";
import { Pilares } from "@/components/home/Pilares";
import { ProductosSection } from "@/components/home/ProductosSection";
import { SobreNosotros } from "@/components/home/SobreNosotros";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Pilares />
      <ProductosSection />
      <Beneficios />
      <SobreNosotros />
    </main>
  );
}
