// The Help page's words (pages/Help.tsx): a step-by-step guide for someone who has never kept a budget, and the
// questions people ask. Kept apart from i18n.ts because it is long and only the Help page reads it. Pictures and the
// numbered markers on them belong to the page; a step's `points` are the markers' captions, in order.

export type HelpPage = 'month' | 'year' | 'subs' | 'goals' | 'categories' | 'settings'
export type Topic = 'start' | 'jars' | 'entries' | 'tools' | 'data' | 'app' | 'trouble'
export const TOPICS: Topic[] = ['start', 'jars', 'entries', 'tools', 'data', 'app', 'trouble']

export interface Step {
  id: string
  title: string
  lead: string
  body: string[]
  points?: string[]
  tip?: string
  go?: HelpPage | 'add'
}

export interface Faq {
  topic: Topic
  q: string
  a: string // paragraphs separated by a blank line
}

const en = {
  title: 'Help',
  lead: 'How Leak works, from the first entry to the year’s story. Plain words, real screens.',
  search: 'Search help',
  searchHint: 'e.g. backup, currency, score, delete',
  guide: 'The guide',
  guideHint: (n: number) => `${n} short steps. Read them in order the first time; about ten minutes.`,
  step: (i: number) => `Step ${i}`,
  tipLabel: 'Tip',
  open: { month: 'Open Month', year: 'Open Year', subs: 'Open Subscriptions', goals: 'Open Goals', categories: 'Open Categories', settings: 'Open Settings', add: 'Add an entry' },
  faq: 'Questions and answers',
  faqHint: (n: number) => `${n} questions people ask. Click one to read the answer.`,
  allTopics: 'All',
  topics: { start: 'Getting started', jars: 'Jars and score', entries: 'Entries', tools: 'Subscriptions, goals, categories', data: 'Your data', app: 'The app', trouble: 'When something is off' },
  results: (n: number) => (n === 1 ? '1 match' : `${n} matches`),
  inGuide: 'In the guide',
  inFaq: 'In the questions',
  readStep: 'Read this step',
  nothing: (q: string) => `Nothing found for “${q}”.`,
  nothingHint: 'Try a shorter word, like “backup” instead of “how do I back up my data”.',
  stuck: 'Still stuck?',
  stuckHint: 'Tell us what happened and what you expected. Every report is read.',
  report: 'Report a problem on GitHub',
  // The picture in step 1, drawn from the user's own split and currency.
  jarsSay: (x: string) => `Say ${x} comes in this month`,
  jarsWhat: { needs: 'Rent, food, bills', wants: 'Eating out, fun', investments: 'Put aside for later' },
  // The drawn entry form in steps 2 and 3.
  form: { salary: 'Salary', groceries: 'Groceries' },
  keys: { palette: 'Search everything', add: 'New entry', prevNext: 'Previous or next month', today: 'Back to now', goMonth: 'Go to Month', help: 'Every shortcut' },

  steps: [
    {
      id: 'idea',
      title: 'The idea in one minute',
      lead: 'Leak is a notebook for your money. You write down what comes in and what goes out. Leak does the maths.',
      body: [
        'Every month, the money that comes in is split into three jars. Needs are things you have to pay: rent, food, bills, getting to work. Wants are things that are nice but you could skip: eating out, games, a new jacket. Investments is money you put aside for later: a savings account, an emergency fund, shares.',
        'In the app the jars are called buckets. The usual plan is 50/30/20: half for needs, 30% for wants, 20% put aside. You can change it any time.',
      ],
      tip: 'You do not need to know anything about budgeting. Write things down and Leak shows you where the money went.',
    },
    {
      id: 'income',
      title: 'Write down your income',
      lead: 'Start with the money you got this month, like your salary.',
      body: [],
      points: [
        'Click New transaction in the sidebar. On a phone, tap the + in the middle of the bottom bar.',
        'Pick Income at the top.',
        'Type the amount. Only the number: 350000 or 1200.50.',
        'Pick a category, like the one for your job.',
        'Press Save. Done.',
      ],
      tip: 'Paid twice this month? Add two entries. Leak adds them up.',
      go: 'add',
    },
    {
      id: 'expense',
      title: 'Write down what you spend',
      lead: 'Do the same for everything you pay for: a coffee, the rent, a bus ticket.',
      body: [
        'The description is optional, but it helps later: “Lidl”, “Mum’s birthday”. Leak remembers what you typed before and offers it in grey. Press Tab to take it.',
        'The date is today unless you pick another day. Tags are optional too: they group things across categories, like everything on one trip.',
      ],
      points: [
        'Expense is already picked.',
        'The amount you paid.',
        'The category. It also picks the jar: Food goes to Needs, Dining out to Wants.',
        'The bucket (the jar). Click Change only when one purchase is an exception.',
      ],
      tip: 'Write it down right after you pay. It takes ten seconds and nothing gets forgotten.',
      go: 'add',
    },
    {
      id: 'month',
      title: 'Read the Month page',
      lead: 'The Month page is home. It answers one question: how much do I have left?',
      body: ['Further down you find the jars, the score, a chart of your categories and every entry of the month.'],
      points: [
        'The month you are looking at. Click it to jump to another one.',
        'Step back or forward a month. Today brings you back to now.',
        'Add a new entry.',
        'Remaining: income minus expenses. This is what you still have. It turns red when you spent more than came in.',
        'Income: everything that came in this month.',
        'Expenses: everything that went out.',
      ],
      tip: 'The ← and → keys flip through the months.',
      go: 'month',
    },
    {
      id: 'jars',
      title: 'Check the three jars',
      lead: 'Budget split, on the Month page, shows how full each jar is.',
      body: ['For Needs and Wants, a full bar means the jar is empty: you spent what the plan allowed. For Investments a full bar is good news: you put aside what you planned.'],
      points: [
        'What went into this jar, and how much the plan allows. With 3,400 coming in and a 50% plan, Needs gets 1,700.',
        'How much is still left in the jar.',
        'The jar’s share of this month’s income, next to the plan’s share.',
      ],
      tip: 'Want a different plan, like 60/20/20? Change it in Settings, under Budget split.',
      go: 'month',
    },
    {
      id: 'score',
      title: 'Get a score for every month',
      lead: 'When a month is over, Leak gives it a score from 0 to 100. Higher is better.',
      body: [
        'Half of the points come from keeping to your plan for the three jars. The other half come from spending less than you earned: keep a fifth of your income and that half is full.',
        'While the month is still running there is no score yet. In its place you see what you have kept so far and what stood out, like a category that cost twice its usual.',
      ],
      tip: 'Click “How is it calculated?” under the score for the full method and its sources.',
      go: 'month',
    },
    {
      id: 'subs',
      title: 'Let subscriptions write themselves',
      lead: 'Netflix, Spotify, the phone plan: things you pay every month. Add them once and Leak writes them in for you.',
      body: [
        'On Subscriptions, click New subscription. Give it a name, the monthly price, a category and the day it is charged. From this month on, Leak adds it on that day of every month, until you cancel it.',
        'After you have paid for something for a year, Leak asks whether you still use it. Good for catching the ones you forgot about.',
      ],
      go: 'subs',
    },
    {
      id: 'goals',
      title: 'Save up for something',
      lead: 'Saving for a bike or a holiday? Make it a goal.',
      body: [
        'On Goals, click New goal. Type what it is, what it costs and how much you already have. Leak works out about how many months are left, from what you kept each month this year.',
        'When you put more aside, open the goal and raise Saved so far. Leak never moves money: it only keeps count.',
      ],
      go: 'goals',
    },
    {
      id: 'year',
      title: 'See the whole year',
      lead: 'The Year page puts the twelve months side by side.',
      body: [
        'Green bars are income, red bars are expenses. Below them: every month in a table with averages and totals, and what you spent per category. Click a month to open it.',
        'From 20 December Leak also offers the year’s story: a full-screen walk through your year in numbers. It stays on the Year page, so you can open it whenever you like.',
      ],
      go: 'year',
    },
    {
      id: 'categories',
      title: 'Sort things your way',
      lead: 'Categories are labels like Food or Rent. Leak comes with a set, and every one of them is yours to change.',
      body: [
        'On Categories, click one to rename it, give it a colour or an icon, or pick the jar it goes into. New category makes your own.',
        'A category can have a monthly limit, like 200 for eating out. The Month page then shows how much of it is left.',
        'Deleting a category keeps your entries: they move to Uncategorized, where you can give them a new one.',
      ],
      go: 'categories',
    },
    {
      id: 'fix',
      title: 'Find it, fix it, undo it',
      lead: 'Typed the wrong amount? Everything can be fixed.',
      body: [],
      points: [
        'Search by description, category, amount or #tag.',
        'Filters: only expenses, a date range, an amount range.',
        'Change the order: newest, largest, A to Z.',
        'Select several entries to change or delete them together.',
        'Click any entry to change or delete it.',
      ],
      tip: 'Deleted something by accident? Press Ctrl+Z (⌘Z on a Mac), or click Undo in the message at the bottom.',
      go: 'month',
    },
    {
      id: 'keys',
      title: 'Go faster with the keyboard',
      lead: 'On a computer you can do almost everything without the mouse.',
      body: [
        'Press Ctrl+K (⌘K on a Mac) and start typing: a command, an entry or a month. Press ? to see every shortcut. You can change them in Settings.',
        'G then M means: press G, let go, then press M.',
      ],
    },
    {
      id: 'yours',
      title: 'Make it yours',
      lead: 'Settings is where Leak changes to suit you.',
      body: [
        'Pick the language (English or Hungarian), your currency, light or dark mode, the 12 or 24-hour clock and your own colours. Drag the handles on the split bar to change your plan, or pick a preset like 60 / 20 / 20.',
        'Colour-blind mode switches to colours that stay apart for every kind of colour blindness, and stripes the expenses.',
      ],
      go: 'settings',
    },
  ] satisfies Step[],

  faqs: [
    // Getting started
    { topic: 'start', q: 'What is Leak?', a: 'A notebook for your money. You write down what comes in and what goes out. Leak adds it up, sorts it into three jars (Needs, Wants, Investments) and shows you how each month went.' },
    { topic: 'start', q: 'Do I need an account?', a: 'Yes. You sign in with Google, GitHub or a code sent to your email.\n\nThe account keeps your data safe when a computer breaks, and lets you use Leak on more than one device.' },
    { topic: 'start', q: 'Does Leak connect to my bank?', a: 'No. Leak never sees your bank account. You type entries in yourself, or import a CSV file that your bank lets you download (Settings › Transactions as CSV).' },
    { topic: 'start', q: 'What should I write down first?', a: 'This month’s income, then your expenses as they happen. Add the payments that come every month (rent, phone, streaming) under Subscriptions once, and they fill themselves in.' },
    { topic: 'start', q: 'Do I really have to write down every coffee?', a: 'The more you write down, the truer the picture. But a missing coffee breaks nothing. Many people write one entry a day for the small things: “Coffee and snacks, 8”.' },
    { topic: 'start', q: 'I am starting in the middle of the month. Is that a problem?', a: 'No. Write down what you remember, or keep this month as practice. A month only gets a score once it is over and has income, so the next full month is a clean start.' },
    { topic: 'start', q: 'Is Leak free?', a: 'Yes. Leak is open source under the AGPL-3.0 licence, and its code is on GitHub.' },

    // Jars and score
    { topic: 'jars', q: 'What are Needs, Wants and Investments?', a: 'Three jars for your money.\n\nNeeds: what you have to pay. Rent, food, bills, transport, medicine.\n\nWants: what you could live without. Eating out, games, travel, a new phone.\n\nInvestments: what you put aside. A savings account, an emergency fund, shares, paying a loan back early.' },
    { topic: 'jars', q: 'What is the 50/30/20 rule?', a: 'A simple plan from the book All Your Worth by Elizabeth Warren and Amelia Warren Tyagi: half of your income for needs, 30% for wants, 20% for saving. It is a starting point, not a law: change it in Settings › Budget split.' },
    { topic: 'jars', q: 'How do I change my budget split?', a: 'Settings › Budget split. Drag the two handles on the bar, or click a preset like 60 / 20 / 20. It saves by itself.\n\nMonths that are already over keep the split they had, so their scores do not change.' },
    { topic: 'jars', q: 'Where does my savings account go?', a: 'Investments. Everything you set aside belongs there: a savings account, an emergency fund, shares, extra loan repayments.\n\nRecord it as an expense in an Investments category (like Investment). Money that is simply left over at the end of the month does not count as invested.' },
    { topic: 'jars', q: 'How is the monthly score calculated?', a: 'Half of the score is how well you kept your split: Needs and Wants lose points as they go over their plan, Investments earn points as you put money in, up to the target.\n\nThe other half is whether you spent less than you earned. Spending about as much as came in gives half of it; keeping a fifth of your income gives all of it.\n\nThe full method, with its sources, is under “How is it calculated?” below the score on the Month page.' },
    { topic: 'jars', q: 'What do Healthy, Coping and Vulnerable mean?', a: 'The score’s three bands, taken from the Financial Health Network’s FinHealth Score: 80–100 Healthy, 40–79 Coping, 0–39 Vulnerable.' },
    { topic: 'jars', q: 'Why does this month have no score?', a: 'A month gets its score once it is over. A month without any income gets none at all, as there is nothing to measure against.' },
    { topic: 'jars', q: 'I sold shares or took money out of savings. Is that income?', a: 'Not really: you earned it earlier. Record it as income in a category marked “Money out of savings or investments”, like the built-in Sold investments.\n\nLeak then leaves it out of the month’s income, and takes it off what you invested, so your score stays fair. Turn the switch on for any income category on the Categories page.' },
    { topic: 'jars', q: 'What does Remaining mean?', a: 'This month’s income minus this month’s expenses: what you still have. It turns red when more went out than came in.\n\nMoney you put into Investments counts as an expense here, because it left your everyday money.' },
    { topic: 'jars', q: 'What is Spending pace?', a: 'A chart on the Month page: how much you have spent so far this month, day by day, with last month’s line next to it. If your line is above the dashed one, you are spending faster than last month.' },

    // Entries
    { topic: 'entries', q: 'How do I add an entry?', a: 'Click New transaction in the sidebar, or the + in the bottom bar on a phone, or press N. Pick Expense or Income, type the amount, pick a category and press Save.' },
    { topic: 'entries', q: 'How do I change or delete an entry?', a: 'Click it in the list on the Month page. The same form opens: change what you need and press Save, or press Delete.' },
    { topic: 'entries', q: 'Can I undo a mistake?', a: 'Yes. Press Ctrl+Z (⌘Z on a Mac) right after, or click Undo in the message that appears at the bottom. Ctrl+Shift+Z brings it back again.' },
    { topic: 'entries', q: 'How do I add something from an earlier day?', a: 'Click the date in the form and pick the day. Entries go to the month of their date, so a 30 March entry shows up in March.' },
    { topic: 'entries', q: 'I paid in another currency. What do I do?', a: 'Click the currency next to the amount and pick the one you paid in, like EUR. Type the amount as it was on the receipt.\n\nLeak fetches the central bank’s rate for that day and converts it. If your bank used a different rate, type it in yourself.' },
    { topic: 'entries', q: 'What are tags?', a: 'Optional labels that group entries across categories and months, like #holiday-2026 for everything on one trip. Type a tag and press Enter. Search for #holiday-2026 to see what the trip cost in total.' },
    { topic: 'entries', q: 'How do I change many entries at once?', a: 'On the Month page, click Select above the list, tick the entries (or All) and click Edit to change their category, jar or date. You can also delete them together.' },
    { topic: 'entries', q: 'How do I find an old entry?', a: 'Press Ctrl+K (⌘K on a Mac) and type part of its description or the amount: this searches every month at once. The search box above the Month page’s list searches only that month.' },
    { topic: 'entries', q: 'Where do the grey suggestions in the description come from?', a: 'From what you typed before. When you start typing “Li”, Leak offers “Lidl” if you used it earlier. Press Tab to take it, or just keep typing.' },

    // Subscriptions, goals, categories
    { topic: 'tools', q: 'How do subscriptions work?', a: 'You add a subscription once, with its monthly price and the day it is charged. From the month you add it, Leak writes it in as an expense on that day every month. If Leak was closed on the day, it catches up the next time you open it.' },
    { topic: 'tools', q: 'What happens when I cancel a subscription?', a: 'Leak stops adding it from then on. The entries it already added stay, because you really paid them.' },
    { topic: 'tools', q: 'Why does Leak ask if I still use a subscription?', a: 'After a year of payments, it asks once. Click “Still using it” to keep it, or cancel it right there. Forgotten subscriptions are one of the most common leaks.' },
    { topic: 'tools', q: 'How does a goal know how long I need?', a: 'It takes what is still missing and divides it by your average monthly profit this year (income minus expenses). If you have not kept anything this year yet, it shows no estimate.' },
    { topic: 'tools', q: 'Does a goal move money for me?', a: 'No. Leak only keeps count. When you put money aside, open the goal and raise Saved so far.' },
    { topic: 'tools', q: 'What is a category limit?', a: 'A monthly cap you set for one category, like 200 for Dining out. The Month page shows how much of each limit is left and warns you when one is gone over. Set it by clicking the category on the Categories page.' },
    { topic: 'tools', q: 'What happens when I delete a category?', a: 'Its entries and subscriptions are kept and move to Uncategorized. Give them a new category with Select › Edit on the Month page.' },
    { topic: 'tools', q: 'What is the year’s story?', a: 'A full-screen walk through your year: what came in, what you kept, your best month, your top category, your habits. Leak offers it from 20 December through January, and you can open any year’s story from the Year page.' },

    // Your data
    { topic: 'data', q: 'Where is my data kept?', a: 'In your account, on a server, so it survives a lost or broken computer. Each device also keeps a copy of the last sync, so you can look at it without internet.' },
    { topic: 'data', q: 'Can anyone else read my data?', a: 'Names, descriptions, tags and amounts are encrypted on your device before they are sent. The key stays with your sign-in account, not with the database, so the database alone cannot read them.' },
    { topic: 'data', q: 'Does Leak work offline?', a: 'You can read everything from the last sync. You cannot save changes until the connection is back. A bar at the top tells you when you are offline, with a Try again button.' },
    { topic: 'data', q: 'How do I use Leak on another computer?', a: 'Install Leak there and sign in with the same account. Everything appears by itself. Your shortcuts and settings come along too.' },
    { topic: 'data', q: 'How do I make a backup?', a: 'Settings › Data › Export backup saves one file with everything in it. Keep it somewhere safe.\n\nImport backup brings a backup back, but it replaces ALL your current data, so use it with care.' },
    { topic: 'data', q: 'How do I bring in entries from my bank or another app?', a: 'Download a CSV file from your bank or app. In Settings › Transactions as CSV, click Import CSV and pick it. Leak shows what it will add before it adds anything.\n\nThe file needs at least a date and an amount column. It may also have type (expense or income), category, bucket and note.' },
    { topic: 'data', q: 'Can I import the same file twice?', a: 'Yes. Leak only adds what it does not have yet, so a second import of the same file adds nothing. This also means a half-finished import can simply be started again.' },
    { topic: 'data', q: 'How do I open my entries in Excel?', a: 'Settings › Transactions as CSV › Export CSV. Pick the months you want. Excel, Numbers and Google Sheets all open the file.' },
    { topic: 'data', q: 'How do I delete everything and start over?', a: 'Settings › Data › Delete all data. It removes every entry, subscription, category and goal; your settings stay. This cannot be undone, so export a backup first.' },
    { topic: 'data', q: 'How do I delete my account?', a: 'Settings › Account › Manage account, then delete the account there. Your Leak data is deleted with it.' },

    // The app
    { topic: 'app', q: 'Which computers does Leak run on?', a: 'Windows, macOS (Apple Silicon and Intel) and Linux. Download it from the latest release on GitHub.' },
    { topic: 'app', q: 'macOS says Leak cannot be opened. What now?', a: 'Leak is not code-signed yet, so macOS blocks the first launch. Open System Settings › Privacy & Security, scroll down and click Open Anyway. You only do this once.' },
    { topic: 'app', q: 'Windows says it protected my PC. What now?', a: 'On the “Windows protected your PC” screen, click More info, then Run anyway. This happens only the first time, because Leak is not code-signed yet.' },
    { topic: 'app', q: 'How do I update Leak?', a: 'Leak checks on launch and offers a new version when there is one. Click Install: it restarts, and your data stays as it is. You can also check by hand in Settings › Updates.' },
    { topic: 'app', q: 'How do I switch to Hungarian, or to dark mode?', a: 'Settings › General: Language and Appearance. Appearance “System” follows your computer’s light or dark setting. Shift+D steps through the three from anywhere.' },
    { topic: 'app', q: 'Does changing my currency convert my amounts?', a: 'No. The currency only changes the sign shown next to the numbers. Pick it once, at the start. For payments in other currencies, pick the currency in the entry form instead.' },
    { topic: 'app', q: 'What is colour-blind mode?', a: 'A set of colours that stay apart for red-green and blue-yellow colour blindness, and for seeing no colour at all. Expenses also get stripes, so they never depend on colour alone. Turn it on in Settings › Colours.' },
    { topic: 'app', q: 'Can I change the keyboard shortcuts?', a: 'Yes. Settings › Keyboard shortcuts. Click Customise next to a command and press the keys you want. Your shortcuts follow your account to every device.' },
    { topic: 'app', q: 'Can I make the sidebar smaller?', a: 'Click Collapse sidebar at its bottom, or press Ctrl+B (⌘B on a Mac). It shrinks to icons; hover an icon to see its name.' },
    { topic: 'app', q: 'Can I have squares instead of a donut chart?', a: 'Yes. Settings › General › Category chart: pick Treemap. It is used on the Month and Year pages.' },

    // When something is off
    { topic: 'trouble', q: 'It says “Can’t reach the server”.', a: 'Your internet is down, or the server is. You still see your data from the last sync. Click Try again once you are back online; until then, changes cannot be saved.' },
    { topic: 'trouble', q: 'I added an entry, but I cannot see it.', a: 'Check three things: that you are looking at the month of its date, that the search box above the list is empty, and that no filter is on (Clear filters). Ctrl+K finds it in any month.' },
    { topic: 'trouble', q: 'A month’s numbers look wrong.', a: 'Usually one entry is in the wrong jar or the wrong month. Sort the list by Largest amount and check the biggest ones first. Money taken out of savings belongs in a “Money out of savings” category, or it counts as income.' },
    { topic: 'trouble', q: 'Signing in with Google or GitHub does not come back to Leak.', a: 'Finish signing in in the browser and allow it to open Leak if it asks. If nothing happens, go back to Leak, click Cancel and try again, or sign in with an email code instead.' },
    { topic: 'trouble', q: 'I found a bug. Where do I report it?', a: 'On GitHub, under Issues (the link is at the bottom of this page). Say what you did, what happened and what you expected. A screenshot helps a lot.' },
  ] satisfies Faq[],
}

export type HelpDict = typeof en

const hu: HelpDict = {
  title: 'Súgó',
  lead: 'Így működik a Leak, az első tételtől az év történetéig. Egyszerű szavakkal, valódi képernyőkkel.',
  search: 'Keresés a súgóban',
  searchHint: 'pl. mentés, pénznem, pontszám, törlés',
  guide: 'Az útmutató',
  guideHint: (n) => `${n} rövid lépés. Elsőre olvasd végig sorban; nagyjából tíz perc.`,
  step: (i) => `${i}. lépés`,
  tipLabel: 'Tipp',
  open: { month: 'Hónap megnyitása', year: 'Év megnyitása', subs: 'Előfizetések megnyitása', goals: 'Célok megnyitása', categories: 'Kategóriák megnyitása', settings: 'Beállítások megnyitása', add: 'Új tétel' },
  faq: 'Kérdések és válaszok',
  faqHint: (n) => `${n} gyakori kérdés. Kattints egyre a válaszért.`,
  allTopics: 'Mind',
  topics: { start: 'Első lépések', jars: 'Kasszák és pontszám', entries: 'Tételek', tools: 'Előfizetések, célok, kategóriák', data: 'Az adataid', app: 'Az alkalmazás', trouble: 'Ha valami nem stimmel' },
  results: (n) => `${n} találat`,
  inGuide: 'Az útmutatóban',
  inFaq: 'A kérdések között',
  readStep: 'Lépés elolvasása',
  nothing: (q) => `Nincs találat erre: „${q}”.`,
  nothingHint: 'Próbálj egy rövidebb szót, pl. „mentés” a „hogyan mentem el az adataimat” helyett.',
  stuck: 'Még mindig elakadtál?',
  stuckHint: 'Írd le, mi történt és mit vártál. Minden bejelentést elolvasunk.',
  report: 'Hiba bejelentése a GitHubon',
  jarsSay: (x) => `Tegyük fel, hogy ebben a hónapban ${x} jön be`,
  jarsWhat: { needs: 'Lakbér, étel, számlák', wants: 'Étterem, szórakozás', investments: 'Félretéve későbbre' },
  form: { salary: 'Fizetés', groceries: 'Bevásárlás' },
  keys: { palette: 'Keresés mindenben', add: 'Új tétel', prevNext: 'Előző vagy következő hónap', today: 'Vissza a mostanihoz', goMonth: 'Ugrás a Hónapra', help: 'Az összes billentyűparancs' },

  steps: [
    {
      id: 'idea',
      title: 'Az ötlet egy percben',
      lead: 'A Leak egy füzet a pénzedhez. Leírod, mi jön be és mi megy ki. A számolást a Leak végzi.',
      body: [
        'Minden hónapban a bejövő pénz három kasszára oszlik. Szükséglet: amit ki kell fizetned, pl. lakbér, étel, számlák, munkába járás. Vágy: ami jó, de meglennél nélküle, pl. étterem, játékok, egy új kabát. Befektetés: amit félreteszel későbbre, pl. megtakarítási számla, vésztartalék, részvények.',
        'Az alkalmazásban ezek neve csoport. A szokásos terv az 50/30/20: a fele a szükségletekre, 30% a vágyakra, 20% félre. Bármikor megváltoztathatod.',
      ],
      tip: 'Semmit nem kell tudnod a költségvetésről. Írd le a dolgokat, és a Leak megmutatja, hová ment a pénz.',
    },
    {
      id: 'income',
      title: 'Írd be a bevételedet',
      lead: 'Kezdd az ebben a hónapban kapott pénzzel, például a fizetéseddel.',
      body: [],
      points: [
        'Kattints az oldalsávban az Új tétel gombra. Telefonon az alsó sáv közepén lévő +-ra.',
        'Fent válaszd a Bevételt.',
        'Írd be az összeget. Csak a számot: 350000 vagy 1200,50.',
        'Válassz kategóriát, például a munkádhoz tartozót.',
        'Nyomd meg a Mentést. Kész.',
      ],
      tip: 'Kétszer kaptál pénzt ebben a hónapban? Vegyél fel két tételt, a Leak összeadja őket.',
      go: 'add',
    },
    {
      id: 'expense',
      title: 'Írd be, mire költesz',
      lead: 'Ugyanígy vegyél fel mindent, amiért fizetsz: egy kávét, a lakbért, egy buszjegyet.',
      body: [
        'A leírás nem kötelező, de később jól jön: „Lidl”, „Anya szülinapja”. A Leak emlékszik, mit írtál korábban, és szürkével felajánlja. A Tab billentyűvel elfogadod.',
        'A dátum a mai nap, hacsak nem választasz másikat. A címkék sem kötelezők: kategóriákon át fogják össze a dolgokat, például egy utazás minden költségét.',
      ],
      points: [
        'A Kiadás már ki van választva.',
        'A kifizetett összeg.',
        'A kategória. Ez a csoportot is kiválasztja: az élelmiszer a Szükségletbe kerül, az étterem a Vágyba.',
        'A csoport (a kassza). Csak akkor kattints a Módosításra, ha egy vásárlás kivétel.',
      ],
      tip: 'Rögtön fizetés után írd be. Tíz másodperc, és semmi nem felejtődik el.',
      go: 'add',
    },
    {
      id: 'month',
      title: 'Így olvasd a Hónap oldalt',
      lead: 'A Hónap oldal a kiindulópont. Egy kérdésre felel: mennyi pénzem maradt?',
      body: ['Lejjebb találod a kasszákat, a pontszámot, a kategóriák diagramját és a hónap összes tételét.'],
      points: [
        'Az éppen nézett hónap. Kattints rá, és másik hónapra ugorhatsz.',
        'Egy hónappal vissza vagy előre. A Ma visszahoz a jelenbe.',
        'Új tétel felvétele.',
        'Maradt: a bevétel mínusz a kiadás. Ennyi pénzed van még. Pirosra vált, ha többet költöttél, mint amennyi bejött.',
        'Bevétel: minden, ami ebben a hónapban bejött.',
        'Kiadás: minden, ami kiment.',
      ],
      tip: 'A ← és → billentyűkkel lapozhatsz a hónapok között.',
      go: 'month',
    },
    {
      id: 'jars',
      title: 'Nézd meg a három kasszát',
      lead: 'A Hónap oldalon a Költségvetés megmutatja, mennyire telt meg az egyes kassza.',
      body: ['A Szükségletnél és a Vágynál a tele csík azt jelenti, hogy elfogyott a keret: elköltötted, amit a terv engedett. A Befektetésnél a tele csík jó hír: félretetted, amit terveztél.'],
      points: [
        'Mennyi ment ebbe a kasszába, és mennyit enged a terv. 3 400 bevételnél és 50%-os tervnél a Szükségletre 1 700 jut.',
        'Mennyi maradt még a kasszában.',
        'A kassza aránya a havi bevételből, mellette a tervezett arány.',
      ],
      tip: 'Más tervet szeretnél, például 60/20/20-at? A Beállításokban, a Költségvetési arányok résznél változtathatod meg.',
      go: 'month',
    },
    {
      id: 'score',
      title: 'Pontszám minden hónapra',
      lead: 'Amikor egy hónap véget ér, a Leak 0 és 100 közötti pontszámot ad neki. Minél több, annál jobb.',
      body: [
        'A pontok fele azért jár, mennyire tartottad a tervet a három kasszánál. A másik fele azért, hogy kevesebbet költöttél-e, mint amennyit kerestél: ha a bevételed ötöde megmarad, ez a fél tele van.',
        'Amíg a hónap tart, még nincs pontszám. A helyén azt látod, mennyi maradt eddig, és mi lógott ki, például egy kategória, ami a szokásos kétszeresébe került.',
      ],
      tip: 'A pontszám alatti „Hogyan számoljuk?” résznél megtalálod a teljes módszert és a forrásokat.',
      go: 'month',
    },
    {
      id: 'subs',
      title: 'Az előfizetések beírják magukat',
      lead: 'Netflix, Spotify, a telefonszámla: amit minden hónapban fizetsz. Vedd fel egyszer, és a Leak beírja helyetted.',
      body: [
        'Az Előfizetések oldalon kattints az Új előfizetésre. Adj neki nevet, havi árat, kategóriát, és add meg, hányadikán vonják le. Ettől a hónaptól a Leak minden hónapban azon a napon beírja, amíg le nem mondod.',
        'Ha valamiért már egy éve fizetsz, a Leak megkérdezi, használod-e még. Így kiderülnek az elfelejtett előfizetések.',
      ],
      go: 'subs',
    },
    {
      id: 'goals',
      title: 'Spórolj valamire',
      lead: 'Biciklire vagy nyaralásra gyűjtesz? Legyen belőle cél.',
      body: [
        'A Célok oldalon kattints az Új célra. Írd be, mi az, mennyibe kerül, és mennyi van már meg rá. A Leak kiszámolja, nagyjából hány hónap van még hátra, abból, amennyi idén havonta megmaradt.',
        'Ha újabb pénzt teszel félre, nyisd meg a célt, és növeld az Eddig félretéve értéket. A Leak sosem mozgat pénzt, csak számon tartja.',
      ],
      go: 'goals',
    },
    {
      id: 'year',
      title: 'Az egész év egyben',
      lead: 'Az Év oldal egymás mellé teszi a tizenkét hónapot.',
      body: [
        'A zöld oszlopok a bevételek, a pirosak a kiadások. Alattuk: minden hónap egy táblázatban, átlagokkal és összegekkel, és hogy mire mennyit költöttél kategóriánként. Kattints egy hónapra, és megnyílik.',
        'December 20-tól a Leak felajánlja az év történetét is: egy teljes képernyős sétát az éveden, számokban. Az Év oldalon marad, így bármikor megnyithatod.',
      ],
      go: 'year',
    },
    {
      id: 'categories',
      title: 'Rendezd a magad módján',
      lead: 'A kategóriák címkék, mint az Étel vagy a Lakbér. A Leak hoz magával egy készletet, és mindegyiket megváltoztathatod.',
      body: [
        'A Kategóriák oldalon kattints egyre, és átnevezheted, adhatsz neki színt vagy ikont, vagy kiválaszthatod, melyik kasszába kerüljön. Az Új kategóriával sajátot készíthetsz.',
        'Egy kategóriának lehet havi limitje, például 20 000 az étteremre. A Hónap oldal ilyenkor mutatja, mennyi maradt belőle.',
        'Ha törölsz egy kategóriát, a tételeid megmaradnak: a Kategória nélkül csoportba kerülnek, ahol újat adhatsz nekik.',
      ],
      go: 'categories',
    },
    {
      id: 'fix',
      title: 'Keresd meg, javítsd ki, vond vissza',
      lead: 'Rossz összeget írtál? Mindent ki lehet javítani.',
      body: [],
      points: [
        'Keresés leírásra, kategóriára, összegre vagy #címkére.',
        'Szűrők: csak kiadások, időszak, összeghatár.',
        'Sorrend: legújabb, legnagyobb, ábécé szerint.',
        'Jelölj ki több tételt, és egyszerre módosítsd vagy töröld őket.',
        'Kattints bármelyik tételre, és módosíthatod vagy törölheted.',
      ],
      tip: 'Véletlenül töröltél valamit? Nyomd meg a Ctrl+Z-t (Macen ⌘Z), vagy kattints a Visszavonásra az alul megjelenő üzenetben.',
      go: 'month',
    },
    {
      id: 'keys',
      title: 'Gyorsabban, billentyűzettel',
      lead: 'Számítógépen szinte mindent elérsz egér nélkül.',
      body: [
        'Nyomd meg a Ctrl+K-t (Macen ⌘K), és kezdj gépelni: egy parancsot, egy tételt vagy egy hónapot. A ? megmutatja az összes billentyűparancsot. A Beállításokban meg is változtathatod őket.',
        'A „G, majd M” azt jelenti: nyomd meg a G-t, engedd fel, aztán nyomd meg az M-et.',
      ],
    },
    {
      id: 'yours',
      title: 'Szabd magadra',
      lead: 'A Beállításokban igazíthatod magadhoz a Leaket.',
      body: [
        'Kiválaszthatod a nyelvet (magyar vagy angol), a pénznemet, a világos vagy sötét megjelenést, a 12 vagy 24 órás időt és a saját színeidet. A tervedet a csík fogantyúinak húzásával változtathatod meg, vagy választhatsz egy kész arányt, például 60 / 20 / 20.',
        'A színtévesztő mód olyan színekre vált, amelyek a színtévesztés minden fajtájánál megkülönböztethetők, a kiadásokat pedig csíkozza.',
      ],
      go: 'settings',
    },
  ],

  faqs: [
    { topic: 'start', q: 'Mi az a Leak?', a: 'Egy füzet a pénzedhez. Leírod, mi jön be és mi megy ki. A Leak összeadja, három kasszába sorolja (Szükséglet, Vágy, Befektetés), és megmutatja, hogyan alakult az egyes hónap.' },
    { topic: 'start', q: 'Kell hozzá fiók?', a: 'Igen. Google-lel, GitHubbal vagy egy e-mailben kapott kóddal lépsz be.\n\nA fiók őrzi meg az adataidat, ha elromlik a gép, és ezzel használhatod a Leaket több eszközön.' },
    { topic: 'start', q: 'Összekapcsolódik a Leak a bankommal?', a: 'Nem. A Leak sosem látja a bankszámládat. A tételeket te írod be, vagy behúzol egy CSV-fájlt, amit a bankodból tölthetsz le (Beállítások › Tranzakciók CSV-ben).' },
    { topic: 'start', q: 'Mit írjak be először?', a: 'Az e havi bevételedet, aztán a kiadásaidat, ahogy történnek. A minden hónapban visszatérő kiadásokat (lakbér, telefon, streaming) vedd fel egyszer az Előfizetések közé, és onnantól beírják magukat.' },
    { topic: 'start', q: 'Tényleg minden kávét be kell írnom?', a: 'Minél többet írsz be, annál igazabb a kép. De egy kimaradt kávé semmit nem ront el. Sokan naponta egy tételt írnak az apróságokra: „Kávé és nasi, 1500”.' },
    { topic: 'start', q: 'Hónap közepén kezdem. Baj ez?', a: 'Nem. Írd be, amire emlékszel, vagy tekintsd ezt a hónapot gyakorlásnak. Pontszámot csak a lezárt, bevétellel rendelkező hónap kap, így a következő teljes hónap tiszta kezdés.' },
    { topic: 'start', q: 'Ingyenes a Leak?', a: 'Igen. A Leak nyílt forráskódú (AGPL-3.0 licenc), a kódja fent van a GitHubon.' },

    { topic: 'jars', q: 'Mi az a Szükséglet, a Vágy és a Befektetés?', a: 'Három kassza a pénzednek.\n\nSzükséglet: amit ki kell fizetned. Lakbér, étel, számlák, közlekedés, gyógyszer.\n\nVágy: ami nélkül is megélnél. Étterem, játékok, utazás, egy új telefon.\n\nBefektetés: amit félreteszel. Megtakarítási számla, vésztartalék, részvények, hitel előtörlesztése.' },
    { topic: 'jars', q: 'Mi az az 50/30/20-as szabály?', a: 'Egyszerű terv Elizabeth Warren és Amelia Warren Tyagi All Your Worth című könyvéből: a bevétel fele a szükségletekre, 30% a vágyakra, 20% megtakarításra. Kiindulópont, nem törvény: a Beállítások › Költségvetési arányok résznél megváltoztathatod.' },
    { topic: 'jars', q: 'Hogyan változtatom meg a felosztást?', a: 'Beállítások › Költségvetési arányok. Húzd a csík két fogantyúját, vagy kattints egy kész arányra, például 60 / 20 / 20. Magától elmentődik.\n\nA már lezárt hónapok megtartják a régi felosztásukat, így a pontszámuk nem változik.' },
    { topic: 'jars', q: 'Hová kerül a megtakarítási számlám?', a: 'A Befektetéshez. Ide tartozik minden, amit félreteszel: megtakarítási számla, vésztartalék, részvények, hitel előtörlesztése.\n\nKiadásként vedd fel, egy Befektetés csoportú kategóriában (például a beépített befektetési kategóriában). Az a pénz, ami a hónap végén egyszerűen megmarad, nem számít befektetésnek.' },
    { topic: 'jars', q: 'Hogyan számolódik a havi pontszám?', a: 'A pontszám fele azon múlik, mennyire tartottad a felosztást: a Szükséglet és a Vágy annyi pontot veszít, amennyivel túllépi a tervet, a Befektetés pedig pontot kapnak a félretett pénzért, a célig.\n\nA másik fele azon, hogy kevesebbet költöttél-e, mint amennyit kerestél. Ha nagyjából annyit költesz, amennyi bejött, a felét kapod meg; ha a bevételed ötöde megmarad, az egészet.\n\nA teljes módszer a forrásokkal együtt a Hónap oldalon, a pontszám alatti „Hogyan számoljuk?” résznél van.' },
    { topic: 'jars', q: 'Mit jelent az Egészséges, a Megküzd és a Sérülékeny?', a: 'A pontszám három sávja, a Financial Health Network FinHealth Score-ja alapján: 80–100 Egészséges, 40–79 Megküzd, 0–39 Sérülékeny.' },
    { topic: 'jars', q: 'Miért nincs pontszáma ennek a hónapnak?', a: 'A hónap akkor kap pontszámot, ha véget ért. Bevétel nélküli hónap egyáltalán nem kap, mert nincs mihez mérni.' },
    { topic: 'jars', q: 'Eladtam részvényeket, vagy pénzt vettem ki a megtakarításból. Ez bevétel?', a: 'Igazából nem: azt korábban kerested meg. Vedd fel bevételként egy olyan kategóriában, amelynél be van kapcsolva a „Megtakarításból vagy befektetésből kivett pénz” (a beépített kategóriák közül ilyen az eladott befektetéseké).\n\nA Leak ilyenkor kihagyja a havi bevételből, és levonja abból, amit befektettél, így a pontszámod igazságos marad. A kapcsolót bármelyik bevételi kategóriánál bekapcsolhatod a Kategóriák oldalon.' },
    { topic: 'jars', q: 'Mit jelent a Maradt?', a: 'Az e havi bevétel mínusz az e havi kiadás: ennyi pénzed van még. Pirosra vált, ha több ment ki, mint amennyi bejött.\n\nA Befektetésbe tett pénz itt kiadásnak számít, mert kikerült a mindennapi pénzed közül.' },
    { topic: 'jars', q: 'Mi az a Költés üteme?', a: 'Egy diagram a Hónap oldalon: mennyit költöttél eddig ebben a hónapban, napról napra, mellette a múlt hónap vonalával. Ha a vonalad a szaggatott fölött van, gyorsabban költesz, mint a múlt hónapban.' },

    { topic: 'entries', q: 'Hogyan veszek fel egy tételt?', a: 'Kattints az oldalsávban az Új tételre, telefonon az alsó sáv +-ára, vagy nyomd meg az N-t. Válaszd a Kiadást vagy a Bevételt, írd be az összeget, válassz kategóriát, és nyomd meg a Mentést.' },
    { topic: 'entries', q: 'Hogyan módosítok vagy törlök egy tételt?', a: 'Kattints rá a Hónap oldal listájában. Ugyanaz az űrlap nyílik meg: változtasd meg, amit kell, és nyomd meg a Mentést, vagy a Törlést.' },
    { topic: 'entries', q: 'Vissza tudok vonni egy hibát?', a: 'Igen. Nyomd meg rögtön utána a Ctrl+Z-t (Macen ⌘Z), vagy kattints a Visszavonásra az alul megjelenő üzenetben. A Ctrl+Shift+Z újra végrehajtja.' },
    { topic: 'entries', q: 'Hogyan veszek fel valamit egy korábbi napra?', a: 'Kattints az űrlapon a dátumra, és válaszd ki a napot. A tétel a dátuma szerinti hónapba kerül, így egy március 30-i tétel márciusban jelenik meg.' },
    { topic: 'entries', q: 'Más pénznemben fizettem. Mit csináljak?', a: 'Kattints az összeg melletti pénznemre, és válaszd ki, amiben fizettél, például EUR. Az összeget úgy írd be, ahogy a blokkon volt.\n\nA Leak lekéri a jegybank aznapi árfolyamát, és átváltja. Ha a bankod más árfolyammal számolt, írd be te.' },
    { topic: 'entries', q: 'Mik azok a címkék?', a: 'Nem kötelező jelölések, amelyek kategóriákon és hónapokon át csoportosítják a tételeket, például #balaton-2026 egy út minden költségére. Írd be a címkét, és nyomj Entert. Keress rá a #balaton-2026-ra, és látod, mennyibe került összesen az út.' },
    { topic: 'entries', q: 'Hogyan módosítok egyszerre sok tételt?', a: 'A Hónap oldalon kattints a lista feletti Kijelölésre, pipáld ki a tételeket (vagy a Mindet), és a Szerkesztéssel megváltoztathatod a kategóriájukat, a kasszájukat vagy a dátumukat. Együtt törölni is tudod őket.' },
    { topic: 'entries', q: 'Hogyan találok meg egy régi tételt?', a: 'Nyomd meg a Ctrl+K-t (Macen ⌘K), és írd be a leírása egy részét vagy az összeget: ez az összes hónapban egyszerre keres. A Hónap oldal listája feletti keresőmező csak abban a hónapban keres.' },
    { topic: 'entries', q: 'Honnan jönnek a szürke javaslatok a leírásnál?', a: 'Abból, amit korábban beírtál. Ha elkezded gépelni, hogy „Li”, a Leak felajánlja a „Lidl”-t, ha korábban használtad. A Tab-bal elfogadod, vagy egyszerűen gépelj tovább.' },

    { topic: 'tools', q: 'Hogyan működnek az előfizetések?', a: 'Egyszer felveszed az előfizetést a havi árával és azzal a nappal, amikor levonják. Attól a hónaptól a Leak minden hónapban azon a napon beírja kiadásként. Ha aznap nem volt megnyitva a Leak, legközelebb pótolja.' },
    { topic: 'tools', q: 'Mi történik, ha lemondok egy előfizetést?', a: 'A Leak onnantól nem írja be. A már beírt tételek megmaradnak, hiszen azokat tényleg kifizetted.' },
    { topic: 'tools', q: 'Miért kérdezi a Leak, hogy használom-e még az előfizetést?', a: 'Egy évnyi fizetés után egyszer rákérdez. Kattints az „Igen, használom” gombra, ha megtartanád, vagy mondd le ott helyben. Az elfelejtett előfizetések a leggyakoribb szivárgások közé tartoznak.' },
    { topic: 'tools', q: 'Honnan tudja egy cél, mennyi idő kell még?', a: 'Fogja a még hiányzó összeget, és elosztja az idei átlagos havi nyereségeddel (bevétel mínusz kiadás). Ha idén még nem maradt meg semmi, nem ad becslést.' },
    { topic: 'tools', q: 'Mozgat helyettem pénzt egy cél?', a: 'Nem. A Leak csak számon tartja. Ha félreteszel, nyisd meg a célt, és növeld az Eddig félretett összeget.' },
    { topic: 'tools', q: 'Mi az a havi limit?', a: 'Egy havi felső határ egy kategóriára, például 20 000 az étteremre. A Hónap oldal mutatja, mennyi maradt az egyes limitekből, és szól, ha egyet túlléptél. Úgy állítod be, hogy a Kategóriák oldalon rákattintasz a kategóriára.' },
    { topic: 'tools', q: 'Mi történik, ha törlök egy kategóriát?', a: 'A tételei és előfizetései megmaradnak, és a Kategória nélkül csoportba kerülnek. A Hónap oldalon a Kijelölés › Szerkesztés segítségével adhatsz nekik új kategóriát.' },
    { topic: 'tools', q: 'Mi az év története?', a: 'Egy teljes képernyős séta az éveden: mi jött be, mi maradt meg, melyik volt a legjobb hónapod, mire költöttél a legtöbbet, milyenek a szokásaid. A Leak december 20-tól január végéig ajánlja fel, és bármelyik év történetét megnyithatod az Év oldalról.' },

    { topic: 'data', q: 'Hol vannak az adataim?', a: 'A fiókodban, egy szerveren, így túlélik, ha elveszik vagy elromlik a géped. Minden eszköz megőrzi az utolsó szinkron másolatát is, így internet nélkül is belenézhetsz.' },
    { topic: 'data', q: 'Elolvashatja más az adataimat?', a: 'A nevek, leírások, címkék és összegek már a te eszközödön titkosítva lesznek, mielőtt elküldenénk őket. A kulcs a bejelentkezési fiókodnál marad, nem az adatbázisban, így az adatbázis önmagában nem tudja elolvasni őket.' },
    { topic: 'data', q: 'Működik a Leak internet nélkül?', a: 'Az utolsó szinkron óta mindent el tudsz olvasni. Változtatást addig nem menthetsz, amíg vissza nem jön a kapcsolat. Fent egy sáv jelzi, ha nincs kapcsolat, egy Újra gombbal.' },
    { topic: 'data', q: 'Hogyan használom a Leaket egy másik gépen?', a: 'Telepítsd ott is, és lépj be ugyanazzal a fiókkal. Minden magától megjelenik, a billentyűparancsaid és a beállításaid is.' },
    { topic: 'data', q: 'Hogyan készítek biztonsági mentést?', a: 'A Beállítások › Adatok › Mentés exportálása egyetlen fájlba ment mindent. Tedd biztonságos helyre.\n\nA Mentés importálása visszahozza a mentést, de az ÖSSZES jelenlegi adatodat lecseréli, ezért óvatosan használd.' },
    { topic: 'data', q: 'Hogyan hozok át tételeket a bankomból vagy egy másik alkalmazásból?', a: 'Tölts le egy CSV-fájlt a bankodból vagy az alkalmazásból. A Beállítások › Tranzakciók CSV-ben résznél kattints a CSV importálására, és válaszd ki. A Leak előbb megmutatja, mit adna hozzá.\n\nA fájlban legalább egy dátum és egy összeg oszlop kell. Lehet benne típus (kiadás vagy bevétel), kategória, csoport és leírás is.' },
    { topic: 'data', q: 'Behúzhatom kétszer ugyanazt a fájlt?', a: 'Igen. A Leak csak azt adja hozzá, ami még nincs meg, így ugyanannak a fájlnak a második importja semmit nem ad hozzá. Ezért egy félbeszakadt import egyszerűen újraindítható.' },
    { topic: 'data', q: 'Hogyan nyitom meg a tételeimet Excelben?', a: 'Beállítások › Tranzakciók CSV-ben › CSV exportálása. Válaszd ki a hónapokat. Az Excel, a Numbers és a Google Táblázatok is megnyitják a fájlt.' },
    { topic: 'data', q: 'Hogyan törlök mindent, hogy elölről kezdjem?', a: 'Beállítások › Adatok › Minden adat törlése. Töröl minden tételt, előfizetést, kategóriát és célt; a beállításaid megmaradnak. Nem lehet visszavonni, ezért előtte exportálj egy mentést.' },
    { topic: 'data', q: 'Hogyan törlöm a fiókomat?', a: 'Beállítások › Fiók › Fiók kezelése, és ott töröld a fiókot. A Leak-adataid vele együtt törlődnek.' },

    { topic: 'app', q: 'Milyen gépen fut a Leak?', a: 'Windowson, macOS-en (Apple Silicon és Intel) és Linuxon. A GitHubon, a legújabb kiadásnál töltheted le.' },
    { topic: 'app', q: 'A macOS szerint a Leak nem nyitható meg. Most mi legyen?', a: 'A Leak még nincs aláírva, ezért a macOS letiltja az első indítást. Nyisd meg a Rendszerbeállítások › Adatvédelem és biztonság részt, görgess le, és kattints a megnyitást engedélyező gombra (angol rendszeren: Open Anyway). Ezt csak egyszer kell megtenned.' },
    { topic: 'app', q: 'A Windows szerint megvédte a gépemet. Most mi legyen?', a: '„A Windows megvédte a számítógépét” képernyőn kattints a További információ, majd a Futtatás mindenképp gombra. Ez csak az első alkalommal történik meg, mert a Leak még nincs aláírva.' },
    { topic: 'app', q: 'Hogyan frissítem a Leaket?', a: 'A Leak indításkor ellenőrzi, és felajánlja az új verziót, ha van. Kattints a Telepítésre: újraindul, az adataid pedig megmaradnak. Kézzel is ellenőrizheted a Beállítások › Frissítések résznél.' },
    { topic: 'app', q: 'Hogyan váltok angolra vagy sötét módra?', a: 'Beállítások › Általános: Nyelv és Megjelenés. A „Rendszer” megjelenés követi a géped világos vagy sötét beállítását. A Shift+D bárhonnan végiglépteti a hármat.' },
    { topic: 'app', q: 'Átváltja az összegeimet, ha megváltoztatom a pénznemet?', a: 'Nem. A pénznem csak a számok mellett megjelenő jelet változtatja meg. Egyszer, az elején válaszd ki. Más pénznemben történt fizetéseknél inkább az űrlapon válaszd ki a pénznemet.' },
    { topic: 'app', q: 'Mi az a színtévesztő mód?', a: 'Olyan színek, amelyek vörös-zöld és kék-sárga színtévesztéssel, sőt színek nélküli látással is megkülönböztethetők. A kiadások csíkozást is kapnak, így sosem csak a színen múlnak. A Beállítások › Színek résznél kapcsolhatod be.' },
    { topic: 'app', q: 'Megváltoztathatom a billentyűparancsokat?', a: 'Igen. Beállítások › Billentyűparancsok. Kattints egy parancs mellett a Testreszabásra, és nyomd meg a kívánt billentyűket. A parancsaid a fiókoddal minden eszközre veled jönnek.' },
    { topic: 'app', q: 'Kisebbre vehetem az oldalsávot?', a: 'Kattints az alján az Oldalsáv összecsukására, vagy nyomd meg a Ctrl+B-t (Macen ⌘B). Ikonokra zsugorodik; vidd az egeret egy ikonra, és látod a nevét.' },
    { topic: 'app', q: 'Lehet kördiagram helyett négyzetes ábrám?', a: 'Igen. Beállítások › Általános › Kategóriadiagram: válaszd a Fatérképet. A Hónap és az Év oldalon jelenik meg.' },

    { topic: 'trouble', q: 'Azt írja: „Nem érhető el a szerver”.', a: 'Nincs internet, vagy a szerver nem elérhető. Az utolsó szinkron szerinti adataidat továbbra is látod. Ha visszajött a kapcsolat, kattints az Újra gombra; addig a változtatások nem menthetők.' },
    { topic: 'trouble', q: 'Felvettem egy tételt, de nem látom.', a: 'Nézz meg három dolgot: a tétel dátumának hónapját nézed-e, üres-e a lista feletti keresőmező, és nincs-e bekapcsolva szűrő (Szűrők törlése). A Ctrl+K bármelyik hónapban megtalálja.' },
    { topic: 'trouble', q: 'Egy hónap számai furcsák.', a: 'Általában egy tétel rossz kasszában vagy rossz hónapban van. Rendezd a listát Legnagyobb összeg szerint, és nézd át először a legnagyobbakat. A megtakarításból kivett pénz olyan kategóriába tartozik, amelynél be van kapcsolva a „Megtakarításból vagy befektetésből kivett pénz”, különben bevételnek számít.' },
    { topic: 'trouble', q: 'A Google-lel vagy GitHubbal belépés nem tér vissza a Leakbe.', a: 'Fejezd be a belépést a böngészőben, és engedd meg, hogy megnyissa a Leaket, ha rákérdez. Ha nem történik semmi, menj vissza a Leakbe, kattints a Mégse gombra, és próbáld újra, vagy lépj be e-mailes kóddal.' },
    { topic: 'trouble', q: 'Hibát találtam. Hol jelezzem?', a: 'A GitHubon, az Issues résznél (a link az oldal alján van). Írd le, mit csináltál, mi történt és mit vártál. Egy képernyőkép sokat segít.' },
  ],
}

export const helpDicts = { en, hu }

// --- Search ---------------------------------------------------------------

/** Lower case without accents, with a map back to the original's indices, so a match on the folded text marks the original. */
function folded(text: string) {
  let s = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    for (const c of text[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) {
      s += c
      at.push(i)
    }
  }
  at.push(text.length)
  return { s, at }
}
const fold = (t: string) => folded(t).s

/** The words of a query, folded: every one of them must match. Punctuation is no word ("?" would match every question). */
export const termsOf = (q: string) => fold(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Where the terms occur in `text`, as [from, to) ranges into the original, sorted and never overlapping. */
export function highlights(text: string, terms: string[]): [number, number][] {
  const { s, at } = folded(text)
  const hits: [number, number][] = []
  for (const term of terms) for (let i = s.indexOf(term); i >= 0; i = s.indexOf(term, i + term.length)) hits.push([at[i], at[i + term.length]])
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const out: [number, number][] = []
  for (const [from, to] of hits) {
    const last = out[out.length - 1]
    if (last && from < last[1]) last[1] = Math.max(last[1], to)
    else out.push([from, to])
  }
  return out
}

/** The part of `text` around its first match, cut at word edges. */
export function snippet(text: string, terms: string[], room = 150) {
  const first = highlights(text, terms)[0]?.[0]
  const from = first !== undefined && first > 40 ? text.indexOf(' ', first - 40) + 1 : 0
  if (from === 0 && text.length <= room) return text
  // Only a slice that stops short of the end loses its broken last word and gets the ellipsis.
  const short = from + room < text.length
  const cut = short ? text.slice(from, from + room).replace(/\s\S*$/, '') : text.slice(from)
  return `${from ? '…' : ''}${cut}${short ? '…' : ''}`
}

export const stepText = (s: Step) => [s.lead, ...s.body, ...(s.points ?? []), s.tip ?? ''].join(' ')

/** 0 when a term is missing; more when terms are in the heading, so those come first. */
function rank(title: string, rest: string, terms: string[]) {
  const head = fold(title)
  const all = `${head} ${fold(rest)}`
  if (!terms.every((t) => all.includes(t))) return 0
  return 1 + terms.filter((t) => head.includes(t)).length * 2
}

/** The steps and questions that hold every term, best first. A step keeps its place in the guide as `i`. */
export function searchHelp(h: HelpDict, terms: string[]) {
  const steps = h.steps
    .map((st, i) => ({ st, i, r: rank(st.title, stepText(st), terms) }))
    .filter((x) => x.r)
    .sort((a, b) => b.r - a.r)
  const faqs = h.faqs
    .map((f) => ({ f, r: rank(f.q, `${f.a} ${h.topics[f.topic]}`, terms) }))
    .filter((x) => x.r)
    .sort((a, b) => b.r - a.r)
    .map((x) => x.f)
  return { steps, faqs }
}
