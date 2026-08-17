const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForAnyVisible(locators, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    await sleep(200);
  }
  return null;
}

function dateFromReviewText(value) {
  const match = value.replace(/\u00a0/g, ' ').match(/(?:изменено\s+)?(?:(?:\d+|несколько)\s*(?:минут(?:у|ы)?|час(?:а|ов)?|д(?:ень|ня|ней)|недел(?:ю|и|ь)|месяц(?:а|ев)?|год(?:а|ов)?|лет)\s+назад|сегодня|вчера|позавчера|today|yesterday|(?:an?|\d+)\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i);
  return match?.[0]?.trim() || '';
}

export async function readLatestReview(page) {
  const reviewsTab = await waitForAnyVisible([
    page.getByRole('tab', { name: /отзывы|reviews/i }).first(),
    page.getByText(/^(отзывы|reviews)$/i).first()
  ], 15_000);
  if (!reviewsTab) return { date: '', status: 'вкладка отзывов не загрузилась' };
  if (!await reviewsTab.click({ timeout: 5_000 }).then(() => true).catch(() => false)) {
    return { date: '', status: 'не удалось открыть вкладку отзывов' };
  }

  const newestSortButton = await waitForAnyVisible([
    page.locator('button').filter({ hasText: /сначала новые|newest/i }).first()
  ], 4_000);
  let sortConfirmed = Boolean(newestSortButton);

  if (!sortConfirmed) {
    const relevantSortButton = await waitForAnyVisible([
      page.locator('button').filter({ hasText: /самые релевантные|most relevant/i }).first()
    ], 10_000);
    if (!relevantSortButton) return { date: '', status: 'переключатель сортировки не загрузился' };
    if (!await relevantSortButton.click({ timeout: 5_000 }).then(() => true).catch(() => false)) {
      return { date: '', status: 'не удалось открыть сортировку отзывов' };
    }
    const newestItem = await waitForAnyVisible([
      page.getByRole('menuitemradio', { name: /сначала новые|newest/i }).first(),
      page.getByText(/^(сначала новые|newest)$/i).first()
    ], 5_000);
    if (!newestItem) return { date: '', status: 'пункт «Сначала новые» не найден' };
    if (!await newestItem.click({ timeout: 5_000, force: true }).then(() => true).catch(() => false)) {
      return { date: '', status: 'не удалось выбрать «Сначала новые»' };
    }
    sortConfirmed = Boolean(await waitForAnyVisible([
      page.locator('button').filter({ hasText: /сначала новые|newest/i }).first()
    ], 8_000));
  }
  if (!sortConfirmed) return { date: '', status: 'сортировка «Сначала новые» не подтверждена' };

  const reviewCard = await waitForAnyVisible([
    page.locator('div.jftiEf:visible').first(),
    page.locator('div[data-review-id]:visible').first()
  ], 15_000);
  if (!reviewCard) return { date: '', status: 'карточки отзывов не загрузились' };
  await page.waitForTimeout(350);
  const classDate = await reviewCard.locator('span.rsqaWe:visible').first().textContent().catch(() => '');
  const date = classDate?.trim() || dateFromReviewText(await reviewCard.innerText().catch(() => ''));
  return date ? { date, status: 'Сначала новые' } : { date: '', status: 'дата не найдена в первой карточке отзыва' };
}
