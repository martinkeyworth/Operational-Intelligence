import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  subtitle,
  meta,
  children,
}: {
  title: string
  subtitle?: string
  meta?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border px-5 py-6 md:flex-row md:items-end md:justify-between md:px-8">
      <div className="space-y-1">
        {meta && (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {meta}
          </p>
        )}
        <h1 className="text-pretty text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
