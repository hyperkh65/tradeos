export function LogoMark({ text, size = 36, className = '' }: { text: string; size?: number; className?: string }) {
  const fontSize = Math.round(size * 0.34);
  return (
    <div
      className={`bg-primary rounded-2xl flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="text-white font-bold tracking-tight leading-none select-none"
        style={{ fontSize }}
      >
        {text}
      </span>
    </div>
  );
}
