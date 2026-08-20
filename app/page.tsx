import { Hero } from "@/components/home/Hero";
import { Pilares } from "@/components/home/Pilares";
import { ProductosSection } from "@/components/home/ProductosSection";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Pilares />
      <ProductosSection />
      {/* <Beneficios /> */}
      {/* <SobreNosotros /> */}
    </main>
  );
}
