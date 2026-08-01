"use client";

/**
 * Runs a queued agent task.
 *
 * `executeAgentTaskAction` runs the bounded tool-call loop and persists an
 * `AgentExecution` with its logs, token count and duration, so it needs a database.
 * The refusal is rendered as an explanation, and the tool catalogue beside it is
 * read from the live registry either way.
 */

import * as React from "react";
import { Play } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatCurrency, formatNumber } from "@/lib/format";

export type ExecuteAgentTaskResult = {
  readonly executionId: string;
  readonly taskId: string;
  readonly status: string;
  readonly stepCount: number;
  readonly failedSteps: number;
  readonly durationMs: number;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly retryCount: number;
  readonly errorMessage: string | null;
  readonly summary: string | null;
};

type Option = { readonly value: string; readonly label: string };

export function TaskRunner({
  organizationId,
  agents,
  tasks,
  executeTask,
}: {
  readonly organizationId: string;
  readonly agents: readonly Option[];
  readonly tasks: readonly Option[];
  readonly executeTask: (input: unknown) => Promise<ActionState<ExecuteAgentTaskResult>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<ExecuteAgentTaskResult>,
    FormData
  >(async (_previous, formData) => {
    const maxSteps = Number(formData.get("maxSteps"));
    const taskId = String(formData.get("taskId") ?? "");
    return executeTask({
      organizationId,
      agentId: String(formData.get("agentId") ?? ""),
      ...(taskId.length > 0 ? { taskId } : {}),
      ...(Number.isFinite(maxSteps) && maxSteps > 0 ? { maxSteps } : {}),
    });
  }, IDLE_ACTION_STATE as ActionState<ExecuteAgentTaskResult>);

  return (
    <form action={formAction} className="space-y-4" data-testid="task-runner">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField name="agentId" label="Agent" type="select" required options={agents} />
        <FormField
          name="taskId"
          label="Queued task"
          type="select"
          options={tasks}
          description="Leave blank to run the agent's default plan."
        />
        <FormField
          name="maxSteps"
          label="Max tool calls"
          type="number"
          defaultValue={10}
          min={1}
          max={50}
          description="Bounds the loop; the runtime records a failure rather than looping."
        />
      </div>

      <ActionError state={state} showSuccess={false} />

      <SubmitButton pending={pending} pendingLabel="Running…">
        <Play className="size-3.5" />
        Execute task
      </SubmitButton>

      {state.status === "success" && (
        <Alert className="border-emerald-500/40" data-testid="execution-result">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>Execution {state.data.executionId}</span>
            <Badge variant={state.data.status === "completed" ? "secondary" : "destructive"}>
              {state.data.status}
            </Badge>
          </AlertTitle>
          <AlertDescription className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">{state.data.stepCount} steps</Badge>
            <Badge variant="outline">{state.data.failedSteps} failed</Badge>
            <Badge variant="outline">{state.data.retryCount} retries</Badge>
            <Badge variant="outline">{formatNumber(state.data.durationMs)} ms</Badge>
            <Badge variant="outline">{formatNumber(state.data.tokensUsed)} tokens</Badge>
            <Badge variant="outline">{formatCurrency(state.data.costUsd, "USD", 4)}</Badge>
            {state.data.errorMessage && (
              <p className="w-full text-xs text-destructive">{state.data.errorMessage}</p>
            )}
            {state.data.summary && <p className="w-full text-xs">{state.data.summary}</p>}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
