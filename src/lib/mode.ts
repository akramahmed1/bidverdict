// Hosted serverless demos cannot persist files and must never spend credits: replay only.
export const getHostedMode = () => Boolean(process.env.VERCEL) || process.env.BIDVERDICT_REPLAY_ONLY === "1";
