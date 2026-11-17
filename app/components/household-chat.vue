<script setup lang="ts">
import { ConvexError } from "convex/values";
import { api } from "@generated/api";

const { data: messages, error: loadError } = useConvexQuery(api.chat.list, {});
const { mutate: sendMessage, isPending: sending } = useConvexMutation(api.chat.send);
const { user } = useConvexUser();

const draft = ref("");
const errorMessage = ref("");
const panel = useTemplateRef<{ scrollToBottom: () => void }>("panel");

const status = computed(() => {
  if (loadError.value) return "error";
  return messages.value === undefined ? "loading" : "ready";
});

const ERROR_COPY: Record<string, string> = {
  EMPTY_BODY: "Write a message first.",
  BODY_TOO_LONG: `Messages can be up to ${CHAT_MESSAGE_MAX_LENGTH.toLocaleString()} characters.`,
};

function convertToErrorCopy(error: unknown): string {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | undefined)?.code;

    if (typeof code === "string" && code in ERROR_COPY) {
      return ERROR_COPY[code]!;
    }
  }

  return "Couldn't send. Try again.";
}

function scrollToBottom() {
  panel.value?.scrollToBottom();
}

async function submit() {
  if (sending.value) {
    return;
  }

  errorMessage.value = "";

  try {
    await sendMessage({ body: draft.value });
    draft.value = "";
    await nextTick();
    scrollToBottom();
  } catch (error) {
    errorMessage.value = convertToErrorCopy(error);
  }
}

watch(
  () => user.value?._id,
  () => {
    draft.value = "";
    errorMessage.value = "";
  },
);

let scrolledOnFirstLoad = false;

watch(
  messages,
  async (value) => {
    if (scrolledOnFirstLoad || value === undefined) {
      return;
    }

    scrolledOnFirstLoad = true;
    await nextTick();
    scrollToBottom();
  },
  { immediate: true },
);

// Home calls this when the mobile drawer opens (a closed popover has no layout to scroll).
defineExpose({ scrollToBottom });
</script>

<template>
  <ChatPanel
    ref="panel"
    v-model="draft"
    :messages="messages ?? []"
    :status="status"
    :sending="sending"
    :error-message="errorMessage"
    @submit="submit"
  >
    <template #header>
      <slot name="header" />
    </template>
  </ChatPanel>
</template>
