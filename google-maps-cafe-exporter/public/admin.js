const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ADMIN_INTERFACE_LANGUAGES = [['ru', 'Русский'], ['en', 'English'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['it', 'Italiano'], ['cs', 'Čeština'], ['hu', 'Magyar'], ['pl', 'Polski'], ['nl', 'Nederlands'], ['fr', 'Français'], ['hr', 'Hrvatski']];
const adminSiteSlug = new URLSearchParams(window.location.search).get('site') || /^\/sites\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\/?$/u.exec(window.location.pathname)?.[1] || '';
const adminSiteLoginEmail = typeof window.__FASTMENU_SITE_LOGIN_EMAIL === 'string' ? window.__FASTMENU_SITE_LOGIN_EMAIL.trim() : '';
const adminSiteInterfaceLanguage = typeof window.__FASTMENU_SITE_INTERFACE_LANGUAGE === 'string' ? window.__FASTMENU_SITE_INTERFACE_LANGUAGE.trim().toLowerCase().slice(0, 2) : '';
const adminInterfaceLanguageStorageKey = adminSiteSlug ? `fastmenu-admin-interface-language:${adminSiteSlug}` : 'fastmenu-admin-interface-language';
const ADMIN_WEEK_DAYS = [
  ['mon', { ru: 'Понедельник', en: 'Monday', it: 'Lunedì', de: 'Montag', es: 'Lunes', pt: 'Segunda-feira', cs: 'Pondělí', hu: 'Hétfő', pl: 'Poniedziałek', nl: 'Maandag', fr: 'Lundi', hr: 'Ponedjeljak' }],
  ['tue', { ru: 'Вторник', en: 'Tuesday', it: 'Martedì', de: 'Dienstag', es: 'Martes', pt: 'Terça-feira', cs: 'Úterý', hu: 'Kedd', pl: 'Wtorek', nl: 'Dinsdag', fr: 'Mardi', hr: 'Utorak' }],
  ['wed', { ru: 'Среда', en: 'Wednesday', it: 'Mercoledì', de: 'Mittwoch', es: 'Miércoles', pt: 'Quarta-feira', cs: 'Středa', hu: 'Szerda', pl: 'Środa', nl: 'Woensdag', fr: 'Mercredi', hr: 'Srijeda' }],
  ['thu', { ru: 'Четверг', en: 'Thursday', it: 'Giovedì', de: 'Donnerstag', es: 'Jueves', pt: 'Quinta-feira', cs: 'Čtvrtek', hu: 'Csütörtök', pl: 'Czwartek', nl: 'Donderdag', fr: 'Jeudi', hr: 'Četvrtak' }],
  ['fri', { ru: 'Пятница', en: 'Friday', it: 'Venerdì', de: 'Freitag', es: 'Viernes', pt: 'Sexta-feira', cs: 'Pátek', hu: 'Péntek', pl: 'Piątek', nl: 'Vrijdag', fr: 'Vendredi', hr: 'Petak' }],
  ['sat', { ru: 'Суббота', en: 'Saturday', it: 'Sabato', de: 'Samstag', es: 'Sábado', pt: 'Sábado', cs: 'Sobota', hu: 'Szombat', pl: 'Sobota', nl: 'Zaterdag', fr: 'Samedi', hr: 'Subota' }],
  ['sun', { ru: 'Воскресенье', en: 'Sunday', it: 'Domenica', de: 'Sonntag', es: 'Domingo', pt: 'Domingo', cs: 'Neděle', hu: 'Vasárnap', pl: 'Niedziela', nl: 'Zondag', fr: 'Dimanche', hr: 'Nedjelja' }]
];
const ADMIN_LOCALE_TAGS = { ru: 'ru-RU', en: 'en-GB', de: 'de-DE', es: 'es-ES', pt: 'pt-PT', it: 'it-IT', cs: 'cs-CZ', hu: 'hu-HU', pl: 'pl-PL', nl: 'nl-NL', fr: 'fr-FR', hr: 'hr-HR' };
const ADMIN_UI_BASE = {
  overview: 'Overview', menu: 'Menu', hours: 'Opening hours', contacts: 'Contacts', analytics: 'Analytics', domains: 'Domains & QR', support: 'Help & support', logout: 'Sign out',
  draftSaved: 'Draft saved', saving: 'Saving draft…', saveFailed: 'Saving failed', publish: 'Publish', save: 'Save', preview: 'Open preview', publishedMenu: 'View menu website', language: 'Interface language',
  menuTitle: 'Restaurant menu', categories: 'Categories', addCategory: '+ Category', addItem: '+ Item', search: 'Find a dish', all: 'All', nothingFound: 'Nothing found', available: 'Available', unavailable: 'Out of stock', visible: 'Visible', hidden: 'Hidden', name: 'Name', description: 'Description', category: 'Category', price: 'Price', photo: 'Dish photo', uploadPhoto: 'Upload photo', portion: 'Weight / volume', menuType: 'Menu type', variants: 'Sizes and prices', modifiers: 'Modifiers', allergens: 'Allergens', tags: 'Tags', featured: 'Show as bestseller', allergensConfirmed: 'Allergens confirmed',
  hoursTitle: 'Opening hours', regularHours: 'Regular hours', kitchenHours: 'Kitchen hours', specialHours: 'Special hours and closures', addSpecial: '+ Special day', closed: 'Closed', open: 'Open', temporaryClosed: 'Temporarily closed', reopeningDate: 'Reopening date', guestMessage: 'Message for guests',
  contactsTitle: 'Contacts and links', cafeName: 'Venue name', cafeShortDescription: 'Short venue description', phone: 'Phone', venueWebsite: 'Venue website', bookingLink: 'Booking button link', orderLink: 'Order button link', logo: 'Logo', address: 'Address', googleMapsLink: 'Google Maps link', instagram: 'Instagram', facebook: 'Facebook', cafeLongDescription: 'Extended venue description', shortDescriptionHint: 'Shown below the venue name in the menu header.', bookingHint: 'This opens when a guest selects the booking button.', orderHint: 'Optional: link to delivery or takeaway ordering. The current Classic Light template does not show an order button yet.', logoHint: 'Direct link to a logo image: PNG, JPG, WebP or GIF.', addressHint: 'Plain postal address shown in the header and footer.', googleMapsHint: 'Optional direct link to the venue card or directions in Google Maps.', instagramHint: 'Public link to the venue Instagram profile.', facebookHint: 'Public link to the venue Facebook page.', longDescriptionHint: 'Optional text for future templates and SEO. The current Classic Light template does not show it.', analyticsTitle: 'Menu analytics', visitors: 'Visitors', menuViews: 'Menu views', bookings: 'Bookings', calls: 'Calls', directions: 'Directions', orders: 'Orders', sources: 'Sources', devices: 'Devices', menuLanguages: 'Menu languages', dishes: 'Dishes', trend: 'Trend',
  domainsTitle: 'Domains and QR codes', domain: 'Menu domain', primaryDomain: 'Primary domain', saveDomain: 'Save domain', qrCodes: 'QR codes', label: 'Label', shortCode: 'Short code', createQr: 'Create QR link', copy: 'Copy', delete: 'Delete', moveUp: 'Move up', moveDown: 'Move down', restore: 'Restore',
  loginTitle: 'Restaurant sign in', login: 'Login', password: 'Password', signIn: 'Sign in', noEvents: 'No events yet', noViews: 'No views yet', loadingAnalytics: 'Loading analytics…'
};
const ADMIN_UI_TRANSLATIONS = {
  ru: { overview:'Обзор',menu:'Меню',hours:'Часы работы',contacts:'Контакты',analytics:'Аналитика',domains:'Домены и QR',support:'Помощь и поддержка',logout:'Выйти',draftSaved:'Черновик сохранён',saving:'Сохраняем черновик…',publish:'Опубликовать',save:'Сохранить',preview:'Открыть preview',publishedMenu:'Посмотреть сайт-меню',language:'Язык интерфейса',menuTitle:'Меню ресторана',categories:'Категории',addCategory:'+ Категория',addItem:'+ Позиция',search:'Найти блюдо',all:'Все',nothingFound:'Ничего не найдено',available:'Доступно',unavailable:'Нет в наличии',visible:'Показывать',hidden:'Скрыто',name:'Название',description:'Описание',category:'Категория',price:'Цена',photo:'Фото блюда',uploadPhoto:'Загрузить фото',portion:'Вес / объём',menuType:'Тип меню',variants:'Варианты размера и цены',modifiers:'Модификаторы',allergens:'Аллергены',tags:'Теги',hoursTitle:'Часы работы',regularHours:'Обычное расписание',kitchenHours:'Часы кухни',specialHours:'Специальные часы и закрытие',addSpecial:'+ Особый день',closed:'Закрыто',open:'Открыто',temporaryClosed:'Временно закрыто',reopeningDate:'Дата возобновления',guestMessage:'Сообщение для гостей',contactsTitle:'Контакты и ссылки',analyticsTitle:'Аналитика меню',visitors:'Посетители',menuViews:'Просмотры меню',bookings:'Бронирования',calls:'Звонки',directions:'Маршруты',orders:'Заказы',sources:'Источники',devices:'Устройства',menuLanguages:'Языки меню',dishes:'Блюда',trend:'Динамика',domainsTitle:'Домены и QR-коды',domain:'Домен меню',primaryDomain:'Основной домен',saveDomain:'Сохранить домен',qrCodes:'QR-коды',label:'Название',shortCode:'Короткий код',createQr:'Создать QR-ссылку',copy:'Копировать',delete:'Удалить',moveUp:'Выше',moveDown:'Ниже',restore:'Откатить',loginTitle:'Вход в ресторан',password:'Пароль',signIn:'Войти' },
  de: { overview:'Übersicht',menu:'Speisekarte',hours:'Öffnungszeiten',contacts:'Kontakte',analytics:'Analysen',domains:'Domains & QR',support:'Hilfe & Support',logout:'Abmelden',draftSaved:'Entwurf gespeichert',saving:'Entwurf wird gespeichert…',publish:'Veröffentlichen',save:'Speichern',preview:'Vorschau öffnen',publishedMenu:'Menü-Website ansehen',language:'Sprache der Oberfläche',menuTitle:'Restaurantmenü',categories:'Kategorien',addCategory:'+ Kategorie',addItem:'+ Gericht',search:'Gericht suchen',all:'Alle',nothingFound:'Nichts gefunden',available:'Verfügbar',unavailable:'Nicht verfügbar',visible:'Sichtbar',hidden:'Ausgeblendet',name:'Name',description:'Beschreibung',category:'Kategorie',price:'Preis',photo:'Foto des Gerichts',uploadPhoto:'Foto hochladen',portion:'Gewicht / Menge',menuType:'Menütyp',variants:'Größen und Preise',modifiers:'Optionen',allergens:'Allergene',tags:'Tags',hoursTitle:'Öffnungszeiten',regularHours:'Reguläre Öffnungszeiten',kitchenHours:'Küchenzeiten',specialHours:'Sonderzeiten und Schließungen',addSpecial:'+ Besonderer Tag',closed:'Geschlossen',open:'Geöffnet',temporaryClosed:'Vorübergehend geschlossen',reopeningDate:'Wiedereröffnungsdatum',guestMessage:'Nachricht für Gäste',contactsTitle:'Kontakte und Links',analyticsTitle:'Menüanalysen',visitors:'Besucher',menuViews:'Menüaufrufe',bookings:'Reservierungen',calls:'Anrufe',directions:'Routen',orders:'Bestellungen',sources:'Quellen',devices:'Geräte',menuLanguages:'Menüsprachen',dishes:'Gerichte',trend:'Trend',domainsTitle:'Domains und QR-Codes',domain:'Menüdomain',primaryDomain:'Primäre Domain',saveDomain:'Domain speichern',qrCodes:'QR-Codes',label:'Bezeichnung',shortCode:'Kurzcode',createQr:'QR-Link erstellen',copy:'Kopieren',delete:'Löschen',moveUp:'Nach oben',moveDown:'Nach unten',restore:'Wiederherstellen',loginTitle:'Restaurant-Anmeldung',password:'Passwort',signIn:'Anmelden' },
  es: { overview:'Resumen',menu:'Menú',hours:'Horario',contacts:'Contactos',analytics:'Analítica',domains:'Dominios y QR',support:'Ayuda y soporte',logout:'Cerrar sesión',draftSaved:'Borrador guardado',saving:'Guardando borrador…',publish:'Publicar',save:'Guardar',preview:'Abrir vista previa',publishedMenu:'Ver sitio web del menú',language:'Idioma de la interfaz',menuTitle:'Menú del restaurante',categories:'Categorías',addCategory:'+ Categoría',addItem:'+ Plato',search:'Buscar un plato',all:'Todo',nothingFound:'No se encontró nada',available:'Disponible',unavailable:'No disponible',visible:'Visible',hidden:'Oculto',name:'Nombre',description:'Descripción',category:'Categoría',price:'Precio',photo:'Foto del plato',uploadPhoto:'Subir foto',portion:'Peso / volumen',menuType:'Tipo de menú',variants:'Tamaños y precios',modifiers:'Modificadores',allergens:'Alérgenos',tags:'Etiquetas',hoursTitle:'Horario de apertura',regularHours:'Horario habitual',kitchenHours:'Horario de cocina',specialHours:'Horarios especiales y cierres',addSpecial:'+ Día especial',closed:'Cerrado',open:'Abierto',temporaryClosed:'Cerrado temporalmente',reopeningDate:'Fecha de reapertura',guestMessage:'Mensaje para clientes',contactsTitle:'Contactos y enlaces',analyticsTitle:'Analítica del menú',visitors:'Visitantes',menuViews:'Vistas del menú',bookings:'Reservas',calls:'Llamadas',directions:'Rutas',orders:'Pedidos',sources:'Fuentes',devices:'Dispositivos',menuLanguages:'Idiomas del menú',dishes:'Platos',trend:'Tendencia',domainsTitle:'Dominios y códigos QR',domain:'Dominio del menú',primaryDomain:'Dominio principal',saveDomain:'Guardar dominio',qrCodes:'Códigos QR',label:'Etiqueta',shortCode:'Código corto',createQr:'Crear enlace QR',copy:'Copiar',delete:'Eliminar',moveUp:'Subir',moveDown:'Bajar',restore:'Restaurar',loginTitle:'Acceso al restaurante',password:'Contraseña',signIn:'Iniciar sesión' },
  pt: { overview:'Visão geral',menu:'Menu',hours:'Horário',contacts:'Contactos',analytics:'Análises',domains:'Domínios e QR',support:'Ajuda e suporte',logout:'Terminar sessão',draftSaved:'Rascunho guardado',saving:'A guardar rascunho…',publish:'Publicar',save:'Guardar',preview:'Abrir pré-visualização',publishedMenu:'Ver site do menu',language:'Idioma da interface',menuTitle:'Menu do restaurante',categories:'Categorias',addCategory:'+ Categoria',addItem:'+ Prato',search:'Procurar prato',all:'Tudo',nothingFound:'Nada encontrado',available:'Disponível',unavailable:'Indisponível',visible:'Visível',hidden:'Oculto',name:'Nome',description:'Descrição',category:'Categoria',price:'Preço',photo:'Foto do prato',uploadPhoto:'Carregar foto',portion:'Peso / volume',menuType:'Tipo de menu',variants:'Tamanhos e preços',modifiers:'Modificadores',allergens:'Alergénios',tags:'Etiquetas',hoursTitle:'Horário de funcionamento',regularHours:'Horário regular',kitchenHours:'Horário da cozinha',specialHours:'Horários especiais e encerramentos',addSpecial:'+ Dia especial',closed:'Fechado',open:'Aberto',temporaryClosed:'Fechado',reopeningDate:'Data de reabertura',guestMessage:'Mensagem para clientes',contactsTitle:'Contactos e links',analyticsTitle:'Análises do menu',visitors:'Visitantes',menuViews:'Visualizações do menu',bookings:'Reservas',calls:'Chamadas',directions:'Rotas',orders:'Pedidos',sources:'Origens',devices:'Dispositivos',menuLanguages:'Idiomas do menu',dishes:'Pratos',trend:'Tendência',domainsTitle:'Domínios e códigos QR',domain:'Domínio do menu',primaryDomain:'Domínio principal',saveDomain:'Guardar domínio',qrCodes:'Códigos QR',label:'Etiqueta',shortCode:'Código curto',createQr:'Criar ligação QR',copy:'Copiar',delete:'Eliminar',moveUp:'Subir',moveDown:'Descer',restore:'Restaurar',loginTitle:'Início de sessão do restaurante',password:'Palavra-passe',signIn:'Iniciar sessão' },
  it: { overview:'Panoramica',menu:'Menu',hours:'Orari',contacts:'Contatti',analytics:'Analisi',domains:'Domini e QR',support:'Aiuto e supporto',logout:'Esci',draftSaved:'Bozza salvata',saving:'Salvataggio bozza…',publish:'Pubblica',save:'Salva',preview:'Apri anteprima',publishedMenu:'Vedi il sito del menu',language:'Lingua dell’interfaccia',menuTitle:'Menu del ristorante',categories:'Categorie',addCategory:'+ Categoria',addItem:'+ Piatto',search:'Cerca un piatto',all:'Tutto',nothingFound:'Nessun risultato',available:'Disponibile',unavailable:'Non disponibile',visible:'Visibile',hidden:'Nascosto',name:'Nome',description:'Descrizione',category:'Categoria',price:'Prezzo',photo:'Foto del piatto',uploadPhoto:'Carica foto',portion:'Peso / volume',menuType:'Tipo di menu',variants:'Formati e prezzi',modifiers:'Modificatori',allergens:'Allergeni',tags:'Tag',hoursTitle:'Orari di apertura',regularHours:'Orario abituale',kitchenHours:'Orari della cucina',specialHours:'Orari speciali e chiusure',addSpecial:'+ Giorno speciale',closed:'Chiuso',open:'Aperto',temporaryClosed:'Chiuso temporaneamente',reopeningDate:'Data di riapertura',guestMessage:'Messaggio per gli ospiti',contactsTitle:'Contatti e link',analyticsTitle:'Analisi del menu',visitors:'Visitatori',menuViews:'Visualizzazioni menu',bookings:'Prenotazioni',calls:'Chiamate',directions:'Indicazioni',orders:'Ordini',sources:'Fonti',devices:'Dispositivi',menuLanguages:'Lingue del menu',dishes:'Piatti',trend:'Andamento',domainsTitle:'Domini e codici QR',domain:'Dominio del menu',primaryDomain:'Dominio principale',saveDomain:'Salva dominio',qrCodes:'Codici QR',label:'Etichetta',shortCode:'Codice breve',createQr:'Crea link QR',copy:'Copia',delete:'Elimina',moveUp:'Sposta su',moveDown:'Sposta giù',restore:'Ripristina',loginTitle:'Accesso al ristorante',password:'Password',signIn:'Accedi' }
};
Object.assign(ADMIN_UI_TRANSLATIONS.ru, {
  cafeName: 'Название кафе', cafeShortDescription: 'Короткое описание кафе', phone: 'Телефон', venueWebsite: 'Сайт заведения', bookingLink: 'Ссылка кнопки бронирования', orderLink: 'Ссылка кнопки заказа', logo: 'Логотип', address: 'Адрес', googleMapsLink: 'Ссылка на Google Maps', cafeLongDescription: 'Расширенное описание кафе',
  shortDescriptionHint: 'Отображается под названием кафе в шапке сайта-меню.', bookingHint: 'Откроется, когда гость нажмёт кнопку бронирования.', orderHint: 'Необязательно. Ссылка на доставку или заказ навынос. В текущем шаблоне кнопка заказа пока не показывается.', logoHint: 'Прямая ссылка на изображение логотипа: PNG, JPG, WebP или GIF.', addressHint: 'Обычный почтовый адрес — в шапке и футере он будет кликабельной ссылкой на Google Maps.', googleMapsHint: 'Необязательно. Адрес в шапке и футере откроет эту ссылку в Google Maps.', longDescriptionHint: 'Необязательный текст для будущих шаблонов и SEO. В текущем шаблоне Classic Light он не выводится.'
});
Object.assign(ADMIN_UI_TRANSLATIONS.ru, {
  instagram: 'Instagram', facebook: 'Facebook',
  instagramHint: 'Ссылка на публичный профиль кафе в Instagram.',
  facebookHint: 'Ссылка на публичную страницу кафе в Facebook.'
});
for (const [code, source] of Object.entries({ cs: 'en', hu: 'en', pl: 'en', nl: 'en', fr: 'en', hr: 'en' })) ADMIN_UI_TRANSLATIONS[code] = { ...ADMIN_UI_BASE, ...ADMIN_UI_TRANSLATIONS[source] };
Object.assign(ADMIN_UI_TRANSLATIONS, {
  cs: { ...ADMIN_UI_TRANSLATIONS.cs, overview:'Přehled',menu:'Menu',hours:'Otevírací doba',contacts:'Kontakty',analytics:'Analytika',domains:'Domény a QR',support:'Nápověda a podpora',logout:'Odhlásit se',draftSaved:'Koncept uložen',saving:'Ukládání konceptu…',publish:'Publikovat',save:'Uložit',preview:'Otevřít náhled',publishedMenu:'Publikované menu',language:'Jazyk rozhraní',menuTitle:'Menu restaurace',categories:'Kategorie',addCategory:'+ Kategorie',addItem:'+ Položka',search:'Hledat jídlo',all:'Vše',nothingFound:'Nic nenalezeno',available:'Dostupné',unavailable:'Nedostupné',visible:'Viditelné',hidden:'Skryté',name:'Název',description:'Popis',category:'Kategorie',price:'Cena',photo:'Fotka jídla',uploadPhoto:'Nahrát fotku',portion:'Hmotnost / objem',menuType:'Typ menu',variants:'Velikosti a ceny',modifiers:'Doplňky',allergens:'Alergeny',tags:'Štítky',hoursTitle:'Otevírací doba',regularHours:'Běžná otevírací doba',kitchenHours:'Hodiny kuchyně',specialHours:'Zvláštní doba a uzavření',closed:'Zavřeno',open:'Otevřeno',temporaryClosed:'Dočasně zavřeno',contactsTitle:'Kontakty a odkazy',analyticsTitle:'Analytika menu',visitors:'Návštěvníci',menuViews:'Zobrazení menu',bookings:'Rezervace',calls:'Volání',directions:'Trasy',orders:'Objednávky',sources:'Zdroje',devices:'Zařízení',menuLanguages:'Jazyky menu',dishes:'Jídla',domainsTitle:'Domény a QR kódy',domain:'Doména menu',primaryDomain:'Hlavní doména',saveDomain:'Uložit doménu',qrCodes:'QR kódy',createQr:'Vytvořit QR odkaz',copy:'Kopírovat',delete:'Smazat',loginTitle:'Přihlášení do restaurace',password:'Heslo',signIn:'Přihlásit se' },
  hu: { ...ADMIN_UI_TRANSLATIONS.hu, overview:'Áttekintés',menu:'Étlap',hours:'Nyitvatartás',contacts:'Kapcsolatok',analytics:'Analitika',domains:'Domainek és QR',support:'Súgó és támogatás',logout:'Kijelentkezés',draftSaved:'Piszkozat mentve',saving:'Piszkozat mentése…',publish:'Közzététel',save:'Mentés',preview:'Előnézet megnyitása',publishedMenu:'Közzétett étlap',language:'Felület nyelve',menuTitle:'Éttermi étlap',categories:'Kategóriák',addCategory:'+ Kategória',addItem:'+ Tétel',search:'Étel keresése',all:'Összes',nothingFound:'Nincs találat',available:'Elérhető',unavailable:'Nem elérhető',visible:'Látható',hidden:'Rejtett',name:'Név',description:'Leírás',category:'Kategória',price:'Ár',photo:'Étel fotója',uploadPhoto:'Fotó feltöltése',portion:'Tömeg / mennyiség',menuType:'Étlap típusa',variants:'Méret és ár',modifiers:'Módosítók',allergens:'Allergének',tags:'Címkék',hoursTitle:'Nyitvatartás',regularHours:'Általános nyitvatartás',kitchenHours:'Konyha nyitvatartása',specialHours:'Különleges órák és zárások',closed:'Zárva',open:'Nyitva',temporaryClosed:'Ideiglenesen zárva',contactsTitle:'Kapcsolatok és linkek',analyticsTitle:'Étlap-analitika',visitors:'Látogatók',menuViews:'Étlapmegtekintések',bookings:'Foglalások',calls:'Hívások',directions:'Útvonalak',orders:'Rendelések',sources:'Források',devices:'Eszközök',menuLanguages:'Étlap nyelvei',dishes:'Ételek',domainsTitle:'Domainek és QR-kódok',domain:'Étlapdomain',primaryDomain:'Elsődleges domain',saveDomain:'Domain mentése',qrCodes:'QR-kódok',createQr:'QR-link létrehozása',copy:'Másolás',delete:'Törlés',loginTitle:'Éttermi bejelentkezés',password:'Jelszó',signIn:'Belépés' },
  pl: { ...ADMIN_UI_TRANSLATIONS.pl, overview:'Przegląd',menu:'Menu',hours:'Godziny otwarcia',contacts:'Kontakty',analytics:'Analityka',domains:'Domeny i QR',support:'Pomoc i wsparcie',logout:'Wyloguj',draftSaved:'Szkic zapisany',saving:'Zapisywanie szkicu…',publish:'Opublikuj',save:'Zapisz',preview:'Otwórz podgląd',publishedMenu:'Opublikowane menu',language:'Język interfejsu',menuTitle:'Menu restauracji',categories:'Kategorie',addCategory:'+ Kategoria',addItem:'+ Pozycja',search:'Znajdź danie',all:'Wszystko',nothingFound:'Nic nie znaleziono',available:'Dostępne',unavailable:'Niedostępne',visible:'Widoczne',hidden:'Ukryte',name:'Nazwa',description:'Opis',category:'Kategoria',price:'Cena',photo:'Zdjęcie dania',uploadPhoto:'Prześlij zdjęcie',portion:'Waga / objętość',menuType:'Typ menu',variants:'Rozmiary i ceny',modifiers:'Modyfikatory',allergens:'Alergeny',tags:'Tagi',hoursTitle:'Godziny otwarcia',regularHours:'Standardowe godziny',kitchenHours:'Godziny kuchni',specialHours:'Godziny specjalne i zamknięcia',closed:'Zamknięte',open:'Otwarte',temporaryClosed:'Tymczasowo zamknięte',contactsTitle:'Kontakty i linki',analyticsTitle:'Analityka menu',visitors:'Odwiedzający',menuViews:'Wyświetlenia menu',bookings:'Rezerwacje',calls:'Połączenia',directions:'Trasy',orders:'Zamówienia',sources:'Źródła',devices:'Urządzenia',menuLanguages:'Języki menu',dishes:'Dania',domainsTitle:'Domeny i kody QR',domain:'Domena menu',primaryDomain:'Główna domena',saveDomain:'Zapisz domenę',qrCodes:'Kody QR',createQr:'Utwórz link QR',copy:'Kopiuj',delete:'Usuń',loginTitle:'Logowanie do restauracji',password:'Hasło',signIn:'Zaloguj się' },
  nl: { ...ADMIN_UI_TRANSLATIONS.nl, overview:'Overzicht',menu:'Menu',hours:'Openingstijden',contacts:'Contacten',analytics:'Analyses',domains:'Domeinen en QR',support:'Hulp en ondersteuning',logout:'Afmelden',draftSaved:'Concept opgeslagen',saving:'Concept opslaan…',publish:'Publiceren',save:'Opslaan',preview:'Voorbeeld openen',publishedMenu:'Gepubliceerd menu',language:'Interfacetaal',menuTitle:'Restaurantmenu',categories:'Categorieën',addCategory:'+ Categorie',addItem:'+ Item',search:'Zoek een gerecht',all:'Alles',nothingFound:'Niets gevonden',available:'Beschikbaar',unavailable:'Niet beschikbaar',visible:'Zichtbaar',hidden:'Verborgen',name:'Naam',description:'Beschrijving',category:'Categorie',price:'Prijs',photo:'Foto van gerecht',uploadPhoto:'Foto uploaden',portion:'Gewicht / volume',menuType:'Menutype',variants:'Maten en prijzen',modifiers:'Opties',allergens:'Allergenen',tags:'Tags',hoursTitle:'Openingstijden',regularHours:'Reguliere openingstijden',kitchenHours:'Keukenuren',specialHours:'Speciale uren en sluitingen',closed:'Gesloten',open:'Open',temporaryClosed:'Tijdelijk gesloten',contactsTitle:'Contacten en links',analyticsTitle:'Menu-analyses',visitors:'Bezoekers',menuViews:'Menuweergaven',bookings:'Reserveringen',calls:'Oproepen',directions:'Routes',orders:'Bestellingen',sources:'Bronnen',devices:'Apparaten',menuLanguages:'Menutalen',dishes:'Gerechten',domainsTitle:'Domeinen en QR-codes',domain:'Menudomein',primaryDomain:'Primair domein',saveDomain:'Domein opslaan',qrCodes:'QR-codes',createQr:'QR-link maken',copy:'Kopiëren',delete:'Verwijderen',loginTitle:'Restaurant aanmelden',password:'Wachtwoord',signIn:'Aanmelden' },
  fr: { ...ADMIN_UI_TRANSLATIONS.fr, overview:'Aperçu',menu:'Menu',hours:'Horaires',contacts:'Contacts',analytics:'Analytique',domains:'Domaines et QR',support:'Aide et support',logout:'Se déconnecter',draftSaved:'Brouillon enregistré',saving:'Enregistrement du brouillon…',publish:'Publier',save:'Enregistrer',preview:'Ouvrir l’aperçu',publishedMenu:'Menu publié',language:'Langue de l’interface',menuTitle:'Menu du restaurant',categories:'Catégories',addCategory:'+ Catégorie',addItem:'+ Plat',search:'Rechercher un plat',all:'Tout',nothingFound:'Aucun résultat',available:'Disponible',unavailable:'Indisponible',visible:'Visible',hidden:'Masqué',name:'Nom',description:'Description',category:'Catégorie',price:'Prix',photo:'Photo du plat',uploadPhoto:'Téléverser une photo',portion:'Poids / volume',menuType:'Type de menu',variants:'Tailles et prix',modifiers:'Modificateurs',allergens:'Allergènes',tags:'Étiquettes',hoursTitle:'Horaires d’ouverture',regularHours:'Horaires habituels',kitchenHours:'Horaires de cuisine',specialHours:'Horaires spéciaux et fermetures',closed:'Fermé',open:'Ouvert',temporaryClosed:'Fermé temporairement',contactsTitle:'Contacts et liens',analyticsTitle:'Analytique du menu',visitors:'Visiteurs',menuViews:'Vues du menu',bookings:'Réservations',calls:'Appels',directions:'Itinéraires',orders:'Commandes',sources:'Sources',devices:'Appareils',menuLanguages:'Langues du menu',dishes:'Plats',domainsTitle:'Domaines et codes QR',domain:'Domaine du menu',primaryDomain:'Domaine principal',saveDomain:'Enregistrer le domaine',qrCodes:'Codes QR',createQr:'Créer un lien QR',copy:'Copier',delete:'Supprimer',loginTitle:'Connexion au restaurant',password:'Mot de passe',signIn:'Se connecter' },
  hr: { ...ADMIN_UI_TRANSLATIONS.hr, overview:'Pregled',menu:'Jelovnik',hours:'Radno vrijeme',contacts:'Kontakti',analytics:'Analitika',domains:'Domene i QR',support:'Pomoć i podrška',logout:'Odjava',draftSaved:'Skica spremljena',saving:'Spremanje skice…',publish:'Objavi',save:'Spremi',preview:'Otvori pregled',publishedMenu:'Objavljeni jelovnik',language:'Jezik sučelja',menuTitle:'Jelovnik restorana',categories:'Kategorije',addCategory:'+ Kategorija',addItem:'+ Stavka',search:'Pronađi jelo',all:'Sve',nothingFound:'Ništa nije pronađeno',available:'Dostupno',unavailable:'Nedostupno',visible:'Vidljivo',hidden:'Skriveno',name:'Naziv',description:'Opis',category:'Kategorija',price:'Cijena',photo:'Fotografija jela',uploadPhoto:'Učitaj fotografiju',portion:'Težina / volumen',menuType:'Vrsta jelovnika',variants:'Veličine i cijene',modifiers:'Dodaci',allergens:'Alergeni',tags:'Oznake',hoursTitle:'Radno vrijeme',regularHours:'Redovno radno vrijeme',kitchenHours:'Radno vrijeme kuhinje',specialHours:'Posebno vrijeme i zatvaranja',closed:'Zatvoreno',open:'Otvoreno',temporaryClosed:'Privremeno zatvoreno',contactsTitle:'Kontakti i poveznice',analyticsTitle:'Analitika jelovnika',visitors:'Posjetitelji',menuViews:'Pregledi jelovnika',bookings:'Rezervacije',calls:'Pozivi',directions:'Upute',orders:'Narudžbe',sources:'Izvori',devices:'Uređaji',menuLanguages:'Jezici jelovnika',dishes:'Jela',domainsTitle:'Domene i QR kodovi',domain:'Domena jelovnika',primaryDomain:'Glavna domena',saveDomain:'Spremi domenu',qrCodes:'QR kodovi',createQr:'Izradi QR poveznicu',copy:'Kopiraj',delete:'Izbriši',loginTitle:'Prijava u restoran',password:'Lozinka',signIn:'Prijavi se' }
});
Object.assign(ADMIN_UI_TRANSLATIONS, {
  cs: { ...ADMIN_UI_TRANSLATIONS.cs, publishedMenu: 'Zobrazit web menu' },
  hu: { ...ADMIN_UI_TRANSLATIONS.hu, publishedMenu: 'Menüwebhely megtekintése' },
  pl: { ...ADMIN_UI_TRANSLATIONS.pl, publishedMenu: 'Zobacz stronę menu' },
  nl: { ...ADMIN_UI_TRANSLATIONS.nl, publishedMenu: 'Menwebsite bekijken' },
  fr: { ...ADMIN_UI_TRANSLATIONS.fr, publishedMenu: 'Voir le site du menu' },
  hr: { ...ADMIN_UI_TRANSLATIONS.hr, publishedMenu: 'Pogledajte web-stranicu jelovnika' }
});
let interfaceLanguage = localStorage.getItem(adminInterfaceLanguageStorageKey) || adminSiteInterfaceLanguage || (navigator.language || '').slice(0, 2).toLowerCase();
if (!ADMIN_INTERFACE_LANGUAGES.some(([code]) => code === interfaceLanguage)) interfaceLanguage = 'en';
function t(key) { return ADMIN_UI_TRANSLATIONS[interfaceLanguage]?.[key] || ADMIN_UI_BASE[key] || key; }
const ADMIN_LOGIN_COPY = {
  ru: { login: 'Логин', credentials: 'Используйте учётные данные владельца или менеджера.' },
  en: { login: 'Login', credentials: 'Use the owner or manager credentials.' },
  de: { login: 'Benutzername', credentials: 'Verwenden Sie die Zugangsdaten des Inhabers oder Managers.' },
  es: { login: 'Usuario', credentials: 'Use las credenciales del propietario o administrador.' },
  pt: { login: 'Utilizador', credentials: 'Use as credenciais do proprietário ou gestor.' },
  it: { login: 'Nome utente', credentials: 'Usa le credenziali del proprietario o del responsabile.' },
  cs: { login: 'Přihlašovací jméno', credentials: 'Použijte přihlašovací údaje vlastníka nebo správce.' },
  hu: { login: 'Bejelentkezési név', credentials: 'Használja a tulajdonos vagy a kezelő bejelentkezési adatait.' },
  pl: { login: 'Login', credentials: 'Użyj danych logowania właściciela lub menedżera.' },
  nl: { login: 'Gebruikersnaam', credentials: 'Gebruik de inloggegevens van de eigenaar of beheerder.' },
  fr: { login: 'Identifiant', credentials: 'Utilisez les identifiants du propriétaire ou du responsable.' },
  hr: { login: 'Korisničko ime', credentials: 'Upotrijebite podatke za prijavu vlasnika ili upravitelja.' }
};
function loginCopy(key) { return ADMIN_LOGIN_COPY[interfaceLanguage]?.[key] || (key === 'login' ? t('login') : ADMIN_LOGIN_COPY.en[key]); }
function qrCopyLabel(kind) {
  if (interfaceLanguage === 'ru') return kind === 'image' ? 'Копировать QR' : 'Копировать ссылку';
  return kind === 'image' ? 'Copy QR' : 'Copy link';
}
const ADMIN_ALLERGEN_UI_COPY = {
  ru: { placeholder: 'Начните вводить аллерген', hint: 'Выберите все аллергены рецепта и подтвердите сведения перед публикацией.', empty: 'Подходящих обязательных аллергенов нет', remove: 'Удалить' },
  en: { placeholder: 'Start typing an allergen', hint: 'Select every allergen in the recipe and confirm the information before publishing.', empty: 'No matching regulated allergens', remove: 'Remove' },
  de: { placeholder: 'Allergen eingeben', hint: 'Wählen Sie alle Allergene im Rezept und bestätigen Sie die Angaben vor der Veröffentlichung.', empty: 'Keine passenden regulierten Allergene', remove: 'Entfernen' },
  es: { placeholder: 'Escribe un alérgeno', hint: 'Selecciona todos los alérgenos de la receta y confirma los datos antes de publicar.', empty: 'No hay alérgenos regulados coincidentes', remove: 'Eliminar' },
  pt: { placeholder: 'Comece a escrever um alergénio', hint: 'Selecione todos os alergénios da receita e confirme os dados antes de publicar.', empty: 'Não existem alergénios regulamentados correspondentes', remove: 'Remover' },
  it: { placeholder: 'Inizia a digitare un allergene', hint: 'Seleziona tutti gli allergeni della ricetta e conferma i dati prima di pubblicare.', empty: 'Nessun allergene regolamentato corrispondente', remove: 'Rimuovi' },
  cs: { placeholder: 'Začněte psát alergen', hint: 'Vyberte všechny alergeny v receptu a před zveřejněním údaje potvrďte.', empty: 'Žádné odpovídající regulované alergeny', remove: 'Odstranit' },
  hu: { placeholder: 'Kezdje el beírni az allergént', hint: 'Válassza ki a recept minden allergénjét, majd közzététel előtt erősítse meg az adatokat.', empty: 'Nincs megfelelő szabályozott allergén', remove: 'Eltávolítás' },
  pl: { placeholder: 'Zacznij wpisywać alergen', hint: 'Wybierz wszystkie alergeny w przepisie i potwierdź dane przed publikacją.', empty: 'Brak pasujących regulowanych alergenów', remove: 'Usuń' },
  nl: { placeholder: 'Begin een allergeen te typen', hint: 'Selecteer alle allergenen in het recept en bevestig de gegevens vóór publicatie.', empty: 'Geen overeenkomende gereguleerde allergenen', remove: 'Verwijderen' },
  fr: { placeholder: 'Commencez à saisir un allergène', hint: 'Sélectionnez tous les allergènes de la recette et confirmez les informations avant publication.', empty: 'Aucun allergène réglementé correspondant', remove: 'Supprimer' },
  hr: { placeholder: 'Počnite upisivati alergen', hint: 'Odaberite sve alergene u receptu i potvrdite podatke prije objave.', empty: 'Nema odgovarajućih reguliranih alergena', remove: 'Ukloni' }
};
function allergenUi(key) { return ADMIN_ALLERGEN_UI_COPY[interfaceLanguage]?.[key] || ADMIN_ALLERGEN_UI_COPY.en[key]; }
const ADMIN_RUSSIAN_FALLBACK = {
  'Меню · черновик v': 'Menu · draft v', 'Меняйте позиции, цены и доступность. Preview обновляется сразу.': 'Edit items, prices and availability. The preview updates immediately.', 'Редактирование': 'Editing', 'Прямая ссылка или загрузка файла ниже.': 'Direct image URL or upload a file below.', 'Обычное меню': 'Regular menu', 'По одной строке: название | цена.': 'One line per option: name | price.', 'По одной строке: название | доплата.': 'One line per option: name | surcharge.', 'Через запятую. Перед публикацией подтвердите сведения.': 'Separate with commas. Confirm the data before publishing.',
  'Настройки ресторана': 'Restaurant settings', 'Показывайте гостям обычное расписание, праздники и периоды временного закрытия.': 'Show regular hours, holidays and temporary closures to guests.', 'Если ресторан закрыт в конкретный день, включите переключатель.': 'Turn on the switch when the restaurant is closed on a particular day.', 'Необязательно. Заполните, если кухня работает по другому графику.': 'Optional. Fill this in when the kitchen follows a different schedule.', 'Праздники, технические перерывы и временное закрытие имеют приоритет над обычным расписанием.': 'Holidays, technical breaks and temporary closures take priority over regular hours.',
  'Эти данные используются в шапке, футере и кнопках вашего меню.': 'This information is used in the header, footer and actions in your menu.', 'Privacy-first analytics': 'Privacy-first analytics', 'Анонимные события без IP, fingerprint и постоянных пользовательских идентификаторов.': 'Anonymous events without IP addresses, fingerprints or persistent user identifiers.', 'Публичные ссылки': 'Public links', 'QR-коды ведут на отслеживаемые ссылки и автоматически учитывают сканирования.': 'QR codes lead to tracked links and automatically count scans.', 'Для production подключите DNS и Cloudflare Worker; локально работает localhost.': 'For production, connect DNS and a Cloudflare Worker; localhost works locally.', 'Создайте отдельную отслеживаемую ссылку для столика, стойки или флаера.': 'Create a separate tracked link for a table, counter or flyer.',
  'Ваше меню готово к следующему обновлению.': 'Your menu is ready for the next update.', 'Опубликованная версия': 'Published version', 'Позиций в меню': 'Menu items', 'Требуют внимания': 'Needs attention', 'Последние изменения': 'Recent changes', 'Перед публикацией': 'Before publishing', 'Проверка': 'Checklist', 'История': 'History'
};
const adminOriginalText = new WeakMap();
function applyRussianFallback() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const original = adminOriginalText.get(node) || node.nodeValue;
    const match = original.match(/^(\s*)(.*?)(\s*)$/s);
    const replacement = ADMIN_RUSSIAN_FALLBACK[match?.[2]];
    if (!replacement) continue;
    adminOriginalText.set(node, original);
    node.nodeValue = `${match[1]}${interfaceLanguage === 'ru' ? match[2] : replacement}${match[3]}`;
  }
}

const copy = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const trashIcon = () => '<svg class="trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13"></path></svg>';
const formatDate = (value) => new Intl.DateTimeFormat(ADMIN_LOCALE_TAGS[interfaceLanguage] || 'en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const MENU_CURRENCIES = [
  ['EUR', 'EUR €'], ['RUB', 'RUB ₽'], ['BYN', 'BYN Br'], ['CZK', 'CZK Kč'], ['HUF', 'HUF Ft'], ['PLN', 'PLN zł'],
  ['BGN', 'BGN лв'], ['DKK', 'DKK kr'], ['RON', 'RON lei'], ['SEK', 'SEK kr'], ['KZT', 'KZT ₸'], ['USD', 'USD $'], ['GBP', 'GBP £']
];
const menuCurrencyCode = (value) => MENU_CURRENCIES.some(([code]) => code === String(value || '').toUpperCase()) ? String(value).toUpperCase() : 'EUR';
const menuCurrencyOptions = (value) => {
  const currency = menuCurrencyCode(value);
  return MENU_CURRENCIES.map(([code, label]) => `<option value="${code}" ${code === currency ? 'selected' : ''}>${label}</option>`).join('');
};
const formatPrice = (price) => new Intl.NumberFormat(ADMIN_LOCALE_TAGS[interfaceLanguage] || 'en-GB', { style: 'currency', currency: price?.currency || 'EUR', minimumFractionDigits: 2 }).format(Number(price?.amount || 0));
const formatNumber = (value) => new Intl.NumberFormat(ADMIN_LOCALE_TAGS[interfaceLanguage] || 'en-GB').format(Number(value || 0));

let workspace = null;
let activeView = 'menu';
let activeCategoryId = 'all';
let activeLanguage = 'en';
let selectedItemId = '';
let activeDevice = 'desktop';
let saveTimer = 0;
let saving = false;
let dirty = false;
let csrfToken = '';
let activeAnalyticsPeriod = 30;

const views = {
  menu: ['menu', 'All items'], hours: ['hours', 'Schedule'], contacts: ['contacts', 'Main information'], analytics: ['analytics', 'Last 30 days'], domains: ['domains', 'Public links'], subscription: ['subscription', 'Подключение']
};

function optionLines(values) {
  return (Array.isArray(values) ? values : []).map((entry) => `${entry.name || ''} | ${Number(entry.price || 0).toFixed(2)}`).join('\n');
}

function parseOptionLines(value, prefix) {
  return String(value || '').split(/\r?\n/).map((line, index) => {
    const [rawName, rawPrice = '0'] = line.split('|');
    const name = rawName.trim().slice(0, 80);
    const price = Math.max(0, Math.min(100000, Number(String(rawPrice).replace(',', '.').trim()) || 0));
    return name ? { id: `${prefix}-${index + 1}`, name, price: Math.round(price * 100) / 100 } : null;
  }).filter(Boolean);
}

function draft() {
  return workspace?.draft;
}

function currentLanguage() {
  return draft()?.languages.find((language) => language.code === activeLanguage) || draft()?.languages[0] || { code: 'en', label: 'EN' };
}

function currentItem() {
  return draft()?.menuItems.find((item) => item.id === selectedItemId) || null;
}

function categoryById(id) {
  return draft()?.categories.find((category) => category.id === id) || null;
}

function allergenNormalized(value) {
  return String(value || '').trim().toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function allergenCatalog() {
  return Array.isArray(workspace?.allergenCatalog) ? workspace.allergenCatalog : [];
}

function allergenEntry(value) {
  const raw = String(value || '').trim().replace(/^allergen:/i, '');
  const normalized = allergenNormalized(raw);
  return allergenCatalog().find((entry) => entry.id === raw || Object.values(entry.translations || {}).some((label) => allergenNormalized(label) === normalized)) || null;
}

function allergenLabel(value) {
  const entry = allergenEntry(value);
  return entry?.translations?.[interfaceLanguage] || entry?.translations?.en || String(value || '').replace(/^allergen:/i, '');
}

function selectedAllergenIds(item) {
  return new Set((item?.allergens || []).map((value) => allergenEntry(value)?.id).filter(Boolean));
}

function renderAllergenPicker() {
  const item = currentItem();
  const search = $('#item-allergen-search');
  const chips = $('#allergen-chips');
  const suggestions = $('#allergen-suggestions');
  if (!item || !search || !chips || !suggestions) return;
  const selectedIds = selectedAllergenIds(item);
  const selected = (item.allergens || []).map((value) => ({ value, entry: allergenEntry(value) })).filter(({ value, entry }, index, values) => !entry || values.findIndex((candidate) => candidate.entry?.id === entry.id) === index);
  chips.innerHTML = selected.map(({ value, entry }) => {
    const id = entry?.id || value;
    const label = allergenLabel(value);
    return `<button class="allergen-chip" type="button" data-remove-allergen="${escapeHtml(id)}" aria-label="${escapeHtml(`${allergenUi('remove')}: ${label}`)}"><span>${escapeHtml(label)}</span><b aria-hidden="true">×</b></button>`;
  }).join('');
  const query = allergenNormalized(search.value);
  const matching = allergenCatalog().filter((entry) => !selectedIds.has(entry.id) && (!query || allergenNormalized(entry.id).includes(query) || Object.values(entry.translations || {}).some((label) => allergenNormalized(label).includes(query)))).slice(0, 14);
  const visible = document.activeElement === search;
  suggestions.hidden = !visible;
  search.setAttribute('aria-expanded', String(visible));
  suggestions.innerHTML = matching.length
    ? matching.map((entry) => `<button class="allergen-suggestion" type="button" role="option" data-add-allergen="${escapeHtml(entry.id)}"><span>${escapeHtml(entry.translations?.[interfaceLanguage] || entry.translations?.en || entry.id)}</span><small>${escapeHtml(entry.id.toUpperCase())}</small></button>`).join('')
    : `<p class="allergen-empty">${escapeHtml(allergenUi('empty'))}</p>`;
}

function addAllergen(id) {
  const item = currentItem();
  const entry = allergenCatalog().find((candidate) => candidate.id === id);
  if (!item || !entry || selectedAllergenIds(item).has(entry.id)) return;
  item.allergens = [...(item.allergens || []), `allergen:${entry.id}`];
  $('#item-allergen-search').value = '';
  markDirty();
  renderAllergenPicker();
}

function removeAllergen(id) {
  const item = currentItem();
  if (!item) return;
  item.allergens = (item.allergens || []).filter((value) => allergenEntry(value)?.id !== id && value !== id);
  markDirty();
  renderAllergenPicker();
}

function nextId(prefix) {
  const ids = new Set([...(draft()?.categories || []).map((item) => item.id), ...(draft()?.menuItems || []).map((item) => item.id)]);
  let count = 1;
  while (ids.has(`${prefix}-${count}`)) count += 1;
  return `${prefix}-${count}`;
}

function showToast(message, type = '') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast is-visible ${type}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => { toast.className = 'toast'; }, 3600);
}

function setDirectText(selector, key) {
  $$(selector).forEach((element) => {
    const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
    if (textNode) textNode.nodeValue = ` ${t(key)}`;
    else if (!element.children.length) element.textContent = t(key);
  });
}

function setFieldLabel(selector, key) {
  const field = $(selector);
  if (!field) return;
  const label = field.closest('label');
  if (!label) return;
  const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
  if (textNode) textNode.nodeValue = t(key);
}

function applyInterfaceLanguage() {
  document.documentElement.lang = interfaceLanguage;
  document.title = `${draft()?.restaurant?.name || workspace?.tenant?.name || 'Menu-on'} — ${t('menuTitle')}`;
  const languageControl = $('#interface-language');
  if (languageControl) {
    languageControl.value = interfaceLanguage;
    languageControl.setAttribute('aria-label', t('language'));
  }
  const languageLabel = $('.interface-language-label');
  if (languageLabel) languageLabel.textContent = t('language');
  const staticCopy = [
    ['[data-view="menu"]', 'menu'], ['[data-view="hours"]', 'hours'], ['[data-view="contacts"]', 'contacts'], ['[data-view="analytics"]', 'analytics'], ['[data-view="domains"]', 'domains'], ['[data-action="show-help"]', 'support'], ['[data-action="logout"]', 'logout'],
    ['#saved-state', 'draftSaved'], ['.topbar-actions a.button', 'publishedMenu'], ['.topbar-actions [data-action="publish"]', 'publish'],
    ['[data-view-panel="menu"] .page-heading h1', 'menuTitle'], ['[data-view-panel="menu"] [data-action="manage-categories"]', 'categories'], ['[data-view-panel="menu"] .heading-actions [data-action="add-category"]', 'addCategory'], ['[data-view-panel="menu"] .heading-actions [data-action="add-item"]', 'addItem'],
    ['[data-view-panel="hours"] .page-heading h1', 'hoursTitle'], ['[data-view-panel="hours"] .page-heading [data-action="save-draft"]', 'save'], ['[data-view-panel="hours"] .settings-card:nth-of-type(1) h2', 'regularHours'], ['[data-view-panel="hours"] .settings-card:nth-of-type(2) h2', 'kitchenHours'], ['[data-view-panel="hours"] .settings-card:nth-of-type(3) h2', 'specialHours'], ['[data-view-panel="hours"] [data-action="add-special-hours"]', 'addSpecial'],
    ['[data-view-panel="contacts"] .page-heading h1', 'contactsTitle'], ['[data-view-panel="contacts"] .page-heading [data-action="save-draft"]', 'save'], ['[data-view-panel="analytics"] .page-heading h1', 'analyticsTitle'], ['[data-view-panel="domains"] .page-heading h1', 'domainsTitle'], ['[data-view-panel="domains"] .settings-card:nth-of-type(1) h2', 'domain'], ['[data-view-panel="domains"] .settings-card:nth-of-type(2) h2', 'qrCodes']
  ];
  staticCopy.forEach(([selector, key]) => setDirectText(selector, key));
  [
    ['#item-name', 'name'], ['#item-description', 'description'], ['#item-category', 'category'], ['#item-price', 'price'], ['#item-image-url', 'photo'], ['#item-image-file', 'uploadPhoto'], ['#item-portion', 'portion'], ['#menu-mode', 'menuType'], ['#item-variants', 'variants'], ['#item-modifiers', 'modifiers'], ['#item-allergen-search', 'allergens'], ['#item-tags', 'tags'], ['#item-featured', 'featured'], ['#item-allergens-confirmed', 'allergensConfirmed'],
    ['#temporary-closure', 'temporaryClosed'], ['#closure-resume-date', 'reopeningDate'], ['#closure-message', 'guestMessage'], ['#primary-domain', 'primaryDomain'], ['#qr-label', 'label'], ['#qr-slug', 'shortCode'],
    ['[data-restaurant-field="name"]', 'cafeName'], ['[data-restaurant-field="subtitle"]', 'cafeShortDescription'], ['[data-restaurant-field="phone"]', 'phone'], ['[data-restaurant-field="websiteUrl"]', 'venueWebsite'], ['[data-restaurant-field="bookingUrl"]', 'bookingLink'], ['[data-restaurant-field="orderUrl"]', 'orderLink'], ['[data-restaurant-field="logoUrl"]', 'logo'], ['[data-restaurant-field="address"]', 'address'], ['[data-restaurant-field="mapUrl"]', 'googleMapsLink'], ['[data-restaurant-social="instagram"]', 'instagram'], ['[data-restaurant-social="facebook"]', 'facebook'], ['[data-restaurant-field="description"]', 'cafeLongDescription']
  ].forEach(([selector, key]) => setFieldLabel(selector, key));
  [
    ['[data-contact-help="shortDescriptionHint"]', 'shortDescriptionHint'], ['[data-contact-help="bookingHint"]', 'bookingHint'], ['[data-contact-help="orderHint"]', 'orderHint'], ['[data-contact-help="logoHint"]', 'logoHint'], ['[data-contact-help="addressHint"]', 'addressHint'], ['[data-contact-help="googleMapsHint"]', 'googleMapsHint'], ['[data-contact-help="instagramHint"]', 'instagramHint'], ['[data-contact-help="facebookHint"]', 'facebookHint'], ['[data-contact-help="longDescriptionHint"]', 'longDescriptionHint']
  ].forEach(([selector, key]) => setDirectText(selector, key));
  const attributes = [['#menu-search', 'placeholder', 'search'], ['#item-description', 'placeholder', 'description'], ['#item-image-file', 'aria-label', 'uploadPhoto'], ['#temporary-closure', 'aria-label', 'temporaryClosed'], ['#primary-domain', 'placeholder', 'primaryDomain']];
  attributes.forEach(([selector, attribute, key]) => { const element = $(selector); if (element) element.setAttribute(attribute, t(key)); });
  applyRussianFallback();
}

function renderRestaurantBrand() {
  const restaurant = draft().restaurant || {};
  const name = String(restaurant.name || workspace.tenant?.name || 'Ресторан').trim();
  const subtitle = String(restaurant.subtitle || workspace.domains?.primary || 'Управление меню').trim();
  const mark = name.charAt(0).toLocaleUpperCase() || 'R';
  const brand = $('#restaurant-brand');
  $('#restaurant-brand-name').textContent = name;
  $('#restaurant-brand-subtitle').textContent = subtitle;
  $('#restaurant-brand-mark').textContent = mark;
  if (brand) {
    brand.href = adminSiteSlug ? `/sites/${encodeURIComponent(adminSiteSlug)}` : '/admin.html';
    brand.setAttribute('aria-label', `${name}: ${t('menu')}`);
  }
}

async function adminFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-admin-csrf', csrfToken);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) showLogin('Сессия закончилась. Войдите снова.');
  return response;
}

function showLogin(message = '') {
  document.body.innerHTML = `<main class="login-page"><section class="login-card"><span class="login-mark">H</span><p class="eyebrow">FastMenu · client admin</p><h1>${escapeHtml(t('loginTitle'))}</h1><p>${escapeHtml(loginCopy('credentials'))}</p><form id="login-form"><label>${escapeHtml(loginCopy('login'))}<input id="login-email" type="text" autocomplete="username" required placeholder="owner@restaurant" /></label><label>${escapeHtml(t('password'))}<input id="login-password" type="password" autocomplete="current-password" required /></label><p class="login-error" id="login-error" ${message ? '' : 'hidden'}>${escapeHtml(message)}</p><button class="button button-primary" type="submit">${escapeHtml(t('signIn'))}</button></form></section></main>`;
  const loginForm = $('#login-form');
  const loginInput = $('#login-email');
  if (adminSiteLoginEmail) {
    loginInput.value = adminSiteLoginEmail;
    $('#login-password').focus();
  }
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = $('#login-error');
    error.hidden = true;
    try {
      const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value, site: adminSiteSlug }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить вход.');
      csrfToken = payload.csrfToken;
      window.location.reload();
    } catch (loginError) {
      error.textContent = loginError.message || 'Не удалось выполнить вход.';
      error.hidden = false;
    }
  });
}

function setSavedState(message = t('draftSaved'), state = 'saved') {
  const target = $('#saved-state');
  target.className = `saved-state ${state}`;
  target.innerHTML = `<i></i>${escapeHtml(message)}`;
}

function updateNumbers() {
  $$('[data-draft-number]').forEach((node) => { node.textContent = draft().number; });
  $$('[data-published-number]').forEach((node) => { node.textContent = workspace.published.number; });
  const publishedAt = $('#published-at');
  if (publishedAt) publishedAt.textContent = formatDate(workspace.published.createdAt);
}

function markDirty() {
  if (!workspace) return;
  dirty = true;
  draft().updatedAt = new Date().toISOString();
  setSavedState(t('saving'), 'saving');
  renderCategoryPills();
  renderMenuList();
  renderPreview();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persistDraft(), 700);
}

async function persistDraft() {
  if (!workspace || saving || !dirty) return;
  saving = true;
  dirty = false;
  const sentDraft = copy(draft());
  setSavedState(t('saving'), 'saving');
  try {
    const response = await adminFetch('/api/admin/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: sentDraft })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить черновик.');
    if (JSON.stringify(draft()) === JSON.stringify(sentDraft)) workspace = payload;
    setSavedState(t('draftSaved'), 'saved');
  } catch (error) {
    dirty = true;
    setSavedState(t('saveFailed'), 'error');
    showToast(error.message || 'Не удалось сохранить черновик.', 'error');
  } finally {
    saving = false;
    if (dirty) {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => persistDraft(), 900);
    }
  }
}

async function saveNow() {
  window.clearTimeout(saveTimer);
  if (!dirty) {
    showToast('Все изменения уже сохранены.');
    return;
  }
  await persistDraft();
}

function renderNavigation() {
  $$('.sidebar-nav [data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === activeView));
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== activeView; });
}

function renderCategoryPills() {
  const counts = new Map();
  draft().menuItems.forEach((item) => counts.set(item.categoryId, (counts.get(item.categoryId) || 0) + 1));
  const allCount = draft().menuItems.length;
  $('#category-pills').innerHTML = [
    `<button type="button" class="${activeCategoryId === 'all' ? 'is-active' : ''}" data-category="all">${escapeHtml(t('all'))} <span>${allCount}</span></button>`,
    ...draft().categories.map((category) => `<button type="button" class="${activeCategoryId === category.id ? 'is-active' : ''}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name[currentLanguage().code] || category.name.en || 'Без названия')} <span>${counts.get(category.id) || 0}</span></button>`)
  ].join('');
}

function renderMenuList() {
  const search = $('#menu-search')?.value.trim().toLocaleLowerCase() || '';
  const language = currentLanguage().code;
  const items = draft().menuItems.filter((item) => {
    const matchingCategory = activeCategoryId === 'all' || item.categoryId === activeCategoryId;
    const haystack = `${item.name[language] || ''} ${item.name.en || ''} ${item.description[language] || ''}`.toLocaleLowerCase();
    return matchingCategory && (!search || haystack.includes(search));
  });
  const list = $('#menu-item-list');
  list.innerHTML = items.length ? items.map((item) => {
    const category = categoryById(item.categoryId);
    const isSelected = item.id === selectedItemId;
    const state = item.availability === 'unavailable' ? t('unavailable') : item.visibility === 'hidden' ? t('hidden') : '';
    return `<button type="button" class="menu-row ${isSelected ? 'is-selected' : ''}" data-item-id="${escapeHtml(item.id)}"><span class="food-image ${item.imageUrl ? 'has-image' : ''}">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : '◌'}</span><span class="menu-row-content"><strong>${escapeHtml(item.name[language] || item.name.en || 'Без названия')}</strong><small>${escapeHtml(category?.name[language] || category?.name.en || 'Без категории')}</small></span><span class="menu-row-meta"><b>${escapeHtml(formatPrice(item.price))}</b>${state ? `<small class="${item.availability === 'unavailable' ? 'is-unavailable' : ''}">${escapeHtml(state)}</small>` : ''}</span></button>`;
  }).join('') : `<div class="empty-list"><span>⌕</span><p>${escapeHtml(t('nothingFound'))}</p></div>`;
}

function renderItemEditor() {
  const item = currentItem();
  const empty = $('#empty-editor');
  const form = $('#item-form');
  empty.hidden = Boolean(item);
  form.hidden = !item;
  if (!item) return;
  const language = currentLanguage();
  $('#editing-item-label').textContent = item.name[language.code] || item.name.en || t('addItem');
  $('#item-available').checked = item.availability === 'available';
  $('#item-visible').checked = item.visibility === 'visible';
  $('#item-available-label').textContent = item.availability === 'available' ? t('available') : t('unavailable');
  $('#item-visible-label').textContent = item.visibility === 'visible' ? t('visible') : t('hidden');
  $('#language-tabs').innerHTML = draft().languages.map((entry) => `<button class="${entry.code === language.code ? 'is-active' : ''}" type="button" data-language="${escapeHtml(entry.code)}">${escapeHtml(entry.label)}</button>`).join('');
  $('#item-name').value = item.name[language.code] || item.name.en || '';
  $('#item-description').value = item.description[language.code] || item.description.en || '';
  $('#item-category').innerHTML = draft().categories.map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === item.categoryId ? 'selected' : ''}>${escapeHtml(category.name[language.code] || category.name.en || 'Без названия')}</option>`).join('');
  $('#item-price').value = item.price.amount;
  item.price.currency = menuCurrencyCode(item.price.currency);
  $('#item-currency').innerHTML = menuCurrencyOptions(item.price.currency);
  $('#item-image-url').value = item.imageUrl || '';
  $('#item-portion').value = item.portion || '';
  $('#item-variants').value = optionLines(item.variants);
  $('#item-modifiers').value = optionLines(item.modifiers);
  $('#menu-mode').value = draft().menuMode === 'seasonal' ? 'seasonal' : 'regular';
  $('#item-tags').value = item.tags.join(', ');
  $('#item-featured').checked = item.featured;
  $('#item-allergens-confirmed').checked = Boolean(item.allergensConfirmed);
  $('#item-image-status').textContent = item.imageUrl ? 'Photo is attached and will appear in the published menu.' : 'PNG, JPEG, WebP or GIF up to 2.5 MB.';
  $('#item-allergen-search').value = '';
  $('#item-allergen-search').setAttribute('placeholder', allergenUi('placeholder'));
  $('#allergen-hint').textContent = allergenUi('hint');
  renderAllergenPicker();
}

function buildPreviewMarkup() {
  const language = currentLanguage().code;
  const restaurant = draft().restaurant;
  const categories = draft().categories.filter((category) => draft().menuItems.some((item) => item.categoryId === category.id && item.visibility === 'visible'));
  const selectedCategory = activeCategoryId !== 'all' ? categoryById(activeCategoryId) : categories[0];
  const items = draft().menuItems.filter((item) => item.visibility === 'visible' && (!selectedCategory || item.categoryId === selectedCategory.id));
  const visibleItem = items.find((item) => item.id === selectedItemId) || items[0];
  const itemName = visibleItem?.name[language] || visibleItem?.name.en || 'Меню скоро появится';
  const itemDescription = visibleItem?.description[language] || visibleItem?.description.en || 'Добавьте первую позицию, чтобы увидеть её здесь.';
  return `<div class="preview-site"><header><span class="preview-logo">${escapeHtml((restaurant.name || 'H').charAt(0))}</span><div><strong>${escapeHtml(restaurant.name || 'Restaurant')}</strong><small>${escapeHtml(restaurant.subtitle || 'Seasonal menu')}</small></div><button type="button" tabindex="-1">${escapeHtml(language.toUpperCase())}</button></header><nav>${categories.map((category) => `<span class="${category.id === selectedCategory?.id ? 'is-active' : ''}">${escapeHtml(category.name[language] || category.name.en)}</span>`).join('')}</nav><main><p class="preview-kicker">${escapeHtml(selectedCategory?.name[language] || selectedCategory?.name.en || 'MENU')}</p><article class="preview-dish ${visibleItem?.availability === 'unavailable' ? 'is-unavailable' : ''}"><div class="preview-dish-photo">${visibleItem?.imageUrl ? `<img src="${escapeHtml(visibleItem.imageUrl)}" alt="" />` : '<span>◌</span>'}</div><div><div class="preview-dish-title"><h3>${escapeHtml(itemName)}</h3><strong>${escapeHtml(formatPrice(visibleItem?.price))}</strong></div><p>${escapeHtml(itemDescription)}</p>${visibleItem?.tags?.length ? `<div class="preview-tags">${visibleItem.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}${visibleItem?.availability === 'unavailable' ? '<b class="preview-stock">Temporarily unavailable</b>' : ''}</div></article><article class="preview-dish preview-secondary"><div class="preview-dish-photo"><span>◌</span></div><div><div class="preview-dish-title"><h3>${escapeHtml(items.find((item) => item.id !== visibleItem?.id)?.name[language] || items.find((item) => item.id !== visibleItem?.id)?.name.en || 'Another dish')}</h3><strong>—</strong></div><p>Menu items update live as you edit your draft.</p></div></article></main><footer><span>${escapeHtml(restaurant.address || 'Your restaurant address')}</span><a href="#preview">Book a table</a></footer></div>`;
}

function renderPreview() {
  const preview = $('#menu-preview');
  preview.className = `preview-frame is-${activeDevice}`;
  preview.innerHTML = buildPreviewMarkup();
}

function weekdayLabel(dayId) {
  const labels = ADMIN_WEEK_DAYS.find(([id]) => id === dayId)?.[1];
  return labels?.[interfaceLanguage] || labels?.en || '';
}

function weekdayId(entry) {
  const explicit = String(entry?.dayId || '').toLowerCase();
  if (ADMIN_WEEK_DAYS.some(([id]) => id === explicit)) return explicit;
  const value = String(entry?.day || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  for (const [id, labels] of ADMIN_WEEK_DAYS) {
    if (Object.values(labels).some((label) => value.includes(String(label).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()))) return id;
  }
  return '';
}

function normalizeWeeklyHours(entries, prefix, fallbackEntries = []) {
  const source = Array.isArray(entries) ? entries : [];
  const fallback = source[0] || (Array.isArray(fallbackEntries) ? fallbackEntries[0] : null) || null;
  const byDay = new Map();
  source.forEach((entry) => {
    const dayId = weekdayId(entry);
    if (dayId && !byDay.has(dayId)) byDay.set(dayId, entry);
  });
  return ADMIN_WEEK_DAYS.map(([dayId], index) => {
    const matchedEntry = byDay.get(dayId);
    const entry = matchedEntry || fallback || {};
    return {
      id: matchedEntry?.id || `${prefix}-${dayId}`,
      dayId,
      day: weekdayLabel(dayId),
      from: /^\d{2}:\d{2}$/.test(String(entry.from || '')) ? entry.from : '',
      to: /^\d{2}:\d{2}$/.test(String(entry.to || '')) ? entry.to : '',
      closed: fallback ? Boolean(entry.closed) : true,
      order: index + 1
    };
  });
}

function renderHours() {
  const openingHours = normalizeWeeklyHours(draft().openingHours, 'hours');
  const kitchenHours = normalizeWeeklyHours(draft().kitchenHours, 'kitchen-hours', openingHours);
  draft().openingHours = openingHours;
  draft().kitchenHours = kitchenHours;
  $('#hours-list').innerHTML = openingHours.map((entry) => `<article class="hours-row" data-hours-id="${escapeHtml(entry.id)}"><strong>${escapeHtml(weekdayLabel(entry.dayId))}</strong><label class="toggle-field compact"><input type="checkbox" data-hours-closed ${entry.closed ? 'checked' : ''} /><span></span><b>${entry.closed ? t('closed') : t('open')}</b></label><div class="time-range"><input type="time" data-hours-from value="${escapeHtml(entry.from)}" ${entry.closed ? 'disabled' : ''} /><span>—</span><input type="time" data-hours-to value="${escapeHtml(entry.to)}" ${entry.closed ? 'disabled' : ''} /></div></article>`).join('');
  $('#kitchen-hours-list').innerHTML = kitchenHours.map((entry) => `<article class="hours-row" data-kitchen-hours-id="${escapeHtml(entry.id)}"><strong>${escapeHtml(weekdayLabel(entry.dayId))}</strong><label class="toggle-field compact"><input type="checkbox" data-kitchen-closed ${entry.closed ? 'checked' : ''} /><span></span><b>${entry.closed ? t('closed') : t('open')}</b></label><div class="time-range"><input type="time" data-kitchen-from value="${escapeHtml(entry.from)}" ${entry.closed ? 'disabled' : ''} /><span>—</span><input type="time" data-kitchen-to value="${escapeHtml(entry.to)}" ${entry.closed ? 'disabled' : ''} /></div></article>`).join('');
  const special = Array.isArray(draft().specialOpeningHours) ? draft().specialOpeningHours : [];
  $('#special-hours-list').innerHTML = special.length ? special.map((entry) => `<article class="special-hours-row" data-special-hours-id="${escapeHtml(entry.id)}"><input type="date" data-special-date value="${escapeHtml(entry.date)}" /><input data-special-label maxlength="80" value="${escapeHtml(entry.label)}" placeholder="Holiday or event" /><label class="toggle-field compact"><input type="checkbox" data-special-closed ${entry.closed ? 'checked' : ''} /><span></span><b>${entry.closed ? t('closed') : t('open')}</b></label><div class="time-range"><input type="time" data-special-from value="${escapeHtml(entry.from)}" ${entry.closed ? 'disabled' : ''} /><span>—</span><input type="time" data-special-to value="${escapeHtml(entry.to)}" ${entry.closed ? 'disabled' : ''} /></div><button type="button" class="icon-button danger-icon" data-action="delete-special-hours" aria-label="${escapeHtml(t('delete'))}">${trashIcon()}</button></article>`).join('') : '<p class="domain-state">No special dates yet.</p>';
  const closure = draft().temporaryClosure || {};
  $('#temporary-closure').checked = Boolean(closure.closed);
  $('#closure-resume-date').value = closure.resumeDate || '';
  $('#closure-message').value = closure.message || '';
}

function renderDomains() {
  if (!workspace?.domains) return;
  $('#primary-domain').value = workspace.domains.primary || '';
  $('#domain-state').textContent = workspace.domains.verified ? 'Domain verified.' : 'Local mode: verify the DNS record before production launch.';
  const codes = Array.isArray(workspace.qrCodes) ? workspace.qrCodes : [];
  $('#qr-codes-list').innerHTML = codes.length ? codes.map((code) => `<article class="qr-code-row"><img src="/api/qr/${encodeURIComponent(code.slug)}.svg" alt="QR: ${escapeHtml(code.label)}" /><div><div class="qr-code-title"><strong>${escapeHtml(code.label)}</strong><button class="code-copy-button" type="button" data-copy-qr-code="${escapeHtml(code.slug)}">${escapeHtml(qrCopyLabel('image'))}</button></div><small>${escapeHtml(publicMenuUrl(`/r/${code.slug}`))}</small></div><div class="qr-row-actions"><button class="button button-secondary" type="button" data-copy-qr="${escapeHtml(code.slug)}">${escapeHtml(qrCopyLabel('link'))}</button><button class="icon-button danger-icon" type="button" data-delete-qr="${escapeHtml(code.id)}" aria-label="${escapeHtml(t('delete'))}">${trashIcon()}</button></div></article>`).join('') : '<p class="domain-state">Create the first QR link for a table, counter or flyer.</p>';
}

async function copyQrImage(slug) {
  if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('Ваш браузер не поддерживает копирование изображений.');
  const response = await fetch(`/api/qr/${encodeURIComponent(slug)}.svg`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось подготовить QR-код.');
  const svg = await response.text();
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Не удалось подготовить QR-код.'));
      image.src = objectUrl;
    });
    const sourceSize = Math.max(image.naturalWidth || 0, image.naturalHeight || 0, 256);
    const size = Math.min(2_048, Math.max(512, sourceSize * 4));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    const png = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось подготовить QR-код.')), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function commercialProfile() {
  return workspace?.commercial || { countryCode: 'OTHER', countryName: 'другая страна', region: 'International B2B', detail: 'Страна требует уточнения', termsProfile: 'international-b2b', pricing: { setup: 299, monthly: 39, currency: 'EUR' }, termsStatus: 'preparation', paymentReady: false, support: {} };
}

function commercialSupportMessage() {
  const profile = commercialProfile();
  const restaurant = draft().restaurant?.name || workspace?.tenant?.name || 'кафе';
  return `Здравствуйте! Хочу подключить полную версию Menu-on для «${restaurant}». Страна: ${profile.countryName || 'уточняется'}.`;
}

function configureSupportLink(element, href, label) {
  if (!element) return;
  if (href) {
    element.href = href;
    element.removeAttribute('aria-disabled');
    element.title = '';
  } else {
    element.href = '#support';
    element.setAttribute('aria-disabled', 'true');
    element.title = `${label} будет доступен после настройки канала поддержки.`;
  }
}

function renderCommercial() {
  const profile = commercialProfile();
  const country = $('#subscription-country');
  country.value = [...country.options].some((option) => option.value === profile.countryCode) ? profile.countryCode : 'OTHER';
  const company = $('#subscription-company');
  if (!company.value) company.value = draft().restaurant?.name || workspace.tenant?.name || '';
  $('#commercial-terms-title').textContent = profile.paymentReady ? `Условия ${profile.region}` : `Подготовка условий: ${profile.region}`;
  $('#commercial-terms-copy').textContent = profile.latestRequest
    ? 'Заявка уже сохранена. Команда подготовки проверит данные и пришлёт следующий шаг.'
    : profile.paymentReady
      ? 'Перед оплатой вы увидите фиксированную редакцию заказа, условий сервиса и DPA.'
      : 'Перед оплатой будут опубликованы фиксированные редакции заказа, условий сервиса и DPA для этого региона.';
  const support = profile.support || {};
  const message = encodeURIComponent(commercialSupportMessage());
  configureSupportLink($('#support-whatsapp'), support.whatsappUrl ? `${support.whatsappUrl}${support.whatsappUrl.includes('?') ? '&' : '?'}text=${message}` : '', 'WhatsApp');
  configureSupportLink($('#support-email'), support.email ? `mailto:${encodeURIComponent(support.email)}?subject=${encodeURIComponent('Подключение Menu-on')}&body=${message}` : '', 'E-mail');
}

async function submitCommercialRequest() {
  const response = await adminFetch('/api/admin/commercial/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: $('#subscription-company').value,
      taxId: $('#subscription-tax-id').value,
      representative: $('#subscription-representative').value,
      email: $('#subscription-email').value,
      country: $('#subscription-country').value,
      authority: $('#subscription-authority').checked,
      termsAcknowledged: $('#subscription-terms').checked
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Не удалось создать заявку на подключение.');
  workspace = payload;
  renderAll();
  showToast('Заявка на подключение сохранена. Следующий шаг — документы и защищённая оплата.', 'success');
}

function publicMenuUrl(pathname = '/menu') {
  const origin = String(workspace?.publicMenuOrigin || '').replace(/\/$/, '');
  const resolvedPath = adminSiteSlug && pathname === '/menu' ? '/' : pathname;
  return origin ? `${origin}${resolvedPath}` : resolvedPath;
}

function analyticsBars(entries, empty = t('noEvents')) {
  if (!entries?.length) return `<p class="domain-state">${escapeHtml(empty)}</p>`;
  const maximum = Math.max(...entries.map((entry) => entry.value), 1);
  return `<div class="analytics-bars">${entries.slice(0, 6).map((entry) => `<div class="analytics-bar"><span>${escapeHtml(entry.label)}</span><i style="width:${Math.max(3, Math.round(entry.value / maximum * 100))}%"></i><b>${formatNumber(entry.value)}</b></div>`).join('')}</div>`;
}

function renderAnalytics(data) {
  const metrics = [[t('visitors'), data.summary.visitors], [t('menuViews'), data.summary.menuViews], [t('bookings'), data.summary.bookingClicks], [t('calls'), data.summary.callClicks], [t('directions'), data.summary.directionsClicks], [t('orders'), data.summary.orderClicks]];
  $('#analytics-content').innerHTML = `<div class="analytics-metrics">${metrics.map(([label, value]) => `<article class="analytics-metric"><span>${label}</span><strong>${formatNumber(value)}</strong></article>`).join('')}</div><div class="analytics-grid"><section class="analytics-panel"><h2>${t('sources')}</h2>${analyticsBars(data.sources)}</section><section class="analytics-panel"><h2>${t('devices')}</h2>${analyticsBars(data.devices)}</section><section class="analytics-panel"><h2>${t('menuLanguages')}</h2>${analyticsBars(data.languages)}</section><section class="analytics-panel"><h2>${t('categories')}</h2>${analyticsBars(data.categories)}</section><section class="analytics-panel"><h2>${t('dishes')}</h2>${analyticsBars(data.items)}</section><section class="analytics-panel"><h2>${t('trend')}</h2>${analyticsBars(data.daily.filter((day) => day.pageViews).map((day) => ({ label: day.date.slice(5), value: day.pageViews })), t('noViews'))}</section></div>`;
}

async function loadAnalytics(period = activeAnalyticsPeriod) {
  activeAnalyticsPeriod = period;
  if (!workspace || activeView !== 'analytics') return;
  $('#analytics-content').innerHTML = `<p class="analytics-loading">${escapeHtml(t('loadingAnalytics'))}</p>`;
  try {
    const response = await adminFetch(`/api/admin/analytics?period=${period}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить аналитику.');
    renderAnalytics(payload);
  } catch (error) {
    $('#analytics-content').innerHTML = `<p class="domain-state">${escapeHtml(error.message || 'Не удалось загрузить аналитику.')}</p>`;
  }
}

function contactFieldValue(restaurant, field) {
  const value = restaurant?.[field];
  if (value && typeof value === 'object') return field === 'address' ? String(value.display || value.value || value.address || '') : '';
  return value == null || value === '[object Object]' ? '' : String(value);
}

function restaurantSocialValue(restaurant, platform) {
  const entry = (Array.isArray(restaurant?.socials) ? restaurant.socials : []).find((social) => String(social?.platform || '').toLowerCase() === platform);
  return typeof entry?.url === 'string' ? entry.url : '';
}

function setRestaurantSocialValue(platform, value) {
  const socials = (Array.isArray(draft().restaurant.socials) ? draft().restaurant.socials : [])
    .filter((social) => String(social?.platform || '').toLowerCase() !== platform);
  const url = String(value || '').trim();
  if (url) socials.push({ platform, url });
  draft().restaurant.socials = socials;
}

function renderContacts() {
  const restaurant = draft().restaurant;
  $$('[data-restaurant-field]').forEach((input) => { input.value = contactFieldValue(restaurant, input.dataset.restaurantField); });
  $$('[data-restaurant-social]').forEach((input) => { input.value = restaurantSocialValue(restaurant, input.dataset.restaurantSocial); });
}

function renderAll() {
  if (!workspace) return;
  const publishedMenuLink = $('.topbar-actions a.button');
  if (publishedMenuLink) publishedMenuLink.href = publicMenuUrl();
  if (!draft().languages.some((language) => language.code === activeLanguage)) activeLanguage = draft().languages[0]?.code || 'en';
  if (selectedItemId && !currentItem()) selectedItemId = '';
  updateNumbers();
  renderNavigation();
  renderCategoryPills();
  renderMenuList();
  renderItemEditor();
  renderPreview();
  renderHours();
  renderContacts();
  renderDomains();
  renderCommercial();
  renderRestaurantBrand();
  applyInterfaceLanguage();
  if (activeView === 'analytics') loadAnalytics(activeAnalyticsPeriod);
}

function addItem() {
  const categoryId = activeCategoryId !== 'all' ? activeCategoryId : draft().categories[0]?.id;
  if (!categoryId) {
    addCategory();
    return;
  }
  const currency = menuCurrencyCode(draft().menuItems.find((entry) => entry.price?.currency)?.price?.currency);
  const item = { id: nextId('new-item'), categoryId, name: {}, description: {}, price: { amount: 0, currency }, imageUrl: '', portion: '', variants: [], modifiers: [], tags: [], allergens: [], allergensConfirmed: false, availability: 'available', visibility: 'visible', featured: false, order: draft().menuItems.length + 1 };
  draft().languages.forEach((language) => { item.name[language.code] = language.code === 'en' ? 'New dish' : ''; item.description[language.code] = ''; });
  draft().menuItems.push(item);
  selectedItemId = item.id;
  activeCategoryId = categoryId;
  markDirty();
  renderAll();
}

function addCategory() {
  const category = { id: nextId('category'), name: {}, icon: 'plate', order: draft().categories.length + 1 };
  draft().languages.forEach((language) => { category.name[language.code] = language.code === 'en' ? 'New category' : ''; });
  draft().categories.push(category);
  activeCategoryId = category.id;
  markDirty();
  renderAll();
  showToast('Категория добавлена. Теперь добавьте позицию.');
}

function deleteSelectedItem() {
  const item = currentItem();
  if (!item) return;
  if (!window.confirm(`Удалить «${item.name[currentLanguage().code] || item.name.en || 'эту позицию'}»?`)) return;
  draft().menuItems = draft().menuItems.filter((entry) => entry.id !== item.id);
  selectedItemId = '';
  markDirty();
  renderAll();
  showToast('Позиция удалена.');
}

function moveSelectedItem(direction) {
  const item = currentItem();
  if (!item) return;
  const matchingIndexes = draft().menuItems.map((entry, index) => entry.categoryId === item.categoryId ? index : -1).filter((index) => index >= 0);
  const currentIndex = draft().menuItems.findIndex((entry) => entry.id === item.id);
  const position = matchingIndexes.indexOf(currentIndex);
  const targetIndex = matchingIndexes[position + direction];
  if (targetIndex === undefined) return showToast(direction < 0 ? 'Это уже первая позиция категории.' : 'Это уже последняя позиция категории.');
  [draft().menuItems[currentIndex], draft().menuItems[targetIndex]] = [draft().menuItems[targetIndex], draft().menuItems[currentIndex]];
  draft().menuItems.forEach((entry, index) => { entry.order = index + 1; });
  markDirty();
}

function addSpecialHours() {
  draft().specialOpeningHours ||= [];
  draft().specialOpeningHours.push({ id: `special-hours-${Date.now()}`, date: '', label: '', from: '09:00', to: '18:00', closed: false });
  markDirty();
  renderAll();
}

function deleteSpecialHours(id) {
  draft().specialOpeningHours = (draft().specialOpeningHours || []).filter((entry) => entry.id !== id);
  markDirty();
  renderAll();
}

function manageCategories() {
  openModal(`<div class="modal-heading"><div><p class="eyebrow">Структура меню</p><h2>Категории</h2></div><button type="button" class="modal-close" data-modal-close>×</button></div><p class="modal-copy">Переименование применяется ко всем языкам по отдельности. Удаление категории также удалит её блюда.</p><div class="version-list">${draft().categories.map((category, index) => `<article data-manage-category="${escapeHtml(category.id)}"><div><span class="version-number">${index + 1}</span><label class="category-edit-label"><small>${escapeHtml(currentLanguage().label)}</small><input data-category-name="${escapeHtml(category.id)}" value="${escapeHtml(category.name[currentLanguage().code] || '')}" maxlength="80" /></label></div><div class="qr-row-actions"><button class="icon-button" type="button" data-category-move="${escapeHtml(category.id)}:-1" aria-label="Выше">↑</button><button class="icon-button" type="button" data-category-move="${escapeHtml(category.id)}:1" aria-label="Ниже">↓</button><button class="icon-button danger-icon" type="button" data-category-delete="${escapeHtml(category.id)}" aria-label="Удалить">${trashIcon()}</button></div></article>`).join('')}</div><button class="button button-secondary" type="button" data-action="add-category">+ Категория</button>`);
}

function moveCategory(id, direction) {
  const index = draft().categories.findIndex((category) => category.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft().categories.length) return;
  [draft().categories[index], draft().categories[target]] = [draft().categories[target], draft().categories[index]];
  draft().categories.forEach((category, categoryIndex) => { category.order = categoryIndex + 1; });
  markDirty();
  manageCategories();
}

function deleteCategory(id) {
  const category = categoryById(id);
  if (!category || draft().categories.length <= 1) return showToast('В меню должна остаться хотя бы одна категория.', 'error');
  const itemCount = draft().menuItems.filter((item) => item.categoryId === id).length;
  if (!window.confirm(itemCount ? `Удалить «${category.name[currentLanguage().code] || category.name.en}» и ${itemCount} позиций?` : `Удалить категорию «${category.name[currentLanguage().code] || category.name.en}»?`)) return;
  draft().categories = draft().categories.filter((entry) => entry.id !== id);
  draft().menuItems = draft().menuItems.filter((item) => item.categoryId !== id);
  activeCategoryId = 'all';
  selectedItemId = '';
  markDirty();
  manageCategories();
}

async function uploadItemImage(file) {
  if (!file || !currentItem()) return;
  if (file.size > 2_500_000) return showToast('Размер изображения не должен превышать 2,5 МБ.', 'error');
  $('#item-image-status').textContent = 'Загружаем фото…';
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const response = await adminFetch('/api/admin/assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить изображение.');
    currentItem().imageUrl = payload.url;
    markDirty();
    showToast('Фото добавлено в черновик.', 'success');
  } catch (error) {
    $('#item-image-status').textContent = error.message || 'Не удалось загрузить фото.';
    showToast(error.message || 'Не удалось загрузить фото.', 'error');
  }
}

async function deleteQrCode(id) {
  try {
    const response = await adminFetch(`/api/admin/qr-codes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось удалить QR-ссылку.');
    workspace = payload;
    renderDomains();
    showToast('QR-ссылка удалена.', 'success');
  } catch (error) {
    showToast(error.message || 'Не удалось удалить QR-ссылку.', 'error');
  }
}

function openModal(content) {
  const modal = $('#modal');
  $('#modal-content').innerHTML = content;
  modal.showModal();
}

function showHistory() {
  openModal(`<div class="modal-heading"><div><p class="eyebrow">История публикаций</p><h2>Версии меню</h2></div><button type="button" class="modal-close" data-modal-close>×</button></div><div class="version-list">${workspace.versions.map((version) => `<article><div><span class="version-number">v${version.number}</span><strong>${escapeHtml(version.note || 'Published menu')}</strong><small>${escapeHtml(formatDate(version.createdAt))} · ${escapeHtml(version.createdBy)}</small></div>${version.number === workspace.published.number ? '<span class="published-badge">Сейчас опубликована</span>' : `<button class="button button-secondary" type="button" data-rollback="${version.number}">Откатить к v${version.number}</button>`}</article>`).join('')}</div>`);
}

function openPreviewModal() {
  openModal(`<div class="modal-heading"><div><p class="eyebrow">Черновик v${draft().number}</p><h2>Preview меню</h2></div><button type="button" class="modal-close" data-modal-close>×</button></div><div class="preview-modal">${buildPreviewMarkup()}</div>`);
}

async function publish() {
  await saveNow();
  if (saving || dirty) return;
  const button = $('[data-action="publish"]');
  button?.setAttribute('disabled', '');
  try {
    const response = await adminFetch('/api/admin/publish', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось опубликовать меню.');
    workspace = payload;
    selectedItemId = '';
    renderAll();
    showToast(`Версия v${workspace.published.number} опубликована. Новые изменения попадут в v${workspace.draft.number}.`, 'success');
  } catch (error) {
    showToast(error.message || 'Не удалось опубликовать меню.', 'error');
  } finally {
    button?.removeAttribute('disabled');
  }
}

async function rollback(version) {
  try {
    const response = await adminFetch(`/api/admin/rollback/${version}`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить откат.');
    workspace = payload;
    $('#modal').close();
    selectedItemId = '';
    renderAll();
    showToast(`Создана и опубликована версия v${workspace.published.number} на основе v${version}.`, 'success');
  } catch (error) {
    showToast(error.message || 'Не удалось выполнить откат.', 'error');
  }
}

function bindEvents() {
  $('#interface-language').addEventListener('change', (event) => {
    interfaceLanguage = event.target.value;
    localStorage.setItem(adminInterfaceLanguageStorageKey, interfaceLanguage);
    renderAll();
  });
  $$('.sidebar-nav [data-view]').forEach((button) => button.addEventListener('click', () => { activeView = button.dataset.view; renderAll(); }));
  $('#menu-search').addEventListener('input', renderMenuList);
  $('#category-pills').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategoryId = button.dataset.category;
    renderAll();
  });
  $('#menu-item-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-item-id]');
    if (!button) return;
    selectedItemId = button.dataset.itemId;
    renderAll();
  });
  $('#language-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-language]');
    if (!button) return;
    activeLanguage = button.dataset.language;
    renderAll();
  });
  $('#item-allergen-search').addEventListener('focus', renderAllergenPicker);
  $('#item-allergen-search').addEventListener('blur', () => window.setTimeout(renderAllergenPicker, 120));
  $('#item-allergen-search').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.target.blur(); return; }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = $('#allergen-suggestions [data-add-allergen]');
    if (first) addAllergen(first.dataset.addAllergen);
  });
  $('#allergen-suggestions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-allergen]');
    if (button) addAllergen(button.dataset.addAllergen);
  });
  $('#allergen-chips').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-allergen]');
    if (button) removeAllergen(button.dataset.removeAllergen);
  });
  $('#item-form').addEventListener('input', (event) => {
    const item = currentItem();
    if (!item) return;
    if (event.target.id === 'item-allergen-search') return renderAllergenPicker();
    const language = currentLanguage().code;
    if (event.target.id === 'item-name') item.name[language] = event.target.value;
    if (event.target.id === 'item-description') item.description[language] = event.target.value;
    if (event.target.id === 'item-price') item.price.amount = Number(event.target.value) || 0;
    if (event.target.id === 'item-image-url') item.imageUrl = event.target.value.trim();
    if (event.target.id === 'item-portion') item.portion = event.target.value;
    if (event.target.id === 'item-variants') item.variants = parseOptionLines(event.target.value, 'variant');
    if (event.target.id === 'item-modifiers') item.modifiers = parseOptionLines(event.target.value, 'modifier');
    if (event.target.id === 'item-tags') item.tags = event.target.value.split(',').map((value) => value.trim()).filter(Boolean);
    markDirty();
  });
  $('#item-form').addEventListener('change', (event) => {
    const item = currentItem();
    if (!item) return;
    if (event.target.id === 'item-category') item.categoryId = event.target.value;
    if (event.target.id === 'item-currency') { item.price.currency = menuCurrencyCode(event.target.value); renderMenuList(); renderPreview(); }
    if (event.target.id === 'item-available') item.availability = event.target.checked ? 'available' : 'unavailable';
    if (event.target.id === 'item-visible') item.visibility = event.target.checked ? 'visible' : 'hidden';
    if (event.target.id === 'item-featured') item.featured = event.target.checked;
    if (event.target.id === 'item-allergens-confirmed') item.allergensConfirmed = event.target.checked;
    if (event.target.id === 'menu-mode') draft().menuMode = event.target.value === 'seasonal' ? 'seasonal' : 'regular';
    markDirty();
  });
  $('#item-image-file').addEventListener('change', (event) => uploadItemImage(event.target.files?.[0]));
  $('#hours-list').addEventListener('change', (event) => {
    const row = event.target.closest('[data-hours-id]');
    const item = draft().openingHours.find((entry) => entry.id === row?.dataset.hoursId);
    if (!item) return;
    const changedAvailability = event.target.matches('[data-hours-closed]');
    if (changedAvailability) item.closed = event.target.checked;
    if (event.target.matches('[data-hours-from]')) item.from = event.target.value;
    if (event.target.matches('[data-hours-to]')) item.to = event.target.value;
    markDirty();
    if (changedAvailability) renderHours();
  });
  $('#kitchen-hours-list').addEventListener('change', (event) => {
    const row = event.target.closest('[data-kitchen-hours-id]');
    const item = draft().kitchenHours.find((entry) => entry.id === row?.dataset.kitchenHoursId);
    if (!item) return;
    const changedAvailability = event.target.matches('[data-kitchen-closed]');
    if (changedAvailability) item.closed = event.target.checked;
    if (event.target.matches('[data-kitchen-from]')) item.from = event.target.value;
    if (event.target.matches('[data-kitchen-to]')) item.to = event.target.value;
    markDirty();
    if (changedAvailability) renderHours();
  });
  $('#special-hours-list').addEventListener('input', (event) => {
    const row = event.target.closest('[data-special-hours-id]');
    const item = draft().specialOpeningHours?.find((entry) => entry.id === row?.dataset.specialHoursId);
    if (!item) return;
    if (event.target.matches('[data-special-date]')) item.date = event.target.value;
    if (event.target.matches('[data-special-label]')) item.label = event.target.value;
    if (event.target.matches('[data-special-from]')) item.from = event.target.value;
    if (event.target.matches('[data-special-to]')) item.to = event.target.value;
    markDirty();
  });
  $('#special-hours-list').addEventListener('change', (event) => {
    const row = event.target.closest('[data-special-hours-id]');
    const item = draft().specialOpeningHours?.find((entry) => entry.id === row?.dataset.specialHoursId);
    if (!item) return;
    if (event.target.matches('[data-special-closed]')) item.closed = event.target.checked;
    markDirty();
  });
  $('#temporary-closure').addEventListener('change', (event) => { draft().temporaryClosure ||= {}; draft().temporaryClosure.closed = event.target.checked; markDirty(); });
  $('#closure-resume-date').addEventListener('change', (event) => { draft().temporaryClosure ||= {}; draft().temporaryClosure.resumeDate = event.target.value; markDirty(); });
  $('#closure-message').addEventListener('input', (event) => { draft().temporaryClosure ||= {}; draft().temporaryClosure.message = event.target.value; markDirty(); });
  $('#contact-form').addEventListener('input', (event) => {
    const field = event.target.dataset.restaurantField;
    const socialPlatform = event.target.dataset.restaurantSocial;
    if (!field && !socialPlatform) return;
    if (field) draft().restaurant[field] = event.target.value;
    if (socialPlatform) setRestaurantSocialValue(socialPlatform, event.target.value);
    markDirty();
  });
  $('#subscription-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await submitCommercialRequest(); } catch (error) { showToast(error.message || 'Не удалось создать заявку на подключение.', 'error'); }
  });
  $$('.device-switcher [data-device]').forEach((button) => button.addEventListener('click', () => { activeDevice = button.dataset.device; $$('.device-switcher button').forEach((item) => item.classList.toggle('is-active', item === button)); renderPreview(); }));
  $('#analytics-period').addEventListener('click', (event) => {
    const button = event.target.closest('[data-period]');
    if (!button) return;
    $$('#analytics-period [data-period]').forEach((item) => item.classList.toggle('is-active', item === button));
    loadAnalytics(Number(button.dataset.period));
  });
  $('#domain-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const response = await adminFetch('/api/admin/domains', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ primary: $('#primary-domain').value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить домен.');
      workspace = payload;
      renderDomains();
      showToast('Домен сохранён. Добавьте DNS-запись по инструкции из отчёта.', 'success');
    } catch (error) { showToast(error.message || 'Не удалось сохранить домен.', 'error'); }
  });
  $('#qr-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const response = await adminFetch('/api/admin/qr-codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: $('#qr-label').value, slug: $('#qr-slug').value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось создать QR-ссылку.');
      workspace = payload;
      $('#qr-form').reset();
      renderDomains();
      showToast('QR-ссылка создана.', 'success');
    } catch (error) { showToast(error.message || 'Не удалось создать QR-ссылку.', 'error'); }
  });
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'add-item') addItem();
    if (action === 'add-category') addCategory();
    if (action === 'manage-categories') manageCategories();
    if (action === 'delete-item') deleteSelectedItem();
    if (action === 'move-item-up') moveSelectedItem(-1);
    if (action === 'move-item-down') moveSelectedItem(1);
    if (action === 'add-special-hours') addSpecialHours();
    if (action === 'delete-special-hours') deleteSpecialHours(event.target.closest('[data-special-hours-id]')?.dataset.specialHoursId);
    if (action === 'save-draft') saveNow();
    if (action === 'publish') publish();
    if (action === 'open-history') showHistory();
    if (action === 'open-preview') openPreviewModal();
    if (action === 'open-subscription') { activeView = 'subscription'; renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (action === 'start-subscription-order') document.querySelector('#subscription-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (action === 'show-commercial-details') openModal('<div class="modal-heading"><div><p class="eyebrow">Как это работает</p><h2>Подключение без переноса данных</h2></div><button type="button" class="modal-close" data-modal-close>×</button></div><p class="modal-copy">Проверяем данные компании, фиксируем заказ с выбранным тарифом, выпускаем постоянный адрес меню и переводим демо в рабочий режим. Все позиции, цены, языки и настройки из этого кабинета сохраняются.</p>');
    if (action === 'show-commercial-legal') openModal('<div class="modal-heading"><div><p class="eyebrow">Документы</p><h2>Что будет зафиксировано</h2></div><button type="button" class="modal-close" data-modal-close>×</button></div><p class="modal-copy">Перед оплатой клиент получает отдельный Order Form с данными компании, тарифом, ценой и датой старта, а также неизменяемую версию Terms of Service и DPA. После подключения система должна хранить дату акцепта, версию и хеш документов, способ акцепта и идентификатор платежа.</p>');
    if (action === 'copy-support-message') {
      navigator.clipboard?.writeText(commercialSupportMessage()).then(() => showToast('Сообщение для поддержки скопировано.', 'success')).catch(() => showToast('Не удалось скопировать сообщение.', 'error'));
    }
    if (action === 'logout') logout();
    if (action === 'show-help') openModal('<div class="modal-heading"><div><p class="eyebrow">Поддержка</p><h2>Нужна помощь?</h2></div><button type="button" class="modal-close" data-modal-close>×</button></div><p class="modal-copy">Напишите нам на <a href="mailto:help@fastmenu.app">help@fastmenu.app</a>. Мы ответим и поможем подготовить следующее обновление меню.</p>');
    const copyQrCode = event.target.closest('[data-copy-qr-code]');
    if (copyQrCode) {
      copyQrImage(copyQrCode.dataset.copyQrCode).then(() => showToast('QR-код скопирован как изображение.', 'success')).catch((error) => showToast(error.message || 'Не удалось скопировать QR-код.', 'error'));
      return;
    }
    const copyQr = event.target.closest('[data-copy-qr]');
    if (copyQr) {
      navigator.clipboard?.writeText(publicMenuUrl(`/r/${copyQr.dataset.copyQr}`)).then(() => showToast('QR link copied.', 'success')).catch(() => showToast('Could not copy the QR link.', 'error'));
      return;
    }
    const deleteQr = event.target.closest('[data-delete-qr]');
    if (deleteQr && window.confirm('Удалить QR-ссылку?')) deleteQrCode(deleteQr.dataset.deleteQr);
  });
  $('#modal').addEventListener('click', (event) => {
    if (event.target === $('#modal') || event.target.closest('[data-modal-close]')) $('#modal').close();
    const rollbackButton = event.target.closest('[data-rollback]');
    if (rollbackButton) rollback(Number(rollbackButton.dataset.rollback));
    const categoryMove = event.target.closest('[data-category-move]');
    if (categoryMove) { const [id, direction] = categoryMove.dataset.categoryMove.split(':'); moveCategory(id, Number(direction)); }
    const categoryDelete = event.target.closest('[data-category-delete]');
    if (categoryDelete) deleteCategory(categoryDelete.dataset.categoryDelete);
  });
  $('#modal').addEventListener('input', (event) => {
    const id = event.target.dataset.categoryName;
    if (!id) return;
    const category = categoryById(id);
    if (!category) return;
    category.name[currentLanguage().code] = event.target.value;
    markDirty();
  });
}

async function logout() {
  try { await adminFetch('/api/admin/auth/logout', { method: 'POST' }); } finally { csrfToken = ''; showLogin(); }
}

async function loadWorkspace() {
  try {
    const sessionResponse = await fetch(`/api/admin/auth/session${adminSiteSlug ? `?site=${encodeURIComponent(adminSiteSlug)}` : ''}`);
    if (sessionResponse.status === 401) return showLogin();
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) throw new Error(session.error || 'Не удалось проверить сессию.');
    csrfToken = session.csrfToken;
    const response = await adminFetch('/api/admin/workspace');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не удалось открыть админку.');
    workspace = payload;
    const storedUserName = String(workspace.user.name || '').trim();
    const userName = !storedUserName || /owner|владелец/iu.test(storedUserName) ? 'Владелец кабинета' : storedUserName;
    $('#user-name').textContent = userName;
    $('#user-role').textContent = workspace.user.role === 'Owner' ? 'Владелец' : workspace.user.role;
    $('#user-avatar').textContent = userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    activeLanguage = draft().languages[0]?.code || 'en';
    selectedItemId = draft().menuItems[0]?.id || '';
    renderAll();
  } catch (error) {
    $('#workspace').innerHTML = `<section class="load-error"><h1>Не удалось открыть админку</h1><p>${escapeHtml(error.message || 'Попробуйте обновить страницу.')}</p></section>`;
  }
}

bindEvents();
loadWorkspace();
