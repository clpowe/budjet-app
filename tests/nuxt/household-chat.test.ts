import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ref, type Ref } from "vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import HouseholdChat from "../../app/components/household-chat.vue";

const state = vi.hoisted(() => ({
  messages: undefined as unknown as Ref<unknown[] | undefined>,
  loadError: undefined as unknown as Ref<Error | null>,
  user: undefined as unknown as Ref<{ _id: string } | null>,
  send: vi.fn(),
}));

mockNuxtImport("useConvexQuery", () => {
  return () => ({
    data: state.messages,
    error: state.loadError,
    isPending: ref(false),
  });
});

// Mirrors convex-vue: isPending is true from call until the mutation settles.
mockNuxtImport("useConvexMutation", () => {
  return () => {
    const isPending = ref(false);

    return {
      mutate: async (args: unknown) => {
        isPending.value = true;
        try {
          return await state.send(args);
        } finally {
          isPending.value = false;
        }
      },
      isPending,
      error: ref(null),
    };
  };
});

mockNuxtImport("useConvexUser", () => {
  return () => ({ user: state.user });
});

function textareaValue(wrapper: ReturnType<typeof mount>) {
  return (wrapper.get("textarea").element as HTMLTextAreaElement).value;
}

async function mountChat() {
  const wrapper = mount(HouseholdChat);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  state.messages = ref([]);
  state.loadError = ref(null);
  state.user = ref({ _id: "user-1" });
  state.send.mockReset();
});

describe("HouseholdChat status", () => {
  it("is loading until the query returns data", async () => {
    state.messages = ref(undefined);

    const wrapper = await mountChat();

    expect(wrapper.text()).toContain("Loading messages…");
    expect(wrapper.find("ol").exists()).toBe(false);
  });

  it("shows the load error when the query fails", async () => {
    state.loadError = ref(new Error("network"));

    const wrapper = await mountChat();

    expect(wrapper.get('[role="alert"]').text()).toBe("Couldn't load messages.");
  });

  it("passes messages through to the panel", async () => {
    state.messages = ref([
      {
        _id: "m1",
        _creationTime: 1,
        senderId: "user-2",
        senderName: "Sam",
        body: "Hi",
        isOwn: false,
      },
    ]);

    const wrapper = await mountChat();

    expect(wrapper.findAll("li.chat-message")).toHaveLength(1);
    expect(wrapper.text()).toContain("Sam");
  });
});

describe("HouseholdChat send lifecycle", () => {
  it("sends the draft and clears it after success", async () => {
    state.send.mockResolvedValue("message-1");
    const wrapper = await mountChat();

    await wrapper.get("textarea").setValue("hello");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(state.send).toHaveBeenCalledWith({ body: "hello" });
    expect(textareaValue(wrapper)).toBe("");
    expect(wrapper.find("form [role='alert']").exists()).toBe(false);
  });

  it("keeps the draft and shows code-specific copy when the server rejects it", async () => {
    state.send.mockRejectedValue(new ConvexError({ code: "BODY_TOO_LONG" }));
    const wrapper = await mountChat();

    await wrapper.get("textarea").setValue("hello");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(textareaValue(wrapper)).toBe("hello");
    expect(wrapper.get("form [role='alert']").text()).toBe(
      "Messages can be up to 2,000 characters.",
    );
  });

  it("falls back to generic copy for unknown failures", async () => {
    state.send.mockRejectedValue(new Error("boom"));
    const wrapper = await mountChat();

    await wrapper.get("textarea").setValue("hello");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(textareaValue(wrapper)).toBe("hello");
    expect(wrapper.get("form [role='alert']").text()).toBe("Couldn't send. Try again.");
  });

  it("clears a previous error once a retry succeeds", async () => {
    state.send.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("message-1");
    const wrapper = await mountChat();

    await wrapper.get("textarea").setValue("hello");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(state.send).toHaveBeenCalledTimes(2);
    expect(wrapper.find("form [role='alert']").exists()).toBe(false);
  });

  it("locks submission while a send is in flight", async () => {
    let resolveSend!: (id: string) => void;
    state.send.mockImplementation(() => new Promise((resolve) => (resolveSend = resolve)));
    const wrapper = await mountChat();

    await wrapper.get("textarea").setValue("hello");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });

    expect(state.send).toHaveBeenCalledTimes(1);
    expect(wrapper.get("textarea").attributes("readonly")).toBeDefined();
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
    expect(wrapper.get("button[type='submit']").text()).toBe("Sending…");

    resolveSend("message-1");
    await flushPromises();

    expect(textareaValue(wrapper)).toBe("");
    expect(wrapper.get("button[type='submit']").text()).toBe("Send");
  });
});

describe("HouseholdChat user change", () => {
  it("resets the draft and error when the signed-in user changes", async () => {
    state.send.mockRejectedValue(new Error("boom"));
    const wrapper = await mountChat();

    await wrapper.get("textarea").setValue("unsent");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find("form [role='alert']").exists()).toBe(true);

    state.user.value = { _id: "user-2" };
    await flushPromises();

    expect(textareaValue(wrapper)).toBe("");
    expect(wrapper.find("form [role='alert']").exists()).toBe(false);
  });
});
