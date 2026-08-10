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
  // Every e2e page is a "first launch" — pre-mark the welcome guide as seen so it doesn't
  // overlay the HUD (the guide has its own dedicated test below).
  await page.addInitScript(() => localStorage.setItem("orbit.welcomed", "1"));
  await page.goto("/play"); // "/" is the public landing page; the game lives at /play
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

    // The player must rest ON the ground, not fall through it (regression: on the big world the
    // terrain trimesh collider takes a moment to build, so the capsule must be caught at the surface).
    const feetY = await page.evaluate(() => window.__orbitTest!.playerPos()[1]);
    const groundY = await page.evaluate(() => window.__orbitTest!.terrainHeightAt(0, 0));
    expect(feetY - groundY, `player feet ${(feetY - groundY).toFixed(2)} above ground`).toBeGreaterThan(-1.5);
    expect(feetY - groundY, `player feet ${(feetY - groundY).toFixed(2)} above ground`).toBeLessThan(6);

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("first launch shows the welcome guide once; ? reopens it", async ({ page }) => {
    // Fresh browser context, NO pre-seeded flag: the guide must greet the first visit.
    await page.goto("/play");
    await expect(page.getByTestId("welcome-guide")).toBeVisible({ timeout: 30_000 });

    // Page through to the end and start playing.
    while (await page.getByTestId("welcome-next").isVisible()) {
      await page.getByTestId("welcome-next").click();
    }
    await page.getByTestId("welcome-start").click();
    await expect(page.getByTestId("welcome-guide")).not.toBeVisible();

    // Second launch: no greeting.
    await page.reload();
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await expect(page.getByTestId("welcome-guide")).not.toBeVisible();

    // But the ? button brings the guide back on demand.
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("welcome-guide")).toBeVisible();
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

  test("typeahead: typing a known object shows a suggestion that spawns it instantly", async ({ page }) => {
    await boot(page);
    await page.getByTestId("prompt-toggle").click();
    await page.getByTestId("prompt-input").fill("heli");

    // A known-template chip appears while typing; clicking it spawns exactly one object, instantly.
    await page.getByTestId("prompt-suggestion-helicopter").click();
    await expect(page.getByTestId("prompt-hint")).toContainText(/Spawned/i, { timeout: 5000 });
    const list = await page.evaluate(() => window.game.list().map((o) => o.label));
    expect(list, "suggestion pick = exactly one object").toHaveLength(1);
    expect(list[0].toLowerCase()).toContain("helicopter");
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

  test("refine iterates on the selected object in place (no duplicate)", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => {
      const r = window.game.spawn("create a supercar");
      window.game.select(r.id!);
      return r.id!;
    });

    // The refine bar is present; with the offline provider it steers the user to an AI provider.
    await expect(page.getByTestId("refine-input")).toBeVisible();
    await expect(page.getByTestId("refine-input")).toHaveAttribute("placeholder", /AI provider/i);

    const before = await page.evaluate(
      (oid) => ({ parts: window.game.get(oid)!.parts.length, label: window.game.get(oid)!.label }),
      id,
    );

    // Switch to a cloud provider and mock the model: it answers with a distinct 2-part spec.
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spec: {
            id: "x",
            label: "Mock",
            type: "vehicle",
            parts: [
              { primitive: "box", size: [2, 1, 4], position: [0, 0.5, 0], material: "paint_blue" },
              { primitive: "box", size: [1.4, 0.7, 2], position: [0, 1.2, 0], material: "glass" },
            ],
            physics: { mass: 12, friction: 0.6, restitution: 0.15, flammable: false },
            config: {},
            prompt: "x",
          },
          provider: "gemini",
          model: "mock",
          ms: 5,
        }),
      }),
    );
    await page.evaluate(() => window.game.setProvider("gemini"));

    await page.getByTestId("refine-input").fill("make it a blue sports car");
    await page.getByTestId("refine-submit").click();

    // The SAME object is edited in place: parts change, identity is preserved, nothing duplicated.
    await page.waitForFunction((oid) => window.game.get(oid)?.parts.length === 2, id, { timeout: 15_000 });
    const after = await page.evaluate(
      (oid) => ({
        parts: window.game.get(oid)!.parts.length,
        label: window.game.get(oid)!.label,
        material: window.game.get(oid)!.parts[0].material,
        count: window.game.list().length,
      }),
      id,
    );
    expect(before.parts).toBeGreaterThan(2);
    expect(after.parts).toBe(2);
    expect(after.material).toBe("paint_blue");
    expect(after.label).toBe(before.label); // identity preserved — an edit, not a new object
    expect(after.count).toBe(1); // no duplicate spawned
  });

  test("the player is blocked by a solid object (no clipping through) @motion", async ({ page }) => {
    await boot(page);
    // A big solid house drops directly in front of the player.
    const house = await page.evaluate(() => {
      const r = window.game.spawn("create a house");
      const o = window.game.list().find((x) => x.id === r.id)!;
      return { pos: o.position };
    });
    await page.waitForTimeout(1200);
    const startDist = await page.evaluate((h) => {
      const p = window.__orbitTest!.playerPos();
      return Math.hypot(h.pos[0] - p[0], h.pos[2] - p[2]);
    }, house);

    // Walk straight at it, sampling the closest approach to the house centre.
    await page.locator("canvas").click();
    await page.keyboard.down("w");
    let minDist = Infinity;
    for (let i = 0; i < 32; i++) {
      await page.waitForTimeout(120);
      const d = await page.evaluate((h) => {
        const p = window.__orbitTest!.playerPos();
        return Math.hypot(h.pos[0] - p[0], h.pos[2] - p[2]);
      }, house);
      minDist = Math.min(minDist, d);
    }
    await page.keyboard.up("w");

    // The player approached the house (got closer than it started)…
    expect(minDist, `approached to ${minDist.toFixed(1)} from ${startDist.toFixed(1)}`).toBeLessThan(startDist - 1);
    // …but the wall stopped it: it never reached the interior (no clipping through the solid house).
    expect(minDist, `closest approach ${minDist.toFixed(1)} (wall blocks entry)`).toBeGreaterThan(1.8);
  });

  test("a flown helicopter cannot sink below the solid ground @motion", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a helicopter").id!);
    await page.waitForTimeout(1400);
    await page.evaluate((vid) => {
      window.__orbitTest!.enterVehicle(vid);
      window.game.setConfig(vid, "rotorSpeed", 2);
    }, id);
    // Hold descend (Shift) for a while: the craft must keep getting snapped back to the surface and
    // can NEVER tunnel down through the solid land (terrain hills here are ~18 tall, so the floor
    // clamp keeping it within a couple of units proves it never passes through — at most a transient
    // sub-step dip at the headless frame rate, which is immediately corrected).
    await page.keyboard.down("Shift");
    let worstPenetration = 0;
    let lastBelow = 0;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(120);
      lastBelow = await page.evaluate((vid) => {
        const p = window.__orbitTest!.objectPos(vid)!;
        return window.__orbitTest!.terrainHeightAt(p[0], p[2]) - p[1]; // +ve = below the ground
      }, id);
      worstPenetration = Math.max(worstPenetration, lastBelow);
    }
    await page.keyboard.up("Shift");
    // It never sinks deep into the terrain (no tunnelling), and the clamp holds it at the surface.
    expect(worstPenetration, `deepest below-ground = ${worstPenetration.toFixed(2)}`).toBeLessThan(3);
    expect(lastBelow, `settled below-ground = ${lastBelow.toFixed(2)}`).toBeLessThan(1.2);
  });

  test("player can walk with WASD @motion", async ({ page }) => {
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

  test("player can enter and drive a created car @motion", async ({ page }) => {
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

  test("player can enter and fly a created plane @motion", async ({ page }) => {
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

  test("provider settings: pick a provider, edit base URL, choose a model", async ({ page }) => {
    await boot(page);
    await page.getByTestId("prompt-toggle").click();
    await page.getByTestId("prompt-settings-toggle").click();

    const providerSelect = page.getByTestId("prompt-provider");
    await expect(providerSelect).toBeVisible();
    // The registry's top-10 BYO-key providers are all selectable.
    for (const id of ["openai", "anthropic", "gemini", "groq", "openrouter", "xai", "nvidia", "mistral", "deepseek", "custom"]) {
      await expect(providerSelect.locator(`option[value="${id}"]`)).toHaveCount(1);
    }

    // Selecting OpenAI reveals a prefilled base URL, a key field, and a model picker.
    await providerSelect.selectOption("openai");
    await expect(page.getByTestId("prompt-baseurl")).toHaveValue("https://api.openai.com/v1");
    await expect(page.getByTestId("prompt-apikey")).toBeVisible();
    await expect(page.getByTestId("prompt-model")).toBeVisible();
    // The model choice persists to the store and is used by the generation request.
    await page.getByTestId("prompt-model").fill("gpt-4o");
    const model = await page.evaluate(() => window.__orbitTest!.state().models.openai);
    expect(model).toBe("gpt-4o");
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

  test("the controls panel actually changes how a vehicle drives (top speed) @motion", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a motorbike").id!);
    await page.waitForTimeout(1400);
    // Drive at each top-speed setting from REST (exit + re-enter resets speed, avoiding slow
    // deceleration at the headless frame rate) and read the controller's actual commanded peak
    // speed. The bike circles (W+D) so it stays in the clear flat spawn area. Only the slider changes.
    const peakAt = async (topSpeed: number) => {
      await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);
      await page.evaluate((args) => window.game.setConfig(args.id, "topSpeed", args.ts), { id, ts: topSpeed });
      await page.keyboard.down("w");
      await page.keyboard.down("d");
      await page.waitForTimeout(2600); // accelerate from rest to this top speed
      const peak = await page.evaluate(async () => {
        let m = 0;
        const end = Date.now() + 1000;
        while (Date.now() < end) {
          m = Math.max(m, window.__orbitTest!.vehicleSpeed());
          await new Promise((r) => setTimeout(r, 50));
        }
        return m;
      });
      await page.keyboard.up("w");
      await page.keyboard.up("d");
      await page.evaluate(() => window.__orbitTest!.exitVehicle());
      await page.waitForTimeout(300);
      return peak;
    };

    const speedFast = await peakAt(300);
    const speedSlow = await peakAt(20);

    expect(speedFast, `peak fast speed=${speedFast.toFixed(1)} m/s`).toBeGreaterThan(20);
    expect(speedFast, `fast=${speedFast.toFixed(1)} m/s slow=${speedSlow.toFixed(1)} m/s`).toBeGreaterThan(speedSlow * 1.6);
  });

  test("a car drives stably: accelerates grounded + upright, steers, and reverses @motion", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a supercar").id!);
    await page.waitForTimeout(1500);
    await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);

    // Accelerate forward (real key) and sample throughout: it must move under power, stay near the
    // ground (NEVER launch into the air) and stay upright (NEVER flip onto its side/roof). The
    // no-launch + upright checks are the heart of the bug report and are frame-rate independent;
    // motion thresholds are kept modest because the headless render loop can run slowly.
    // Reverse FIRST from the open spawn area (before any forward run could wedge it on a building).
    await page.locator("canvas").click();
    const revBefore = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    await page.keyboard.down("s");
    await page.waitForTimeout(3200); // generous: the headless loop can be slow to warm up after entering
    await page.keyboard.up("s");
    const revAfter = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    const reversed = Math.hypot(revAfter[0] - revBefore[0], revAfter[2] - revBefore[2]);
    expect(reversed, `reversed ${reversed.toFixed(1)}`).toBeGreaterThan(2);
    await page.waitForTimeout(300);

    const start = await page.evaluate((vid) => window.__orbitTest!.objectPos(vid)!, id);
    await page.keyboard.down("w");
    let maxY = -Infinity, minUp = 1, peakSpeed = 0, firstSpeed = 0;
    for (let i = 0; i < 18; i++) {
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
    expect(moved, `moved ${moved.toFixed(1)}`).toBeGreaterThan(2);
  });

  test("steering changes a driving car's heading @motion", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => window.game.spawn("create a supercar").id!);
    await page.waitForTimeout(1500);
    await page.evaluate((vid) => window.__orbitTest!.enterVehicle(vid), id);

    // Read the craft's actual heading (yaw) — frame-rate independent — before vs after steering.
    await page.keyboard.down("w");
    await page.waitForTimeout(1000); // build up speed so steering has authority
    const h0 = await page.evaluate(() => window.__orbitTest!.vehicleHeading());
    await page.keyboard.down("d"); // steer right
    await page.waitForTimeout(2200);
    const h1 = await page.evaluate(() => window.__orbitTest!.vehicleHeading());
    await page.keyboard.up("w");
    await page.keyboard.up("d");
    let turned = Math.abs(h1 - h0);
    if (turned > Math.PI) turned = 2 * Math.PI - turned;
    expect(turned, `heading changed by ${(turned * 57.3).toFixed(0)}°`).toBeGreaterThan(0.15);
  });

  test("a helicopter flies, and its rotor-speed control gates lift @motion", async ({ page }) => {
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

  test("a broadly-named vehicle (buggy) is drivable end to end @motion", async ({ page }) => {
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

  test("a spawned gun is wieldable and fires to knock a target back @motion", async ({ page }) => {
    await boot(page);
    // A light crate target sits in front of the player; a gun is spawned to wield.
    const ids = await page.evaluate(() => {
      const crate = window.game.spawn("create a crate");
      const gun = window.game.spawn("create a pistol");
      return { crate: crate.id!, gun: gun.id! };
    });
    // The gun must be recognised as a wieldable weapon.
    const mode = await page.evaluate((g) => (window.game.describe(g) as { interaction?: { mode?: string } } | null)?.interaction?.mode, ids.gun);
    expect(mode).toBe("wield");

    await page.waitForTimeout(1600); // let the crate drop & settle
    // Stand a few metres from the crate, face it, and equip the gun.
    const before = await page.evaluate((c) => window.__orbitTest!.objectPos(c)!, ids.crate);
    await page.evaluate((d) => {
      const c = window.__orbitTest!.objectPos(d.crate)!;
      // place the player ~5u toward -Z of the crate, looking at it (+Z)
      window.__orbitTest!.teleport(c[0], c[2] - 5, 0);
      window.__orbitTest!.equipWeapon(d.gun);
    }, ids);
    await page.waitForTimeout(700); // let the camera settle behind the player

    // Fire several shots at the crate and measure its peak speed (impulse on impact).
    const peak = await page.evaluate(async (c) => {
      let m = 0;
      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyF" }));
        await new Promise((r) => setTimeout(r, 120));
        m = Math.max(m, window.__orbitTest!.objectSpeed(c));
      }
      return m;
    }, ids.crate);
    const after = await page.evaluate((c) => window.__orbitTest!.objectPos(c)!, ids.crate);
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);

    // The crate was struck: it picked up speed and was shoved from where it sat.
    expect(peak, `crate peak speed after fire = ${peak.toFixed(2)}`).toBeGreaterThan(1);
    expect(moved, `crate shoved ${moved.toFixed(2)}`).toBeGreaterThan(0.5);
  });
});
