export default function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="rgb(var(--accent))" />
      <circle cx="16" cy="16" r="7" fill="#fff" />
    </svg>
  );
}
