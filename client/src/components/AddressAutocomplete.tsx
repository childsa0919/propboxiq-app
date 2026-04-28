import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export interface AddressMatch {
  matchedAddress: string;
  lat: number;
  lon: number;
  components: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

interface Props {
  initialValue?: string;
  onSelect: (match: AddressMatch) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function AddressAutocomplete({
  initialValue = "",
  onSelect,
  placeholder = "Enter property address",
  autoFocus,
}: Props) {
  const [query, setQuery] = useState(initialValue);
  const [matches, setMatches] = useState<AddressMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.trim().length < 4) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      try {
        const res = await apiRequest(
          "GET",
          `/api/geocode?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        if (myReq !== reqIdRef.current) return;
        setMatches(data.matches ?? []);
        setOpen(true);
        setHighlight(0);
      } catch {
        if (myReq === reqIdRef.current) setMatches([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Click-outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(m: AddressMatch) {
    setQuery(m.matchedAddress);
    setOpen(false);
    onSelect(m);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(matches.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden
        />
        <Input
          autoFocus={autoFocus}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => matches.length > 0 && setOpen(true)}
          onKeyDown={onKey}
          className="pl-10 pr-10 h-12 text-base"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="address-listbox"
          data-testid="input-address"
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>
      {open && matches.length > 0 && (
        <ul
          id="address-listbox"
          role="listbox"
          className="absolute z-50 mt-2 w-full rounded-md border border-card-border bg-popover shadow-lg overflow-hidden"
        >
          {matches.slice(0, 8).map((m, idx) => (
            <li
              key={`${m.matchedAddress}-${idx}`}
              role="option"
              aria-selected={highlight === idx}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer text-sm ${
                highlight === idx ? "bg-accent/10" : ""
              }`}
              data-testid={`option-address-${idx}`}
            >
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 leading-snug">{m.matchedAddress}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && query.trim().length >= 4 && matches.length === 0 && (
        <div className="absolute z-50 mt-2 w-full rounded-md border border-card-border bg-popover shadow-lg p-4 text-sm text-muted-foreground">
          No matches. Try including city and state.
        </div>
      )}
    </div>
  );
}
