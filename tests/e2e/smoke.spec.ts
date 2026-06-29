import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/**
 * Headless smoke tests (PRD §6 core stability) for the walkable third-person world. They verify
 * the world renders, the glass HUD works, the prompt pipeline spawns objects, the player can
 * walk and drive a created car, controls + error handling + persistence work, and the game API
 * is usable by agents. Tests use the LOCAL generator (no network/credits) and a fixed daytime.
 */

const ALLOWED_CONSOLE = [
  /Download the React DevTools/i,
  /WebGL/i,
  /GL Driver/i,
  /ReadPixels/i,
  /Multiple instances of Three/i,
];

function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!ALLOWED_CONSOLE.some((re) => re.test(text))) errors.push(text);
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function boot(page: Page) {
  await page.goto("/");
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => document.body.getAttribute("data-scene-ready") === "true", { timeout: 30_000 });
  // Deterministic, fast & free: local generator + fixed daytime.
  await page.evaluate(() => {
    window.game.setProvider("local");
    window.game.setTimeOfDay(0.45);
    window.game.clear();
  });
  await page.waitForTimeout(1000);
}

test.describe("Project Orbit — walkable world", () => {
  test("renders the world + glass HUD on a non-blank canvas", async ({ page }) => {
    const errors = trackConsole(page);
    await boot(page);

    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);

    await expect(page.getByTestId("world-clock")).toBeVisible();
    await expect(page.getByTestId("prompt-toggle")).toBeVisible();
    await expect(page.getByTestId("dev-toggle")).toBeVisible();
    await expect(page.getByTestId("controls-hint")).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("spawns an object via the prompt box", async ({ page }) => {
    const errors = trackConsole(page);
    await boot(page);

    await page.getByTestId("prompt-toggle").click();
    await page.getByTestId("prompt-input").fill("create a supercar");
    await page.getByTestId("prompt-submit").click();

    await expect(page.getByTestId("prompt-hint")).toContainText(/Spawned/i, { timeout: 5000 });
    const count = await page.evaluate(() => window.game.list().length);
    expect(count).toBeGreaterThanOrEqual(1);

    await page.waitForTimeout(600);
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("game API spawns, lists, configures and describes objects", async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(() => {
      const a = window.game.spawn("create the Taj Mahal");
      const b = window.game.spawn("create a bowling ball");
      const list = window.game.list();
      const ball = list.find((o) => o.id === b.id)!;
      const key = Object.keys(ball.config).find((k) => ball.config[k].type !== "checkbox")!;
      window.game.setConfig(ball.id, key, 2);
      return {
        aOk: a.ok, bOk: b.ok, count: list.length,
        describe: window.game.describe(ball.id),
        newVal: window.game.get(ball.id)?.config[key].value,
      };
    });
    expect(result.aOk).toBe(true);
    expect(result.bOk).toBe(true);
    expect(result.count).toBe(2);
    expect(result.describe).toBeTruthy();
    expect(result.newVal).toBe(2);
  });

  test("selecting an object opens the controls panel with working steppers", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => {
      const r = window.game.spawn("create a supercar");
      window.game.select(r.id!);
      return r.id!;
    });
    expect(id).toBeTruthy();

    await expect(page.getByTestId("controls-panel")).toBeVisible();
    await page.getByTestId("tab-Chassis").click();
    const before = await page.evaluate((oid) => Number(window.game.get(oid)!.config.wheelCount.value), id);
    await page.getByTestId("control-wheelCount-plus5").click();
    const after = await page.evaluate((oid) => Number(window.game.get(oid)!.config.wheelCount.value), id);
    expect(after).toBeGreaterThan(before);

    await page.getByTestId("controls-panel").getByLabel("Close controls").click();
    await expect(page.getByTestId("controls-panel")).toBeHidden();
  });

  test("player can walk with WASD", async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => window.__orbitTest!.playerPos());
    // Hold W (forward) for a bit.
    await page.locator("canvas").click(); // focus
    await page.keyboard.down("w");
    // Hold long enough to register movement even at headless SwiftShader's low frame rate.
    await page.waitForTimeout(2500);
    await page.keyboard.up("w");
    const after = await page.evaluate(() => window.__orbitTest!.playerPos());
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
    expect(moved, `player moved ${moved.toFixed(2)} units`).toBeGreaterThan(1.0);
  });

  test("player can enter and drive a created car", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a sports car").id!);
    await page.waitForTimeout(1600); // let the body drop, register & settle before entering

    // Force-enter via the test hook (bypasses walking to it), then drive forward.
    await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);
    await expect(page.getByTestId("interaction-prompt")).toContainText(/Drive/i);

    const driving = await page.evaluate(() => window.__orbitTest!.drivingId());
    expect(driving).toBe(id);

    const before = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid), id);
    await page.keyboard.down("w");
    // Cars now accelerate gradually (inertia), so hold longer to build up distance.
    await page.waitForTimeout(3000);
    await page.keyboard.up("w");
    const after = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid), id);
    const moved = Math.hypot(after![0] - before![0], after![2] - before![2]);
    expect(moved, `car moved ${moved.toFixed(2)} units`).toBeGreaterThan(1.5);
  });

  test("player can enter and fly a created plane", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create an airplane").id!);
    await page.waitForTimeout(1600);
    // Plane should be flyable per the interaction API.
    const mode = await page.evaluate((vid) => (window.game.describe(vid) as { interaction?: { mode?: string } } | null)?.interaction?.mode, id);
    expect(mode).toBe("fly");

    await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);
    const yBefore = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)![1], id);
    await page.keyboard.down("Space"); // ascend
    await page.waitForTimeout(1500);
    await page.keyboard.up("Space");
    const yAfter = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)![1], id);
    expect(yAfter - yBefore, `plane climbed ${(yAfter - yBefore).toFixed(2)}`).toBeGreaterThan(3);
  });

  test("object explorer lists, hides and removes objects", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.game.spawn("create a crate");
      window.game.spawn("create a tree");
    });
    await page.getByTestId("explorer-toggle").click();
    await expect(page.getByTestId("explorer-panel")).toBeVisible();
    expect(await page.getByTestId("explorer-item").count()).toBe(2);

    // Hide the first object via its eye button → it stays in the registry but is unloaded.
    await page.getByTestId("explorer-item").first().getByTestId("explorer-hide").click();
    const hiddenCount = await page.evaluate(() => Object.values(window.__orbitTest!.state().objects).filter((o) => o.hidden).length);
    expect(hiddenCount).toBe(1);

    // Remove the first object entirely.
    await page.getByTestId("explorer-item").first().getByTestId("explorer-remove").click();
    expect(await page.evaluate(() => window.game.list().length)).toBe(1);
  });

  test("the create bar opens with the / shortcut", async ({ page }) => {
    await boot(page);
    await expect(page.getByTestId("prompt-input")).toBeHidden();
    await page.keyboard.press("/");
    await expect(page.getByTestId("prompt-input")).toBeVisible();
  });

  test("errors light the indicator and open the debug window", async ({ page }) => {
    await boot(page);
    await expect(page.getByTestId("error-indicator")).toBeHidden();
    await page.evaluate(() => window.__orbitTest!.pushLog("simulated object failure", "render"));
    await expect(page.getByTestId("error-indicator")).toBeVisible();
    await expect(page.getByTestId("error-badge")).toContainText("1");
    await page.getByTestId("error-indicator").click();
    await expect(page.getByTestId("debug-window")).toBeVisible();
    await expect(page.getByTestId("debug-entry").first()).toContainText("simulated object failure");
    const logCount = await page.evaluate(() => window.game.getLogs().length);
    expect(logCount).toBeGreaterThanOrEqual(1);
  });

  test("persists and reloads the world", async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
      window.game.spawn("create a tree");
      window.game.spawn("create a crate");
      await window.game.save();
    });
    await page.reload();
    await page.waitForFunction(() => document.body.getAttribute("data-scene-ready") === "true", { timeout: 30_000 });
    const count = await page.evaluate(() => window.game.list().length);
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
