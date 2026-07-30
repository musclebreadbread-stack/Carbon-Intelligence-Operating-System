import { Leaf } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="mb-8 flex items-center gap-2">
        <Leaf className="size-8 text-emerald-600" />
        <span className="text-xl font-semibold">CIOS</span>
      </div>
      <div className="w-full max-w-md">
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Carbon Intelligence Operating System
      </p>
    </div>
  );
}
