import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

const householdRef = ref<Doc<"households"> | undefined>({
  name: "Rivera family",
  inviteCode: "ABC123",
} as Doc<"households">);
const membersRef = ref<Doc<"users">[]>([]);

const useConvexQueryMock = vi.fn();
const useConvexClientMock = vi.fn();
const useAuthGateMock = vi.fn();

vi.mock("#imports", () => ({
  useConvexQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useConvexClient: () => useConvexClientMock(),
  useAuthGate: () => useAuthGateMock(),
}));

let useHousehold: typeof import("../../app/composables/use-households").useHousehold;

describe("useHousehold", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("useState", (_key: string, initialize: () => unknown) => ref(initialize()));
    vi.stubGlobal("useConvexQuery", (...args: unknown[]) => useConvexQueryMock(...args));
    vi.stubGlobal("useConvexClient", () => useConvexClientMock());
    vi.stubGlobal("useAuthGate", () => useAuthGateMock());

    useConvexQueryMock.mockReset();
    useConvexClientMock.mockReset();
    useAuthGateMock.mockReset();

    useConvexQueryMock.mockImplementation(() => {
      const responses = [householdRef, membersRef];
      const index = (useConvexQueryMock.mock.calls.length - 1) % responses.length;
      return { data: responses[index] };
    });
    useConvexClientMock.mockReturnValue({ mutation: vi.fn() });
    useAuthGateMock.mockReturnValue({ invalidate: vi.fn() });

    ({ useHousehold } = await import("../../app/composables/use-households"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("subscribes to the household and its members with reactive Convex queries", () => {
    const household = useHousehold();

    expect(useConvexQueryMock).toHaveBeenNthCalledWith(1, api.households.getMyHousehold, {});
    expect(useConvexQueryMock).toHaveBeenNthCalledWith(2, api.households.listHouseholdMembers, {});
    expect(household.household).toBe(householdRef);
    expect(household.members).toBe(membersRef);
  });
});
