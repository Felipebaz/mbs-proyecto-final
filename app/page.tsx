import { ProductosSection } from "@/components/home/ProductosSection";
import { Hero } from "@/components/home/Hero";

export default function Home() {
  return (
    <main className="flex-1">
      { <Hero /> }
      {/* <Pilares /> */}
      <ProductosSection />
      {/* <Beneficios /> */}
      {/* <SobreNosotros /> */}
    </main>
  );
}
