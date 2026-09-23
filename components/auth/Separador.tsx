export function Separador({ texto = "o" }: { texto?: string }) {
  return (
    <div className="my-6 flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-foreground/15" />
      <span className="text-xs uppercase tracking-wide text-muted">{texto}</span>
      <span className="h-px flex-1 bg-foreground/15" />
    </div>
  );
}
