// v1.8.0 Deal Sharing — header tray icon with gold count badge. Polls every
// 60s while the app is visible and refetches on focus/resume.
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHARES_COUNT_KEY } from "@/lib/shares";

export function InboxTrayButton() {
  const [location] = useLocation();
  const active = location.startsWith("/shared");
  const { data } = useQuery<{ count: number }>({
    queryKey: SHARES_COUNT_KEY,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const count = data?.count ?? 0;
  return (
    <Link href="/shared">
      <Button
        variant={active ? "secondary" : "ghost"}
        size="icon"
        className={`relative ${count > 0 ? "text-[#5fd4e7]" : ""}`}
        aria-label={count > 0 ? `Shared deals, ${count} new` : "Shared deals"}
        data-testid="button-shared-inbox"
      >
        <Inbox className="h-4 w-4" />
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold ring-2 ring-background"
            style={{ background: "#f5c948", color: "#0a0e12" }}
            data-testid="badge-inbox-count"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
    </Link>
  );
}
