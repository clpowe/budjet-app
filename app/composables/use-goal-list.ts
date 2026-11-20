import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { computed, onBeforeUnmount, onMounted } from "vue";
import { api } from "../../convex/_generated/api";
import {
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
} from "../../shared/utils/local-date.ts";
import { useGoalSection } from "./use-goal-section";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function runAction<T>(action: () => Promise<T>, fallback: string): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await action() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : fallback };
  }
}

function useGoalAction<M extends FunctionReference<"mutation">>(mutation: M, fallback: string) {
  const { mutate } = useConvexMutation(mutation);

  return (args: FunctionArgs<M>): Promise<ActionResult<FunctionReturnType<M>>> =>
    runAction(() => mutate(args), fallback);
}

function useSavingsClock() {
  const { timeZone } = useDate();
  const now = useState<number>("goals-summary-now", () => Date.now());

  let midnightTimer: number | undefined;

  function refreshIfNewDay() {
    const next = Date.now();

    if (getLocalDateKey(next, timeZone.value) !== getLocalDateKey(now.value, timeZone.value)) {
      now.value = next;
    }
  }

  function scheduleMidnight() {
    window.clearTimeout(midnightTimer);

    const today = getLocalDateKey(Date.now(), timeZone.value);
    const nextMidnight = getLocalDayBounds(
      getNextLocalDate(today, timeZone.value),
      timeZone.value,
    ).startTimestamp;

    midnightTimer = window.setTimeout(
      () => {
        refreshIfNewDay();
        scheduleMidnight();
      },
      Math.max(nextMidnight - Date.now(), 0),
    );
  }

  function onVisible() {
    if (document.visibilityState === "visible") refreshIfNewDay();
  }

  if (import.meta.client) {
    onMounted(() => {
      refreshIfNewDay();
      scheduleMidnight();
      window.addEventListener("focus", refreshIfNewDay);
      document.addEventListener("visibilitychange", onVisible);
    });

    onBeforeUnmount(() => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", refreshIfNewDay);
      document.removeEventListener("visibilitychange", onVisible);
    });
  }

  return now;
}

export function useGoalList() {
  const now = useSavingsClock();

  const { data: activeResult, isPending: isActivePending } = useConvexQuery(api.goals.list, {});

  const convex = useConvexClient();
  const history = {
    ideas: useGoalSection(convex, "idea"),
    onHold: useGoalSection(convex, "on_hold"),
    purchased: useGoalSection(convex, "purchased"),
  };

  const { data: summary, isPending: isSummaryPending } = useConvexQuery(
    api.savings.getSummary,
    computed(() => ({ now: now.value })),
  );

  const sections = computed(() => ({
    active: activeResult.value?.active ?? [],
    ideas: history.ideas.items.value,
    onHold: history.onHold.items.value,
    purchased: history.purchased.items.value,
  }));

  const isLoading = computed(() => isActivePending.value || isSummaryPending.value);

  return {
    sections,
    history,
    summary,
    isLoading,
    createItem: useGoalAction(api.goals.create, "Could not create this goal. Try again."),
    updateItem: useGoalAction(api.goals.update, "Could not update this goal. Try again."),
    changeStatus: useGoalAction(
      api.goals.changeStatus,
      "Could not change this goal's status. Try again.",
    ),
    reorder: useGoalAction(api.goals.reorder, "Could not reorder the goals list. Try again."),
    purchase: useGoalAction(api.goals.purchase, "Could not complete this purchase. Try again."),
    correctPurchase: useGoalAction(
      api.goals.correctPurchase,
      "Could not correct this purchase. Try again.",
    ),
    undoPurchase: useGoalAction(api.goals.undoPurchase, "Could not undo this purchase. Try again."),
  };
}
