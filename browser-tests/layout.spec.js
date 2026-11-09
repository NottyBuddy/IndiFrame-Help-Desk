const { test, expect } = require("@playwright/test");

const viewports = [
  { width: 320, height: 740 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 480, height: 900 },
  { width: 768, height: 1024 },
  { width: 850, height: 1000 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 }
];

async function boxesDoNotOverlap(first, second) {
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  expect(a, "first element should be visible and measurable").not.toBeNull();
  expect(b, "second element should be visible and measurable").not.toBeNull();
  const horizontal = a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5;
  const vertical = a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
  expect(horizontal && vertical, "interactive/content blocks must not overlap").toBe(false);
}

for (const viewport of viewports) {
  test(`login layout has no horizontal overflow or card collisions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    const loader = page.locator("#indinextLoader");
    await expect(loader).toBeVisible();
    await expect(loader.getByRole("heading", { name: "Help Desk" })).toBeVisible();
    await expect(loader).toHaveAttribute("aria-label", "Loading workspace");
    await expect(loader).toHaveClass(/is-hidden/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator(".login-top-copy")).toHaveCount(0);

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);

    await boxesDoNotOverlap(page.locator(".login-panel"), page.locator(".brand-footer"));
    await boxesDoNotOverlap(page.locator("#employeeId"), page.locator("#password"));
    await boxesDoNotOverlap(page.locator("#password"), page.locator("#loginButton"));
    await boxesDoNotOverlap(page.locator("#loginButton"), page.locator("#message"));
  });
}

test("login starfield stays decorative and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/index.html");
  await expect(page.locator(".star")).toHaveCount(72);
  const animationNames = await page.locator(".star, .orbit-track, .orbit-card").evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node).animationName)
  );
  expect(animationNames.every(name => name === "none")).toBe(true);
  expect(await page.locator(".starfield").evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
});

// Layout smoke tests for every portal screen. JavaScript is disabled intentionally so
// auth/API calls cannot redirect or mutate data; this checks the delivered HTML/CSS only.
const portalPages = [
  "/dashboard.html",
  "/admin-section.html",
  "/superadmin.html",
  "/weekly-data.html",
  "/breaks.html",
  "/call-performance.html",
  "/call-performance-detail.html",
  "/disposition-performance.html",
  "/change-password.html"
];

for (const path of portalPages) {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 }
  ]) {
    test(`${path} has no horizontal overflow at ${viewport.width}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
      }));
      expect(dimensions.document, `${path} document overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.body, `${path} body overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport);
      await context.close();
    });
  }
}
