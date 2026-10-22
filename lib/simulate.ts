/** SIMULATE_FAIL=gemini,email makes those steps fail on purpose, to prove the run survives. */
export const simulate = (what: "gemini" | "email") => (process.env.SIMULATE_FAIL ?? "").split(",").map((s) => s.trim()).includes(what);
