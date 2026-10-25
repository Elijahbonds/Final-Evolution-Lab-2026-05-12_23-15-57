// KEY FLOW 5 — /studio loads. A creator opens Nexus Studio, the venue editor's 3D view draws, every track opens, and a
// project rename is saved on the device and survives a reload.
//
// The studio is the largest client bundle in the app (Babylon, the venue editor, CELL's builder). "Loads" here means
// what a person would call loaded: the editor's canvas is on screen at a real size and has drawn, the four tracks
// (venue, AI, characters, scripts) each open without a page error, and the save state answers an edit.
import { assert } from '../../../scripts/e2e/rig';
import { colourCount, raster } from '../../../scripts/e2e/pixels';
import type { Flow } from '../../../scripts/e2e/flow';
import { FakeAuth } from '../fakes/auth';

const CREATOR = { id: 'creator-1', email: 'creator@example.com', password: 'x', name: 'Rig Creator' };

export const studioFlow: Flow = {
  name: 'studio',
  title: 'A creator opens /studio: the 3D view draws, all four tracks open, and a rename is saved across a reload',
  timeoutMs: 240_000,
  async run(ctx) {
    const auth = new FakeAuth([CREATOR], CREATOR.email);
    const s = ctx.session({
      viewport: { width: 1280, height: 800 },
      pages: { '/studio': { entry: 'tests/e2e/entries/studio.tsx' } },
      api: (req) => auth.handle(req) ?? { json: {} },
    });
    const page = await s.open('/studio');
    await page.locator('[data-testid="nexus-studio"]').waitFor({ timeout: 90_000 });
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ timeout: 90_000 });
    const box = await canvas.boundingBox();
    assert(box && box.width >= 400 && box.height >= 300, `the editor canvas is ${box?.width}x${box?.height}, not a real viewport`);
    // the 3D view has drawn: a screenshot of the canvas is not one flat colour (a WebGL canvas cannot be read back from
    // the page without preserveDrawingBuffer, so the pixels are read from the browser's own screenshot)
    const drew = async () => colourCount(await raster(await page.screenshot({ clip: box, timeout: 60_000, animations: 'allow' })));
    let colours = 0;
    for (let t0 = Date.now(); (colours = await drew()) < 24; ) {
      if (Date.now() - t0 > 90_000) throw new Error(`the studio's 3D view never drew (${colours} colours in its canvas after 90 s)`);
      await page.waitForTimeout(2000);
    }
    await ctx.shot(page, '1-venue');

    for (const label of ['AI', 'Characters', 'Scripts', 'Venue']) {
      const tab = page.getByRole('tab', { name: new RegExp(label, 'i') }).first();
      await tab.click();
      assert(await tab.getAttribute('aria-selected') === 'true', `the ${label} track did not open`);
      await page.waitForTimeout(800);
      await ctx.shot(page, `2-track-${label.toLowerCase()}`);
    }

    const name = page.getByLabel('Project name');
    await name.fill('Rig test venue');
    await name.blur();
    await page.getByTitle('Save now').click();
    await page.getByTestId('save-state').getByText('Saved on this device').waitFor({ timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.locator('[data-testid="nexus-studio"]').waitFor({ timeout: 90_000 });
    assert(await page.getByLabel('Project name').inputValue() === 'Rig test venue', 'the renamed project did not survive a reload');
    ctx.log(`studio mounted, 3D view drew (${colours} colours), 4 tracks opened, a rename survived a reload`);
  },
};
