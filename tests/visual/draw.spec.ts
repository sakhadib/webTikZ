import { test, expect } from "@playwright/test";

test("draw (0,0) -- (1,1) renders without error", async ({ page }) => {
  await page.goto("/playground/index.html");
  const canvas = page.locator("#canvas");
  await expect(canvas).toBeVisible();
  // after auto-render, canvas should have non-zero size
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(10);
  expect(box!.height).toBeGreaterThan(10);
});
