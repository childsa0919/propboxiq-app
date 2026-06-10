import { cn } from "@/lib/utils";

/**
 * NEW pill — teal background, white text. Shared by the Gateway Hold card
 * and the Welcome Hold card so the badge stays identical across surfaces.
 */
export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground",
        className,
      )}
      data-testid="badge-new"
    >
      New
    </span>
  );
}
