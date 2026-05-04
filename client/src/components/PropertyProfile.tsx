import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronDown,
  Building2,
  User,
  Receipt,
  History,
  TrendingUp,
  Home,
  Wrench,
  ExternalLink,
} from "lucide-react";

interface FullProperty {
  identity: {
    address: string;
    county: string | null;
    subdivision: string | null;
    zoning: string | null;
    propertyType: string | null;
    assessorId: string | null;
  };
  facts: {
    sqft: number | null;
    beds: number | null;
    baths: number | null;
    yearBuilt: number | null;
    lotSqft: number | null;
    lotAcres: number | null;
  };
  features: {
    architectureType: string | null;
    floorCount: number | null;
    exteriorType: string | null;
    roofType: string | null;
    cooling: boolean | null;
    coolingType: string | null;
    heating: boolean | null;
    heatingType: string | null;
    garage: boolean | null;
    garageType: string | null;
    fireplace: boolean | null;
    pool: boolean | null;
  };
  taxes: {
    latestAssessYear: string | null;
    latestAssessValue: number | null;
    landValue: number | null;
    improvementsValue: number | null;
    latestTaxYear: string | null;
    latestTaxAmount: number | null;
    assessmentHistory: { year: number; value: number | null }[];
    taxHistory: { year: number; amount: number | null }[];
  };
  owner: {
    names: string[];
    type: string | null;
    ownerOccupied: boolean | null;
    mailingAddress: string | null;
    absentee: boolean | null;
  } | null;
  rentEstimate: {
    rent: number | null;
    rentLow: number | null;
    rentHigh: number | null;
  } | null;
  saleHistory: {
    date: string | null;
    event: string;
    price: number | null;
    listingType: string | null;
    daysOnMarket: number | null;
    mlsNumber?: string | null;
  }[];
  rentalHistory: {
    date: string | null;
    event: string;
    price: number | null;
    daysOnMarket: number | null;
  }[];
  market: {
    zip: string;
    lastUpdated: string | null;
    all: {
      medianPrice: number | null;
      medianPricePerSqft: number | null;
      medianDom: number | null;
      totalListings: number | null;
      newListings: number | null;
    };
    singleFamily: {
      medianPrice: number | null;
      medianPricePerSqft: number | null;
      medianDom: number | null;
      totalListings: number | null;
    } | null;
  } | null;
}

const fmtUSD = (n: number | null | undefined) =>
  n != null && Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export function PropertyProfile({
  address,
  zip,
}: {
  address: string;
  zip: string | null;
}) {
  const { data, isLoading, isError, error } = useQuery<FullProperty>({
    queryKey: ["/api/property/full", address, zip],
    queryFn: async () => {
      const params = new URLSearchParams({ address });
      if (zip) params.set("zip", zip);
      const r = await apiRequest("GET", `/api/property/full?${params}`);
      return r.json();
    },
    enabled: !!address,
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="h-4 w-32 rounded bg-muted animate-pulse mb-3" />
          <div className="h-3 w-48 rounded bg-muted/60 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    // Surface a small inline note when the data provider is rate-limited or
    // misconfigured instead of vanishing the entire profile silently.
    const m = String((error as Error | null)?.message ?? "");
    const colonIdx = m.indexOf(":");
    const body = colonIdx >= 0 ? m.slice(colonIdx + 1).trim() : m;
    let providerMsg: string | null = null;
    if (body.startsWith("{")) {
      try {
        const parsed = JSON.parse(body);
        if (
          typeof parsed?.error === "string" &&
          parsed.error.startsWith("data_provider_")
        ) {
          providerMsg =
            "Property data temporarily unavailable — you can still enter values manually.";
        }
      } catch {}
    }
    if (providerMsg) {
      return (
        <Card className="mb-8" data-testid="card-property-profile-error">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-accent" />
              <h3 className="font-display text-base font-semibold tracking-tight">
                Property profile
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">{providerMsg}</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }
  if (!data) {
    return null;
  }

  return (
    <Card className="mb-8" data-testid="card-property-profile">
      <CardContent className="p-5 sm:p-6 space-y-1">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-4 w-4 text-accent" />
          <h3 className="font-display text-base font-semibold tracking-tight">
            Property profile
          </h3>
        </div>

        <Section icon={<Home className="h-3.5 w-3.5" />} title="Identity" defaultOpen>
          <KeyValGrid
            items={[
              ["County", data.identity.county],
              ["Subdivision", data.identity.subdivision],
              ["Zoning", data.identity.zoning],
              ["Property type", data.identity.propertyType],
              ["Year built", data.facts.yearBuilt?.toString() ?? null],
              [
                "Beds / Baths",
                data.facts.beds != null && data.facts.baths != null
                  ? `${data.facts.beds} / ${data.facts.baths}`
                  : null,
              ],
              [
                "Sqft",
                data.facts.sqft ? data.facts.sqft.toLocaleString() : null,
              ],
              [
                "Lot",
                data.facts.lotAcres
                  ? `${data.facts.lotAcres.toFixed(3)} ac`
                  : null,
              ],
            ]}
          />
        </Section>

        <Section icon={<Wrench className="h-3.5 w-3.5" />} title="Features">
          <KeyValGrid
            items={[
              ["Architecture", data.features.architectureType],
              [
                "Floors",
                data.features.floorCount?.toString() ?? null,
              ],
              ["Exterior", data.features.exteriorType],
              ["Roof", data.features.roofType],
              [
                "Heating",
                data.features.heating
                  ? data.features.heatingType ?? "Yes"
                  : data.features.heating === false
                    ? "No"
                    : null,
              ],
              [
                "Cooling",
                data.features.cooling
                  ? data.features.coolingType ?? "Yes"
                  : data.features.cooling === false
                    ? "No"
                    : null,
              ],
              [
                "Garage",
                data.features.garage
                  ? data.features.garageType ?? "Yes"
                  : data.features.garage === false
                    ? "No"
                    : null,
              ],
              [
                "Pool",
                data.features.pool === true
                  ? "Yes"
                  : data.features.pool === false
                    ? "No"
                    : null,
              ],
              [
                "Fireplace",
                data.features.fireplace === true
                  ? "Yes"
                  : data.features.fireplace === false
                    ? "No"
                    : null,
              ],
            ]}
          />
        </Section>

        <Section icon={<Receipt className="h-3.5 w-3.5" />} title="Taxes & assessment">
          <KeyValGrid
            items={[
              [
                `Assessment ${data.taxes.latestAssessYear ?? ""}`,
                fmtUSD(data.taxes.latestAssessValue),
              ],
              ["Land value", fmtUSD(data.taxes.landValue)],
              ["Improvements", fmtUSD(data.taxes.improvementsValue)],
              [
                `Annual tax ${data.taxes.latestTaxYear ?? ""}`,
                fmtUSD(data.taxes.latestTaxAmount),
              ],
            ]}
          />
          {data.taxes.assessmentHistory.length > 1 && (
            <div className="mt-3 pt-3 border-t border-card-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Assessment history
              </p>
              <div className="space-y-1">
                {data.taxes.assessmentHistory.map((row) => (
                  <div
                    key={row.year}
                    className="flex justify-between text-xs tabular-nums"
                  >
                    <span className="text-muted-foreground">{row.year}</span>
                    <span className="font-medium">{fmtUSD(row.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {data.owner && (
          <Section icon={<User className="h-3.5 w-3.5" />} title="Owner">
            <KeyValGrid
              items={[
                ["Name", data.owner.names.join(" · ") || null],
                ["Type", data.owner.type],
                [
                  "Owner-occupied",
                  data.owner.ownerOccupied === true
                    ? "Yes"
                    : data.owner.ownerOccupied === false
                      ? "No (absentee)"
                      : null,
                ],
                [
                  "Mailing address",
                  data.owner.absentee ? data.owner.mailingAddress : null,
                ],
              ]}
            />
            {data.owner.absentee && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 px-2 py-1 text-[11px] font-medium">
                Absentee owner — possible off-market opportunity
              </p>
            )}
          </Section>
        )}

        {data.rentEstimate?.rent != null && (
          <Section icon={<TrendingUp className="h-3.5 w-3.5" />} title="Rent estimate">
            <div className="flex items-baseline gap-2">
              <span
                className="font-display text-xl font-semibold tabular-nums"
                data-testid="text-rent-estimate"
              >
                {fmtUSD(data.rentEstimate.rent)}
              </span>
              <span className="text-xs text-muted-foreground">/mo</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              Range {fmtUSD(data.rentEstimate.rentLow)} —{" "}
              {fmtUSD(data.rentEstimate.rentHigh)}
            </p>
          </Section>
        )}

        {data.saleHistory.length > 0 && (
          <Section
            icon={<History className="h-3.5 w-3.5" />}
            title={`Sale history (${data.saleHistory.length})`}
          >
            <Timeline items={data.saleHistory} />
          </Section>
        )}

        {data.rentalHistory.length > 0 && (
          <Section
            icon={<History className="h-3.5 w-3.5" />}
            title={`Rental history (${data.rentalHistory.length})`}
          >
            <Timeline items={data.rentalHistory} />
          </Section>
        )}

        {data.market && (
          <Section
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            title={`Market stats · ${data.market.zip}`}
          >
            {data.market.singleFamily ? (
              <>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Single Family
                </p>
                <KeyValGrid
                  items={[
                    ["Median price", fmtUSD(data.market.singleFamily.medianPrice)],
                    [
                      "Median $/sqft",
                      data.market.singleFamily.medianPricePerSqft
                        ? `$${Math.round(data.market.singleFamily.medianPricePerSqft)}`
                        : null,
                    ],
                    [
                      "Median DOM",
                      data.market.singleFamily.medianDom
                        ? `${Math.round(data.market.singleFamily.medianDom)} days`
                        : null,
                    ],
                    [
                      "Active listings",
                      data.market.singleFamily.totalListings?.toString() ?? null,
                    ],
                  ]}
                />
              </>
            ) : (
              <KeyValGrid
                items={[
                  ["Median price", fmtUSD(data.market.all.medianPrice)],
                  [
                    "Median $/sqft",
                    data.market.all.medianPricePerSqft
                      ? `$${Math.round(data.market.all.medianPricePerSqft)}`
                      : null,
                  ],
                  [
                    "Median DOM",
                    data.market.all.medianDom
                      ? `${Math.round(data.market.all.medianDom)} days`
                      : null,
                  ],
                  ["New listings (30d)", data.market.all.newListings?.toString() ?? null],
                ]}
              />
            )}
            {data.market.lastUpdated && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Updated {fmtDate(data.market.lastUpdated)}
              </p>
            )}
          </Section>
        )}

        <p className="pt-3 mt-2 border-t border-card-border text-[10px] text-muted-foreground inline-flex items-center gap-1">
          <ExternalLink className="h-2.5 w-2.5" />
          Powered by RentCast · public records may be incomplete or stale
        </p>
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-card-border first:border-t-0 -mx-1 px-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 text-left hover-elevate rounded-md px-1 -mx-1"
        data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="pb-4 px-1">{children}</div>}
    </div>
  );
}

function KeyValGrid({
  items,
}: {
  items: [string, string | number | null | undefined][];
}) {
  const visible = items.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No data available
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {visible.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {k}
          </dt>
          <dd className="text-sm font-medium truncate" title={String(v)}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({
  items,
}: {
  items: {
    date: string | null;
    event: string;
    price: number | null;
    daysOnMarket?: number | null;
    listingType?: string | null;
    mlsNumber?: string | null;
  }[];
}) {
  return (
    <ol className="relative space-y-3 pl-4 before:absolute before:left-1 before:top-1 before:bottom-1 before:w-px before:bg-card-border">
      {items.slice(0, 8).map((evt, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[13px] top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{evt.event}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {fmtDate(evt.date)}
            </span>
          </div>
          {evt.price != null && (
            <div className="text-sm font-semibold tabular-nums">
              {fmtUSD(evt.price)}
            </div>
          )}
          {evt.daysOnMarket != null && (
            <div className="text-[11px] text-muted-foreground">
              {evt.daysOnMarket} days on market
              {evt.listingType ? ` · ${evt.listingType}` : ""}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
