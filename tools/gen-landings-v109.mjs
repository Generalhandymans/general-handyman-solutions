// v109 generator — city + trade landing pages, DERIVED from the source of
// truth so prices/names can never drift:
//   prices + member prices : SERVER_MENU  (app/server.js)
//   trade of each service   : MENU_TRADE   (app/server.js)
//   EN names + metas        : MENU_CATALOG (app/public/app.js)
//   ES names + metas        : MENU_ES      (app/public/app.js)
// The unique per-page editorial copy lives in the CITIES / TRADE_PAGES
// tables below (EN + ES). %%PRICE:<id>%% tokens inside copy are replaced
// with the live menu price. Run: node tools/gen-landings-v109.mjs
// Output: app/public/landings/*.html (13 files). The suite pins every
// rendered row against the same sources, so a stale regeneration fails CI.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSrc = fs.readFileSync(path.join(ROOT, 'app', 'server.js'), 'utf8');
const appJsSrc = fs.readFileSync(path.join(ROOT, 'app', 'public', 'app.js'), 'utf8');

function literal(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('marker not found: ' + marker);
  const open = src.indexOf('{', start);
  const end = src.indexOf('\n};', open);
  if (end < 0) throw new Error('block end not found: ' + marker);
  return vm.runInNewContext('(' + src.slice(open, end + 2) + ')', {});
}
const SMENU = literal(serverSrc, 'const SERVER_MENU = {');
const TRADE = literal(serverSrc, 'const MENU_TRADE = {');
const CATALOG = literal(appJsSrc, 'const MENU_CATALOG = {');
const MENU_ES = literal(appJsSrc, 'const MENU_ES = {');

for (const id of Object.keys(SMENU)) {
  if (!CATALOG[id]) throw new Error('MENU_CATALOG missing ' + id);
  if (!MENU_ES[id]) throw new Error('MENU_ES missing ' + id);
  if (!TRADE[id]) throw new Error('MENU_TRADE missing ' + id);
  if (CATALOG[id].price !== SMENU[id].p || CATALOG[id].member !== SMENU[id].m) throw new Error('price drift ' + id);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Titles and meta/OG attributes follow the v104 doors' style: raw & (the
// settled pages write "Fairfield & Solano County" unescaped there); only
// angle brackets (and quotes inside attributes) are escaped.
const escT = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => escT(s).replace(/"/g, '&quot;');
const priceOf = id => '$' + SMENU[id].p;
const fillPrices = s => s.replace(/%%PRICE:([a-z0-9-]+)%%/g, (m, id) => priceOf(id));

function row(id, lang) {
  const c = CATALOG[id], s = SMENU[id];
  const name = lang === 'es' ? MENU_ES[id][0] : c.name;
  const meta = lang === 'es' ? MENU_ES[id][1] : c.meta;
  const price = (c.from ? (lang === 'es' ? 'Desde $' : 'From $') : '$') + s.p;
  const member = (lang === 'es' ? 'Miembros $' : 'Members $') + s.m;
  const href = c.est ? 'https://generalhandymans.app/' : 'https://generalhandymans.app/#order/' + id;
  return '<li><div><a class="pn" href="' + href + '">' + esc(name) + '</a><span class="pd">' + esc(meta) + '</span></div><div class="pp">' + price + '<span class="pm">' + member + '</span></div></li>';
}
const rowsFor = (ids, lang) => ids.map(id => row(id, lang)).join('\n        ');
const byTrade = t => Object.keys(SMENU).filter(id => TRADE[id] === t);

const TRADE_ORDER = ['carpentry', 'electrical', 'plumbing', 'gardening', 'mechanic'];
const TRADE_NAMES = {
  carpentry: { en: 'Carpentry', es: 'Carpintería' },
  electrical: { en: 'Electrical', es: 'Electricidad' },
  plumbing: { en: 'Plumbing', es: 'Plomería' },
  gardening: { en: 'Yard & Outdoor', es: 'Jardinería y exterior' },
  mechanic: { en: 'Mobile Mechanic', es: 'Mecánica móvil' },
  handyman: { en: 'General help', es: 'Ayuda general' }
};
const TRADE_HEADS = {
  carpentry: { en: 'Carpentry — doors, trim, drywall, paint, fences & decks', es: 'Carpintería — puertas, molduras, tablaroca, pintura, cercas y decks' },
  electrical: { en: 'Electrical — TV mounting, fans, fixtures & smart home', es: 'Electricidad — montaje de TV, ventiladores, lámparas y casa inteligente' },
  plumbing: { en: 'Plumbing — faucets, toilets, disposals & water heaters', es: 'Plomería — llaves, inodoros, trituradores y calentadores' },
  gardening: { en: 'Yard & outdoor — gutters, pressure washing, cleanups, junk & hauling', es: 'Yarda y exterior — canales, lavado a presión, limpiezas, basura y acarreo' },
  mechanic: { en: 'Mobile mechanic — at your home', es: 'Mecánica móvil — en tu casa' },
  handyman: { en: 'More help', es: 'Más ayuda' }
};

const COPY = {
  orderCtaCity: { en: 'See all services & prices in the app', es: 'Ver todos los servicios y precios en la app' },
  formNote: { en: 'Fixed prices, ordered in a few minutes — a deposit books your job, the balance is due when the work is done.', es: 'Precios fijos, ordenados en minutos — un depósito aparta tu trabajo, el saldo se paga cuando el trabajo está terminado.' },
  localPicture: { en: 'The local picture', es: 'El panorama local' },
  neighborhoods: { en: 'Neighborhoods we cover', es: 'Zonas que cubrimos' },
  popularIn: { en: 'Popular in', es: 'Popular en' },
  fineprint: {
    en: 'HomeCare / HomeCare Plus members save 20% — member prices shown. Book with a deposit ($50 flat on jobs up to $300, 40% on jobs over $300) and pay the balance when the job is done.',
    es: 'Los miembros HomeCare / HomeCare Plus ahorran 20% — precios de miembro mostrados. Aparta con un depósito ($50 fijo en trabajos de hasta $300, 40% en trabajos de más de $300) y paga el saldo cuando el trabajo está terminado.'
  },
  homecareH: { en: 'Members save 20% on every price here', es: 'Los miembros ahorran 20% en todos estos precios' },
  homecareBody: {
    en: 'HomeCare is $29/mo and your first month is FREE (30-day trial, one per account): 20% off labor (jobs under $1,000), your first in-person estimate free (then $50), priority scheduling, cancel anytime. HomeCare Plus ($100/mo) adds a yard visit every month.',
    es: 'HomeCare cuesta $29/mes y tu primer mes es GRATIS (prueba de 30 días, una por cuenta): 20% de descuento en mano de obra (trabajos menores de $1,000), tu primer estimado en persona gratis (después $50), agenda prioritaria, cancela cuando quieras. HomeCare Plus ($100/mes) agrega una visita de yarda cada mes.'
  },
  homecareLink: { en: 'See HomeCare →', es: 'Ver HomeCare →' },
  plusLink: { en: 'See HomeCare Plus →', es: 'Ver HomeCare Plus →' },
  howH: { en: 'How it works', es: 'Cómo funciona' },
  steps: {
    en: [['Order in the app', 'Pick your service in the app menu — exact prices, a few minutes.'], ['The Team confirms', 'We line up your technician and confirm your day and time.'], ['Done', 'Track it live in the app and pay the balance right there when the work is finished.']],
    es: [['Pide en la app', 'Elige tu servicio en el menú de la app — precios exactos, en minutos.'], ['El Team confirma', 'Asignamos a tu técnico y confirmamos tu día y hora.'], ['Listo', 'Síguelo en vivo en la app y paga el saldo ahí mismo cuando el trabajo esté terminado.']]
  },
  areasH: { en: 'Handyman services by city', es: 'Servicios por ciudad' },
  tradesH: { en: 'Our five trades', es: 'Nuestros cinco oficios' },
  doorsH: { en: 'Memberships & more', es: 'Membresías y más' },
  goodToKnow: { en: 'Good to know', es: 'Bueno saber' },
  browseAll: { en: 'Browse all services & prices →', es: 'Ver todos los servicios y precios →' },
  callLine: { en: 'Questions? Call the Team: (707) 862-3773', es: '¿Preguntas? Llama al Team: (707) 862-3773' }
};

const CITIES = [
  {
    slug: 'fairfield', file: 'handyman-fairfield.html', name: { en: 'Fairfield', es: 'Fairfield' },
    title: { en: 'Handyman in Fairfield, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Fairfield, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Fairfield, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Based in Fairfield since 2020. North Texas, Cordelia, Green Valley, Rancho Solano & Paradise Valley. Free photo estimate.',
      es: 'Servicios de handyman en Fairfield, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Basados en Fairfield desde 2020. North Texas, Cordelia, Green Valley, Rancho Solano y Paradise Valley. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Fairfield, CA · our home base', es: 'Handyman · Fairfield, CA · nuestra base' },
    h1: { en: 'Handyman in Fairfield', es: 'Handyman en Fairfield' },
    sub: { en: 'Our home base since 2020 — every trade, fixed prices, ordered in the app.', es: 'Nuestra base desde 2020 — todos los oficios, precios fijos, ordenados en la app.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Fairfield', es: 'Técnico de General Handyman Solutions en Fairfield' },
    zones: 'North Texas · Cordelia · Green Valley · Rancho Solano · Paradise Valley · Downtown Fairfield · Travis AFB area',
    popular: ['tv-mounting', 'water-heater', 'ceiling-fan', 'paint-room', 'brake-pads'],
    intro: {
      en: [
        'General Handyman Solutions is based right here in Fairfield — we have been fixing Fairfield homes since 2020. This is home turf: the Team knows the two-story layouts in Rancho Solano, the newer builds out in Cordelia and the established streets along North Texas like the back of a hand.',
        'Fairfield homes keep us busy in predictable ways: ceiling fans and TV mounting in Green Valley and Paradise Valley living rooms, water heaters giving up in Cordelia garages, fences and gates worked loose by the Delta breeze, and drywall patches wherever life happens. Every job is ordered in the app at a fixed price — a deposit books it, the balance is due when the work is done.'
      ],
      es: [
        'General Handyman Solutions está basado aquí mismo en Fairfield — arreglamos casas de Fairfield desde 2020. Este es nuestro territorio: el Team conoce las casas de dos pisos de Rancho Solano, las construcciones nuevas de Cordelia y las calles establecidas de North Texas como la palma de la mano.',
        'Las casas de Fairfield nos mantienen ocupados de formas predecibles: ventiladores de techo y montaje de TV en las salas de Green Valley y Paradise Valley, calentadores que se rinden en los garajes de Cordelia, cercas y puertas aflojadas por la brisa del Delta, y parches de tablaroca donde sea que pase la vida. Cada trabajo se ordena en la app a precio fijo — un depósito lo aparta, el saldo se paga cuando el trabajo está terminado.'
      ]
    }
  },
  {
    slug: 'suisun-city', file: 'handyman-suisun-city.html', name: { en: 'Suisun City', es: 'Suisun City' },
    title: { en: 'Handyman in Suisun City, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Suisun City, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Suisun City, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Old Town, the Marina, Heritage Park & Lawler Ranch. Free photo estimate.',
      es: 'Servicios de handyman en Suisun City, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Old Town, la Marina, Heritage Park y Lawler Ranch. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Suisun City, CA', es: 'Handyman · Suisun City, CA' },
    h1: { en: 'Handyman in Suisun City', es: 'Handyman en Suisun City' },
    sub: { en: 'Old Town to Lawler Ranch — every trade, fixed prices, ordered in the app.', es: 'De Old Town a Lawler Ranch — todos los oficios, precios fijos, ordenados en la app.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Suisun City', es: 'Técnico de General Handyman Solutions en Suisun City' },
    zones: 'Old Town · Suisun Marina · Waterfront · Heritage Park · Lawler Ranch · Peterson Ranch',
    popular: ['gutter-cleaning', 'fence-picket-repair', 'pressure-washing', 'yard-cleanup', 'toilet-replacement'],
    intro: {
      en: [
        'Suisun City mixes Old Town cottages, marina-side homes and the newer streets of Lawler Ranch, so no two jobs look the same — and that is exactly how we like it. From the waterfront by the Marina to the neighborhoods around Heritage Park, we handle the repairs these homes actually need.',
        'The Suisun Marsh breeze is hard on fences, gates and gutters, and Old Town\u2019s older housing stock keeps our plumbers and electricians busy with faucet swaps, toilet replacements and fixture updates. Order in the app, follow your technician in the app, and pay the balance when the work is done.'
      ],
      es: [
        'Suisun City mezcla las casas de Old Town, las casas junto a la marina y las calles nuevas de Lawler Ranch, así que ningún trabajo se parece a otro — y así nos gusta. Desde el waterfront junto a la Marina hasta los vecindarios alrededor de Heritage Park, hacemos las reparaciones que estas casas de verdad necesitan.',
        'La brisa del Suisun Marsh castiga cercas, puertas y canales, y las casas más viejas de Old Town mantienen ocupados a nuestros plomeros y electricistas con cambios de llaves, inodoros y lámparas. Ordena en la app, sigue a tu técnico en la app y paga el saldo cuando el trabajo esté terminado.'
      ]
    }
  },
  {
    slug: 'vacaville', file: 'handyman-vacaville.html', name: { en: 'Vacaville', es: 'Vacaville' },
    title: { en: 'Handyman in Vacaville, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Vacaville, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Vacaville, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Nut Tree, Browns Valley, Alamo Creek & North Village. Free photo estimate.',
      es: 'Servicios de handyman en Vacaville, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Nut Tree, Browns Valley, Alamo Creek y North Village. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Vacaville, CA', es: 'Handyman · Vacaville, CA' },
    h1: { en: 'Handyman in Vacaville', es: 'Handyman en Vacaville' },
    sub: { en: 'Just down I-80 from our Fairfield base — fixed prices, ordered in the app.', es: 'A minutos por la I-80 desde nuestra base en Fairfield — precios fijos, ordenados en la app.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Vacaville', es: 'Técnico de General Handyman Solutions en Vacaville' },
    zones: 'Nut Tree · Browns Valley · Alamo Creek · North Village · Peabody · Downtown Vacaville',
    popular: ['garage-opener', 'blinds-install', 'furniture-assembly-large', 'sprinkler-irrigation', 'junk-medium'],
    intro: {
      en: [
        'From the Nut Tree corridor to the cul-de-sacs of Browns Valley and Alamo Creek, Vacaville homes are newer, bigger and full of projects: garage door openers, blinds for the tall windows, furniture assembly that never ends, and sprinkler systems working overtime through the hot summers.',
        'We are just down I-80 from our Fairfield base, so Vacaville is a regular route for the Team — the same fixed app prices as everywhere else. Book with a deposit, track the job in the app, and pay the balance when it is done.'
      ],
      es: [
        'Desde el corredor del Nut Tree hasta las calles de Browns Valley y Alamo Creek, las casas de Vacaville son más nuevas, más grandes y están llenas de proyectos: motores de garaje, persianas para las ventanas altas, armado de muebles que nunca termina, y sistemas de aspersores trabajando horas extra en los veranos calientes.',
        'Estamos a minutos por la I-80 desde nuestra base en Fairfield, así que Vacaville es ruta regular del Team — los mismos precios fijos de la app que en cualquier otro lugar. Aparta con un depósito, sigue el trabajo en la app y paga el saldo cuando esté terminado.'
      ]
    }
  },
  {
    slug: 'vallejo', file: 'handyman-vallejo.html', name: { en: 'Vallejo', es: 'Vallejo' },
    title: { en: 'Handyman in Vallejo, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Vallejo, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Vallejo, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Glen Cove, Hiddenbrooke, Mare Island & downtown. Free photo estimate.',
      es: 'Servicios de handyman en Vallejo, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Glen Cove, Hiddenbrooke, Mare Island y el centro. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Vallejo, CA', es: 'Handyman · Vallejo, CA' },
    h1: { en: 'Handyman in Vallejo', es: 'Handyman en Vallejo' },
    sub: { en: 'Older homes, honest fixed prices — see the number before you book.', es: 'Casas con años, precios fijos y honestos — ve el número antes de apartar.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Vallejo', es: 'Técnico de General Handyman Solutions en Vallejo' },
    zones: 'Glen Cove · Hiddenbrooke · Mare Island · Downtown Vallejo · North Vallejo · South Vallejo',
    popular: ['drywall-patch-medium', 'toilet-replacement', 'deck-board-replacement', 'faucet-replacement', 'fence-post-replacement'],
    intro: {
      en: [
        'Vallejo has the oldest housing stock on our map — pre-war cottages, postwar ranches and the homes around Mare Island and Glen Cove — and older homes need a handyman who prices honestly. Drywall, doors that swell and stick, tired fences, aging faucets and toilets: that is our daily bread in Vallejo.',
        'Every price below is the real menu price, the same one the app charges. No \u201Cwe\u2019ll see when we get there\u201D — you see the number before you book, a deposit books the job, and the balance lands when the work is done.'
      ],
      es: [
        'Vallejo tiene las casas más viejas de nuestro mapa — casas de antes de la guerra, ranchos de la posguerra y las casas alrededor de Mare Island y Glen Cove — y las casas viejas necesitan un handyman que cobre honesto. Tablaroca, puertas que se hinchan y se atoran, cercas cansadas, llaves e inodoros con años: ese es nuestro pan de cada día en Vallejo.',
        'Cada precio de abajo es el precio real del menú, el mismo que cobra la app. Nada de \u00ABya veremos cuando lleguemos\u00BB — ves el número antes de apartar, un depósito aparta el trabajo y el saldo cae cuando el trabajo está terminado.'
      ]
    }
  },
  {
    slug: 'benicia', file: 'handyman-benicia.html', name: { en: 'Benicia', es: 'Benicia' },
    title: { en: 'Handyman in Benicia, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Benicia, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Benicia, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Southampton, Waters End & historic First Street. Free photo estimate.',
      es: 'Servicios de handyman en Benicia, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Southampton, Waters End y la histórica First Street. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Benicia, CA', es: 'Handyman · Benicia, CA' },
    h1: { en: 'Handyman in Benicia', es: 'Handyman en Benicia' },
    sub: { en: 'Historic homes, careful work — fixed prices, ordered in the app.', es: 'Casas históricas, trabajo con cuidado — precios fijos, ordenados en la app.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Benicia', es: 'Técnico de General Handyman Solutions en Benicia' },
    zones: 'Southampton · Waters End · Downtown / First Street · East Benicia · Benicia State Park area',
    popular: ['weatherstripping', 'screen-door-install', 'grab-bar-install', 'light-fixture-swap', 'smart-lock-install'],
    intro: {
      en: [
        'Benicia\u2019s historic First Street homes and the Southampton and Waters End neighborhoods are full of character — and full of the small, skilled jobs that keep older houses right: weatherstripping against the strait breeze, screen doors, grab bars, fixture swaps and careful repairs that respect the house.',
        'We are based next door in Fairfield, and Benicia is one of our regular routes. Order any of it in the app at the fixed price shown — deposit to book, balance when the work is done, and HomeCare members save 20% on labor.'
      ],
      es: [
        'Las casas históricas de First Street en Benicia y los vecindarios de Southampton y Waters End están llenos de carácter — y de los trabajos chicos y precisos que mantienen bien una casa con años: burletes contra la brisa del estrecho, puertas mosquiteras, barras de apoyo, cambios de lámparas y reparaciones con cuidado que respetan la casa.',
        'Estamos basados al lado, en Fairfield, y Benicia es una de nuestras rutas regulares. Ordena lo que sea en la app al precio fijo mostrado — depósito para apartar, saldo cuando el trabajo esté terminado, y los miembros HomeCare ahorran 20% en mano de obra.'
      ]
    }
  },
  {
    slug: 'napa', file: 'handyman-napa.html', name: { en: 'Napa', es: 'Napa' },
    title: { en: 'Handyman in Napa, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Napa, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Napa, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Browns Valley, Alta Heights & downtown Napa. Free photo estimate.',
      es: 'Servicios de handyman en Napa, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Browns Valley, Alta Heights y el centro de Napa. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Napa, CA', es: 'Handyman · Napa, CA' },
    h1: { en: 'Handyman in Napa', es: 'Handyman en Napa' },
    sub: { en: 'Finish work and repairs, at the same fixed prices as our Fairfield base.', es: 'Acabados y reparaciones, a los mismos precios fijos que en nuestra base de Fairfield.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Napa', es: 'Técnico de General Handyman Solutions en Napa' },
    zones: 'Browns Valley · Alta Heights · Downtown Napa · North Napa · West Napa',
    popular: ['chandelier-swap', 'cabinet-hardware-install', 'vanity-swap', 'accent-wall-painting', 'picture-mirror-hanging'],
    intro: {
      en: [
        'Napa homes — from Browns Valley to Alta Heights and the streets around downtown — tend to be well kept, and the jobs match: chandelier and fixture swaps, cabinet hardware, vanity upgrades, accent walls and the careful finish work that makes a room feel done.',
        'You get the same fixed menu prices here as at our Fairfield base — the price on this page is the price in the app. Book with a deposit, follow the job in the app, and pay the balance when the work is finished.'
      ],
      es: [
        'Las casas de Napa — de Browns Valley a Alta Heights y las calles alrededor del centro — suelen estar bien cuidadas, y los trabajos van con eso: cambios de candiles y lámparas, jaladeras de gabinete, mejoras de mueble de baño, paredes de acento y el trabajo de acabado cuidadoso que hace que un cuarto se sienta terminado.',
        'Aquí tienes los mismos precios fijos del menú que en nuestra base de Fairfield — el precio de esta página es el precio de la app. Aparta con un depósito, sigue el trabajo en la app y paga el saldo cuando el trabajo esté terminado.'
      ]
    }
  },
  {
    slug: 'concord', file: 'handyman-concord.html', name: { en: 'Concord', es: 'Concord' },
    title: { en: 'Handyman in Concord, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Concord, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Concord, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Clayton Valley, Dana Estates & downtown Concord. Free photo estimate.',
      es: 'Servicios de handyman en Concord, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Clayton Valley, Dana Estates y el centro de Concord. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Concord, CA', es: 'Handyman · Concord, CA' },
    h1: { en: 'Handyman in Concord', es: 'Handyman en Concord' },
    sub: { en: 'Suburban homes, endless lists — fixed prices, ordered in the app.', es: 'Casas suburbanas, listas sin fin — precios fijos, ordenados en la app.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Concord', es: 'Técnico de General Handyman Solutions en Concord' },
    zones: 'Clayton Valley · Dana Estates · Downtown Concord · Four Corners · Monument Corridor',
    popular: ['smart-thermostat-install', 'security-camera-install', 'laminate-floor-repair', 'baseboard-install', 'garage-opener'],
    intro: {
      en: [
        'Concord is classic East Bay suburbia — Clayton Valley and Dana Estates tract homes where the list never ends: thermostat upgrades, security cameras, laminate repairs, baseboards, and a garage opener that picked the worst possible Monday to quit.',
        'Concord is the far edge of our regular coverage, and the deal is the same as everywhere: fixed prices in the app, a deposit books your job, the Team confirms your day and time, and you pay the balance when the work is done.'
      ],
      es: [
        'Concord es el suburbio clásico del East Bay — casas de Clayton Valley y Dana Estates donde la lista nunca termina: mejoras de termostato, cámaras de seguridad, reparaciones de laminado, zoclos, y un motor de garaje que escogió el peor lunes posible para rendirse.',
        'Concord es el borde lejano de nuestra cobertura regular, y el trato es el mismo que en todas partes: precios fijos en la app, un depósito aparta tu trabajo, el Team confirma tu día y hora, y pagas el saldo cuando el trabajo está terminado.'
      ]
    }
  },
  {
    slug: 'antioch', file: 'handyman-antioch.html', name: { en: 'Antioch', es: 'Antioch' },
    title: { en: 'Handyman in Antioch, CA — Services & Prices | General Handyman Solutions', es: 'Handyman en Antioch, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Handyman services in Antioch, CA with fixed prices in the app: carpentry, electrical, plumbing, yard work and mobile mechanic. Deer Valley, Lone Tree & Black Diamond. Free photo estimate.',
      es: 'Servicios de handyman en Antioch, CA con precios fijos en la app: carpintería, electricidad, plomería, yarda y mecánica móvil. Deer Valley, Lone Tree y Black Diamond. Estimado por foto gratis.'
    },
    badge: { en: 'Handyman · Antioch, CA', es: 'Handyman · Antioch, CA' },
    h1: { en: 'Handyman in Antioch', es: 'Handyman en Antioch' },
    sub: { en: 'Growing neighborhoods, nonstop projects — fixed prices in the app.', es: 'Vecindarios en crecimiento, proyectos sin parar — precios fijos en la app.' },
    img: '/hero-tech.jpg', imgAlt: { en: 'General Handyman Solutions technician in Antioch', es: 'Técnico de General Handyman Solutions en Antioch' },
    zones: 'Deer Valley · Lone Tree · Downtown Antioch · Black Diamond · Somersville',
    popular: ['window-ac-install', 'curtain-rod-install', 'carpet-repair', 'brake-pads', 'battery-replacement'],
    intro: {
      en: [
        'Antioch keeps growing — newer subdivisions around Deer Valley and Lone Tree next to established neighborhoods — and growing households generate handyman work nonstop: window AC installs before the heat, curtain rods and blinds in every new room, carpet repairs, and mobile mechanic visits right in the driveway.',
        'Order in the app at the fixed price, book with a deposit and track your technician live. Antioch is on our regular route from Fairfield — same prices, same Team, same 30-day workmanship guarantee the app promises.'
      ],
      es: [
        'Antioch sigue creciendo — subdivisiones nuevas alrededor de Deer Valley y Lone Tree junto a vecindarios establecidos — y las casas en crecimiento generan trabajo de handyman sin parar: instalación de aire de ventana antes del calor, cortineros y persianas en cada cuarto nuevo, reparaciones de alfombra, y visitas de mecánica móvil en la propia cochera.',
        'Ordena en la app al precio fijo, aparta con un depósito y sigue a tu técnico en vivo. Antioch está en nuestra ruta regular desde Fairfield — mismos precios, mismo Team, misma garantía de 30 días en mano de obra que promete la app.'
      ]
    }
  }
];

const TRADE_PAGES = [
  {
    slug: 'carpentry-fairfield', file: 'carpentry-fairfield.html', trade: 'carpentry',
    title: { en: 'Carpentry in Fairfield, CA — Services & Prices | General Handyman Solutions', es: 'Carpintería en Fairfield, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Carpentry in Fairfield, CA at fixed app prices: doors & locks, drywall patches, painting, trim, fences, decks, shelves and furniture assembly. Free photo estimate.',
      es: 'Carpintería en Fairfield, CA a precios fijos de la app: puertas y chapas, parches de tablaroca, pintura, molduras, cercas, decks, repisas y armado de muebles. Estimado por foto gratis.'
    },
    badge: { en: 'Carpentry · Fairfield, CA', es: 'Carpintería · Fairfield, CA' },
    h1: { en: 'Carpentry in Fairfield', es: 'Carpintería en Fairfield' },
    sub: { en: 'Doors, trim, drywall, paint, fences & decks — the biggest section of the menu.', es: 'Puertas, molduras, tablaroca, pintura, cercas y decks — la sección más grande del menú.' },
    img: '/cat-img/carpentry.jpg', imgAlt: { en: 'Carpentry work by General Handyman Solutions in Fairfield', es: 'Trabajo de carpintería de General Handyman Solutions en Fairfield' },
    intro: {
      en: [
        'Doors, trim, drywall, paint, fences and decks — carpentry is the biggest section of our menu because it is what Fairfield homes ask for most. Rancho Solano two-stories need door adjustments and drywall patches; Cordelia\u2019s newer builds need shelves, organizers and assembly done right the first time.',
        'Every carpentry job below is a fixed app price. Not sure your job fits a menu line? The free photo estimate in the app gets you a price before anyone rolls.'
      ],
      es: [
        'Puertas, molduras, tablaroca, pintura, cercas y decks — la carpintería es la sección más grande de nuestro menú porque es lo que más piden las casas de Fairfield. Las casas de dos pisos de Rancho Solano necesitan ajustes de puertas y parches de tablaroca; las construcciones nuevas de Cordelia necesitan repisas, organizadores y armados bien hechos desde la primera vez.',
        'Cada trabajo de carpintería de abajo tiene precio fijo en la app. ¿No estás seguro de que tu trabajo encaje en una línea del menú? El estimado por foto gratis de la app te da precio antes de que salga nadie.'
      ]
    },
    notes: {
      en: ['Fixed prices are labor — you supply the materials, or ask on the free photo estimate and we price them in.', 'Doors, locks and hardware are priced per door or per piece, exactly as each line shows.', 'Fences and decks: repairs as listed; a full replacement starts with a free photo estimate.'],
      es: ['Los precios fijos son mano de obra — tú aportas los materiales, o pide en el estimado por foto gratis y los cotizamos.', 'Puertas, chapas y herrajes se cobran por puerta o por pieza, tal como lo muestra cada línea.', 'Cercas y decks: reparaciones como están listadas; un reemplazo completo empieza con un estimado por foto gratis.']
    }
  },
  {
    slug: 'electrical-fairfield', file: 'electrical-fairfield.html', trade: 'electrical',
    title: { en: 'Electrical Services in Fairfield, CA — Prices | General Handyman Solutions', es: 'Servicios eléctricos en Fairfield, CA — Precios | General Handyman Solutions' },
    desc: {
      en: 'Electrical services in Fairfield, CA at fixed app prices: TV mounting, ceiling fans, chandeliers, fixtures, dimmers, smart thermostats, doorbells and cameras. Free photo estimate.',
      es: 'Servicios eléctricos en Fairfield, CA a precios fijos de la app: montaje de TV, ventiladores de techo, candiles, lámparas, dimmers, termostatos inteligentes, timbres y cámaras. Estimado por foto gratis.'
    },
    badge: { en: 'Electrical · Fairfield, CA', es: 'Electricidad · Fairfield, CA' },
    h1: { en: 'Electrical Services in Fairfield', es: 'Servicios Eléctricos en Fairfield' },
    sub: { en: 'TV mounting, fans, fixtures & smart home — swap-and-install work, tested before we leave.', es: 'Montaje de TV, ventiladores, lámparas y casa inteligente — cambios e instalaciones, probados antes de irnos.' },
    img: '/cat-img/electrical.jpg', imgAlt: { en: 'Electrical install work by General Handyman Solutions in Fairfield', es: 'Trabajo eléctrico de General Handyman Solutions en Fairfield' },
    intro: {
      en: [
        'Our electrical menu is the swap-and-install work Fairfield homes need every week: TV mounting, ceiling fans, chandeliers and fixtures, dimmers, smart thermostats, doorbells and cameras — installed on your existing boxes and wiring, and tested before we leave.',
        'Green Valley and Paradise Valley living rooms are our TV-mounting home turf, and the homes around Travis keep us busy with fans and smart thermostats. Pick the job in the app, see the fixed price, and book with a deposit.'
      ],
      es: [
        'Nuestro menú eléctrico es el trabajo de cambio e instalación que las casas de Fairfield necesitan cada semana: montaje de TV, ventiladores de techo, candiles y lámparas, dimmers, termostatos inteligentes, timbres y cámaras — instalados sobre tus cajas y cableado existentes, y probados antes de irnos.',
        'Las salas de Green Valley y Paradise Valley son nuestro territorio de montaje de TV, y las casas alrededor de Travis nos mantienen ocupados con ventiladores y termostatos inteligentes. Elige el trabajo en la app, ve el precio fijo y aparta con un depósito.'
      ]
    },
    notes: {
      en: ['All electrical work here is swap-and-install on existing boxes and wiring — no new circuits, no panel work.', 'TV mounting: cable hiding (surface raceway) and soundbar mounting are add-ons right in the app.', 'Smart devices — thermostats, doorbells, cameras — are set up and connected before we leave.'],
      es: ['Todo el trabajo eléctrico aquí es cambio e instalación sobre cajas y cableado existentes — sin circuitos nuevos, sin trabajo de panel.', 'Montaje de TV: esconder cables (canaleta) y montar la barra de sonido son extras dentro de la app.', 'Los dispositivos inteligentes — termostatos, timbres, cámaras — quedan configurados y conectados antes de irnos.']
    }
  },
  {
    slug: 'plumbing-fairfield', file: 'plumbing-fairfield.html', trade: 'plumbing',
    title: { en: 'Plumbing in Fairfield, CA — Services & Prices | General Handyman Solutions', es: 'Plomería en Fairfield, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Plumbing in Fairfield, CA at fixed app prices: faucets, toilets, disposals, showerheads, vanities, drain unclogs and water heater installs with haul-away included. Free photo estimate.',
      es: 'Plomería en Fairfield, CA a precios fijos de la app: llaves, inodoros, trituradores, regaderas, muebles de baño, destapes de drenaje e instalación de calentadores con retiro incluido. Estimado por foto gratis.'
    },
    badge: { en: 'Plumbing · Fairfield, CA', es: 'Plomería · Fairfield, CA' },
    h1: { en: 'Plumbing in Fairfield', es: 'Plomería en Fairfield' },
    sub: { en: 'Faucets, toilets, disposals & water heaters — the repairs that cannot wait.', es: 'Llaves, inodoros, trituradores y calentadores — las reparaciones que no pueden esperar.' },
    img: '/cat-img/plumbing.jpg', imgAlt: { en: 'Plumbing work by General Handyman Solutions in Fairfield', es: 'Trabajo de plomería de General Handyman Solutions en Fairfield' },
    intro: {
      en: [
        'Faucets, toilets, disposals, showerheads, vanities and water heaters — the plumbing work that cannot wait a week. Our water heater install is %%PRICE:water-heater%% flat with haul-away of the old unit included, and a basic drain unclog is %%PRICE:drain-unclog%%.',
        'Fairfield\u2019s older North Texas homes keep our plumbers busy with toilet rebuilds and faucet swaps, while Cordelia and Green Valley call for disposals and water heaters. Every price is fixed in the app before you book — no hourly meter running.'
      ],
      es: [
        'Llaves, inodoros, trituradores, regaderas, muebles de baño y calentadores — el trabajo de plomería que no puede esperar una semana. Nuestra instalación de calentador cuesta %%PRICE:water-heater%% fijo con el retiro del viejo incluido, y un destape básico de drenaje cuesta %%PRICE:drain-unclog%%.',
        'Las casas más viejas de North Texas mantienen ocupados a nuestros plomeros con reparaciones de inodoros y cambios de llaves, mientras Cordelia y Green Valley llaman por trituradores y calentadores. Cada precio es fijo en la app antes de que apartes — sin reloj de horas corriendo.'
      ]
    },
    notes: {
      en: ['Water heater install includes haul-away of the old unit — it is never charged separately.', 'Toilet and vanity swaps: haul-away of the old unit is available as an add-on in the app.', 'Prices are labor; fixtures and parts are yours to supply, or confirmed on the estimate first.'],
      es: ['La instalación de calentador incluye el retiro del viejo — nunca se cobra por separado.', 'Cambios de inodoro y mueble de baño: el retiro del viejo está disponible como extra en la app.', 'Los precios son mano de obra; los accesorios y piezas los aportas tú, o se confirman primero en el estimado.']
    }
  },
  {
    slug: 'yard-work-fairfield', file: 'yard-work-fairfield.html', trade: 'gardening',
    title: { en: 'Yard Work in Fairfield, CA — Services & Prices | General Handyman Solutions', es: 'Trabajo de yarda en Fairfield, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Yard work in Fairfield, CA at fixed app prices: gutter cleaning, pressure washing, yard cleanups, sprinklers, junk removal and green waste hauling. Monthly yard plans available. Free photo estimate.',
      es: 'Trabajo de yarda en Fairfield, CA a precios fijos de la app: limpieza de canales, lavado a presión, limpiezas de yarda, aspersores, retiro de basura y desecho verde. Planes mensuales de yarda disponibles. Estimado por foto gratis.'
    },
    badge: { en: 'Yard & Outdoor · Fairfield, CA', es: 'Yarda y exterior · Fairfield, CA' },
    h1: { en: 'Yard Work in Fairfield', es: 'Trabajo de Yarda en Fairfield' },
    sub: { en: 'Gutters, pressure washing, cleanups, sprinklers, junk & hauling — the outdoor menu.', es: 'Canales, lavado a presión, limpiezas, aspersores, basura y acarreo — el menú exterior.' },
    img: '/cat-img/gardening.jpg', imgAlt: { en: 'Yard work by General Handyman Solutions in Fairfield', es: 'Trabajo de yarda de General Handyman Solutions en Fairfield' },
    intro: {
      en: [
        'Gutters before the rains, pressure washing after them, cleanups when the yard wins, sprinklers when the summer hits — plus junk and green waste hauling when it is time to reset. This is the outdoor menu for Fairfield homes, from Rancho Solano to Paradise Valley.',
        'Want it handled every month instead? Yard Care is $75/mo for a monthly visit, and HomeCare Plus ($100/mo) bundles a monthly yard visit with 20% off labor across the whole menu.'
      ],
      es: [
        'Canales antes de las lluvias, lavado a presión después, limpiezas cuando la yarda gana, aspersores cuando llega el verano — más retiro de basura y desecho verde cuando es hora de resetear. Este es el menú exterior para las casas de Fairfield, de Rancho Solano a Paradise Valley.',
        '¿Prefieres que se maneje cada mes? Yard Care cuesta $75/mes por una visita mensual, y HomeCare Plus ($100/mes) combina una visita de yarda mensual con 20% de descuento en mano de obra en todo el menú.'
      ]
    },
    notes: {
      en: ['Junk prices follow the load — pick the tier that matches and the app confirms before we roll.', 'Two-story gutter cleaning is its own line — pick the right one and the price is final.', 'Monthly yard plans: Yard Care $75/mo (1 visit) or $150/mo (2 visits); unused visits never roll over or refund.'],
      es: ['Los precios de basura siguen la carga — elige la tarifa que coincide y la app confirma antes de salir.', 'La limpieza de canales de dos pisos es su propia línea — elige la correcta y el precio es final.', 'Planes mensuales de yarda: Yard Care $75/mes (1 visita) o $150/mes (2 visitas); las visitas no usadas nunca se acumulan ni se reembolsan.']
    }
  },
  {
    slug: 'mobile-mechanic-fairfield', file: 'mobile-mechanic-fairfield.html', trade: 'mechanic',
    title: { en: 'Mobile Mechanic in Fairfield, CA — Services & Prices | General Handyman Solutions', es: 'Mecánica móvil en Fairfield, CA — Servicios y precios | General Handyman Solutions' },
    desc: {
      en: 'Mobile mechanic in Fairfield, CA at fixed app prices: brake pads, batteries, alternators, starters, belts, spark plugs and check-engine diagnostics — at your home. Free photo estimate.',
      es: 'Mecánica móvil en Fairfield, CA a precios fijos de la app: balatas, baterías, alternadores, marchas, bandas, bujías y diagnóstico de check-engine — en tu casa. Estimado por foto gratis.'
    },
    badge: { en: 'Mobile Mechanic · Fairfield, CA', es: 'Mecánica móvil · Fairfield, CA' },
    h1: { en: 'Mobile Mechanic in Fairfield', es: 'Mecánica Móvil en Fairfield' },
    sub: { en: 'A mechanic who comes to your driveway — no tow truck, no shop waiting room.', es: 'Un mecánico que llega a tu cochera — sin grúa, sin sala de espera.' },
    img: '/cat-img/mechanic.jpg', imgAlt: { en: 'Mobile mechanic work by General Handyman Solutions in Fairfield', es: 'Trabajo de mecánica móvil de General Handyman Solutions en Fairfield' },
    intro: {
      en: [
        'A mechanic who comes to your driveway. Brakes, batteries, alternators, starters, belts, spark plugs and check-engine diagnostics — done at your home in Fairfield, so a car that will not start is not a tow-truck problem.',
        'Prices are fixed app prices for labor; parts are yours to supply or confirmed on the estimate first. Turbo replacement is estimate-first: we inspect it and confirm the exact price before any work starts.'
      ],
      es: [
        'Un mecánico que llega a tu cochera. Frenos, baterías, alternadores, marchas, bandas, bujías y diagnóstico de check-engine — hechos en tu casa en Fairfield, para que un carro que no arranca no sea un problema de grúa.',
        'Los precios son precios fijos de la app por mano de obra; las piezas las aportas tú o se confirman primero en el estimado. El reemplazo de turbo es con estimado primero: lo revisamos y confirmamos el precio exacto antes de empezar cualquier trabajo.'
      ]
    },
    notes: {
      en: ['The mechanic comes to your home — the car never leaves your driveway.', 'Labor is the fixed price shown; parts are yours to supply or confirmed before we start.', 'Turbo replacement is estimate-first: we inspect and confirm the exact price before any work.'],
      es: ['El mecánico llega a tu casa — el carro nunca sale de tu cochera.', 'La mano de obra es el precio fijo mostrado; las piezas las aportas tú o se confirman antes de empezar.', 'El reemplazo de turbo es con estimado primero: revisamos y confirmamos el precio exacto antes de cualquier trabajo.']
    }
  }
];

const STYLE = `
  *{box-sizing:border-box}
  html,body{background:#0a0a0c}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;-webkit-font-smoothing:antialiased}
  a{color:#ff5a68}
  .top{text-align:center;padding:26px 16px 4px}
  .top .logo img{width:min(360px,86vw);height:auto;display:block;margin:0 auto}
  .tag{letter-spacing:.35em;font-weight:800;font-size:12px;color:#e42535;margin-top:8px;text-transform:uppercase}
  .lang-toggle{display:inline-flex;gap:6px;margin-top:14px}
  .lang-toggle button{background:#1a1a1e;color:#d8d8de;border:1px solid #33333a;border-radius:999px;padding:6px 16px;font-size:13px;font-weight:700;cursor:pointer}
  .lang-toggle button.on{background:#e42535;border-color:#e42535;color:#fff}
  main{max-width:680px;margin:0 auto;padding:10px 16px 8px}
  .badge{display:inline-block;background:#e42535;color:#fff;font-weight:800;font-size:13px;border-radius:999px;padding:6px 14px;margin:14px 0 4px}
  h1{font-size:40px;margin:10px 0 2px;line-height:1.05}
  .sub{color:#b9b9c0;font-size:17px;margin:0 0 14px}
  .plan-img{width:100%;border-radius:18px;display:block;border:1px solid #26262c}
  .card{background:#131316;border:1px solid #26262c;border-radius:18px;padding:20px;margin:18px 0}
  .card h2{margin:0 0 12px;font-size:21px}
  .card h2 a{color:#f4f4f5;text-decoration:none}
  .card p{color:#d8d8de;font-size:16px;line-height:1.55;margin:0 0 10px}
  .card p:last-child{margin-bottom:0}
  .zones{color:#b9b9c0;font-size:15px}
  .zones b{color:#f4f4f5}
  .notes{margin:0;padding-left:20px;color:#d8d8de;font-size:15.5px;line-height:1.6}
  .prices{list-style:none;margin:0;padding:0}
  .prices li{display:flex;justify-content:space-between;gap:14px;align-items:baseline;padding:10px 0;border-bottom:1px solid #202025}
  .prices li:last-child{border-bottom:none}
  .prices .pn{font-size:16.5px;font-weight:700;color:#f4f4f5;text-decoration:none}
  .prices .pd{display:block;color:#b9b9c0;font-size:14px;font-weight:400;margin-top:2px}
  .prices .pp{font-size:19px;font-weight:900;color:#fff;white-space:nowrap;text-align:right}
  .prices .pm{display:block;color:#2fbf71;font-size:13px;font-weight:700}
  .cta{display:block;background:#e42535;color:#fff;text-align:center;font-weight:900;font-size:19px;text-decoration:none;border-radius:14px;padding:16px 18px;margin:20px 0 8px}
  .cta:hover{background:#c11b29}
  .form-note{text-align:center;color:#a7a7b0;font-size:14px;margin:0 0 6px}
  .steps{display:grid;gap:12px}
  .step{display:flex;gap:12px;align-items:flex-start}
  .step-badge{flex:none;width:30px;height:30px;border-radius:50%;background:#2fbf71;color:#06130b;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:16px}
  .step b{display:block;font-size:16.5px}
  .step span{color:#b9b9c0;font-size:15px}
  .cities{font-size:16.5px;line-height:1.55}
  .links{display:flex;flex-direction:column;gap:8px;margin:16px 0 4px;font-size:16px}
  .fineprint{color:#a7a7b0;font-size:13.5px;line-height:1.5}
  footer{text-align:center;color:#a7a7b0;padding:26px 16px 34px;font-size:14px;line-height:1.7}
  footer .foot-tag{color:#e42535;font-weight:800;letter-spacing:.3em;font-size:11.5px;text-transform:uppercase}
  footer a{color:#d8d8de;text-decoration:none;font-weight:700}
`;

const LANG_SCRIPT = `<script>
function ghsLang(l) {
  l = (l === 'es') ? 'es' : 'en';
  document.documentElement.lang = l;
  var blocks = document.querySelectorAll('[data-lang]');
  for (var i = 0; i < blocks.length; i++) blocks[i].hidden = blocks[i].getAttribute('data-lang') !== l;
  var bE = document.getElementById('lgEn'), bS = document.getElementById('lgEs');
  if (bE) bE.classList.toggle('on', l === 'en');
  if (bS) bS.classList.toggle('on', l === 'es');
  try { localStorage.setItem('ghsMenuLang', l); localStorage.setItem('ghsWorkerLang', l); localStorage.setItem('ghsCartLang', l); localStorage.setItem('ghsEstLang', l); } catch (e) {}
}
(function () { try { if (localStorage.getItem('ghsMenuLang') === 'es') ghsLang('es'); } catch (e) {} })();
</script>`;

function areasCard(lang, currentSlug) {
  const selfCitySlug = currentSlug.startsWith('handyman-') ? currentSlug.slice('handyman-'.length) : null;
  const cityLinks = CITIES.filter(c => c.slug !== selfCitySlug)
    .map(c => '<a href="https://generalhandymans.app/handyman-' + c.slug + '">' + (lang === 'es' ? 'Handyman en ' : 'Handyman in ') + c.name[lang] + '</a>').join(' · ');
  const selfCity = CITIES.find(c => c.slug === selfCitySlug);
  const tradeLinks = TRADE_PAGES.filter(tp => tp.slug !== currentSlug)
    .map(tp => '<a href="https://generalhandymans.app/' + tp.slug + '">' + TRADE_NAMES[tp.trade][lang] + ' — Fairfield</a>').join(' · ');
  let inner = '<h2>' + COPY.areasH[lang] + '</h2><p class="cities">' + cityLinks + '</p>';
  if (selfCity) inner += '<p class="fineprint">' + (lang === 'es' ? 'Estás viendo: ' : 'You are here: ') + '<b>Handyman — ' + selfCity.name[lang] + '</b></p>';
  inner += '<h2 style="margin-top:18px">' + COPY.tradesH[lang] + '</h2><p class="cities">' + tradeLinks + '</p>';
  inner += '<h2 style="margin-top:18px">' + COPY.doorsH[lang] + '</h2><p class="cities">' +
    '<a href="https://generalhandymans.app/homecare">HomeCare</a> · <a href="https://generalhandymans.app/plus">HomeCare Plus</a> · <a href="https://generalhandymans.app/yard">Yard Care</a> · <a href="https://generalhandymans.app/junk-removal">' + (lang === 'es' ? 'Retiro de basura' : 'Junk Removal') + '</a></p>';
  return '<div class="card">' + inner + '</div>';
}

function langBlock(page, lang, kind) {
  const L = lang;
  const t = k => COPY[k][L];
  let out = '';
  out += '<span class="badge">' + esc(page.badge[L]) + '</span>\n    ';
  out += '<h1>' + esc(page.h1[L]) + '</h1>\n    ';
  out += '<p class="sub">' + esc(page.sub[L]) + '</p>\n    ';
  out += '<img class="plan-img" src="' + page.img + '" alt="' + escA(page.imgAlt[L]) + '">\n    ';
  out += '<a class="cta" href="%%JOIN%%">' + t('orderCtaCity') + '</a>\n    ';
  out += '<p class="form-note">' + t('formNote') + '</p>\n    ';
  out += '<div class="card"><h2>' + t('localPicture') + '</h2>' + page.intro[L].map(p => '<p>' + esc(fillPrices(p)) + '</p>').join('') + (page.zones ? '<p class="zones"><b>' + t('neighborhoods') + ':</b> ' + esc(page.zones) + '</p>' : '') + '</div>\n    ';
  if (kind === 'city') {
    out += '<div class="card"><h2>' + t('popularIn') + ' ' + page.name[L] + '</h2><ul class="prices">\n        ' + rowsFor(page.popular, L) + '\n      </ul></div>\n    ';
    for (const tr of TRADE_ORDER) {
      const tp = TRADE_PAGES.find(x => x.trade === tr);
      out += '<div class="card"><h2><a href="https://generalhandymans.app/' + tp.slug + '">' + TRADE_HEADS[tr][L] + '</a></h2><ul class="prices">\n        ' + rowsFor(byTrade(tr), L) + '\n      </ul></div>\n    ';
    }
    out += '<div class="card"><h2>' + TRADE_HEADS.handyman[L] + '</h2><ul class="prices">\n        ' + rowsFor(byTrade('handyman'), L) + '\n      </ul><p class="fineprint">' + t('fineprint') + '</p></div>\n    ';
  } else {
    out += '<div class="card"><h2>' + TRADE_HEADS[page.trade][L] + '</h2><ul class="prices">\n        ' + rowsFor(byTrade(page.trade), L) + '\n      </ul><p class="fineprint">' + t('fineprint') + '</p></div>\n    ';
    out += '<div class="card"><h2>' + t('goodToKnow') + '</h2><ul class="notes">' + page.notes[L].map(n => '<li>' + esc(fillPrices(n)) + '</li>').join('') + '</ul></div>\n    ';
  }
  out += '<div class="card"><h2>' + t('homecareH') + '</h2><p>' + t('homecareBody') + '</p><p><a href="https://generalhandymans.app/homecare">' + t('homecareLink') + '</a> · <a href="https://generalhandymans.app/plus">' + t('plusLink') + '</a></p></div>\n    ';
  out += '<div class="card"><h2>' + t('howH') + '</h2><div class="steps">' + COPY.steps[L].map((s, i) => '<div class="step"><div class="step-badge">' + (i + 1) + '</div><div><b>' + s[0] + '</b><span>' + s[1] + '</span></div></div>').join('') + '</div></div>\n    ';
  out += areasCard(L, page.slug) + '\n    ';
  out += '<a class="cta" href="%%JOIN%%">' + t('orderCtaCity') + '</a>\n    ';
  out += '<div class="links"><a href="https://generalhandymans.app/">' + t('browseAll') + '</a><a href="tel:+17078623773">' + t('callLine') + '</a></div>';
  return out;
}

function pageHtml(page, kind) {
  const url = 'https://generalhandymans.app/' + page.slug;
  const ld = kind === 'city'
    ? { '@context': 'https://schema.org', '@type': 'Handyman', name: 'General Handyman Solutions', url, telephone: '+1-707-862-3773', image: 'https://generalhandymans.app/og-image.jpg', priceRange: '$75/hr', foundingDate: '2020', areaServed: { '@type': 'City', name: page.name.en + ', CA' } }
    : { '@context': 'https://schema.org', '@type': 'Service', name: TRADE_NAMES[page.trade].en + ' services in Fairfield, CA', url, provider: { '@type': 'Handyman', name: 'General Handyman Solutions', telephone: '+1-707-862-3773', url: 'https://generalhandymans.app/' }, areaServed: 'Fairfield, CA' };
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escT(page.title.en) + '</title>\n' +
    '<meta name="description" content="' + escA(page.desc.en) + '">\n' +
    '<link rel="canonical" href="' + url + '">\n' +
    '<meta name="theme-color" content="#0b0b0b">\n<meta name="color-scheme" content="dark">\n' +
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">\n<link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png">\n<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">\n' +
    '<meta property="og:title" content="' + escA(page.title.en) + '">\n' +
    '<meta property="og:description" content="' + escA(page.desc.en) + '">\n' +
    '<meta property="og:type" content="website">\n<meta property="og:url" content="' + url + '">\n' +
    '<meta property="og:image" content="https://generalhandymans.app/og-image.jpg">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' +
    '<script type="application/ld+json">\n' + JSON.stringify(ld) + '\n</script>\n' +
    '<style>' + STYLE + '</style>\n</head>\n<body>\n' +
    '<header class="top">\n  <a class="logo" href="https://generalhandymans.app/" aria-label="General Handyman Solutions — home"><img src="/logo-header.png" alt="General Handyman Solutions"></a>\n  <div class="tag">REPORTING FOR DUTY</div>\n  <div class="lang-toggle" role="group" aria-label="Language / Idioma"><button type="button" id="lgEn" class="on" onclick="ghsLang(\'en\')">EN</button><button type="button" id="lgEs" onclick="ghsLang(\'es\')">ES</button></div>\n</header>\n<main>\n' +
    '  <div data-lang="en">\n    ' + langBlock(page, 'en', kind) + '\n  </div>\n' +
    '  <div data-lang="es" hidden>\n    ' + langBlock(page, 'es', kind) + '\n  </div>\n' +
    '</main>\n<footer>\n  <div class="foot-tag">REPORTING FOR DUTY</div>\n  General Handyman Solutions · <a href="https://generalhandymans.app/">generalhandymans.app</a><br>\n  <a href="tel:+17078623773">(707) 862-3773</a>\n</footer>\n' +
    LANG_SCRIPT + '\n</body>\n</html>\n';
}

let written = 0;
for (const c of CITIES) { fs.writeFileSync(path.join(ROOT, 'app', 'public', 'landings', c.file), pageHtml({ ...c, slug: 'handyman-' + c.slug }, 'city')); written++; }
for (const tp of TRADE_PAGES) { fs.writeFileSync(path.join(ROOT, 'app', 'public', 'landings', tp.file), pageHtml(tp, 'trade')); written++; }
console.log('v109 generator: wrote ' + written + ' landing pages; catalog ' + Object.keys(SMENU).length + ' services; trades ' +
  TRADE_ORDER.map(t => t + '=' + byTrade(t).length).join(' ') + ' handyman=' + byTrade('handyman').length);
