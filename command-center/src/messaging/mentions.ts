const MENTION_PATTERN = /@([a-zA-Z0-9._-]+)/g;

/** Extracts @mentions as raw handles (lowercased, deduplicated) - not resolved against a real
 * Workspace directory, since none exists in this system yet. A mention of "@jonathan" is stored
 * as the literal string "jonathan"; matching that back to a real person's inbox/notification is
 * follow-up work once a directory (or just the Command Center's own known-user list) exists. */
export function parseMentions(body: string): string[] {
  const mentions = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    mentions.add(match[1]!.toLowerCase());
  }
  return [...mentions];
}
