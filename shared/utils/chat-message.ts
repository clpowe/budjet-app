export const CHAT_MESSAGE_MAX_LENGTH = 2_000;

export type ChatBodyError = "EMPTY_BODY" | "BODY_TOO_LONG";

export function getChatBodyError(trimmedBody: string): ChatBodyError | null {
  if (trimmedBody.length === 0) {
    return "EMPTY_BODY";
  }

  if (trimmedBody.length > CHAT_MESSAGE_MAX_LENGTH) {
    return "BODY_TOO_LONG";
  }

  return null;
}
