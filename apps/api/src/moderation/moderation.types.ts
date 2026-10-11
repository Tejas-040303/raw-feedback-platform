export type AbuseCategory =
  | 'harassment'     // insults aimed at people
  | 'hate'           // slurs, attacks on protected groups
  | 'threat'         // threats of violence or harm
  | 'personal_info'  // phone numbers, emails, home addresses (doxxing)
  | 'sexual'         // sexual content about real people
  | 'spam';          // ads, links, repeated text

export interface ModerationResult {
  abusive: boolean;
  categories: AbuseCategory[];
  /** Short explanation shown to the user. */
  explanation: string;
  /**
   * A version of the post with the abuse removed but every complaint kept.
   * null when the post can't be salvaged (e.g. it is only a threat).
   */
  suggestedRewrite: string | null;
  /** Which moderator produced this result, for the audit log. */
  provider: string;
}

export interface Moderator {
  moderate(text: string): Promise<ModerationResult>;
}
