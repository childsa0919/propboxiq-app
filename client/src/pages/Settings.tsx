import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Sparkles } from "lucide-react";
import { APP_VERSION } from "@shared/version";
import { RELEASE_NOTES } from "@shared/releaseNotes";
import { hasUnseenRelease, markReleaseSeen } from "@/lib/whatsNew";

const GOLD = "#f5c948";
const TEAL = "#126D85";
const CYAN = "#5fd4e7";

export default function Settings() {
  const [notesOpen, setNotesOpen] = useState(false);
  const [showBadge, setShowBadge] = useState(() => hasUnseenRelease());

  function openNotes() {
    markReleaseSeen();
    setShowBadge(false);
    setNotesOpen((v) => !v);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          App preferences and information.
        </p>
      </div>

      {/* Release Notes card */}
      <Card>
        <button
          type="button"
          onClick={openNotes}
          className="w-full text-left"
          data-testid="button-release-notes"
        >
          <CardContent className="p-5 flex items-center gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(95,212,231,0.12)", color: CYAN }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Release Notes</span>
                {showBadge && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-black"
                    style={{ background: GOLD }}
                    data-testid="badge-whats-new"
                  >
                    What's New
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                What's new in PropBoxIQ v{APP_VERSION}
              </div>
            </div>
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                notesOpen ? "rotate-90" : ""
              }`}
            />
          </CardContent>
        </button>

        {notesOpen && (
          <CardContent className="border-t border-card-border p-5 pt-4">
            <div
              className="max-h-[60vh] space-y-6 overflow-y-auto pr-1"
              data-testid="release-notes-body"
            >
              {RELEASE_NOTES.map((rn) => (
                <div key={rn.version}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span
                      className="text-sm font-bold"
                      style={{ color: CYAN }}
                    >
                      v{rn.version}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {rn.date}
                    </span>
                  </div>
                  {rn.added && rn.added.length > 0 && (
                    <NoteGroup title="Added" items={rn.added} />
                  )}
                  {rn.changed && rn.changed.length > 0 && (
                    <NoteGroup title="Changed" items={rn.changed} />
                  )}
                  {rn.fixed && rn.fixed.length > 0 && (
                    <NoteGroup title="Fixed" items={rn.fixed} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Version line */}
      <div
        className="text-center text-xs text-muted-foreground"
        data-testid="text-settings-version"
      >
        <span style={{ color: TEAL, fontWeight: 600 }}>PropBoxIQ</span> v
        {APP_VERSION}
      </div>
    </div>
  );
}

function NoteGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <ul className="mt-1 space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-current opacity-50" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
