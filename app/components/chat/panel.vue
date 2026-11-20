<script setup lang="ts">
export type ChatPanelMessage = {
  _id: string;
  _creationTime: number;
  senderName: string;
  body: string;
  isOwn: boolean;
};

const props = defineProps<{
  messages: ChatPanelMessage[];
  status: "loading" | "ready" | "error";
  sending: boolean;
  errorMessage?: string;
}>();

const draft = defineModel<string>({ required: true });

const emit = defineEmits<{
  submit: [];
}>();

const id = useId();
const textareaId = `${id}-draft`;
const hintId = `${id}-hint`;
const errorId = `${id}-error`;

const bodyError = computed(() => getChatBodyError(draft.value.trim()));
const canSend = computed(() => !props.sending && bodyError.value === null);

const messageTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatMessageTime(timestamp: number) {
  return messageTimeFormat.format(new Date(timestamp));
}

function submit() {
  if (!canSend.value) {
    return;
  }

  emit("submit");
}

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  submit();
}

useTextareaAutosize({
  element: useTemplateRef<HTMLTextAreaElement>("composer"),
  input: draft,
  maxHeight: 160,
});

const scroller = useTemplateRef<HTMLElement>("scroller");

function scrollToBottom() {
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
}

// Keep the newest message in view when the list's box shrinks (composer autosize, drawer open)
// but only if the reader was already at the bottom.
const { arrivedState } = useScroll(scroller);

useResizeObserver(scroller, () => {
  if (arrivedState.bottom) {
    scrollToBottom();
  }
});

defineExpose({ scrollToBottom });
</script>

<template>
  <section class="chat-panel" :aria-labelledby="`${id}-title`">
    <header class="chat-panel-header">
      <h2 :id="`${id}-title`">Household chat</h2>
      <slot name="header" />
    </header>

    <p class="chat-panel-window">Latest 50 messages</p>

    <div ref="scroller" class="chat-panel-messages" tabindex="0" aria-label="Messages">
      <p v-if="status === 'loading'">Loading messages…</p>
      <p v-else-if="status === 'error'" role="alert">Couldn't load messages.</p>
      <p v-else-if="messages.length === 0">No messages yet.</p>

      <ol v-else class="chat-message-list">
        <li
          v-for="message in messages"
          :key="message._id"
          class="chat-message"
          :class="{ 'is-own': message.isOwn }"
        >
          <p class="chat-message-meta">
            <span>{{ message.senderName }}</span>
            <time :datetime="new Date(message._creationTime).toISOString()">
              {{ formatMessageTime(message._creationTime) }}
            </time>
          </p>
          <p class="chat-message-body">{{ message.body }}</p>
        </li>
      </ol>
    </div>

    <form class="chat-panel-composer" novalidate @submit.prevent="submit">
      <label :for="textareaId">Message</label>
      <textarea
        :id="textareaId"
        ref="composer"
        v-model="draft"
        rows="2"
        :readonly="sending"
        :aria-describedby="
          [bodyError === 'BODY_TOO_LONG' ? hintId : '', errorMessage ? errorId : '']
            .filter(Boolean)
            .join(' ') || undefined
        "
        @keydown.enter="onEnter"
      />

      <p v-if="bodyError === 'BODY_TOO_LONG'" :id="hintId">
        Too long: {{ draft.trim().length.toLocaleString() }} /
        {{ CHAT_MESSAGE_MAX_LENGTH.toLocaleString() }} characters.
      </p>
      <p v-if="errorMessage" :id="errorId" role="alert">{{ errorMessage }}</p>

      <button type="submit" :disabled="!canSend">{{ sending ? "Sending…" : "Send" }}</button>
    </form>
  </section>
</template>

<style scoped>
/* Fills its container: header and composer stay put, only the message list scrolls. */
.chat-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 0.5rem;
  height: 100%;
  min-height: 0;
}

.chat-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.chat-panel-window {
  font-size: 0.8125rem;
}

.chat-panel-messages {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.chat-message-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-message {
  justify-self: start;
  max-width: 85%;
  padding: 0.5rem 0.75rem;
  border: 1px solid;
  border-radius: 0.5rem;

  &.is-own {
    justify-self: end;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
}

.chat-message-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.chat-message-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat-panel-composer {
  display: grid;
  gap: 0.5rem;

  textarea {
    min-height: 0;
    resize: none;
  }

  button {
    justify-self: end;
  }
}
</style>
