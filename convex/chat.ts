import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findHouseholdMember, requireHouseholdMember } from "./lib/household_access";
import type { Doc, Id } from "./_generated/dataModel";
import { getChatBodyError } from "../shared/utils/chat-message";

const LATEST_MESSAGE_LIMIT = 50;

const chatMessageValidator = v.object({
  _id: v.id("chatMessages"),
  _creationTime: v.number(),
  senderId: v.id("users"),
  senderName: v.string(),
  body: v.string(),
  isOwn: v.boolean(),
});

function getSenderName(user: Doc<"users">): string {
  const name = user.name?.trim();
  if (name) {
    return name;
  }

  const atIndex = user.email.indexOf("@");
  return atIndex === -1 ? user.email : user.email.slice(0, atIndex);
}

export const list = query({
  args: {},
  returns: v.array(chatMessageValidator),
  handler: async (ctx) => {
    const member = await findHouseholdMember(ctx);

    if (!member) {
      return [];
    }

    const { user, household } = member;
    const householdId = household._id;

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .order("desc")
      .take(LATEST_MESSAGE_LIMIT);

    const senderNames = new Map<Id<"users">, string>();
    const senderIds = [...new Set(messages.map((message) => message.senderId))];

    await Promise.all(
      senderIds.map(async (senderId) => {
        const sender = await ctx.db.get("users", senderId);
        senderNames.set(senderId, sender ? getSenderName(sender) : "Former member");
      }),
    );

    return messages.reverse().map((message) => ({
      _id: message._id,
      _creationTime: message._creationTime,
      senderId: message.senderId,
      senderName: senderNames.get(message.senderId) ?? "Former member",
      body: message.body,
      isOwn: message.senderId === user._id,
    }));
  },
});

export const send = mutation({
  args: { body: v.string() },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    const { user, household } = await requireHouseholdMember(ctx);

    const body = args.body.trim();

    const bodyError = getChatBodyError(body);

    if (bodyError) {
      throw new ConvexError({ code: bodyError });
    }

    return await ctx.db.insert("chatMessages", {
      householdId: household._id,
      senderId: user._id,
      body,
    });
  },
});
