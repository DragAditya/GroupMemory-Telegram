import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedExternalCron } from "./retention";

const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe("external retention scheduler authorization", () => {
  it("accepts only the matching bearer secret", () => {
    process.env.CRON_SECRET = "test-scheduler-secret";
    expect(isAuthorizedExternalCron("Bearer test-scheduler-secret")).toBe(true);
    expect(isAuthorizedExternalCron("Bearer incorrect-secret")).toBe(false);
    expect(isAuthorizedExternalCron(undefined)).toBe(false);
  });
});
