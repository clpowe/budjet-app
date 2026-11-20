import { describe, expect, it } from "vite-plus/test";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { projectAllocations } from "../../app/utils/goal-allocations";

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
