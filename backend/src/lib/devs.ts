/** Whether the account is one of the developers', who are sent the mail from the user page: "reo", unless DEV_USERNAMES (separated by commas) names others. */
export function isDev(username: string): boolean {
  return (process.env.DEV_USERNAMES || "reo")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .includes(username.trim().toLowerCase());
}
