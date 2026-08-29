import './BrandMark.css'

type BrandMarkProps = {
  className?: string
  title?: string
}

export function BrandMark({ className = '', title }: BrandMarkProps) {
  const labelled = Boolean(title)

  return (
    <svg
      className={`brand-symbol ${className}`.trim()}
      viewBox="0 0 32 32"
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      aria-label={title}
    >
      <path className="brand-symbol-frame" d="M16 2.75 28 9.65v12.7l-5.35 3.1M9.35 25.45 4 22.35V9.65Z" />
      <path className="brand-symbol-iris" d="M16 7.6 21.45 10.75v6.3L16 20.2l-5.45-3.15v-6.3Z" />
      <path className="brand-symbol-beam" d="m10.15 28 4.2-12.15h3.3L21.85 28Z" />
    </svg>
  )
}
