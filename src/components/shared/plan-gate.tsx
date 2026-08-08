import { Lock } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/shared/link-button";
import { PageHeader } from "@/components/shared/page-header";
import { minimumPlanFor, type ModuleKey } from "@/lib/core/plans";
import { getDictionary } from "@/lib/i18n/server";

/**
 * The "you need a higher plan" screen for a locked module.
 *
 * A page checks `hasModuleAccess()` itself and returns this *instead of*
 * rendering its normal content — deliberately not a wrapper component, so a
 * page whose plan check fails never runs the repository reads its real
 * content would have needed. See carbon-finance/page.tsx for the pattern.
 */
export async function PlanGateLocked({ module }: { readonly module: ModuleKey }) {
  const dict = await getDictionary();
  const requiredPlan = minimumPlanFor(module);

  return (
    <div className="space-y-6">
      <PageHeader title={dict["planGate.title"]} description={dict["planGate.description"]} />
      <Card data-testid="plan-gate-locked">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4 text-muted-foreground" />
            {dict["planGate.title"]}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <span>{dict["planGate.description"]}</span>
            <Badge variant="outline">{requiredPlan}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LinkButton href="/#pricing">{dict["planGate.cta"]}</LinkButton>
        </CardContent>
      </Card>
    </div>
  );
}
