import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { computed, onBeforeUnmount, onMounted } from "vue";
import { api } from "../../convex/_generated/api";
import {
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
} from "../../shared/utils/local-date.ts";
import { useWantSection } from "./use-want-section";

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
  const now = useState<number>("wants-summary-now", () => Date.now());

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

export function useWantList() {
  const now = useSavingsClock();

  const { data: activeResult, isPending: isActivePending } = useConvexQuery(api.goals.list, {});

  const convex = useConvexClient();
  const history = {
    considering: useWantSection(convex, "idea"),
    notNow: useWantSection(convex, "on_hold"),
    bought: useWantSection(convex, "purchased"),
  };

  const { data: summary, isPending: isSummaryPending } = useConvexQuery(
    api.savings.getSummary,
    computed(() => ({ now: now.value })),
  );

  const sections = computed(() => ({
    active: activeResult.value?.active ?? [],
    considering: history.considering.items.value,
    notNow: history.notNow.items.value,
    bought: history.bought.items.value,
  }));

  const isLoading = computed(() => isActivePending.value || isSummaryPending.value);

  return {
    sections,
    history,
    summary,
    isLoading,
    createItem: useGoalAction(api.goals.create, "Could not create this Want. Try again."),
    updateItem: useGoalAction(api.goals.update, "Could not update this Want. Try again."),
    changeStatus: useGoalAction(
      api.goals.changeStatus,
      "Could not change this Want's status. Try again.",
    ),
    reorder: useGoalAction(api.goals.reorder, "Could not reorder the Wants list. Try again."),
    purchase: useGoalAction(api.goals.purchase, "Could not complete this purchase. Try again."),
    correctPurchase: useGoalAction(
      api.goals.correctPurchase,
      "Could not correct this purchase. Try again.",
    ),
    undoPurchase: useGoalAction(api.goals.undoPurchase, "Could not undo this purchase. Try again."),
  };
}
