function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run the specs through npm run e2e.`);
  return value;
}

export const BASE_URL = required("E2E_BASE_URL");
export const FAKE_QLOO_URL = required("FAKE_QLOO_URL");
export const QLOO_HOSTS = [new URL(FAKE_QLOO_URL).host, "hackathon.api.qloo.com"];
