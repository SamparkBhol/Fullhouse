export interface AiLike {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  VENUE: DurableObjectNamespace;
  METER: DurableObjectNamespace;
  ASSETS?: Fetcher;
  AI?: AiLike;
  AI_MODEL?: string;
  QLOO_API_KEY?: string;
  QLOO_BASE_URL?: string;
  QLOO_DAILY_BUDGET?: string;
  TOKEN_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  EXTRA_ORIGINS?: string;
}

export const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export function modelOf(env: Env): string {
  return env.AI_MODEL && env.AI_MODEL.trim() ? env.AI_MODEL.trim() : DEFAULT_MODEL;
}

export function dailyBudgetOf(env: Env): number {
  const n = Number.parseInt(env.QLOO_DAILY_BUDGET ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

// There is no default sender: owner email stays off until both the key and a verified sender are set.
export function resendOf(env: Env): { key: string; from: string } | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  return key && from ? { key, from } : null;
}
