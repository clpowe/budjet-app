import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { clearNuxtState } from "#app";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent, ref, type Ref } from "vue";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import { getLocalDateKey } from "../../shared/utils/local-date";
import { useWantList } from "../../app/composables/use-want-list";

const TIME_ZONE = "America/New_York";
// 2026-11-20 is EST (UTC-5): 11:00 pm local is 04:00 UTC the next day.
const elevenPmLocal = Date.UTC(2026, 10, 21, 4);
const localMidnight = Date.UTC(2026, 10, 21, 5);

const { summaryArgs } = vi.hoisted(() => ({
  summaryArgs: { current: undefined as Ref<{ now: number }> | undefined },
}));

mockNuxtImport("useDate", () => () => ({ timeZone: ref(TIME_ZONE) }));
mockNuxtImport("useConvexClient", () => () => ({ onUpdate: () => () => {} }));
mockNuxtImport("useConvexMutation", () => () => ({ mutate: vi.fn() }));
mockNuxtImport(
  "useConvexQuery",
  () => (endpoint: FunctionReference<"query">, args: Ref<{ now: number }>) => {
    if (getFunctionName(endpoint) === getFunctionName(api.savings.getSummary)) {
      summaryArgs.current = args;
    }
    return { data: ref(undefined), isPending: ref(false) };
  },
);

function summaryNow(): number {
  if (!summaryArgs.current) throw new Error("Savings summary was not queried");
  return summaryArgs.current.value.now;
}

function mountList() {
  return mount(
    defineComponent({
      setup() {
        useWantList();
        return () => null;
      },
    }),
  );
}

describe("useWantList savings clock", () => {
  beforeEach(() => {
    clearNuxtState("wants-summary-now");
    summaryArgs.current = undefined;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(elevenPmLocal);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the same summary time for the rest of the local day", () => {
    const wrapper = mountList();
    const start = summaryNow();

    vi.advanceTimersByTime(59 * 60_000);
    window.dispatchEvent(new Event("focus"));

    expect(summaryNow()).toBe(start);
    wrapper.unmount();
  });

  it("moves to the new local date at local midnight", () => {
    const wrapper = mountList();

    vi.advanceTimersByTime(localMidnight - elevenPmLocal);

    expect(getLocalDateKey(summaryNow(), TIME_ZONE)).toBe("2026-11-21");

    // The next midnight is scheduled too.
    vi.advanceTimersByTime(24 * 60 * 60_000);
    expect(getLocalDateKey(summaryNow(), TIME_ZONE)).toBe("2026-11-22");
    wrapper.unmount();
  });

  it.each([
    ["focus", () => window.dispatchEvent(new Event("focus"))],
    ["visibilitychange", () => document.dispatchEvent(new Event("visibilitychange"))],
  ])("catches a missed midnight on %s", (_name, wake) => {
    const wrapper = mountList();

    // A sleeping laptop: the clock jumps past midnight without timers firing.
    vi.setSystemTime(localMidnight + 3 * 60 * 60_000);
    wake();

    expect(getLocalDateKey(summaryNow(), TIME_ZONE)).toBe("2026-11-21");
    wrapper.unmount();
  });

  it("stops listening after unmount", () => {
    const wrapper = mountList();
    const start = summaryNow();

    wrapper.unmount();
    vi.advanceTimersByTime(localMidnight - elevenPmLocal + 60_000);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(summaryNow()).toBe(start);
    expect(vi.getTimerCount()).toBe(0);
  });
});
