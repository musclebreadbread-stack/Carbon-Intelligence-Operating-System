"use client";

/**
 * Organisation members: invite, change role, revoke.
 *
 * This is the read side's counterpart to the P0-1 tenant-isolation fix — before
 * this tab existed there was no UI path to grant another user membership, so
 * `OrganizationMembership` stayed empty and the active-organisation switcher had
 * nothing to show beyond a user's own home organisation. All three actions
 * re-check the caller's permission server-side; `useCan` here only hides
 * controls the action would refuse anyway.
 */

import * as React from "react";
import { UserPlus, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ActionError } from "@/components/shared/form/action-error";
import { FormField, type SelectOption } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { useCan } from "@/components/providers/session-provider";
import { useT } from "@/components/providers/locale-provider";
import { formatDateTime } from "@/lib/format";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import type { MembershipActionResult } from "@/lib/actions/organization-membership";
import type { MemberSummary } from "@/lib/data/repositories/organization-membership";

const ROLE_OPTIONS: readonly SelectOption[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

type ActionFn = (input: unknown) => Promise<ActionState<MembershipActionResult>>;

export function MembersTab({
  members,
  inviteMember,
  updateMembershipRole,
  revokeMembership,
}: {
  readonly members: readonly MemberSummary[];
  readonly inviteMember: ActionFn;
  readonly updateMembershipRole: ActionFn;
  readonly revokeMembership: ActionFn;
}) {
  const t = useT();
  const canManage = useCan("organization_membership", "update");
  const [pendingId, startTransition] = React.useTransition();
  const [pendingMembershipId, setPendingMembershipId] = React.useState<string | null>(null);

  const [inviteState, inviteFormAction, invitePending] = React.useActionState<
    ActionState<MembershipActionResult>,
    FormData
  >(async (_previous, formData) => {
    const email = formData.get("email");
    const role = formData.get("role");
    return inviteMember({
      email: typeof email === "string" ? email : "",
      role: typeof role === "string" ? role : "MEMBER",
    });
  }, IDLE_ACTION_STATE as ActionState<MembershipActionResult>);

  function changeRole(membershipId: string, role: string): void {
    setPendingMembershipId(membershipId);
    startTransition(async () => {
      await updateMembershipRole({ membershipId, role });
      setPendingMembershipId(null);
    });
  }

  function revoke(membershipId: string): void {
    setPendingMembershipId(membershipId);
    startTransition(async () => {
      await revokeMembership({ membershipId });
      setPendingMembershipId(null);
    });
  }

  return (
    <div className="space-y-4 pt-3">
      <p className="text-xs text-muted-foreground">{t("security.members.ssoNote")}</p>
      {canManage && (
        <form action={inviteFormAction} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <FormField
            name="email"
            type="email"
            label={t("security.members.inviteEmail")}
            placeholder="name@example.com"
            required
            className="min-w-[220px] flex-1"
          />
          <FormField
            name="role"
            type="select"
            label={t("security.members.role")}
            options={ROLE_OPTIONS}
            defaultValue="MEMBER"
          />
          <SubmitButton pending={invitePending} pendingLabel={t("security.members.inviting")}>
            <UserPlus className="size-3.5" />
            {t("security.members.invite")}
          </SubmitButton>
          <ActionError state={inviteState} handledFields={["email", "role"]} />
        </form>
      )}

      {members.length === 0 ? (
        <EmptyState title={t("security.members.empty")} />
      ) : (
        <div className="space-y-1.5">
          {members.map((member) => {
            const rowPending = pendingId && pendingMembershipId === member.membershipId;
            return (
              <div
                key={member.membershipId}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
              >
                <span className="font-medium">{member.userName ?? member.userEmail}</span>
                <span className="font-mono text-xs text-muted-foreground">{member.userEmail}</span>
                {canManage ? (
                  <select
                    aria-label={t("security.members.role")}
                    className="rounded-md border bg-transparent px-1.5 py-0.5 text-xs"
                    value={member.role}
                    disabled={rowPending}
                    onChange={(event) => changeRole(member.membershipId, event.target.value)}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant="outline">{member.role}</Badge>
                )}
                <Badge variant={member.status === "ACTIVE" ? "secondary" : "destructive"}>
                  {member.status}
                </Badge>
                {member.invitedAt && (
                  <span className="text-xs text-muted-foreground">
                    {t("security.members.since")} {formatDateTime(member.invitedAt)}
                  </span>
                )}
                {canManage && member.status !== "REVOKED" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto gap-1 text-destructive"
                    disabled={rowPending}
                    onClick={() => revoke(member.membershipId)}
                  >
                    <UserX className="size-3.5" />
                    {t("security.members.revoke")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
