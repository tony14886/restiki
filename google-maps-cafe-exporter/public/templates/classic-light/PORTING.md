# Classic Light — porting contract

## Entry points

- `template.html` — shell markup.
- `template.css` — responsive presentation.
- `template.js` — JSON loading, rendering, localization and standalone export.
- `defaults.json` — complete data shape and safe defaults.
- `example-content.json` — working content example.
- `template.manifest.json` — version, supported capabilities and file list.
- `template.anatomy.json` — canonical component map, data paths and diagram numbering.

## Integration

1. Serve every file in this folder from the same public URL.
2. Pass the landing JSON through `?content=<absolute-or-relative-json-url>`, or put it in the `#template-content` script tag in `template.html`.
3. Keep `restaurant.name` and at least one populated `menu.categories[]` / `menu.items[]` pair.
4. Use `data-component`, `data-component-key`, `data-slot` and `data-repeat` as stable integration selectors. Do not select generated UI by its visible text.

## Conditional blocks

Missing optional data removes the matching block: logo, subtitle, address, phone, languages, booking, map, social profiles, individual contact entries and each legal link.

## Repeating blocks

- One `menu-category-tab` and one `menu-category-section` are generated per category with items.
- One `menu-card` is generated per menu item.
- One social link is generated per valid social URL.
- One opening-hours row is generated per schedule entry.

## External dependencies

The default presentation loads Google Fonts and Font Awesome from CDN. Bundle local equivalents or replace these references if your generator must work offline.
