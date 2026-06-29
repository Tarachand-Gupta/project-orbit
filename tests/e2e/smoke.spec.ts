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
  // Deterministic, fast & free: local generator + fixed daytime. Reset transient control state so
  // synthetic key events / driving state from a previous test can't leak into this one.
  await page.evaluate(() => {
    window.__orbitTest?.resetControls();
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
    // Exactly ONE object — a single Create must never produce a duplicate (regression: double-spawn).
    const count = await page.evaluate(() => window.game.list().length);
    expect(count, "one Create = exactly one object").toBe(1);

    await page.waitForTimeout(600);
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("a fast double-click on Create still spawns only one object", async ({ page }) => {
    await boot(page);
    await page.getByTestId("prompt-toggle").click();
    await page.getByTestId("prompt-input").fill("create a monster truck");
    const btn = page.getByTestId("prompt-submit");
    await btn.click();
    await btn.click(); // accidental second click of the same intent
    await page.waitForTimeout(800);
    const count = await page.evaluate(() => window.game.list().length);
    expect(count, "double-click = still one object").toBe(1);
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

  test("the controls panel actually changes how a vehicle drives (top speed)", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a motorbike").id!);
    await page.waitForTimeout(1200);

    // Drive at each top-speed setting from rest and read the controller's actual commanded speed
    // (independent of the low headless frame rate). Same bike, same throttle — only the slider
    // changed. We exit (E) and re-enter between phases so each run accelerates from a standstill.
    const { speedFast, speedSlow } = await page.evaluate(async (vid) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const peakSpeed = async (ms: number) => {
        let peak = 0;
        const end = Date.now() + ms;
        while (Date.now() < end) {
          peak = Math.max(peak, window.__orbitTest!.vehicleSpeed());
          await wait(50);
        }
        return peak;
      };
      const driveAt = async (topSpeed: number) => {
        window.game.setConfig(vid, "topSpeed", topSpeed);
        window.__orbitTest!.enterVehicle(vid);
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
        await wait(2200); // accelerate from rest toward the (new) top speed
        const peak = await peakSpeed(800);
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" })); // exit
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE" }));
        await wait(400);
        return peak;
      };
      const speedFast = await driveAt(300);
      const speedSlow = await driveAt(30);
      return { speedFast, speedSlow };
    }, id);

    // Sanity: it really was moving fast, and lowering the control really slowed it down.
    expect(speedFast, `peak fast speed=${speedFast.toFixed(1)} m/s`).toBeGreaterThan(20);
    expect(speedFast, `fast=${speedFast.toFixed(1)} m/s slow=${speedSlow.toFixed(1)} m/s`).toBeGreaterThan(speedSlow * 1.6);
  });

  test("a car drives stably: accelerates grounded + upright, steers, and reverses", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a supercar").id!);
    await page.waitForTimeout(1500);
    await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);

    // Accelerate forward (real key) and sample throughout: it must move under power, stay near the
    // ground (NEVER launch into the air) and stay upright (NEVER flip onto its side/roof). The
    // no-launch + upright checks are the heart of the bug report and are frame-rate independent;
    // motion thresholds are kept modest because the headless render loop can run slowly.
    const start = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    await page.keyboard.down("w");
    let maxY = -Infinity, minUp = 1, peakSpeed = 0, firstSpeed = 0;
    for (let i = 0; i < 34; i++) {
      await page.waitForTimeout(100);
      const s = await page.evaluate((vid) => ({
        y: window.__orbitTest!.objectPos(vid)![1],
        up: window.__orbitTest!.objectUpY(vid),
        speed: window.__orbitTest!.vehicleSpeed(),
      }), id);
      if (i === 2) firstSpeed = s.speed;
      maxY = Math.max(maxY, s.y); minUp = Math.min(minUp, s.up); peakSpeed = Math.max(peakSpeed, s.speed);
    }
    await page.keyboard.up("w");
    const endPos = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    const moved = Math.hypot(endPos[0] - start[0], endPos[2] - start[2]);

    expect(maxY, `max height ${maxY.toFixed(2)} (no launching)`).toBeLessThan(6); // never launches skyward
    expect(minUp, `min uprightness ${minUp.toFixed(2)}`).toBeGreaterThan(0.5); // never flips
    expect(peakSpeed, `peak speed ${peakSpeed.toFixed(1)}`).toBeGreaterThan(4); // moves under power
    expect(peakSpeed, `accelerated from ${firstSpeed.toFixed(1)} to ${peakSpeed.toFixed(1)}`).toBeGreaterThan(firstSpeed + 1);
    expect(moved, `moved ${moved.toFixed(1)}`).toBeGreaterThan(3);

    // Reverse: holding S sends it backward.
    const before = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    await page.keyboard.down("s");
    await page.waitForTimeout(1500);
    await page.keyboard.up("s");
    const after = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    const reversed = Math.hypot(after[0] - before[0], after[2] - before[2]);
    expect(reversed, `reversed ${reversed.toFixed(1)}`).toBeGreaterThan(2);
  });

  test("steering changes a driving car's heading", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a supercar").id!);
    await page.waitForTimeout(1500);
    await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);

    const headingOver = async (ms: number) => {
      const a = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
      await page.waitForTimeout(ms);
      const b = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
      return Math.atan2(b[0] - a[0], b[2] - a[2]);
    };
    await page.keyboard.down("w");
    await page.waitForTimeout(1200); // build up speed so steering has authority
    const h0 = await headingOver(400);
    await page.keyboard.down("d"); // steer right
    await page.waitForTimeout(2200);
    const h1 = await headingOver(400);
    await page.keyboard.up("w");
    await page.keyboard.up("d");
    let turned = Math.abs(h1 - h0);
    if (turned > Math.PI) turned = 2 * Math.PI - turned;
    expect(turned, `heading changed by ${(turned * 57.3).toFixed(0)}°`).toBeGreaterThan(0.15);
  });

  test("a helicopter flies, and its rotor-speed control gates lift", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a helicopter").id!);
    await page.waitForTimeout(1400);
    const mode = await page.evaluate((vid) => (window.game.describe(vid) as { interaction?: { mode?: string } } | null)?.interaction?.mode, id);
    expect(mode).toBe("fly");

    // Hold ascend (real key) and measure the craft's commanded vertical velocity (signed linvel.y,
    // independent of the headless frame rate). A spinning rotor produces real lift; stopping the
    // rotor mid-air kills the lift (it stops climbing / sinks).
    const peakClimb = (vid: string, ms: number) =>
      page.evaluate(
        async ([id, dur]) => {
          let m = -Infinity;
          const end = Date.now() + (dur as number);
          while (Date.now() < end) {
            m = Math.max(m, window.__orbitTest!.objectVelY(id as string));
            await new Promise((r) => setTimeout(r, 50));
          }
          return m;
        },
        [vid, ms] as const,
      );

    await page.evaluate((vid) => {
      window.__orbitTest!.enterVehicle(vid);
      window.game.setConfig(vid, "rotorSpeed", 2); // rotor spun up
    }, id);
    await page.keyboard.down("Space"); // ascend
    await page.waitForTimeout(500);
    const liftOn = await peakClimb(id, 700);

    await page.evaluate((vid) => window.game.setConfig(vid, "rotorSpeed", 0), id); // stop the rotor
    await page.waitForTimeout(400);
    const liftOff = await peakClimb(id, 700);
    await page.keyboard.up("Space");

    expect(liftOn, `climb rate, rotor spinning = ${liftOn.toFixed(2)}`).toBeGreaterThan(6);
    expect(liftOff, `climb rate, rotor stopped = ${liftOff.toFixed(2)}`).toBeLessThan(2);
  });

  test("a broadly-named vehicle (buggy) is drivable end to end", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a dune buggy").id!);
    await page.waitForTimeout(1400);
    const mode = await page.evaluate((vid) => (window.game.describe(vid) as { interaction?: { mode?: string } } | null)?.interaction?.mode, id);
    expect(mode).toBe("drive");

    // Drive forward and measure the peak speed the chassis actually reaches (frame-rate independent).
    const peakSpeed = await page.evaluate(async (vid) => {
      window.__orbitTest!.enterVehicle(vid);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      let m = 0;
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        m = Math.max(m, window.__orbitTest!.objectSpeed(vid));
        await new Promise((r) => setTimeout(r, 50));
      }
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
      return m;
    }, id);
    expect(peakSpeed, `buggy reached ${peakSpeed.toFixed(2)} m/s`).toBeGreaterThan(2);
  });
});
