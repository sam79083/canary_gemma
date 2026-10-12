import { expect, test, type Page } from "@playwright/test";

// Helper: skip onboarding (any language), open the tutor, ensure a placed
// level (clicks the bare "A1" CEFR button when the level gate shows —
// locale-independent), then yields the tutor dialog on the Quiz tab.
async function openPlacedTutor(page: Page) {
  await page.goto("/");
  const skip = page.locator("#onboard-overlay").getByRole("button", { name: /skip/i });
  if (await skip.isVisible({ timeout: 8000 }).catch(() => false)) {
    await skip.click();
  }
  await page.keyboard.press("Control+j");
  const dialog = page.getByRole("dialog", { name: /english tutor/i });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  // Brand-new profile lands on the level gate: place A1 to reach the quiz.
  if (!(await dialog.getByTestId("quiz-prompt").isVisible({ timeout: 4000 }).catch(() => false))) {
    await dialog.getByRole("button", { name: "A1", exact: true }).first().click();
    await expect(dialog.getByTestId("quiz-prompt")).toBeVisible({ timeout: 8000 });
  }
  return dialog;
}

// Answer whatever the current question is (choice or fill), then Next.
async function answerCurrent(dialog: Awaited<ReturnType<typeof openPlacedTutor>>) {
  if ((await dialog.getByTestId("quiz-choice").count()) > 0) {
    await dialog.getByTestId("quiz-choice").first().click();
  } else {
    await dialog.getByTestId("quiz-fill").fill("test");
    await dialog.getByTestId("quiz-check").click();
  }
  await dialog.getByTestId("quiz-next").click();
}

// First Valor: open → answer Q1 → Q2 shows (loop advances, no AI needed).
test("learn loop: tutor opens, Q1 answered, Q2 appears", async ({ page }) => {
  const dialog = await openPlacedTutor(page);
  const prompt = dialog.getByTestId("quiz-prompt");
  const q1 = await prompt.textContent();
  await answerCurrent(dialog);
  await expect(dialog.getByTestId("quiz-prompt")).toBeVisible();
  expect(await dialog.getByTestId("quiz-prompt").textContent()).not.toEqual(q1);
});

// XP engine: answering + recording moves persisted XP.
test("xp persists after a recorded quiz", async ({ page }) => {
  const dialog = await openPlacedTutor(page);
  for (let i = 0; i < 5; i++) {
    const p = dialog.getByTestId("quiz-prompt");
    if (!(await p.isVisible({ timeout: 5000 }).catch(() => false))) break;
    await answerCurrent(dialog);
  }
  const done = dialog.getByTestId("quiz-done");
  await expect(done).toBeVisible({ timeout: 8000 });
  await done.click();
  const xp = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("canary-learn-v1");
      return raw ? (JSON.parse(raw) as { xp?: number }).xp ?? 0 : 0;
    } catch {
      return 0;
    }
  });
  expect(xp).toBeGreaterThan(0);
});
