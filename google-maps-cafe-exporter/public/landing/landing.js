import { landingContentRu as content } from './content.ru.js';

const root = document.querySelector('#landing-root');
const icon = (value) => `<span class="ui-icon" aria-hidden="true">${value}</span>`;
const check = () => '<span class="check" aria-hidden="true">✓</span>';

function trackEvent(name, properties = {}) {
  const event = { name, properties, at: new Date().toISOString() };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...properties });
  document.dispatchEvent(new CustomEvent('menu-on:track', { detail: event }));
}

function leadForm(id, { compact = false } = {}) {
  return `<form class="demo-form ${compact ? 'demo-form--compact' : ''}" data-demo-form="${id}" novalidate>
    <div class="demo-form__fields">
      <label>
        <span>${content.form.siteLabel}</span>
        <input name="websiteUrl" inputmode="url" autocomplete="url" placeholder="${content.form.sitePlaceholder}" required maxlength="2048" />
      </label>
      <label>
        <span>${content.form.emailLabel}</span>
        <input name="email" type="email" inputmode="email" autocomplete="email" placeholder="${content.form.emailPlaceholder}" required maxlength="254" />
      </label>
      <label class="honeypot" aria-hidden="true">
        <span>Компания</span><input name="company" tabindex="-1" autocomplete="off" />
      </label>
    </div>
    <button class="button button--primary" type="submit"><span data-button-label>${content.ctas.send}</span>${icon('→')}</button>
    <p class="form-note">${content.form.privacy}</p>
    <p class="form-status" aria-live="polite" role="status"></p>
  </form>`;
}

function productPhone({ dark = false } = {}) {
  return `<div class="phone ${dark ? 'phone--dark' : ''}" aria-label="Пример мобильного меню">
    <div class="phone__notch"></div>
    <div class="phone__screen">
      <div class="phone__top"><span class="phone__brand">BASILICO</span><span class="language-pill">DE <b>⌄</b></span></div>
      <p class="phone__eyebrow">Итальянская кухня</p>
      <h3>Выберите любимое блюдо</h3>
      <div class="phone__tabs"><span class="is-active">Популярное</span><span>Паста</span><span>Десерты</span></div>
      <article class="dish-card"><div class="dish-card__visual dish-card__visual--green"><span>Буррата</span></div><div><strong>Буррата с томатами</strong><small>Томаты · базилик · орехи</small><b>€13.50</b></div></article>
      <article class="dish-card dish-card--short"><div class="dish-card__visual dish-card__visual--gold"><span>Паста</span></div><div><strong>Тальятелле с грибами</strong><small>Вегетарианское</small><b>€16.00</b></div></article>
      <div class="phone__actions"><button type="button">Забронировать</button><button type="button" aria-label="Позвонить">☎</button><button type="button" aria-label="Маршрут">⌁</button></div>
    </div>
  </div>`;
}

function analyticsWidget() {
  return `<aside class="analytics-float" aria-label="Пример аналитики">
    <div class="analytics-float__head"><span>За 30 дней</span><i></i></div>
    <strong>2 481</strong><span>посетитель меню</span>
    <div class="spark-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="analytics-float__foot"><span>↗ 18%</span><span>к прошлому периоду</span></div>
  </aside>`;
}

function sectionHead(eyebrow, title, intro = '') {
  return `<div class="section-head"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2>${intro ? `<p class="section-intro">${intro}</p>` : ''}</div>`;
}

function renderPage() {
  const c = content;
  root.innerHTML = `
    <header class="site-header" data-header>
      <div class="container header-inner">
        <a href="#top" class="brand" aria-label="${c.brand}: на главную"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>${c.brand}</span></a>
        <button class="menu-toggle" type="button" aria-controls="site-navigation" aria-expanded="false"><span></span><span></span><span></span><b>Меню</b></button>
        <nav class="site-navigation" id="site-navigation" aria-label="Основная навигация">
          ${c.navigation.map(([href, label]) => `<a href="#${href}">${label}</a>`).join('')}
        </nav>
        <a class="button button--header" href="#demo" data-track="hero_demo_click">${c.ctas.demo}</a>
      </div>
    </header>

    <main id="main-content">
      <section class="hero" id="top">
        <div class="container hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">${c.hero.eyebrow}</p>
            <h1>${c.hero.title}</h1>
            <p class="hero-copy__lead">${c.hero.description}</p>
            <div class="hero-actions"><a class="button button--primary" href="#demo" data-track="hero_demo_click">${c.ctas.demo}${icon('→')}</a><a class="button button--text" href="#examples" data-track="example_click">${c.ctas.viewExample}<span aria-hidden="true">↓</span></a></div>
            <ul class="trust-list">${c.hero.trust.map((item) => `<li>${check()}${item}</li>`).join('')}</ul>
          </div>
          <div class="hero-product" aria-label="Пример меню и аналитики">
            <div class="hero-orbit hero-orbit--one"></div><div class="hero-orbit hero-orbit--two"></div>
            ${productPhone()}${analyticsWidget()}
            <div class="google-card"><span class="google-card__pin">⌖</span><div><small>Гость пришёл из</small><strong>Google Maps</strong></div><span class="google-card__rating">4.8 ★</span></div>
          </div>
        </div>
      </section>

      <section class="section section--sand" id="before-after">
        <div class="container">${sectionHead(c.beforeAfter.eyebrow, c.beforeAfter.title)}
          <div class="comparison-visual" data-compare>
            <article class="legacy-menu"><div class="legacy-menu__paper"><span class="legacy-menu__logo">Ristorante <b>Roma</b></span><span class="legacy-menu__rule"></span><p>ANTIPASTI</p><div><b>Bruschetta</b><span>€8</span></div><div><b>Carpaccio</b><span>€14</span></div><p>PASTA</p><div><b>Tagliatelle al ragù</b><span>€18</span></div><div><b>Lasagne</b><span>€16</span></div><small>Service included · Allergens on request</small></div><div class="comparison-caption"><span class="caption-state">${c.beforeAfter.before.label}</span><h3>${c.beforeAfter.before.title}</h3><ul>${c.beforeAfter.before.bullets.map((item) => `<li><span>—</span>${item}</li>`).join('')}</ul></div></article>
            <div class="compare-divider"><span>вместо</span><i aria-hidden="true">→</i></div>
            <article class="modern-menu">${productPhone({ dark: true })}<div class="comparison-caption"><span class="caption-state caption-state--good">${c.beforeAfter.after.label}</span><h3>${c.beforeAfter.after.title}</h3><ul>${c.beforeAfter.after.bullets.map((item) => `<li>${check()}${item}</li>`).join('')}</ul></div></article>
          </div>
        </div>
      </section>

      <section class="section problem" id="problem"><div class="container problem-grid">${sectionHead(c.problem.eyebrow, c.problem.title)}
        <div class="journey-card"><p>Путь гостя</p><ol>${c.problem.chain.map((item, index) => `<li><span>0${index + 1}</span><strong>${item}</strong></li>`).join('')}</ol></div>
        <div class="pain-grid">${c.problem.pains.map((item, index) => `<article><span>0${index + 1}</span><p>${item}</p></article>`).join('')}</div>
      </div></section>

      <section class="section solution" id="features"><div class="container solution-grid">
        <div class="solution-copy">${sectionHead(c.solution.eyebrow, c.solution.title, c.solution.description)}<div class="solution-tags">${c.solution.items.map((item) => `<span>${item}</span>`).join('')}</div></div>
        <div class="solution-stage">${productPhone()}<span class="solution-tag solution-tag--a">Переводы</span><span class="solution-tag solution-tag--b">Аллергены</span><span class="solution-tag solution-tag--c">Бронирование</span><span class="solution-tag solution-tag--d">QR</span></div>
      </div></section>

      <section class="section section--ink benefits"><div class="container">${sectionHead(c.benefits.eyebrow, c.benefits.title)}<div class="benefit-grid">${c.benefits.cards.map((card) => `<article class="benefit-card"><span class="benefit-card__number">${card.number}</span><div class="benefit-card__visual">${card.visual}</div><h3>${card.title}</h3><p>${card.body}</p><span class="benefit-card__arrow">↗</span></article>`).join('')}</div></div></section>

      <section class="section analytics" id="analytics"><div class="container analytics-grid"><div class="analytics-dashboard"><div class="dashboard-head"><div><span>${c.analytics.note}</span><h3>Последние 30 дней</h3></div><button type="button" tabindex="-1">Скачать отчёт</button></div><div class="metric-grid">${c.analytics.metrics.map(([label, value], index) => `<div class="metric"><span>${label}</span><strong>${value}</strong>${index < 3 ? '<i class="metric-line"></i>' : ''}</div>`).join('')}</div><div class="dashboard-bottom"><div><span>Популярные блюда</span>${c.analytics.popular.map((item, index) => `<p><b>${index + 1}</b>${item}</p>`).join('')}</div><div class="language-chart"><span>Языки</span><p><b>Deutsch</b><i style="--value:50%"></i><em>50%</em></p><p><b>English</b><i style="--value:38%"></i><em>38%</em></p><p><b>Русский</b><i style="--value:12%"></i><em>12%</em></p></div></div></div>
        <div class="analytics-copy">${sectionHead(c.analytics.eyebrow, c.analytics.title)}<ul class="check-list">${c.analytics.bullets.map((item) => `<li>${check()}<span>${item}</span></li>`).join('')}</ul></div></div></section>

      <section class="section section--sand admin"><div class="container admin-grid"><div class="admin-copy">${sectionHead(c.admin.eyebrow, c.admin.title)}<ul class="check-list">${c.admin.bullets.map((item) => `<li>${check()}<span>${item}</span></li>`).join('')}</ul><p class="restore-note">↶ ${c.admin.note}</p></div><div class="admin-panel" aria-label="Пример панели управления"><div class="admin-panel__top"><span>Меню ресторана</span><span class="admin-avatar">M</span></div><div class="admin-panel__body"><p>Основные блюда</p><h3>Венский шницель</h3><label>Цена <span>€18.50</span></label><label>Доступность <span class="availability">● Доступно</span></label><label>Категория <span>Основные блюда ⌄</span></label><label>English <span>Wiener Schnitzel…</span></label><button type="button" tabindex="-1">Сохранить изменения</button></div></div></div></section>

      <section class="section how" id="how"><div class="container">${sectionHead(c.how.eyebrow, c.how.title)}<ol class="steps">${c.how.steps.map((step) => `<li><span>${step.number}</span><div><h3>${step.title}</h3><p>${step.body}</p></div></li>`).join('')}</ol></div></section>

      <section class="section demo-section" id="demo"><div class="container demo-card"><div><p class="eyebrow">Персональная демо-версия</p><h2>${c.form.title}</h2><p>${c.form.description}</p></div>${leadForm('main')}</div></section>

      <section class="section examples" id="examples"><div class="container">${sectionHead(c.examples.eyebrow, c.examples.title, c.examples.description)}<div class="example-grid">${c.examples.items.map((item, index) => `<article class="template-card template-card--${index + 1}"><div class="template-card__mock"><span class="template-card__brand">${index === 0 ? 'LUMIÈRE' : index === 1 ? 'TERRA' : 'NOIR'}</span><i></i><b>${index === 0 ? 'Seasonal table' : index === 1 ? 'Taste the moment' : 'A study in flavour'}</b><small>${index === 1 ? 'BOOK A TABLE' : 'MENU · CONTACT'}</small></div><div class="template-card__copy"><span>0${index + 1}</span><h3>${item.name}</h3><strong>${item.type}</strong><p>${item.description}</p><button type="button" data-track="example_click">Открыть пример <i>↗</i></button></div></article>`).join('')}</div></div></section>

      <section class="section feature-section"><div class="container">${sectionHead(c.features.eyebrow, c.features.title)}<div class="feature-grid">${c.features.items.map((item, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><p>${item}</p>${check()}</article>`).join('')}</div></div></section>

      <section class="section section--ink pricing" id="pricing"><div class="container pricing-grid"><div>${sectionHead(c.pricing.eyebrow, c.pricing.title)}<p class="pricing-note">${c.pricing.note}</p></div><article class="pricing-card"><p>${c.pricing.name}</p><div class="pricing-card__prices"><div><span>${c.pricing.setupLabel}</span><strong>${c.pricing.setupPrice}</strong></div><i>+</i><div><span>${c.pricing.monthlyLabel}</span><strong>${c.pricing.monthlyPrice}</strong></div></div><ul>${c.pricing.includes.map((item) => `<li>${check()}${item}</li>`).join('')}</ul><a href="#demo" class="button button--primary" data-track="pricing_demo_click">${c.ctas.demo}${icon('→')}</a></article></div></section>

      <section class="section comparison-section"><div class="container">${sectionHead(c.comparison.eyebrow, c.comparison.title)}<div class="comparison-table"><div class="comparison-table__head"><span></span><strong>PDF</strong><strong>Наше меню</strong></div>${c.comparison.rows.map(([label, pdf, menu]) => `<div class="comparison-table__row"><span>${label}</span><b class="${pdf ? 'is-yes' : 'is-no'}">${pdf ? '✓' : '—'}</b><b class="is-yes">${menu ? '✓' : '—'}</b></div>`).join('')}</div></div></section>

      <section class="section section--sand faq" id="faq"><div class="container faq-grid"><div>${sectionHead(c.faq.eyebrow, c.faq.title)}<p class="faq-intro">Если не нашли свой вопрос — оставьте ссылку на ресторан в форме, и мы подскажем подходящий сценарий.</p></div><div class="accordion">${c.faq.items.map(([question, answer], index) => `<article><h3><button type="button" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="faq-answer-${index}" id="faq-question-${index}"><span>${question}</span><i aria-hidden="true">+</i></button></h3><div id="faq-answer-${index}" role="region" aria-labelledby="faq-question-${index}" ${index === 0 ? '' : 'hidden'}><p>${answer}</p></div></article>`).join('')}</div></div></section>

      <section class="section final-cta"><div class="container final-card"><div><p class="eyebrow">Без обязательств</p><h2>${c.final.title}</h2><p>${c.final.description}</p><ul class="trust-list">${c.final.trust.map((item) => `<li>${check()}${item}</li>`).join('')}</ul></div>${leadForm('final', { compact: true })}</div></section>
    </main>

    <footer class="site-footer"><div class="container footer-grid"><div><a href="#top" class="brand"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>${c.brand}</span></a><p>Современное онлайн-меню для ресторана — от первого просмотра до действия гостя.</p></div><div><h3>Продукт</h3>${c.footer.product.map((item, index) => `<a href="#${['features', 'how', 'examples', 'pricing'][index]}">${item}</a>`).join('')}</div><div><h3>Компания</h3>${c.footer.company.map((item) => `<a href="#demo">${item}</a>`).join('')}</div><div><h3>Документы</h3>${c.footer.legal.map((item, index) => `<a href="${['/terms', '/privacy', '/dpa', '/legal'][index]}">${item}</a>`).join('')}</div></div><div class="container footer-bottom"><span>© 2026 ${c.brand}</span><span>Сделано для ресторанов и их гостей</span></div></footer>
    <a class="mobile-cta button button--primary" href="#demo" data-track="hero_demo_click">${c.ctas.demo}</a>`;
}

function setupHeader() {
  const header = document.querySelector('[data-header]');
  const toggle = header.querySelector('.menu-toggle');
  const navigation = header.querySelector('.site-navigation');
  const closeMenu = () => {
    header.classList.remove('is-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('is-menu-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  navigation.addEventListener('click', closeMenu);
  window.addEventListener('scroll', () => header.classList.toggle('is-scrolled', window.scrollY > 12), { passive: true });
  header.classList.toggle('is-scrolled', window.scrollY > 12);
}

function setupAccordions() {
  document.querySelectorAll('.accordion button').forEach((button) => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.accordion button').forEach((item) => {
        item.setAttribute('aria-expanded', 'false');
        document.querySelector(`#${item.getAttribute('aria-controls')}`).hidden = true;
      });
      if (!expanded) {
        button.setAttribute('aria-expanded', 'true');
        document.querySelector(`#${button.getAttribute('aria-controls')}`).hidden = false;
        trackEvent('faq_open', { question: button.textContent.trim().replace('+', '') });
      }
    });
  });
}

function validWebsite(value) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function setupForms() {
  document.querySelectorAll('[data-demo-form]').forEach((form) => {
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector('[data-button-label]');
    const setStatus = (message, type = '') => {
      status.textContent = message;
      status.className = `form-status ${type}`;
    };
    form.addEventListener('focusin', () => {
      if (!form.dataset.started) {
        form.dataset.started = 'true';
        trackEvent('demo_form_started', { placement: form.dataset.demoForm });
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const websiteUrl = String(values.get('websiteUrl') || '').trim();
      const email = String(values.get('email') || '').trim();
      const company = String(values.get('company') || '');
      if (!validWebsite(websiteUrl)) {
        setStatus(content.form.invalidSite, 'is-error');
        form.elements.websiteUrl.focus();
        return;
      }
      if (!validEmail(email)) {
        setStatus(content.form.invalidEmail, 'is-error');
        form.elements.email.focus();
        return;
      }
      button.disabled = true;
      label.textContent = 'Отправляем…';
      setStatus('');
      trackEvent('demo_form_submitted', { placement: form.dataset.demoForm });
      try {
        const response = await fetch('/api/demo-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ websiteUrl, email, company, source: 'sales-landing', locale: 'ru' })
        });
        if (!response.ok) throw new Error('Request failed');
        form.reset();
        form.dataset.started = '';
        setStatus(content.form.success, 'is-success');
        trackEvent('demo_form_success', { placement: form.dataset.demoForm });
      } catch {
        setStatus(content.form.error, 'is-error');
        trackEvent('demo_form_error', { placement: form.dataset.demoForm });
      } finally {
        button.disabled = false;
        label.textContent = content.ctas.send;
      }
    });
  });
}

function setupTracking() {
  document.querySelectorAll('[data-track]').forEach((element) => element.addEventListener('click', () => trackEvent(element.dataset.track)));
  const pricing = document.querySelector('#pricing');
  if (pricing && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { trackEvent('pricing_view'); observer.disconnect(); }
    }, { threshold: 0.3 });
    observer.observe(pricing);
  }
}

function addStructuredData() {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: content.brand,
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
    description: content.seo.description,
    provider: { '@type': 'Organization', name: content.brand, url: 'https://menu-on.com/' },
    inLanguage: 'ru'
  });
  document.head.append(script);
}

document.title = content.seo.title;
renderPage();
setupHeader();
setupAccordions();
setupForms();
setupTracking();
addStructuredData();
trackEvent('landing_view');

export { trackEvent };
