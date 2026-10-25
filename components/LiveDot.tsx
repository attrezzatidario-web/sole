export default function LiveDot({ colore = "up" }: { colore?: "up" | "accent" }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
          colore === "up" ? "bg-up" : "bg-accent"
        }`}
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colore === "up" ? "bg-up" : "bg-accent"}`} />
    </span>
  );
}
