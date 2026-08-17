import path from 'node:path';
import { chromium } from 'playwright';
import { readLatestReview } from '../lib/maps-reviews.mjs';

const profileDir = path.resolve('.maps-browser-profile');
const cafes = [
  'Kennington Lane Cafe, 383 Kennington Lane, London',
  'The English Rose Cafe and Tea Shop, 4 Lower Grosvenor Place, London',
  'Regency Cafe, 17 Regency Street, London',
  "L'ETO Caffe, 215 Brompton Road, London",
  'The Wolseley, 160 Piccadilly, London',
  'Feya Cafe, 86 Duke Street, London',
  'WatchHouse, 7 Berwick Street, London',
  'Notes Coffee Roasters, 31 St Martin’s Lane, London',
  'GAIL’s Bakery, 128-130 Northcote Road, London',
  'Grind, 2 London Bridge, London'
];

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: ['--start-minimized', '--window-position=-32000,-32000'],
  locale: 'ru-RU',
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const results = [];

async function openExactPlace(query) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=ru`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const isResultsPage = /^результаты$/i.test((await page.locator('h1').first().textContent().catch(() => '')).trim());
  if (!isResultsPage) return;
  const candidate = page.locator('a[href*="/maps/place/"]').first();
  await candidate.waitFor({ state: 'visible', timeout: 12_000 });
  const href = await candidate.getAttribute('href');
  if (!href) throw new Error('карточка заведения не найдена в списке');
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(800);
}

try {
  for (const cafe of cafes) {
    await openExactPlace(cafe);
    const name = (await page.locator('h1').first().textContent().catch(() => '')).trim() || cafe;
    const review = await readLatestReview(page);
    const passed = Boolean(review.date && review.status === 'Сначала новые');
    results.push({ name, ...review, passed });
    console.log(`${passed ? 'PASS' : 'FAIL'} | ${name} | ${review.date || '—'} | ${review.status}`);
  }
} finally {
  await context.close();
}

const passed = results.filter((result) => result.passed).length;
console.log(`RESULT: ${passed}/${results.length}`);
process.exitCode = passed === results.length ? 0 : 1;
