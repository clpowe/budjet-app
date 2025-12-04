<script setup lang="ts">
import { api } from "../../convex/_generated/api";

definePageMeta({
  middleware: ["auth"],
  ssr: false,
});

const name = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

const router = useRouter();
const { syncUser } = useHousehold();
const { mutate: createHousehold } = useConvexMutation(
  api.households.createHousehold,
);
const { user } = useUser();
const { isComplete } = useProfileStatus();

const handleSubmit = async () => {
  if (isComplete.value) {
    return router.push("/home");
  }
  if (!name.value || loading.value) return;
  loading.value = true;
  error.value = null;

  try {
    await syncUser();
    await createHousehold({ name: name.value });

    // Mark profile complete in Clerk metadata for middleware checks.
    await user.value?.update({
      unsafeMetadata: { profileComplete: true },
    });

    await router.push("/home");
  } catch (err: any) {
    error.value = err?.message ?? "Something went wrong";
  } finally {
    loading.value = false;
  }
};

// If the user is already complete, bounce to home.
watchEffect(() => {
  if (isComplete.value) {
    router.push("/home");
  }
});
</script>

<template>
  <div class="container mx-auto max-w-xl p-6 space-y-6">
    <h1 class="text-2xl font-semibold">Finish setting up your budget</h1>
    <p class="text-sm text-gray-500">
      Create a household to start tracking expenses and snowball payments.
    </p>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <label class="space-y-1 block">
        <span class="font-medium">Household name</span>
        <input
          v-model="name"
          type="text"
          class="input input-bordered w-full"
          placeholder="e.g. Rivera Family"
          required
        />
      </label>

      <button
        class="btn btn-primary w-full"
        type="submit"
        :disabled="loading || isComplete"
      >
        {{
          loading
            ? "Saving..."
            : isComplete
              ? "Already set"
              : "Save and continue"
        }}
      </button>
    </form>

    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
  </div>
</template>
