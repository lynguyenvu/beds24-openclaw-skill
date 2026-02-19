import type { FollowupRun } from "./types.js";
import { defaultRuntime } from "../../../runtime.js";
import {
  buildCollectPrompt,
  buildQueueSummaryPrompt,
  hasCrossChannelItems,
  waitForQueueDebounce,
} from "../../../utils/queue-helpers.js";
import { isRoutableChannel } from "../route-reply.js";
import { FOLLOWUP_QUEUES } from "./state.js";

function previewQueueSummaryPrompt(queue: {
  dropPolicy: "summarize" | "old" | "new";
  droppedCount: number;
  summaryLines: string[];
}): string | undefined {
  return buildQueueSummaryPrompt({
    state: {
      dropPolicy: queue.dropPolicy,
      droppedCount: queue.droppedCount,
      summaryLines: [...queue.summaryLines],
    },
    noun: "message",
  });
}

function clearQueueSummaryState(queue: { droppedCount: number; summaryLines: string[] }): void {
  queue.droppedCount = 0;
  queue.summaryLines = [];
}

function hasCrossAgentItems(items: FollowupRun[]): boolean {
  const agentIds = new Set<string>();
  for (const item of items) {
    const agentId = item.run?.agentId?.trim();
    if (!agentId) {
      continue;
    }
    agentIds.add(agentId);
    if (agentIds.size > 1) {
      return true;
    }
  }
  return false;
}

export function scheduleFollowupDrain(
  key: string,
  runFollowup: (run: FollowupRun) => Promise<void>,
): void {
  const queue = FOLLOWUP_QUEUES.get(key);
  if (!queue || queue.draining) {
    return;
  }
  queue.draining = true;
  void (async () => {
    try {
      let forceIndividualCollect = false;
      while (queue.items.length > 0 || queue.droppedCount > 0) {
        await waitForQueueDebounce(queue);
        if (queue.mode === "collect") {
          // Once the batch is mixed, never collect again within this drain.
          // Prevents “collect after shift” collapsing different targets.
          //
          // Debug: `pnpm test src/auto-reply/reply/queue.collect-routing.test.ts`
          if (forceIndividualCollect) {
            const next = queue.items[0];
            if (!next) {
              break;
            }
            await runFollowup(next);
            queue.items.shift();
            continue;
          }

          // Check if messages span multiple channels.
          // If so, process individually to preserve per-message routing.
          const isCrossChannel = hasCrossChannelItems(queue.items, (item) => {
            const channel = item.originatingChannel;
            const to = item.originatingTo;
            const accountId = item.originatingAccountId;
            const threadId = item.originatingThreadId;
            if (!channel && !to && !accountId && threadId == null) {
              return {};
            }
            if (!isRoutableChannel(channel) || !to) {
              return { cross: true };
            }
            const threadKey = threadId != null ? String(threadId) : "";
            return {
              key: [channel, to, accountId || "", threadKey].join("|"),
            };
          });

          if (isCrossChannel) {
            forceIndividualCollect = true;
            const next = queue.items[0];
            if (!next) {
              break;
            }
            await runFollowup(next);
            queue.items.shift();
            continue;
          }

          // Check if messages span multiple agents.
          // If so, process individually to preserve agent isolation.
          const isCrossAgent = hasCrossAgentItems(queue.items);
          if (isCrossAgent) {
            forceIndividualCollect = true;
            const next = queue.items[0];
            if (!next) {
              break;
            }
            await runFollowup(next);
            queue.items.shift();
            continue;
          }

          const items = queue.items.slice();
          const summary = previewQueueSummaryPrompt(queue);
          const run = items.at(-1)?.run ?? queue.lastRun;
          if (!run) {
            break;
          }

          // Preserve originating channel from items when collecting same-channel.
          const originatingChannel = items.find((i) => i.originatingChannel)?.originatingChannel;
          const originatingTo = items.find((i) => i.originatingTo)?.originatingTo;
          const originatingAccountId = items.find(
            (i) => i.originatingAccountId,
          )?.originatingAccountId;
          const originatingThreadId = items.find(
            (i) => i.originatingThreadId != null,
          )?.originatingThreadId;

          const prompt = buildCollectPrompt({
            title: "[Queued messages while agent was busy]",
            items,
            summary,
            renderItem: (item, idx) => `---\nQueued #${idx + 1}\n${item.prompt}`.trim(),
          });
          await runFollowup({
            prompt,
            run,
            enqueuedAt: Date.now(),
            originatingChannel,
            originatingTo,
            originatingAccountId,
            originatingThreadId,
          });
          queue.items.splice(0, items.length);
          if (summary) {
            clearQueueSummaryState(queue);
          }
          continue;
        }

        const summaryPrompt = previewQueueSummaryPrompt(queue);
        if (summaryPrompt) {
          const run = queue.lastRun;
          if (!run) {
            break;
          }
          const next = queue.items[0];
          if (!next) {
            break;
          }
          await runFollowup({
            prompt: summaryPrompt,
            run,
            enqueuedAt: Date.now(),
          });
          queue.items.shift();
          clearQueueSummaryState(queue);
          continue;
        }

        const next = queue.items[0];
        if (!next) {
          break;
        }
        await runFollowup(next);
        queue.items.shift();
      }
    } catch (err) {
      queue.lastEnqueuedAt = Date.now();
      defaultRuntime.error?.(`followup queue drain failed for ${key}: ${String(err)}`);
    } finally {
      queue.draining = false;
      if (queue.items.length === 0 && queue.droppedCount === 0) {
        FOLLOWUP_QUEUES.delete(key);
      } else {
        scheduleFollowupDrain(key, runFollowup);
      }
    }
  })();
}
