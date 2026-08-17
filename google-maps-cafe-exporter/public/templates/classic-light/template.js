const root = document.querySelector('[data-template="classic-light"]');
const slots = {
  header: root.querySelector('[data-component="header"]'),
  navigation: root.querySelector('[data-component="category-navigation"]'),
  menu: root.querySelector('[data-component="menu-section"]'),
  location: root.querySelector('[data-component="location-section"]'),
  footer: root.querySelector('[data-component="footer"]'),
  legal: root.querySelector('[data-component="legal-bar"]')
};

const iconNames = new Set(['bars', 'calendar-days', 'cake-candles', 'cheese', 'clock', 'egg', 'envelope', 'fire', 'fish', 'globe', 'leaf', 'location-dot', 'map-location-dot', 'mug-hot', 'pepper-hot', 'phone', 'seedling', 'shrimp', 'star', 'utensils', 'wheat-awn', 'wine-glass']);
const dietaryIcons = {
  vegetarian: 'leaf', vegan: 'seedling', spicy: 'pepper-hot', 'gluten-related': 'wheat-awn',
  'chef-choice': 'utensils', bestseller: 'star', seasonal: 'seedling'
};
const allergenIcons = {
  milk: 'cheese', dairy: 'cheese', gluten: 'wheat-awn', wheat: 'wheat-awn', eggs: 'egg', egg: 'egg',
  nuts: 'seedling', peanuts: 'seedling', soy: 'seedling', fish: 'fish', shellfish: 'shrimp', crustaceans: 'shrimp'
};
const socialIcons = { instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', google: 'google', tripadvisor: 'tripadvisor', youtube: 'youtube', x: 'x-twitter', twitter: 'x-twitter', linkedin: 'linkedin' };
let menuData;
let activeCategory = 'all';
let categoryObserver;
let analyticsSessionId = '';

function analyticsSession() {
  if (analyticsSessionId) return analyticsSessionId;
  try {
    analyticsSessionId = sessionStorage.getItem('fastmenu-session') || crypto.randomUUID();
    sessionStorage.setItem('fastmenu-session', analyticsSessionId);
  } catch {
    analyticsSessionId = crypto.randomUUID();
  }
  return analyticsSessionId;
}

function analyticsSource() {
  const source = new URLSearchParams(window.location.search).get('source');
  return String(source || 'direct').slice(0, 80);
}

function analyticsDevice() {
  if (window.matchMedia('(max-width: 720px)').matches) return 'mobile';
  if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet';
  return 'desktop';
}

function track(event, details = {}) {
  if (!menuData?.analytics?.tenantId) return;
  const payload = JSON.stringify({ tenantId: menuData.analytics.tenantId, event, sessionId: analyticsSession(), language: menuData.localization?.activeLanguage || '', source: analyticsSource(), deviceType: analyticsDevice(), timestamp: new Date().toISOString(), ...details });
  try {
    const body = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/events', body)) return;
  } catch {
    // Fall back to a non-blocking request when sendBeacon is unavailable.
  }
  fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
}

function deepMerge(base, update) {
  if (Array.isArray(update)) return update.slice();
  if (!update || typeof update !== 'object') return update ?? base;
  const result = { ...(base && typeof base === 'object' ? base : {}) };
  Object.entries(update).forEach(([key, value]) => {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(result[key], value)
      : Array.isArray(value) ? value.slice() : value;
  });
  return result;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function inlineContent() {
  const source = document.querySelector('#template-content')?.textContent?.trim() || '';
  if (!source || source === '{}') return null;
  try { return JSON.parse(source); } catch { throw new Error('The inline menu JSON is not valid.'); }
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${url}.`);
  return response.json();
}

async function loadContent() {
  const inline = inlineContent();
  if (inline?.__classicLightResolved) return inline;
  const params = new URLSearchParams(window.location.search);
  const contentUrl = params.get('content') || './example-content.json';
  const [defaults, content] = await Promise.all([getJson('./defaults.json'), inline || getJson(contentUrl)]);
  return deepMerge(defaults, content);
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.entries(value).forEach(([dataKey, dataValue]) => { node.dataset[dataKey] = String(dataValue); });
    else if (key === 'attrs') Object.entries(value).forEach(([attribute, attributeValue]) => node.setAttribute(attribute, String(attributeValue)));
    else node[key] = value;
  });
  children.flat().filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function safeIcon(name, fallback = 'utensils') {
  return iconNames.has(String(name)) ? String(name) : fallback;
}

function openingHoursScheduleText(openingHours, maxEntries = 2) {
  const schedule = Array.isArray(openingHours?.schedule) ? openingHours.schedule : [];
  return schedule
    .map((entry) => {
      const label = translated(entry?.label || entry?.days || '').trim();
      const value = translated(entry?.value || [entry?.opens, entry?.closes].filter(Boolean).join('–')).trim();
      return label && value ? `${label}: ${value}` : value;
    })
    .filter(Boolean)
    .slice(0, maxEntries)
    .join(' · ');
}

function icon(name, { brand = false, title = '' } = {}) {
  return element('i', {
    class: `${brand ? 'fa-brands' : 'fa-solid'} fa-${brand ? String(name) : safeIcon(name)}`,
    attrs: { 'aria-hidden': title ? 'false' : 'true', ...(title ? { title } : {}) }
  });
}

function isUsableUrl(value) {
  if (!String(value || '').trim()) return false;
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch { return false; }
}

function linkOrElement({ href, className, text, slot, component = '', children = [], target = '' }) {
  const useLink = isUsableUrl(href);
  const node = element(useLink ? 'a' : 'div', {
    class: className,
    text,
    attrs: {
      ...(useLink ? { href } : {}),
      ...(slot ? { 'data-slot': slot } : {}),
      ...(component ? { 'data-component': component } : {}),
      ...(target ? { target, rel: 'noreferrer' } : {})
    }
  });
  children.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function translated(value, language = menuData?.localization?.activeLanguage) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!plainObject(value)) return '';
  const fallback = menuData?.localization?.nativeLanguage || 'en';
  return String(value[language] ?? value[fallback] ?? value.en ?? Object.values(value).find((item) => typeof item === 'string') ?? '');
}

function ui(key, fallback = '') {
  const language = menuData.localization.activeLanguage;
  const localized = menuData.localization.translations?.[language] || menuData.localization.translations?.[menuData.localization.nativeLanguage] || menuData.localization.translations?.en || {};
  return key.split('.').reduce((value, part) => value?.[part], localized) ?? fallback;
}

function setTheme(theme = {}) {
  const variables = {
    '--font-heading': `${theme.headingFont || 'Playfair Display'}, Georgia, serif`,
    '--font-body': `${theme.bodyFont || 'Inter'}, Arial, sans-serif`,
    '--color-page': theme.pageBackground || '#f8f6f1',
    '--color-surface': theme.surfaceColor || '#ffffff',
    '--color-text': theme.textColor || '#171914',
    '--color-muted': theme.mutedColor || '#686960',
    '--color-primary': theme.primaryColor || '#315c27',
    '--color-primary-hover': theme.primaryHoverColor || '#25491e',
    '--color-accent': theme.accentColor || '#c8a16c',
    '--color-border': theme.borderColor || '#e8e3da',
    '--color-error': theme.errorColor || '#a94343',
    '--color-warning': theme.warningColor || '#a67c36',
    '--radius-card': `${theme.cardRadius ?? 12}px`,
    '--radius-small': `${theme.buttonRadius ?? 8}px`
  };
  Object.entries(variables).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
  document.documentElement.style.setProperty('--radius-section', `${Math.max((theme.cardRadius ?? 12) + 2, 10)}px`);
}

function applyMainBackground() {
  const area = root.querySelector('.site-main-area');
  if (!area) return;
  const source = String(menuData?.templateOptions?.background?.imageUrl || '').trim();
  const supported = /^(?:https?:\/\/|\/|data:image\/)/iu.test(source);
  if (!supported) {
    area.style.removeProperty('--classic-light-main-background');
    area.style.removeProperty('--classic-light-background-width');
    area.removeAttribute('data-background');
    area.removeAttribute('data-background-orientation');
    area.removeAttribute('data-background-source');
    return;
  }
  const safeSource = source.replace(/["\\\\\n\r]/gu, '\\\\$&');
  area.style.setProperty('--classic-light-main-background', `url("${safeSource}")`);
  area.dataset.background = String(menuData.templateOptions.background.label || 'selected');
  // Most of the uploaded backdrops are portrait photos. Start in the safe
  // no-upscale mode immediately, then switch to the landscape layout only
  // when the browser has confirmed the image dimensions.
  area.dataset.backgroundSource = source;
  area.dataset.backgroundOrientation = 'portrait';
  const backgroundImage = new Image();
  backgroundImage.onload = () => {
    if (area.dataset.backgroundSource !== source) return;
    const width = Number(backgroundImage.naturalWidth) || 0;
    const height = Number(backgroundImage.naturalHeight) || 0;
    if (!width || !height) return;
    area.style.setProperty('--classic-light-background-width', `${width}px`);
    area.dataset.backgroundOrientation = width >= height ? 'landscape' : 'portrait';
  };
  backgroundImage.onerror = () => {
    if (area.dataset.backgroundSource === source) area.dataset.backgroundOrientation = 'portrait';
  };
  backgroundImage.src = source;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
}

function brandFallback(restaurant) {
  return element('span', { class: 'restaurant-logo__fallback' }, [
    element('span', { class: 'logo-monogram', text: initials(restaurant.name), attrs: { 'aria-hidden': 'true' } }),
    element('span', {}, [
      element('span', { class: 'logo-fallback__eyebrow', text: restaurant.category || '' }),
      element('span', { class: 'logo-fallback__name', text: restaurant.name || '' })
    ])
  ]);
}

// Server-side validation checks HTTP, format and decoding. This last browser
// check protects the finished landing from a CDN block, a malformed graphic or
// a resource that was removed after the audit was saved.
function verifiedImage({ src, alt = '', loading = '', style = '', onUnavailable = null }) {
  const image = element('img', { src, alt, ...(loading ? { loading } : {}), ...(style ? { style } : {}) });
  let unusable = false;
  const fail = () => {
    if (unusable) return;
    unusable = true;
    image.dataset.assetState = 'unavailable';
    onUnavailable?.(image);
  };
  const verify = () => {
    if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) fail();
    else image.dataset.assetState = 'ready';
  };
  image.addEventListener('error', fail, { once: true });
  image.addEventListener('load', verify, { once: true });
  queueMicrotask(() => { if (image.complete) verify(); });
  return image;
}

function brandMark(className, slot) {
  const { restaurant } = menuData;
  const href = restaurant.websiteUrl;
  const wrapper = linkOrElement({ href, className, slot });
  if (restaurant.logo?.src) {
    if (restaurant.logo.presentation === 'dark-surface') wrapper.classList.add('brand-mark--dark-surface');
    wrapper.append(verifiedImage({
      src: restaurant.logo.src,
      alt: restaurant.logo.alt || restaurant.name || '',
      onUnavailable: () => {
        wrapper.classList.remove('brand-mark--dark-surface');
        wrapper.replaceChildren(brandFallback(restaurant));
      }
    }));
  } else {
    wrapper.append(brandFallback(restaurant));
  }
  return wrapper;
}

function buttonLabel(label, iconName) {
  return [icon(iconName), document.createTextNode(label)];
}

function renderHeader() {
  const { restaurant, localization, templateOptions } = menuData;
  const shell = element('div', { class: 'page-shell site-header__inner' });
  shell.append(brandMark('restaurant-logo', 'restaurant.logo'));

  const identity = element('section', { class: 'restaurant-identity', attrs: { 'aria-label': 'Restaurant' } });
  identity.append(element('h1', { text: restaurant.name, attrs: { 'data-component': 'header-title', 'data-slot': 'restaurant.name' } }));
  if (restaurant.subtitle) identity.append(element('p', { text: restaurant.subtitle, attrs: { 'data-component': 'header-subtitle', 'data-slot': 'restaurant.subtitle' } }));
  if (restaurant.address?.display) {
    const address = linkOrElement({ href: menuData.map.directionsUrl, className: 'address-link', slot: 'restaurant.address' });
    address.append(icon('location-dot'), document.createTextNode(translated(restaurant.address.display)));
    address.addEventListener('click', () => track('directions_click'));
    identity.append(address);
  }
  shell.append(identity);

  const contacts = element('section', { class: 'header-contacts', attrs: { 'aria-label': ui('contactUs', 'Contact') } });
  if (restaurant.phone?.display) {
    const phone = linkOrElement({ href: restaurant.phone.normalized ? `tel:${restaurant.phone.normalized}` : '', className: 'contact-row', slot: 'restaurant.phone' });
    phone.append(element('span', { class: 'contact-row__icon' }, [icon('phone')]), document.createTextNode(restaurant.phone.display));
    phone.addEventListener('click', () => track('call_click'));
    contacts.append(phone);
  }
  const hoursText = openingHoursScheduleText(restaurant.openingHours);
  if (hoursText) {
    const hours = element('div', { class: 'contact-row contact-row--hours', attrs: { 'data-slot': 'restaurant.openingHours.schedule' } });
    hours.append(element('span', { class: 'contact-row__icon' }, [icon('clock')]), element('span', { text: hoursText }));
    contacts.append(hours);
  }
  if (restaurant.openingHours?.todayLabel) {
    contacts.append(element('div', { class: 'contact-row contact-row--status', text: translated(restaurant.openingHours.todayLabel), attrs: { 'data-slot': 'restaurant.openingHours.status' } }));
  }
  if (contacts.childElementCount) shell.append(contacts);

  const actions = element('section', { class: 'header-actions', attrs: { 'aria-label': 'Actions' } });
  if (localization.languages?.length > 1) {
    const switcher = element('div', { class: 'language-switcher', attrs: { 'data-repeat': 'localization.languages', 'aria-label': 'Language' } });
    localization.languages.forEach((language) => {
      const selected = language.code === localization.activeLanguage;
      const languageButton = element('button', { text: language.label, attrs: { type: 'button', 'data-language': language.code, 'data-state': String(selected), 'aria-pressed': String(selected) } });
      languageButton.addEventListener('click', () => changeLanguage(language.code));
      switcher.append(languageButton);
    });
    actions.append(switcher);
  }
  if (templateOptions.showBookingButton && isUsableUrl(restaurant.bookingUrl)) {
    const booking = linkOrElement({ href: restaurant.bookingUrl, className: 'button booking-button', slot: 'restaurant.bookingUrl' });
    booking.append(...buttonLabel(ui('bookTable', 'Book a table'), 'calendar-days'));
    booking.addEventListener('click', () => track('booking_click'));
    actions.append(booking);
  }
  if (actions.childElementCount) shell.append(actions);
  slots.header.replaceChildren(shell);
}

function sortedCategories() {
  return (menuData.menu.categories || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function visibleCategories() {
  const itemCategoryIds = new Set((menuData.menu.items || []).map((item) => item.categoryId));
  return sortedCategories().filter((category) => itemCategoryIds.has(category.id));
}

function setActiveCategory(id) {
  activeCategory = id;
  slots.navigation.querySelectorAll('.category-tab').forEach((button) => button.setAttribute('aria-current', String(button.dataset.categoryId === id)));
}

function renderNavigation() {
  const categories = visibleCategories();
  if (!categories.length) { slots.navigation.hidden = true; return; }
  slots.navigation.hidden = false;
  slots.navigation.classList.toggle('is-not-sticky', !menuData.templateOptions.stickyCategories);
  const all = element('button', { class: 'category-tab', attrs: { type: 'button', 'data-component': 'menu-category-tab-all', 'data-category-id': 'all', 'aria-current': String(activeCategory === 'all'), 'data-slot': 'ui.all' } });
  all.append(icon('bars'), document.createTextNode(ui('all', 'All')));
  all.addEventListener('click', () => {
    setActiveCategory('all');
    track('category_view', { categoryId: 'all' });
    slots.menu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  slots.navigation.replaceChildren(all);
  categories.forEach((category) => {
    const tab = element('button', { class: 'category-tab', attrs: { type: 'button', 'data-component': 'menu-category-tab', 'data-component-key': category.id, 'data-category-id': category.id, 'aria-current': String(activeCategory === category.id), 'data-repeat': 'menu.categories[]', 'data-slot': 'menu.category.label' } });
    tab.append(icon(category.icon), document.createTextNode(translated(category.label)));
    tab.addEventListener('click', () => {
      setActiveCategory(category.id);
      track('category_view', { categoryId: category.id });
      document.querySelector(`#category-${CSS.escape(category.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    slots.navigation.append(tab);
  });
}

function localizedItem(item) {
  const language = menuData.localization.activeLanguage;
  return item.translations?.[language] || item.translations?.[menuData.localization.nativeLanguage] || item.translations?.en || {};
}

function priceValue(price, approximate = false) {
  if (!price?.formatted) return null;
  return element('span', { class: `price ${approximate ? 'price--converted' : 'price--native'}`, text: approximate ? `≈ ${price.formatted}` : price.formatted, attrs: { 'data-slot': approximate ? 'menu.item.pricing.converted' : 'menu.item.pricing.native' } });
}

function menuPrices(item) {
  const prices = element('div', { class: 'menu-card__prices', attrs: { 'data-slot': 'menu.item.pricing' } });
  const native = item.pricing?.native;
  if (native?.formatted) prices.append(priceValue(native));
  if (!menuData.templateOptions.showConvertedPrices) return prices;
  const nativeCurrency = String(native?.currency || '').toUpperCase();
  if (nativeCurrency !== 'EUR' && item.pricing?.eur?.formatted) prices.append(priceValue(item.pricing.eur, true));
  if (nativeCurrency !== 'USD' && item.pricing?.usd?.formatted) prices.append(priceValue(item.pricing.usd, true));
  return prices;
}

function dietaryTags(tags) {
  if (!tags?.length) return null;
  const list = element('div', { class: 'dietary-tags', attrs: { 'data-repeat': 'menu.item.dietaryTags' } });
  tags.forEach((tag) => {
    const label = ui(`tags.${tag}`, tag);
    list.append(element('span', { class: 'dietary-tag', attrs: { title: label, 'aria-label': label, 'data-slot': 'menu.item.dietaryTags[]' } }, [icon(dietaryIcons[tag] || 'utensils')]));
  });
  return list;
}

function allergenIconFor(label) {
  const normalized = String(label || '').toLocaleLowerCase();
  if (/(?:gluten|wheat|weizen|glutine|bl[eé]|trigo|глютен|пшениц|lepek|pšenic)/u.test(normalized)) return 'wheat-awn';
  if (/(?:egg|eier|uova|œufs?|huevos|яйц|toj[aá]s|vejce)/u.test(normalized)) return 'egg';
  if (/(?:fish|pesce|poisson|pescado|рыб)/u.test(normalized)) return 'fish';
  if (/(?:shellfish|crustacean|mollusc|crostace|molus|моллюск|ракообр)/u.test(normalized)) return 'shrimp';
  if (/(?:nuts?|peanut|frutta\s+a\s+guscio|fruits?\s+[àa]\s+coque|schalenfr[üu]chte|орех|di[oó]f[eé]l[eé]k|skoř[aá]pk|soy|soja|соя|sz[oó]ja)/u.test(normalized)) return 'seedling';
  return allergenIcons[normalized] || 'cheese';
}

function allergens(item) {
  const language = menuData.localization.activeLanguage;
  const values = Array.isArray(item.allergens)
    ? item.allergens
    : item.allergens?.[language]
      || item.allergens?.[menuData.localization.nativeLanguage]
      || item.allergens?.en
      || Object.values(item.allergens || {}).find(Array.isArray)
      || [];
  if (!menuData.templateOptions.showAllergens || !values.length) return null;
  const status = item.allergenStatus || 'not-provided';
  const section = element('section', { attrs: { 'data-slot': 'menu.item.allergens' } });
  const row = element('div', { class: 'allergen-list', dataset: { status }, attrs: { 'data-repeat': 'menu.item.allergens', 'data-status': status } });
  values.forEach((allergen) => {
    const label = String(allergen || '').trim();
    if (!label) return;
    const allergenIcon = allergenIconFor(label);
    row.append(element('span', { class: 'allergen-chip', attrs: { title: label, 'aria-label': label } }, [
      icon(allergenIcon),
      document.createTextNode(label)
    ]));
  });
  section.append(row);
  return section;
}

function menuCard(item) {
  const itemText = localizedItem(item);
  const hasImage = Boolean(item.image?.src);
  const card = element('article', { class: 'menu-card', dataset: { menuItemId: item.id, state: hasImage ? 'with-image' : 'without-image' }, attrs: { 'data-repeat': 'menu.items', 'data-menu-item-id': item.id, 'data-state': hasImage ? 'with-image' : 'without-image' } });
  card.addEventListener('click', () => track('menu_item_view', { itemId: item.id, categoryId: item.categoryId }));
  if (hasImage) {
    const media = element('div', { class: 'menu-card__media', attrs: { 'data-slot': 'menu.item.image' } });
    media.append(verifiedImage({
      src: item.image.src,
      alt: item.image.alt || itemText.name || '',
      loading: 'lazy',
      style: `object-position: ${item.image.focalPoint || '50% 50%'}`,
      onUnavailable: () => { media.remove(); card.dataset.state = 'without-image'; card.setAttribute('data-state', 'without-image'); }
    }));
    if (item.featured) media.append(element('span', { class: 'featured-mark', attrs: { title: ui('tags.chef-choice', 'Chef choice') } }, [icon('utensils')]));
    card.append(media);
  }
  const content = element('div', { class: 'menu-card__content' });
  const titleRow = element('div', { class: 'menu-card__title-row' });
  titleRow.append(element('h3', { text: itemText.name || '', attrs: { 'data-slot': 'menu.item.name' } }));
  titleRow.append(...[dietaryTags(item.dietaryTags)].filter(Boolean));
  content.append(titleRow);
  if (itemText.description) content.append(element('p', { class: 'menu-card__description', text: itemText.description, attrs: { 'data-slot': 'menu.item.description' } }));
  if (item.portion) content.append(element('p', { class: 'menu-card__portion', text: item.portion, attrs: { 'data-slot': 'menu.item.portion' } }));
  if (menuData.templateOptions.showIngredients && itemText.ingredients) content.append(element('p', { class: 'menu-card__ingredients', text: itemText.ingredients, attrs: { 'data-slot': 'menu.item.ingredients' } }));
  content.append(...[allergens(item)].filter(Boolean));
  if (item.variants?.length) content.append(element('ul', { class: 'menu-card__options', attrs: { 'data-slot': 'menu.item.variants' } }, item.variants.map((variant) => element('li', { text: `${variant.name} — ${variant.formattedPrice}` }))));
  if (item.modifiers?.length) content.append(element('p', { class: 'menu-card__modifiers', text: item.modifiers.map((modifier) => `${modifier.name} +${modifier.formattedPrice}`).join(' · '), attrs: { 'data-slot': 'menu.item.modifiers' } }));
  card.append(content, menuPrices(item));
  return card;
}

function renderMenu() {
  const categories = visibleCategories();
  slots.menu.replaceChildren();
  categories.forEach((category) => {
    const items = (menuData.menu.items || []).filter((item) => item.categoryId === category.id);
    const section = element('section', { class: 'menu-category', attrs: { id: `category-${category.id}`, 'data-component': 'menu-category-section', 'data-component-key': category.id, 'data-category-id': category.id, 'data-repeat': 'menu.categories[]' } });
    const heading = element('div', { class: 'menu-category__heading' });
    heading.append(element('h2', { text: translated(category.label), attrs: { 'data-slot': 'menu.category.label' } }), element('span', { text: String(items.length), attrs: { 'data-slot': 'menu.category.itemsCount' } }));
    section.append(heading, element('div', { class: 'menu-grid' }, items.map(menuCard)));
    slots.menu.append(section);
  });
  slots.menu.hidden = !categories.length;
  observeCategories();
}

function renderMap() {
  const { map, restaurant, templateOptions } = menuData;
  const locationCard = menuData.locationCard || {};
  const cardName = locationCard.name || restaurant.name || '';
  const cardRating = locationCard.rating ?? restaurant.rating;
  const cardReviewsCount = locationCard.reviewsCount ?? restaurant.reviewsCount;
  const cardAddress = locationCard.address || restaurant.address || {};
  const cardHours = locationCard.openingHours || restaurant.openingHours || {};
  const cardDirectionsUrl = locationCard.directionsUrl || map.directionsUrl || '';
  const cardImage = locationCard.miniPhoto || restaurant.locationImage || null;
  slots.location.replaceChildren();
  if (!templateOptions.showMap) { slots.location.hidden = true; return; }
  slots.location.hidden = false;
  if (isUsableUrl(map.embedUrl)) {
    slots.location.append(element('div', { class: 'location-map', attrs: { 'data-slot': 'map.embedUrl' } }, [
      element('iframe', { src: map.embedUrl, loading: 'lazy', title: map.markerLabel || restaurant.name || ui('mapUnavailable'), attrs: { referrerpolicy: 'no-referrer-when-downgrade' } })
    ]));
  } else {
    const placeholder = element('div', { class: 'location-map location-map--placeholder', attrs: { 'data-slot': 'map.embedUrl', role: 'img', 'aria-label': ui('mapUnavailable') } });
    placeholder.append(element('span', { class: 'map-placeholder__marker', attrs: { 'aria-hidden': 'true' } }, [icon('location-dot')]), element('span', { class: 'map-placeholder__label', text: map.markerLabel || restaurant.name || ui('mapUnavailable'), attrs: { 'data-slot': 'map.markerLabel' } }));
    slots.location.append(placeholder);
  }
  const card = element('aside', { class: 'location-info-card', attrs: { 'aria-label': cardName || 'Location' } });
  const content = element('div', { class: 'location-info-card__content' });
  content.append(element('h2', { text: cardName, attrs: { 'data-slot': 'locationCard.name' } }));
  const metadata = element('div', { class: 'location-meta' });
  if (cardRating !== null && cardRating !== undefined) {
    const rating = element('span', { class: 'location-rating', attrs: { 'data-slot': 'locationCard.rating' } });
    const score = Number(cardRating).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    rating.append(element('b', { text: score }), element('span', { class: 'location-rating__stars', text: '★★★★★', attrs: { 'aria-hidden': 'true' } }));
    if (cardReviewsCount) rating.append(element('span', { class: 'location-rating__reviews', text: `(${Number(cardReviewsCount).toLocaleString()} ${ui('reviews', 'reviews')})`, attrs: { 'data-slot': 'locationCard.reviewsCount' } }));
    metadata.append(rating);
  }
  if (restaurant.category) metadata.append(element('span', { text: restaurant.category, attrs: { 'data-slot': 'restaurant.category' } }));
  if (restaurant.priceLevel) metadata.append(element('span', { text: restaurant.priceLevel, attrs: { 'data-slot': 'restaurant.priceLevel' } }));
  if (metadata.childElementCount) content.append(metadata);
  if (cardAddress?.display) content.append(element('address', { class: 'location-address', text: translated(cardAddress.display), attrs: { 'data-slot': 'locationCard.address' } }));
  const cardHoursText = openingHoursScheduleText(cardHours);
  if (cardHoursText) {
    content.append(element('div', { class: 'location-hours', text: cardHoursText, attrs: { 'data-slot': 'locationCard.openingHours.schedule' } }));
  }
  if (isUsableUrl(cardDirectionsUrl)) {
    const directions = linkOrElement({ href: cardDirectionsUrl, className: 'button', slot: 'locationCard.directionsUrl', target: '_blank' });
    directions.append(...buttonLabel(ui('directions', 'Directions'), 'map-location-dot'));
    directions.addEventListener('click', () => track('directions_click'));
    content.append(directions);
  }
  card.append(content);
  if (cardImage?.src) {
    const image = element('div', { class: 'location-info-card__media', attrs: { 'data-slot': 'locationCard.miniPhoto' } });
    image.append(verifiedImage({
      src: cardImage.src,
      alt: cardImage.alt || cardName,
      loading: 'lazy',
      onUnavailable: () => { image.remove(); card.classList.add('location-info-card--without-image'); }
    }));
    card.append(image);
  }
  slots.location.append(card);
}

function socialLink(social) {
  if (!isUsableUrl(social.url)) return null;
  const label = social.platform || 'Social link';
  const iconName = socialIcons[social.icon || social.platform];
  const child = iconName ? icon(iconName, { brand: true, title: label }) : icon('globe', { title: label });
  const link = linkOrElement({ href: social.url, className: 'social-link', slot: 'restaurant.social.url', children: [child], target: '_blank' });
  link.addEventListener('click', () => track('social_click'));
  return link;
}

function renderFooter() {
  const { restaurant, templateOptions } = menuData;
  const shell = element('div', { class: 'page-shell site-footer__main' });
  const brand = element('section', { attrs: { 'data-component': 'footer-brand', 'data-slot': 'restaurant.logo' } });
  const footerBrand = brandMark('footer-brand', 'restaurant.logo');
  footerBrand.classList.remove('restaurant-logo');
  if (restaurant.logo?.src) footerBrand.querySelector('img')?.classList.add('footer-brand__image');
  brand.append(footerBrand);
  shell.append(brand);

  const contacts = element('section', { class: 'footer-contacts', attrs: { 'data-component': 'footer-contacts', 'data-slot': 'restaurant.contacts' } });
  contacts.append(element('h2', { class: 'footer-heading', text: ui('contactUs', 'Contact us'), attrs: { 'data-component': 'footer-contacts-heading', 'data-slot': 'ui.contactUs' } }));
  const contactList = element('ul', { class: 'footer-contact-list', attrs: { 'data-component': 'footer-contact-list' } });
  if (restaurant.phone?.display) {
    const phone = linkOrElement({ href: restaurant.phone.normalized ? `tel:${restaurant.phone.normalized}` : '', className: '', slot: 'restaurant.phone', component: 'footer-contact-phone-link' });
    phone.append(icon('phone'), document.createTextNode(restaurant.phone.display));
    phone.addEventListener('click', () => track('call_click'));
    contactList.append(element('li', { attrs: { 'data-component': 'footer-contact-phone' } }, [phone]));
  }
  if (restaurant.email) {
    const email = linkOrElement({ href: `mailto:${restaurant.email}`, className: '', slot: 'restaurant.email', component: 'footer-contact-email-link' });
    email.append(icon('envelope'), document.createTextNode(restaurant.email));
    contactList.append(element('li', { attrs: { 'data-component': 'footer-contact-email' } }, [email]));
  }
  if (restaurant.websiteUrl) {
    const website = linkOrElement({ href: restaurant.websiteUrl, className: '', slot: 'restaurant.websiteUrl', component: 'footer-contact-website-link', target: '_blank' });
    website.append(icon('globe'), document.createTextNode(ui('website', 'Website')));
    contactList.append(element('li', { attrs: { 'data-component': 'footer-contact-website' } }, [website]));
  }
  if (restaurant.address?.display) {
    const address = linkOrElement({ href: menuData.map.directionsUrl, className: '', slot: 'restaurant.address', component: 'footer-contact-address-link' });
    address.append(icon('location-dot'), document.createTextNode(translated(restaurant.address.display)));
    address.addEventListener('click', () => track('directions_click'));
    contactList.append(element('li', { attrs: { 'data-component': 'footer-contact-address' } }, [address]));
  }
  contacts.append(contactList);
  if (contactList.childElementCount) shell.append(contacts);

  if (templateOptions.showSocials && restaurant.socials?.some((social) => isUsableUrl(social.url))) {
    const socials = element('section', { attrs: { 'data-component': 'footer-socials', 'data-repeat': 'restaurant.socials' } });
    socials.append(element('h2', { class: 'footer-heading', text: ui('followUs', 'Follow us'), attrs: { 'data-slot': 'ui.followUs' } }), element('div', { class: 'social-links' }, restaurant.socials.map(socialLink)));
    shell.append(socials);
  }

  if (restaurant.openingHours?.schedule?.length || restaurant.bookingUrl) {
    const hours = element('section', { class: 'footer-hours', attrs: { 'data-component': 'footer-hours', 'data-slot': 'restaurant.openingHours' } });
    hours.append(element('h2', { class: 'footer-heading', text: ui('openingHours', 'Opening hours'), attrs: { 'data-slot': 'ui.openingHours' } }));
    if (restaurant.openingHours?.schedule?.length) hours.append(element('ul', { class: 'hours-list', attrs: { 'data-repeat': 'restaurant.openingHours.schedule' } }, restaurant.openingHours.schedule.map((entry) => element('li', { attrs: { 'data-slot': 'restaurant.openingHours.schedule[]' } }, [element('span', { text: translated(entry.label || entry.days || '') }), element('span', { text: translated(entry.value || [entry?.opens, entry?.closes].filter(Boolean).join('–')) })]))));
    if (templateOptions.showBookingButton && isUsableUrl(restaurant.bookingUrl)) {
      const booking = linkOrElement({ href: restaurant.bookingUrl, className: 'button', slot: 'restaurant.bookingUrl', component: 'footer-booking-cta' });
      booking.append(...buttonLabel(ui('bookTable', 'Book a table'), 'calendar-days'));
      booking.addEventListener('click', () => track('booking_click'));
      hours.append(booking);
    }
    shell.append(hours);
  }
  slots.footer.replaceChildren(shell);
}

function renderLegal() {
  const { footer } = menuData;
  // A copyright copied from a source site is often outdated.  The landing is
  // generated for the current publishing year, so normalise every old value
  // here as well as on the server. This also repairs already saved audits.
  const currentYear = new Date().getFullYear();
  const sourceCopyright = String(footer.copyright || '').trim();
  const copyright = sourceCopyright
    ? sourceCopyright.replace(/\b(?:19|20)\d{2}\b/g, String(currentYear))
    : `© ${currentYear}${restaurant.name ? ` ${restaurant.name}.` : ''}`;
  const links = [
    ['privacyUrl', 'privacyPolicy', 'Privacy policy'],
    ['termsUrl', 'termsOfService', 'Terms of service'],
    ['imprintUrl', 'imprint', 'Imprint']
  ].filter(([key]) => isUsableUrl(footer[key]));
  if (!copyright && !links.length) { slots.legal.hidden = true; return; }
  slots.legal.hidden = false;
  const shell = element('div', { class: 'page-shell legal-bar__inner', attrs: { 'data-component': 'legal-strip-content' } });
  if (copyright) shell.append(element('p', { text: copyright, attrs: { 'data-component': 'legal-copyright', 'data-slot': 'footer.copyright' } }));
  if (links.length) {
    const nav = element('nav', { class: 'legal-links', attrs: { 'data-component': 'legal-links', 'aria-label': 'Legal' } });
    links.forEach(([key, labelKey, fallback]) => nav.append(linkOrElement({ href: footer[key], className: '', text: ui(labelKey, fallback), slot: `footer.${key}`, component: `legal-${key.replace('Url', '')}` })));
    shell.append(nav);
  }
  slots.legal.replaceChildren(shell);
}

function observeCategories() {
  categoryObserver?.disconnect();
  const sections = [...slots.menu.querySelectorAll('.menu-category')];
  if (!sections.length || !('IntersectionObserver' in window)) return;
  categoryObserver = new IntersectionObserver((entries) => {
    const entry = entries.filter((item) => item.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (entry) setActiveCategory(entry.target.dataset.categoryId);
  }, { rootMargin: '-25% 0px -65% 0px', threshold: [0, .2, .5] });
  sections.forEach((section) => categoryObserver.observe(section));
}

function applyDocumentMetadata() {
  document.documentElement.lang = menuData.localization.activeLanguage || menuData.localization.nativeLanguage || 'en';
  if (menuData.restaurant.name) document.title = `${menuData.restaurant.name} · ${ui('all', 'Menu')}`;
  document.querySelector('.skip-link').textContent = ui('skipToMenu', 'Skip to menu');
}

function render() {
  setTheme(menuData.theme);
  applyMainBackground();
  applyDocumentMetadata();
  renderHeader();
  renderNavigation();
  renderMenu();
  renderMap();
  renderFooter();
  renderLegal();
  root.dataset.state = 'ready';
}

function changeLanguage(language) {
  if (!menuData.localization.languages?.some((item) => item.code === language)) return;
  const currentPosition = window.scrollY;
  menuData.localization.activeLanguage = language;
  render();
  track('language_change', { language });
  window.scrollTo({ top: currentPosition, behavior: 'instant' });
}

async function exportStandalone(fileName = 'classic-light-menu.html') {
  const [css, script] = await Promise.all([fetch('./template.css').then((response) => response.text()), fetch('./template.js').then((response) => response.text())]);
  const exportData = await embedProjectAssets({ ...menuData, __classicLightResolved: true });
  const escapedData = JSON.stringify(exportData).replace(/<\//g, '<\\/');
  const escapedScript = script.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html><html lang="${menuData.localization.activeLanguage || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${document.title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" referrerpolicy="no-referrer"><style>${css}</style></head><body><a class="skip-link" href="#menu-content"></a><div class="site" data-template="classic-light" data-state="loading"><header class="site-header" data-component="header"></header><main class="site-main-area"><div class="site-main" id="menu-content"><nav class="category-navigation" data-component="category-navigation"></nav><section class="menu-section" data-component="menu-section"></section><section class="location-section" data-component="location-section"></section></div></main><footer class="site-footer" data-component="footer"></footer><div class="legal-bar" data-component="legal-bar"></div></div><script id="template-content" type="application/json">${escapedData}</script><script>${escapedScript}</script></body></html>`;
  const download = element('a', { href: URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), download: fileName });
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(download.href), 1_000);
}

async function embedProjectAssets(content) {
  const copy = structuredClone(content);
  const assets = [copy.restaurant?.logo, copy.restaurant?.locationImage, ...(copy.menu?.items || []).map((item) => item.image)].filter((asset) => asset?.src);
  await Promise.all(assets.map(async (asset) => {
    try {
      const source = new URL(asset.src, window.location.href);
      if (source.origin !== window.location.origin) return;
      const response = await fetch(source.href);
      if (!response.ok) return;
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      bytes.forEach((value) => { binary += String.fromCharCode(value); });
      asset.src = `data:${response.headers.get('content-type') || 'application/octet-stream'};base64,${btoa(binary)}`;
    } catch {
      // Keep the original source URL when an optional asset cannot be embedded.
    }
  }));
  const background = copy.templateOptions?.background;
  if (background?.imageUrl) {
    try {
      const source = new URL(background.imageUrl, window.location.href);
      if (source.origin === window.location.origin) {
        const response = await fetch(source.href);
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = '';
          bytes.forEach((value) => { binary += String.fromCharCode(value); });
          background.imageUrl = `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${btoa(binary)}`;
        }
      }
    } catch {
      // Keep the landing export usable if the optional decorative background is unavailable.
    }
  }
  return copy;
}

async function start() {
  try {
    menuData = await loadContent();
    if (!plainObject(menuData) || !plainObject(menuData.restaurant)) throw new Error('The content JSON does not match the Classic Light contract.');
    render();
    track('session_start');
    track('page_view');
  } catch (error) {
    root.dataset.state = 'error';
    root.replaceChildren(element('p', { class: 'template-error', text: error.message || 'The menu template could not be loaded.' }));
  }
}

window.ClassicLightMenu = { exportStandalone, getContent: () => structuredClone(menuData), setContent: (content) => { menuData = content; activeCategory = 'all'; render(); } };
start();
