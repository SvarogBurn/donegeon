/** The repo's commits as the app was built, newest first (the git-log plugin in vite.config.ts). */
declare module "virtual:git-log" {
  const commits: { hash: string; date: string; subject: string }[];
  export default commits;
}
