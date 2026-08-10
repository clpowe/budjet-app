import { mutation, query } from "./_generated/server";
import { findUserByIdentity, getAuthenticatedIdentity } from "./lib/helpers";

export const syncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthenticatedIdentity(ctx);

    if (!identity.email) {
      throw new Error("Authenticated account does not have an email address");
    }

    const existingUser = await findUserByIdentity(ctx, identity);

    if (existingUser) {
      if (existingUser.identityKey && existingUser.identityKey !== identity.tokenIdentifier) {
        throw new Error("Existing user is linked to a different identity");
      }

      await ctx.db.patch(existingUser._id, {
        identityKey: identity.tokenIdentifier,
        email: identity.email,
        ...(identity.name !== undefined ? { name: identity.name } : {}),
      });

      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      identityKey: identity.tokenIdentifier,
      email: identity.email,
      ...(identity.name !== undefined ? { name: identity.name } : {}),
      role: "member",
      createdAt: Date.now(),
    });
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    return await findUserByIdentity(ctx, identity);
  },
});
