/* ==================================================================
   i18n-server.js — Georgian for the messages the API sends back.

   The client can't translate these from a dictionary the way it does the
   rest of the UI, because an error string arrives as data inside a JSON
   body rather than as text in the DOM. So the server localises them, keyed
   on the English message and selected by the `lang` cookie the front-end
   sets when you use the language switch.

   Wired in as a single res.json interceptor (see server.js) rather than at
   the ~62 call sites: one place to get right, and nothing to forget when a
   new route is added. Messages built with a template literal (a worker's
   name, a price) have no stable key and stay English — those are listed at
   the bottom as the known gap.
================================================================== */

const KA = {
  /* auth / accounts */
  'Please log in.': 'გთხოვთ, შედით სისტემაში.',
  'Not allowed for your role.': 'თქვენი როლისთვის დაუშვებელია.',
  'Wrong email or password.': 'ელფოსტა ან პაროლი არასწორია.',
  'Name, email and password are required.': 'სახელი, ელფოსტა და პაროლი სავალდებულოა.',
  'Name is required.': 'სახელი სავალდებულოა.',
  'Email is required.': 'ელფოსტა სავალდებულოა.',
  'Enter a valid email address.': 'შეიყვანეთ ელფოსტის სწორი მისამართი.',
  'That email address is too long.': 'ეს ელფოსტის მისამართი ძალიან გრძელია.',
  'Not found.': 'ვერ მოიძებნა.',
  'That email is already in use.': 'ეს ელფოსტა უკვე გამოყენებულია.',
  'That email is already registered.': 'ეს ელფოსტა უკვე დარეგისტრირებულია.',
  'Your current password is incorrect.': 'თქვენი მიმდინარე პაროლი არასწორია.',
  'This account is no longer active. Please contact an administrator.':
    'ეს ანგარიში აღარ არის აქტიური. გთხოვთ, დაუკავშირდეთ ადმინისტრატორს.',
  'User not found.': 'მომხმარებელი ვერ მოიძებნა.',

  /* roles / staff administration */
  'Role must be worker, manager or admin.': 'როლი უნდა იყოს სპეციალისტი, მენეჯერი ან ადმინი.',
  'Clients cannot be promoted into staff roles.': 'კლიენტების დაწინაურება პერსონალის როლებში შეუძლებელია.',
  'The primary admin cannot be changed.': 'მთავარი ადმინის შეცვლა შეუძლებელია.',
  'There must always be at least one admin.': 'ყოველთვის უნდა იყოს მინიმუმ ერთი ადმინი.',
  'You cannot change your own role.': 'ვერ შეცვლით საკუთარ როლს.',
  'You cannot change your own employment status.': 'ვერ შეცვლით საკუთარ დასაქმების სტატუსს.',
  'Status must be active, dismissed or resigned.':
    'სტატუსი უნდა იყოს აქტიური, გათავისუფლებული ან წასული.',
  'Employment status is only for staff (workers, managers, admins).':
    'დასაქმების სტატუსი მხოლოდ პერსონალისთვისაა (სპეციალისტები, მენეჯერები, ადმინები).',

  /* posting a problem */
  'Choose a valid problem type.': 'აირჩიეთ პრობლემის სწორი ტიპი.',
  'Please describe the problem.': 'გთხოვთ, აღწერეთ პრობლემა.',
  'Please choose an image.': 'გთხოვთ, აირჩიეთ სურათი.',
  'Please choose a CV file (PDF or Word).': 'გთხოვთ, აირჩიეთ CV ფაილი (PDF ან Word).',
  'Pick or type at least one thing you can fix.':
    'აირჩიეთ ან ჩაწერეთ სულ მცირე ერთი რამ, რის შეკეთებაც შეგიძლიათ.',

  /* pricing / negotiation */
  'Enter a price for the work (₾0 or more).': 'შეიყვანეთ სამუშაოს ფასი (₾0 ან მეტი).',
  'Enter the price you can offer.': 'შეიყვანეთ ფასი, რომელსაც შესთავაზებთ.',
  'Enter your counter price.': 'შეიყვანეთ თქვენი შემხვედრი ფასი.',
  "There's no offer to respond to right now.": 'ამჟამად პასუხის გასაცემი შეთავაზება არ არის.',
  'There is no client counter to reply to.': 'კლიენტის შემხვედრი შეთავაზება, რომელსაც უპასუხოთ, არ არის.',
  'This task is not awaiting a first price.': 'ეს დავალება საწყის ფასს არ ელოდება.',

  /* assignment / work */
  'Choose a worker to assign.': 'აირჩიეთ სპეციალისტი მინიჭებისთვის.',
  'That worker no longer exists.': 'ეს სპეციალისტი აღარ არსებობს.',
  'Worker not found.': 'სპეციალისტი ვერ მოიძებნა.',
  'Only an approved, unassigned task can be assigned.':
    'მინიჭება შესაძლებელია მხოლოდ დამტკიცებული, არმინიჭებული დავალების.',
  'Only an in-progress task can be released.':
    'ჩამოხსნა შესაძლებელია მხოლოდ მიმდინარე დავალების.',
  'This task is not in progress.': 'ეს დავალება არ მიმდინარეობს.',
  'This task is not awaiting confirmation.': 'ეს დავალება დადასტურებას არ ელოდება.',
  'This task can no longer be cancelled.': 'ამ დავალების გაუქმება აღარ შეიძლება.',
  'Task not found.': 'დავალება ვერ მოიძებნა.',
  'This task was just updated — refresh and try again.':
    'ეს დავალება ახლახან განახლდა — განაახლეთ გვერდი და სცადეთ ხელახლა.',
  'Pick a valid availability.': 'აირჩიეთ ხელმისაწვდომობის სწორი მნიშვნელობა.',

  /* payment / rating */
  'This job is already paid.': 'ეს დავალება უკვე გადახდილია.',
  'You can only pay once the job is completed.':
    'გადახდა შესაძლებელია მხოლოდ დავალების დასრულების შემდეგ.',
  'You can only rate a completed job.': 'შეფასება შესაძლებელია მხოლოდ დასრულებული დავალების.',
  'You have already rated this job.': 'ამ დავალებას უკვე შეაფასეთ.',
  'There is no worker to rate.': 'შესაფასებელი სპეციალისტი არ არის.',
  'Pick a rating from 1 to 5 stars.': 'აირჩიეთ შეფასება 1-დან 5 ვარსკვლავამდე.',

  /* generic */
  'Unknown action.': 'უცნობი მოქმედება.',
};

/* Patterns for the interpolated messages, so a name or a price does not cost
   us the translation. Anything unmatched falls through as English. */
const KA_PATTERNS = [
  [/^(.+) is currently (.+) and can't take new work\. Pick a worker who's Available\.$/,
    (m) => `${m[1]} ამჟამად ${m[2]}-ია და ახალ სამუშაოს ვერ იღებს. აირჩიეთ ხელმისაწვდომი სპეციალისტი.`],
  [/^Password must be at least (\d+) characters, with a number and a capital letter\.$/,
    (m) => `პაროლი უნდა შედგებოდეს მინიმუმ ${m[1]} სიმბოლოსგან, ციფრითა და დიდი ასოთი.`],
  [/^Image is too large \(max (\d+) ?MB\)\.$/, (m) => `სურათი ძალიან დიდია (მაქს. ${m[1]} MB).`],
  [/^CV is too large \(max (\d+) ?MB\)\.$/, (m) => `CV ძალიან დიდია (მაქს. ${m[1]} MB).`],
];

function translateMessage(msg, lang) {
  if (lang !== 'ka' || typeof msg !== 'string') return msg;
  if (Object.prototype.hasOwnProperty.call(KA, msg)) return KA[msg];
  for (const [re, fn] of KA_PATTERNS) {
    const m = msg.match(re);
    if (m) return fn(m);
  }
  return msg;
}

/* Express middleware: wraps res.json so every { error } body gets localised
   on the way out, whichever route produced it. */
function i18nErrors(req, res, next) {
  const lang = req.cookies && req.cookies.lang === 'ka' ? 'ka' : 'en';
  req.lang = lang;
  if (lang === 'ka') {
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body === 'object' && typeof body.error === 'string') {
        body.error = translateMessage(body.error, lang);
      }
      return orig(body);
    };
  }
  next();
}

module.exports = { i18nErrors, translateMessage, KA };
