"use client";

/**
 * Client-side session context.
 *
 * The session is resolved once, on the server, in `(dashboard)/layout.tsx` and
 * handed down through this provider. Client components therefore never fetch the
 * session and never see the parts of `SessionUser` that only matter server-side —
 * the provider carries a deliberately narrow, serialisable projection.
 */

import * as React from "react";

export type ClientPermission = {
  readonly resource: string;
  readonly action: string;
};

export type ClientSession = {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly roles: readonly string[];
  readonly permissions: readonly ClientPermission[];
  /** How the session was established, so the UI can explain the demo case. */
  readonly source: "supabase" | "demo" | "apiKey";
};

export type ClientOrganization = {
  readonly id: string;
  readonly name: string;
};

export type SessionContextValue = {
  readonly session: ClientSession | null;
  readonly organizations: readonly ClientOrganization[];
  readonly dataMode: "database" | "demo";
};

const SessionContext = React.createContext<SessionContextValue>({
  session: null,
  organizations: [],
  dataMode: "demo",
});

export function SessionProvider({
  value,
  children,
}: {
  readonly value: SessionContextValue;
  readonly children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return React.useContext(SessionContext);
}

/**
 * Client-side permission check, for hiding controls the user cannot use.
 *
 * This is a *convenience*, not a control: every server action re-checks the same
 * permission, because an action is reachable by direct POST.
 */
export function useCan(resource: string, action: string): boolean {
  const { session } = useSession();
  if (!session) return false;
  return session.permissions.some(
    (permission) =>
      (permission.resource === resource || permission.resource === "*") &&
      (permission.action === action || permission.action === "*"),
  );
}
