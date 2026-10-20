/**
 * Whether the account is one of the developers', who are sent the mail from the user page: the usernames in
 * DEV_USERNAMES, separated by commas. Unset, nobody is: the inbox is never open by default on a new deploy.
 */
export function isDev(username: string): boolean {
  return (process.env.DEV_USERNAMES ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .includes(username.trim().toLowerCase());
}
