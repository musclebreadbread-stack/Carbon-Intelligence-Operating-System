import { Compass } from "lucide-react";

import { LinkButton } from "@/components/shared/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Not found — CIOS",
};

/** Root 404: reachable both from an unknown URL and from `notFound()`. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="size-4 text-muted-foreground" />
            That page does not exist
          </CardTitle>
          <CardDescription>
            The address you followed is not one of the eighteen CIOS modules. Pick a
            starting point below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <LinkButton size="sm" href="/dashboard">
            Dashboard
          </LinkButton>
          <LinkButton size="sm" variant="outline" href="/emission-engine">
            Emission engine
          </LinkButton>
          <LinkButton size="sm" variant="outline" href="/esg-disclosure">
            ESG disclosure
          </LinkButton>
          <LinkButton size="sm" variant="ghost" href="/">
            Home
          </LinkButton>
        </CardContent>
      </Card>
    </div>
  );
}
