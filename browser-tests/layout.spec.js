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
  test(`transparent login has no horizontal overflow or card collisions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#indinextLoader")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /MOVE WITH PURPOSE/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Good to see you." })).toBeVisible();
    await expect(page.locator(".brand-footer-tagline")).toHaveText("Crafted to Fit. Installed to Last.");
    await expect(page.locator(".night-scene")).toBeAttached();
    await expect(page.locator(".night-scene")).toBeHidden();
    await expect(page.locator('link[rel="stylesheet"][href*="sitewide-transparent.css"]')).toHaveCount(1);
    await expect(page.locator(".site-background-video")).toBeAttached();
    await expect(page.locator(".site-background-video source")).toHaveAttribute("src", "/Anime-bg.mp4");
    await expect(page.locator(".vehicle-car")).toBeHidden();
    await expect(page.locator(".vehicle-bike")).toBeHidden();
  await expect(page.locator(".night-scene")).toBeHidden();
    await expect(page.locator("#employeeId")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#loginButton")).toBeVisible();
    await expect(page.locator(".indinext-intro, .space-backdrop, .solar-scene, .starfield, .star, .indinext-hole")).toHaveCount(0);

    const dimensions = await page.evaluate(() => {
      const body = document.body;
      const offenders = [...body.querySelectorAll("*")].map(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          className: typeof node.className === "string" ? node.className : "",
          id: node.id || "",
          x: Math.round(rect.x * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          position: style.position,
          transform: style.transform,
          overflowX: style.overflowX
        };
      }).filter(item => item.right > window.innerWidth + 1 || item.x < -1)
        .sort((a, b) => b.right - a.right).slice(0, 15);
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: body.scrollWidth,
        bodyClient: body.clientWidth,
        bodyRect: body.getBoundingClientRect().toJSON(),
        bodyPadding: getComputedStyle(body).padding,
        offenders
      };
    });
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);

    await boxesDoNotOverlap(page.locator(".login-panel"), page.locator(".brand-footer"));
    await boxesDoNotOverlap(page.locator("#employeeId"), page.locator("#password"));
    await boxesDoNotOverlap(page.locator("#password"), page.locator("#loginButton"));
    await boxesDoNotOverlap(page.locator("#loginButton"), page.locator("#message"));
  });
}

test("site-wide visual reset removes login backgrounds and motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/index.html");
  await expect(page.locator(".vehicle-car")).toBeHidden();
  await expect(page.locator(".vehicle-bike")).toBeHidden();
  const animationNames = await page.locator(".light-streak, .lane, .night-brand, .night-login-panel").evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node).animationName)
  );
  expect(animationNames.every(name => name === "none")).toBe(true);
  expect(await page.locator(".night-scene").evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
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


test("all portal pages load their local CSS, JavaScript and image assets", async ({ request, baseURL }) => {
  for (const path of portalPages) {
    const pageUrl = new URL(path, baseURL).toString();
    const pageResponse = await request.get(pageUrl);
    expect(pageResponse.status(), `Portal page ${path} should load`).toBe(200);
    const html = await pageResponse.text();
    const references = [...html.matchAll(/<(?:link|script|img|source)\\b[^>]*?(?:href|src)=["']([^"']+)["'][^>]*>/gi)]
      .map(match => match[1]);
    const assets = [...new Set(references.map(reference => new URL(reference, pageUrl))
      .filter(url => url.origin === new URL(baseURL).origin)
      .map(url => url.toString()))];
    for (const asset of assets) {
      const response = await request.get(asset);
      expect(response.status(), `Broken local asset ${asset} referenced by ${path}`).toBe(200);
    }
  }
});

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
      const visualTheme = await page.evaluate(() => {
        const body = document.body;
        const workspaceStylesheet = [...document.styleSheets].some(sheet =>
          sheet.href && new URL(sheet.href).pathname.endsWith("/workspace-night-drive.css")
        );
        const transparentStylesheet = [...document.styleSheets].some(sheet =>
          sheet.href && new URL(sheet.href).pathname.endsWith("/workspace-transparent.css")
        );
        const sitewideLink = document.querySelector('link[rel="stylesheet"][href*="sitewide-transparent.css"]');
        const sitewideStylesheet = Boolean(sitewideLink);
        const stylesAfterOverride = sitewideLink
          ? [...document.querySelectorAll("style,link[rel='stylesheet']")].filter(element =>
              element !== sitewideLink &&
              Boolean(sitewideLink.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
            )
          : [];
        const sitewideLast = Boolean(sitewideLink && stylesAfterOverride.length === 0);
        const backgroundVideo = document.querySelector(".site-background-video source");
        return {
          workspaceStylesheet,
          transparentStylesheet,
          sitewideStylesheet,
          sitewideLast,
          backgroundVideo: backgroundVideo?.getAttribute("src"),
          backgroundImage: getComputedStyle(body).backgroundImage,
          backgroundColor: getComputedStyle(body).backgroundColor,
          roadOverlay: getComputedStyle(body, "::before").content !== "none",
          roadSurface: getComputedStyle(body, "::after").content !== "none",
          solarBackground: document.querySelector(".indinext-solar-bg")
            ? getComputedStyle(document.querySelector(".indinext-solar-bg")).display
            : "none"
        };
      });
      expect(visualTheme.workspaceStylesheet, `${path} must load the shared workspace stylesheet`).toBe(true);
      expect(visualTheme.sitewideStylesheet, `${path} must include the strict site-wide reset`).toBe(true);
      expect(visualTheme.sitewideLast, `${path} must place the shared reset after all linked styles`).toBe(true);
      expect(visualTheme.backgroundVideo, `${path} must use the shared MP4 background`).toBe("/Anime-bg.mp4");
      if (["/dashboard.html", "/admin-section.html", "/superadmin.html"].includes(path)) {
        expect(visualTheme.transparentStylesheet, `${path} must load the transparent workspace override`).toBe(true);
        expect(visualTheme.backgroundImage).toBe("none");
        expect(visualTheme.roadOverlay).toBe(false);
        expect(visualTheme.roadSurface).toBe(false);
      } else {
        expect(visualTheme.backgroundImage).toBe("none");
        expect(visualTheme.roadOverlay).toBe(false);
        expect(visualTheme.roadSurface).toBe(false);
      }
      expect(visualTheme.solarBackground).toBe("none");
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
