/** Rows standing in for the list while it loads, or for its next page under the rows already there. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <ul aria-busy aria-label={label} className="divide-y rounded-lg border">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 p-3">
          <span className="size-7 animate-pulse rounded-full bg-muted" />
          <span className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <span className="h-4 w-20 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )
}
