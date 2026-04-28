import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, SlidersHorizontal, Sparkles, Zap } from "lucide-react";

export default function Detailed() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-20">
      <Link href="/">
        <Button variant="ghost" size="sm" className="-ml-3 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Home
        </Button>
      </Link>

      <Card>
        <CardContent className="p-8 sm:p-12 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-5">
            <SlidersHorizontal className="h-7 w-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
            Detailed mode is coming
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
            Full underwriting with financing terms, holding costs, sensitivity
            analysis, and investor-ready PDF export. We're tuning this to your
            workflow — pop into Quick mode to start analyzing in the meantime.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/quick">
              <Button size="lg" className="w-full sm:w-auto">
                <Zap className="h-4 w-4 mr-2" />
                Try Quick mode
              </Button>
            </Link>
          </div>
          <div className="mt-8 text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-accent" />
            Tip: any deal you save in Quick mode will be ready for Detailed
            mode the moment it's live.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
