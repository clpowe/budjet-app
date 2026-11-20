import { describe, expect, it } from "vite-plus/test";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { previewGoalPurchase, projectAllocations } from "../../app/utils/goal-allocations";

function makeGoal(id: string, estimatedCostCents: bigint): Doc<"goals"> {
  return {
    _id: id as Id<"goals">,
    _creationTime: 0,
    householdId: "household" as Id<"households">,
    name: id,
    estimatedCostCents,
    priority: "medium",
    notes: "",
    status: "saving",
    order: 0,
    createdBy: "user" as Id<"users">,
    updatedBy: "user" as Id<"users">,
    createdAt: 0,
    updatedAt: 0,
  } as Doc<"goals">;
}

describe("projectAllocations", () => {
  it("funds goals in queue order and keys each allocation by goal id", () => {
    const camera = makeGoal("camera", 5_000n);
    const headphones = makeGoal("headphones", 4_000n);

    expect(projectAllocations(6_000n, [camera, headphones])).toEqual([
      {
        goalId: camera._id,
        allocatedCents: 5_000n,
        remainingCents: 0n,
        progressBasisPoints: 10_000,
      },
      {
        goalId: headphones._id,
        allocatedCents: 1_000n,
        remainingCents: 3_000n,
        progressBasisPoints: 2_500,
      },
    ]);
  });

  it("funds nothing when savings are negative", () => {
    const camera = makeGoal("camera", 5_000n);

    expect(projectAllocations(-500n, [camera])).toEqual([
      {
        goalId: camera._id,
        allocatedCents: 0n,
        remainingCents: 5_000n,
        progressBasisPoints: 0,
      },
    ]);
  });

  it("returns no allocations for an empty queue", () => {
    expect(projectAllocations(1_000n, [])).toEqual([]);
  });
});

describe("previewGoalPurchase", () => {
  const camera = makeGoal("camera", 10_000n);
  const trip = makeGoal("trip", 5_000n);

  it("splits the amount between savings and the daily budget", () => {
    expect(previewGoalPurchase(8_000n, [camera, trip], camera._id, 10_000n)).toEqual({
      actualAmountCents: 10_000n,
      fromSavingsCents: 8_000n,
      budgetImpactCents: 2_000n,
      progressLosses: [],
    });
  });

  it("reports progress the purchase takes from later goals", () => {
    expect(previewGoalPurchase(15_000n, [camera, trip], camera._id, 12_000n)).toEqual({
      actualAmountCents: 12_000n,
      fromSavingsCents: 12_000n,
      budgetImpactCents: 0n,
      progressLosses: [
        { goalId: trip._id, name: "trip", lostCents: 2_000n, allocatedCentsAfter: 3_000n },
      ],
    });
  });

  it("charges everything to the daily budget when savings are negative", () => {
    expect(previewGoalPurchase(-500n, [camera], camera._id, 10_000n)).toMatchObject({
      fromSavingsCents: 0n,
      budgetImpactCents: 10_000n,
    });
  });

  it("returns null when the goal is no longer in the active queue", () => {
    expect(previewGoalPurchase(15_000n, [trip], camera._id, 10_000n)).toBeNull();
  });
});
