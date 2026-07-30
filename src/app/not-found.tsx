import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
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
          <Button size="sm" render={<Link href="/dashboard" />}>
            Dashboard
          </Button>
          <Button size="sm" variant="outline" render={<Link href="/emission-engine" />}>
            Emission engine
          </Button>
          <Button size="sm" variant="outline" render={<Link href="/esg-disclosure" />}>
            ESG disclosure
          </Button>
          <Button size="sm" variant="ghost" render={<Link href="/" />}>
            Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
