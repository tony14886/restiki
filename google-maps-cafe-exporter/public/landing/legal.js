const documents = {
  terms: {
    path: '/terms', key: 'terms', nav: 'Условия использования', eyebrow: 'Документы Menu-on',
    title: 'Условия оказания услуг', subtitle: 'Terms of Service',
    description: 'Условия оказания услуг сервиса Menu-on.',
    lead: 'Полная редакция условий оказания услуг сервиса Menu-on.',
    version: 'Версия 1.0', effective: 'Дата вступления в силу: [ДАТА]',
    source: '/landing/legal-content/terms.md'
  },
  privacy: {
    path: '/privacy', key: 'privacy', nav: 'Политика конфиденциальности', eyebrow: 'Документы Menu-on',
    title: 'Политика конфиденциальности и использования cookies', subtitle: 'Privacy & Cookie Policy',
    description: 'Политика конфиденциальности и использования cookies сервиса Menu-on.',
    lead: 'Полная редакция политики конфиденциальности и использования cookies.',
    version: 'Версия 1.0', effective: 'Последнее обновление: [ДАТА]',
    source: '/landing/legal-content/privacy.md'
  },
  dpa: {
    path: '/dpa', key: 'dpa', nav: 'DPA', eyebrow: 'Документы Menu-on',
    title: 'Соглашение об обработке персональных данных', subtitle: 'Data Processing Agreement',
    description: 'Соглашение об обработке персональных данных (DPA) сервиса Menu-on.',
    lead: 'Полная редакция соглашения об обработке персональных данных между клиентом и исполнителем.',
    version: 'Версия 1.0', effective: 'Дата вступления в силу: [ДАТА]',
    source: '/landing/legal-content/dpa.md'
  },
  legal: {
    path: '/legal', key: 'legal', nav: 'Юридическая информация', eyebrow: 'Документы Menu-on',
    title: 'Юридическая информация', subtitle: '',
    description: 'Информация о порядке заключения договора и документах сервиса Menu-on.',
    lead: 'Здесь объясняем, какие документы получает ресторан до подключения и где фиксируются юридически значимые условия.',
    version: 'Справочная страница', effective: 'Актуально на 12 августа 2026',
    content: `## 1. Статус сервиса

Menu-on предоставляет программные и сопутствующие услуги для создания и поддержки цифрового меню ресторана. Публичный сайт служит для знакомства с продуктом и запроса персональной демо-версии.

Доступ к платной версии предоставляется только после согласования коммерческих условий. Само посещение сайта или отправка заявки не создают обязательства купить сервис.

## 2. Что фиксируется до оплаты

До подключения клиент получает документы, в которых зафиксированы юридическая сторона договора, наименование услуги, тариф, валюта, налоги, период, дата запуска, порядок оплаты и контакты для документооборота.

Если обработка данных клиента требует специальных условий, к заказу присоединяется DPA. Редакция документов сохраняется вместе с фактом акцепта.

## 3. Реквизиты и договорная сторона

Договорной стороной выступает лицо, прямо указанное в выставленном счёте, Order Form или подписанном соглашении. Эти документы содержат актуальные официальные реквизиты, адрес и применимый порядок разрешения споров.

## 4. Документооборот

Коммерческие документы могут направляться на рабочий e-mail представителя клиента или через согласованный кабинет. Если нужна определённая форма договора, инвойса или налогового документа, это обсуждается до оплаты и фиксируется в заказе.

## 5. Контакт по юридическим вопросам

Для первичного обращения используйте форму запроса демо на главной странице. Укажите, что вопрос относится к документам, персональным данным или договору, и приложите только необходимый минимум информации.

Не отправляйте через публичную форму платёжные реквизиты, пароли, копии удостоверений личности или иные чувствительные данные.`
  }
};

const current = Object.values(documents).find((entry) => entry.path === window.location.pathname.replace(/\/$/, '')) || documents.legal;
const root = document.querySelector('#legal-root');
const documentLinks = Object.values(documents).map((entry) => `<a href="${entry.path}"${entry.path === current.path ? ' aria-current="page"' : ''}>${entry.nav}</a>`).join('');

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => inlineMarkdown(cell.trim()));
}

function isTableDivider(line) {
  return /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/u.test(line.trim());
}

function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const output = [];
  let index = 0;
  let skippedTitle = false;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (/^---\s*$/u.test(line)) { output.push('<hr />'); index += 1; continue; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/u);
    if (heading) {
      const level = heading[1].length;
      if (level === 1 && !skippedTitle) { skippedTitle = true; index += 1; continue; }
      const tag = `h${Math.min(level + 1, 4)}`;
      output.push(`<section class="legal-section legal-section--level-${level}"><${tag}>${inlineMarkdown(heading[2])}</${tag}>`);
      index += 1;
      const sectionParts = [];
      while (index < lines.length && !/^(#{1,4})\s+/u.test(lines[index])) {
        if (!lines[index].trim()) { index += 1; continue; }
        if (/^---\s*$/u.test(lines[index])) { sectionParts.push('<hr />'); index += 1; continue; }
        if (lines[index].trim().startsWith('|') && isTableDivider(lines[index + 1] || '')) {
          const headers = tableCells(lines[index]);
          index += 2;
          const rows = [];
          while (index < lines.length && lines[index].trim().startsWith('|')) { rows.push(tableCells(lines[index])); index += 1; }
          sectionParts.push(`<div class="legal-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
          continue;
        }
        const isOrdered = /^\d+\.\s+/u.test(lines[index]);
        const isUnordered = /^(?:\*|-)\s+/u.test(lines[index]);
        if (isOrdered || isUnordered) {
          const pattern = isOrdered ? /^\d+\.\s+(.+)$/u : /^(?:\*|-)\s+(.+)$/u;
          const items = [];
          while (index < lines.length) {
            const match = lines[index].match(pattern);
            if (!match) break;
            items.push(`<li>${inlineMarkdown(match[1])}</li>`);
            index += 1;
          }
          sectionParts.push(`<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`);
          continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/u.test(lines[index]) && !/^---\s*$/u.test(lines[index]) && !/^(?:\*|-)\s+/u.test(lines[index]) && !/^\d+\.\s+/u.test(lines[index]) && !(lines[index].trim().startsWith('|') && isTableDivider(lines[index + 1] || ''))) {
          paragraph.push(lines[index].trim());
          index += 1;
        }
        if (paragraph.length) sectionParts.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      }
      output.push(`${sectionParts.join('')}</section>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/u.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1; }
    if (paragraph.length) output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
  }
  return output.join('');
}

function renderShell() {
  root.innerHTML = `
    <header class="legal-header"><div class="container legal-header__inner">
      <a class="brand" href="/" aria-label="Menu-on, на главную"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu-on</span></a>
      <nav class="legal-header__nav" aria-label="Основная навигация"><a href="/#features">Возможности</a><a href="/#pricing">Стоимость</a><a class="button" href="/#demo">Получить демо</a></nav>
    </div></header>
    <main id="main-content">
      <section class="legal-hero"><div class="container">
        <p class="breadcrumb"><a href="/">Главная</a><span aria-hidden="true">/</span><span>Документы</span></p>
        <div class="legal-hero__grid"><div><p class="eyebrow">${current.eyebrow}</p><h1>${current.title}</h1>${current.subtitle ? `<p class="legal-hero__subtitle">${current.subtitle}</p>` : ''}<p class="legal-hero__lead">${current.lead}</p></div><div class="legal-version"><span>Статус документа</span><strong>${current.version}</strong><small>${current.effective}</small></div></div>
      </div></section>
      <div class="container legal-layout">
        <aside class="document-nav" aria-label="Документы"><span class="document-nav__title">Все документы</span>${documentLinks}<a class="document-nav__home" href="/">← На главную</a></aside>
        <article class="legal-article"><div class="legal-document-content" aria-live="polite"><p class="legal-loading">Загружаем документ…</p></div></article>
      </div>
    </main>
    <footer class="legal-footer"><div class="container legal-footer__grid"><div><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu-on</span></a><p>Современное онлайн-меню для ресторана — от первого просмотра до действия гостя.</p></div><nav class="legal-footer__links" aria-label="Документы">${documentLinks}</nav></div><div class="container legal-footer__bottom">© 2026 Menu-on · Сделано для ресторанов и их гостей</div></footer>`;
}

async function loadDocument() {
  const target = root.querySelector('.legal-document-content');
  try {
    const markdown = current.source ? await fetch(current.source, { headers: { Accept: 'text/markdown' } }).then((response) => {
      if (!response.ok) throw new Error(`Document request failed with ${response.status}`);
      return response.text();
    }) : current.content;
    target.innerHTML = renderMarkdown(markdown);
  } catch (error) {
    target.innerHTML = '<div class="legal-notice"><span class="legal-notice__mark" aria-hidden="true">!</span><p>Документ временно недоступен. Пожалуйста, обновите страницу или вернитесь позже.</p></div>';
  }
}

const canonicalUrl = `https://menu-on.com${current.path}`;
document.title = `${current.title} — Menu-on`;
document.querySelector('meta[name="description"]')?.setAttribute('content', current.description);
document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);
document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${current.title} — Menu-on`);
document.querySelector('meta[property="og:description"]')?.setAttribute('content', current.description);
document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonicalUrl);
renderShell();
loadDocument();
document.dispatchEvent(new CustomEvent('menu-on:track', { detail: { name: 'legal_document_view', properties: { document: current.path }, at: new Date().toISOString() } }));
