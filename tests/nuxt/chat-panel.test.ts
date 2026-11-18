import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import ChatPanel from "../../app/components/chat/panel.vue";

type PanelMessage = {
  _id: string;
  _creationTime: number;
  senderName: string;
  body: string;
  isOwn: boolean;
};

function makeMessage(id: string, overrides: Partial<PanelMessage> = {}): PanelMessage {
  return {
    _id: id,
    _creationTime: Date.UTC(2026, 10, 15, 12, 0),
    senderName: "Sam",
    body: `Message ${id}`,
    isOwn: false,
    ...overrides,
  };
}

function mountPanel({ messages = [] as PanelMessage[], draft = "" } = {}) {
  const wrapper = mount(ChatPanel, {
    props: {
      messages,
      status: "ready",
      sending: false,
      modelValue: draft,
      "onUpdate:modelValue": (value: string) => wrapper.setProps({ modelValue: value }),
    },
  });

  return wrapper;
}

describe("ChatPanel states", () => {
  it("shows an empty state when there are no messages", () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("No messages yet.");
    expect(wrapper.text()).toContain("Latest 50 messages");
  });

  it("renders messages in order and marks the current user's own messages", () => {
    const wrapper = mountPanel({
      messages: [
        makeMessage("m1", { senderName: "Alex", body: "Hi", isOwn: true }),
        makeMessage("m2", { senderName: "Sam", body: "Line one\nLine two" }),
      ],
    });

    const rows = wrapper.findAll("li.chat-message");

    expect(rows).toHaveLength(2);
    expect(rows[0]!.classes()).toContain("is-own");
    expect(rows[0]!.text()).toContain("Alex");
    expect(rows[1]!.classes()).not.toContain("is-own");
    expect(rows[1]!.get(".chat-message-body").element.textContent).toBe("Line one\nLine two");
    expect(rows[1]!.get("time").attributes("datetime")).toBe("2026-11-15T12:00:00.000Z");
  });

  it("renders message bodies as text, not HTML", () => {
    const wrapper = mountPanel({ messages: [makeMessage("m1", { body: "<b>bold</b>" })] });

    expect(wrapper.find(".chat-message-body b").exists()).toBe(false);
    expect(wrapper.get(".chat-message-body").text()).toBe("<b>bold</b>");
  });
});

describe("ChatPanel composer", () => {
  it("submits on Enter and prevents the newline", async () => {
    const wrapper = mountPanel({ draft: "hello" });
    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });

    wrapper.get("textarea").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("submit")).toHaveLength(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not submit on Shift+Enter", async () => {
    const wrapper = mountPanel({ draft: "hello" });

    await wrapper.get("textarea").trigger("keydown", { key: "Enter", shiftKey: true });

    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("does not submit on Enter while an IME composition is active", async () => {
    const wrapper = mountPanel({ draft: "hello" });
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      cancelable: true,
    });

    wrapper.get("textarea").element.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it("disables Send for an empty or whitespace-only draft", async () => {
    const wrapper = mountPanel({ draft: "" });
    const button = wrapper.get("button[type='submit']");

    expect(button.attributes("disabled")).toBeDefined();

    await wrapper.get("textarea").setValue("   \n ");
    expect(button.attributes("disabled")).toBeDefined();

    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();

    await wrapper.get("textarea").setValue("hi");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("flags drafts over 2,000 characters and blocks sending", () => {
    const wrapper = mountPanel({ draft: "a".repeat(2_001) });

    expect(wrapper.text()).toContain("Too long: 2,001 / 2,000 characters.");
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
  });

  it("allows exactly 2,000 characters", () => {
    const wrapper = mountPanel({ draft: "a".repeat(2_000) });

    expect(wrapper.text()).not.toContain("Too long");
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeUndefined();
  });
});
