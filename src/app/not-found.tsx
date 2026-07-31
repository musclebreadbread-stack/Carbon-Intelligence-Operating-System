import { Compass } from "lucide-react";

import { LinkButton } from "@/components/shared/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n/server";

export const metadata = {
  title: "Not found - CIOS",
};

/** Root 404: reachable both from an unknown URL and from `notFound()`. */
export default async function NotFound() {
  const dict = await getDictionary();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="size-4 text-muted-foreground" />
            {dict["common.notFound"]}
          </CardTitle>
          <CardDescription>
            {dict["common.notFoundDescription"]}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <LinkButton size="sm" href="/dashboard">
            {dict["nav.dashboard"]}
          </LinkButton>
          <LinkButton size="sm" variant="outline" href="/emission-engine">
            {dict["nav.emissionEngine"]}
          </LinkButton>
          <LinkButton size="sm" variant="outline" href="/esg-disclosure">
            {dict["nav.esgDisclosure"]}
          </LinkButton>
          <LinkButton size="sm" variant="ghost" href="/">
            {dict["landing.cta"]}
          </LinkButton>
        </CardContent>
      </Card>
    </div>
  );
}
