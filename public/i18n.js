/* ==================================================================
   i18n.js — Georgian / English for the whole app.

   Why a DOM translator instead of t() calls everywhere: the UI is built
   as HTML strings in app.js and analytics.js (~2,000 lines of template
   literals). Threading a t() through every one of them would be a huge,
   risky diff. Instead this file translates the rendered DOM, keyed on the
   English text itself, and a MutationObserver re-translates anything the
   app renders later. app.js and analytics.js stay untouched.

   Consequences worth knowing:
   - English is the source of truth. A key IS the English string, so
     changing copy in app.js means updating the key here.
   - Dates and numbers are handled by patching the toLocale* methods to
     default to the active locale (app.js calls them with no locale arg).
   - Task timeline entries are stored in the database in English at write
     time, so they are matched by PATTERNS below rather than by key.
================================================================== */

const I18N_LANGS = { en: 'EN', ka: 'ქა' };
const I18N_LOCALE = { en: 'en-GB', ka: 'ka-GE' };

/* Never translate text inside these — user-authored or data, not UI copy.
   Guards against a task titled "Completed" being rewritten. */
const I18N_SKIP_SEL = 'input,textarea,script,style,code,pre,[data-no-i18n]';

/* ------------------------------------------------------------------
   Dictionary. Keys are the exact rendered English strings.
------------------------------------------------------------------- */
const I18N_KA = {
  /* ---- nav / chrome ---- */
  'How it works': 'როგორ მუშაობს',
  'Common Problems': 'ხშირი პრობლემები',
  'Reviews': 'შეფასებები',
  'About': 'ჩვენ შესახებ',
  'About Digit': 'Digit-ის შესახებ',
  'Log in': 'შესვლა',
  'Log out': 'გასვლა',
  'Sign up': 'რეგისტრაცია',
  'Dashboard': 'პანელი',
  'Digit home': 'Digit-ის მთავარი',
  'Open menu': 'მენიუს გახსნა',
  'Primary': 'მთავარი',
  'Your profile': 'ჩემი პროფილი',
  'Back': 'უკან',
  'Back home': 'მთავარზე დაბრუნება',
  'Back to dashboard': 'პანელზე დაბრუნება',
  'Close': 'დახურვა',
  'Continue': 'გაგრძელება',
  'Cancel anytime.': 'გაუქმება ნებისმიერ დროს.',
  'Show': 'ჩვენება',
  'Done': 'დასრულებულია',

  /* ---- landing: hero ---- */
  'IT help, made human': 'IT დახმარება ადამიანურად',

  /* ---- landing rewrite: short lines that carry the whole idea ---- */
  'Something broken?': 'რაღაც გაფუჭდა?',
  'A real person fixes it.': 'ცოცხალი ადამიანი გაგისწორებთ.',
  'Describe it in plain words. We do the rest.':
    'აღწერეთ მარტივი სიტყვებით. დანარჩენს ჩვენ ვაკეთებთ.',
  'Work with us': 'იმუშავე ჩვენთან',
  'You describe it': 'თქვენ აღწერთ',
  'A person handles it': 'ადამიანი აგვარებს',
  "It's fixed": 'მოგვარდა',
  "Four steps. That's it.": 'ოთხი ნაბიჯი. სულ ეს არის.',
  'One sentence. Add a photo.': 'ერთი წინადადება. დაამატეთ ფოტო.',
  'We price it': 'ვადგენთ ფასს',
  'A manager agrees it with you.': 'მენეჯერი თქვენთან შეათანხმებს.',
  'A pro fixes it': 'სპეციალისტი აგვარებს',
  'Remotely or at your place.': 'დისტანციურად ან ადგილზე.',
  "Pay only when it's done.": 'გადაიხდით მხოლოდ დასრულების შემდეგ.',
  'What can we help with?': 'რაში დაგეხმაროთ?',
  'Know how to fix things? Get paid for it.':
    'იცი შეკეთება? მიიღე ანაზღაურება.',
  'Your skills, your rate': 'შენი უნარები, შენი ტარიფი',
  'Only relevant jobs': 'მხოლოდ შესაბამისი დავალებები',
  'Remote or in person': 'დისტანციურად ან ადგილზე',
  /* aria-labels on the four step illustrations — the picture carries the meaning
     visually, so this is the only description a screen reader gets. */
  'Describe the problem': 'აღწერეთ პრობლემა',
  'A manager agrees a price': 'მენეჯერი ათანხმებს ფასს',
  'A specialist fixes it': 'სპეციალისტი აგვარებს პრობლემას',
  'A manager sets a fair price': 'მენეჯერი ადგენს სამართლიან ფასს',
  'A specialist does the work': 'სპეციალისტი ასრულებს სამუშაოს',
  'You confirm and pay': 'თქვენ ადასტურებთ და იხდით',
  "Behind every glitch, there's": 'ყოველი ხარვეზის უკან არის',
  'someone who can fix it.': 'ადამიანი, რომელიც მოაგვარებს.',
  'Digit connects everyday people with IT pros who solve real tech problems — from a blue screen to a brand-new website.':
    'Digit აკავშირებს ადამიანებს IT სპეციალისტებთან, რომლებიც წყვეტენ რეალურ ტექნიკურ პრობლემებს — ლურჯი ეკრანიდან სრულიად ახალ ვებგვერდამდე.',
  "No tech jargon. Just tell us what's wrong, like you'd tell a friend.":
    'ტექნიკური ჟარგონის გარეშე. უბრალოდ გვითხარით რა მოხდა, როგორც მეგობარს ეტყოდით.',
  'Get it fixed': 'პრობლემის მოგვარება',
  'Start fixing': 'დაიწყე მუშაობა',
  'problems solved': 'მოგვარებული პრობლემა',
  'average rating': 'საშუალო შეფასება',
  'median first reply': 'პასუხის მედიანური დრო',
  'specialists ready': 'მზად მყოფი სპეციალისტი',
  'Trusted by people who\'d rather not call "their tech cousin" again.':
    'ენდობიან ადამიანები, რომლებსაც აღარ სურთ „ტექნიკის მცოდნე ბიძაშვილს“ დარეკვა.',
  'Avg. reply in 12 min': 'პასუხი საშუალოდ 12 წუთში',
  'Verified workers only': 'მხოლოდ დადასტურებული სპეციალისტები',
  'Post your problem': 'გამოაგზავნეთ პრობლემა',

  /* Light landing (profy.ge direction). Georgian is the primary market, so these
     are written to read naturally rather than translated word for word. */
  'Tech problems, solved by': 'ტექნიკურ პრობლემებს წყვეტენ',
  'real people': 'ცოცხალი ადამიანები',
  "Describe what's wrong in plain words. A manager agrees a fair price, and the right specialist fixes it.":
    'აღწერეთ პრობლემა მარტივი სიტყვებით. მენეჯერი შეათანხმებს სამართლიან ფასს, სპეციალისტი კი მოაგვარებს.',
  'What do you need fixed?': 'რის შეკეთება გჭირდებათ?',
  'Pick the one that sounds like your problem.': 'აირჩიეთ თქვენს პრობლემასთან ყველაზე ახლობელი.',
  'Three steps': 'სამი ნაბიჯი',
  'No jargon, no guessing what it should cost.': 'ჟარგონის გარეშე და ფასის გამოცნობის გარეშე.',
  'Describe it': 'აღწერეთ',
  'A sentence and a photo is enough.': 'ერთი წინადადება და ფოტო საკმარისია.',
  'Agree a price': 'შეათანხმეთ ფასი',
  'A manager sets it with you, up front.': 'მენეჯერი თქვენთან ერთად ადგენს, წინასწარ.',
  'It gets fixed': 'პრობლემა გვარდება',
  "Remotely or at your place. Pay when it's done.":
    'დისტანციურად ან ადგილზე. გადაიხდით დასრულების შემდეგ.',
  'What clients say': 'რას ამბობენ კლიენტები',
  'Know how to fix things? Get paid for it.': 'იცით შეკეთება? მიიღეთ ანაზღაურება.',
  'Pick what you can solve, set your rate, and take only the jobs that match.':
    'აირჩიეთ რისი მოგვარებაც შეგიძლიათ, დააწესეთ ტარიფი და აიღეთ მხოლოდ შესაბამისი დავალებები.',
  'Your skills, your rate': 'თქვენი უნარები, თქვენი ტარიფი',
  'Only relevant jobs': 'მხოლოდ შესაბამისი დავალებები',
  'Remote or in person': 'დისტანციურად ან ადგილზე',
  'Work with us': 'იმუშავე ჩვენთან',

  /* Landing terminal. The typed phrase is read from the DOM at run time, so the
     translator rewrites it before fx.js starts typing. */
  'My laptop shows a blue screen every morning.': 'ლეპტოპი ყოველ დილით ლურჯ ეკრანს აჩვენებს.',
  'Sent to a manager': 'გაიგზავნა მენეჯერთან',
  'Price agreed · no jargon': 'ფასი შეთანხმდა · ჟარგონის გარეშე',
  'Fixed by a real specialist': 'მოაგვარა რეალურმა სპეციალისტმა',
  'digit — help': 'digit — დახმარება',
  '3 clicks': '3 დაწკაპუნება',
  '"My laptop shows a blue screen every time I open it…"':
    '„ლეპტოპი ყოველ ჩართვაზე ლურჯ ეკრანს აჩვენებს…“',
  'Send to a worker': 'სპეციალისტთან გაგზავნა',
  'Send to a manager': 'მენეჯერთან გაგზავნა',

  /* ---- landing: steps ---- */
  'Four steps, no stress': 'ოთხი ნაბიჯი, სტრესის გარეშე',
  'From "it\'s broken" to "it\'s fixed"': '„გაფუჭდა“-დან „მოგვარდა“-მდე',
  "You don't need to know what's wrong. You just need to describe it — a manager handles the rest.":
    'არ გჭირდებათ იცოდეთ რა გაფუჭდა. მხოლოდ აღწერეთ — დანარჩენს მენეჯერი მოაწესრიგებს.',
  'Describe it': 'აღწერეთ',
  "Pick what's wrong, type a sentence, add a photo, and name a budget if you like.":
    'აირჩიეთ პრობლემა, დაწერეთ ერთი წინადადება, დაამატეთ ფოტო და სურვილისამებრ მიუთითეთ ბიუჯეტი.',
  'A manager checks it': 'მენეჯერი ამოწმებს',
  'A real person reviews your problem, agrees on a fair price, and explains it in plain words.':
    'რეალური ადამიანი განიხილავს თქვენს პრობლემას, შეათანხმებს სამართლიან ფასს და მარტივი სიტყვებით აგიხსნით.',
  'A worker takes it': 'სპეციალისტი იღებს',
  'The right specialist picks up your job and gets to work — remotely or in person.':
    'შესაბამისი სპეციალისტი იღებს თქვენს დავალებას და იწყებს მუშაობას — დისტანციურად ან ადგილზე.',
  'You confirm': 'თქვენ ადასტურებთ',
  "Once it's solved, you confirm it's done. Simple.":
    'როცა მოგვარდება, თქვენ ადასტურებთ, რომ დასრულდა. მარტივია.',

  /* ---- landing: categories + specialist band ---- */
  'What can a worker help with?': 'რაში დაგეხმარებათ სპეციალისტი?',
  'Tap the one that sounds like your problem — it pre-fills the form for you.':
    'აირჩიეთ თქვენს პრობლემას მიახლოებული — ფორმა ავტომატურად შეივსება.',
  "Don't see it? Describe it yourself:": 'ვერ ხედავთ? აღწერეთ თავად:',
  'For specialists': 'სპეციალისტებისთვის',
  'Turn what you already know into income.': 'აქციეთ თქვენი ცოდნა შემოსავლად.',
  'Pick the problems you can solve, set your own rate, and start helping people who genuinely need you — on your schedule.':
    'აირჩიეთ პრობლემები, რომელთა მოგვარებაც შეგიძლიათ, დააყენეთ თქვენი ტარიფი და დაეხმარეთ მათ, ვისაც ნამდვილად სჭირდებით — თქვენივე გრაფიკით.',
  'Choose your own skills & rate': 'აირჩიეთ თქვენი უნარები და ტარიფი',
  'Get matched to relevant jobs only': 'მიიღეთ მხოლოდ შესაბამისი დავალებები',
  'First to accept gets the job': 'ვინც პირველი დაეთანხმება, მიიღებს დავალებას',
  'Work remote or in person': 'იმუშავეთ დისტანციურად ან ადგილზე',
  'Become a worker': 'გახდი სპეციალისტი',
  'Join as a worker': 'შემოგვიერთდი სპეციალისტად',

  /* ---- about page ---- */
  'How we\'re different': 'რით განვსხვავდებით',
  'A human in the loop.': 'პროცესში ადამიანი მონაწილეობს.',
  'No jargon.': 'ჟარგონის გარეშე.',
  'The right specialist.': 'შესაბამისი სპეციალისტი.',
  'You stay in control.': 'კონტროლი თქვენს ხელშია.',
  'Clear, explained pricing.': 'გამჭვირვალე, ახსნილი ფასები.',
  'Qualified workers only.': 'მხოლოდ კვალიფიციური სპეციალისტები.',
  'You confirm completion.': 'დასრულებას თქვენ ადასტურებთ.',
  'Every job is reviewed by a manager.': 'ყოველ დავალებას მენეჯერი განიხილავს.',
  'A real person checks your request before any worker sees it.':
    'რეალური ადამიანი ამოწმებს თქვენს მოთხოვნას, სანამ სპეციალისტი დაინახავს.',
  'A job is only marked done after you say it\'s fixed.':
    'დავალება დასრულებულად ჩაითვლება მხოლოდ მას შემდეგ, რაც თქვენ დაადასტურებთ.',
  'A manager reviews every request, agrees on a fair price, and explains it in words anyone can understand.':
    'მენეჯერი განიხილავს ყოველ მოთხოვნას, შეათანხმებს სამართლიან ფასს და აგიხსნით ყველასთვის გასაგებ ენაზე.',
  'Jobs are matched to specialists, and a worker must accept before starting.':
    'დავალებები შეესაბამება სპეციალისტებს და სპეციალისტმა უნდა დაეთანხმოს დაწყებამდე.',
  'Approved jobs go out to qualified workers, and the first available one picks it up.':
    'დამტკიცებული დავალებები ეგზავნება კვალიფიციურ სპეციალისტებს და პირველი თავისუფალი იღებს მას.',
  'Tap what sounds like your problem, type a sentence, optionally add a photo. That\'s it.':
    'აირჩიეთ თქვენს პრობლემას მიახლოებული, დაწერეთ წინადადება, სურვილისამებრ დაამატეთ ფოტო. სულ ეს არის.',
  'You name your budget; if the manager suggests a different price, they tell you exactly why. You can accept or decline.':
    'თქვენ ასახელებთ ბიუჯეტს; თუ მენეჯერი სხვა ფასს შემოგთავაზებთ, აგიხსნით ზუსტად რატომ. შეგიძლიათ დაეთანხმოთ ან უარი თქვათ.',
  'Nothing is final until you confirm the work is done.':
    'არაფერია საბოლოო, სანამ არ დაადასტურებთ, რომ სამუშაო დასრულდა.',
  'Digit exists for one reason: getting a real tech problem solved shouldn\'t require knowing tech.':
    'Digit არსებობს ერთი მიზნით: რეალური ტექნიკური პრობლემის მოგვარება არ უნდა მოითხოვდეს ტექნიკის ცოდნას.',
  'Most platforms expect you to already speak the language — to know whether you need "hardware support" or a "backend engineer." We flipped that around. On Digit you describe what\'s wrong in plain words, and a real person takes it from there.':
    'პლატფორმების უმეტესობა მოელის, რომ ენას უკვე ფლობთ — იცით, გჭირდებათ „აპარატურის მხარდაჭერა“ თუ „ბექენდ ინჟინერი“. ჩვენ ეს შევატრიალეთ. Digit-ზე თქვენ მარტივი სიტყვებით აღწერთ პრობლემას, დანარჩენს კი რეალური ადამიანი აგრძელებს.',
  'We want Digit to feel safe for people who aren\'t sure who to trust with their tech.':
    'გვსურს, Digit იყოს საიმედო მათთვის, ვისაც არ იცის, ვის მიანდოს თავისი ტექნიკა.',
  'We only collect what\'s needed to solve your problem — your contact details and what you tell us about the issue. Photos you upload are used solely to help a worker understand the problem.':
    'ვაგროვებთ მხოლოდ იმას, რაც პრობლემის მოგვარებისთვისაა საჭირო — საკონტაქტო მონაცემებს და თქვენს აღწერას. ატვირთული ფოტოები გამოიყენება მხოლოდ იმისთვის, რომ სპეციალისტმა პრობლემა გაიგოს.',
  'From a blue screen to a brand-new website, Digit connects everyday people with IT pros who actually want to help.':
    'ლურჯი ეკრანიდან სრულიად ახალ ვებგვერდამდე — Digit აკავშირებს ადამიანებს IT სპეციალისტებთან, რომლებსაც ნამდვილად სურთ დახმარება.',
  'The simplest way to get a real IT problem solved by a real person.':
    'უმარტივესი გზა, რეალური IT პრობლემა რეალურმა ადამიანმა მოაგვაროს.',
  'Questions, feedback, or need a hand? We\'d love to hear from you.':
    'შეკითხვები, უკუკავშირი თუ დახმარება გჭირდებათ? მოგვწერეთ.',
  'Contact us': 'დაგვიკავშირდით',
  'Contact': 'კონტაქტი',
  'Support': 'მხარდაჭერა',
  'Message': 'შეტყობინება',
  'Send message': 'შეტყობინების გაგზავნა',
  'Mon–Fri, 9am–6pm': 'ორშ–პარ, 9:00–18:00',
  'What clients are saying': 'რას ამბობენ კლიენტები',
  'No comment left.': 'კომენტარი არ დატოვებულა.',

  /* ---- footer ---- */
  'Get help': 'დახმარება',
  'For workers': 'სპეციალისტებისთვის',
  'Company': 'კომპანია',
  'Post a problem': 'პრობლემის გამოგზავნა',
  'Privacy · Terms': 'კონფიდენციალურობა · წესები',
  '© 2026 Digit. A friendlier kind of tech help.':
    '© 2026 Digit. ტექნიკური დახმარება ადამიანურად.',

  /* ---- auth ---- */
  'Log in to post problems or pick up jobs.':
    'შედით, რომ გამოაგზავნოთ პრობლემა ან აიღოთ დავალება.',
  'Email': 'ელფოსტა',
  'Password': 'პაროლი',
  'New here?': 'ახალი ხართ?',
  'Already have an account?': 'უკვე გაქვთ ანგარიში?',
  'Create your account': 'შექმენით ანგარიში',
  'Create a client account': 'კლიენტის ანგარიშის შექმნა',
  'Create account': 'ანგარიშის შექმნა',
  'Create a free account to post a problem.':
    'შექმენით უფასო ანგარიში პრობლემის გამოსაგზავნად.',
  'Create my profile': 'პროფილის შექმნა',
  'Full name': 'სრული სახელი',
  'Your name': 'თქვენი სახელი',
  'Name': 'სახელი',
  'Phone': 'ტელეფონი',
  'Choose a password': 'აირჩიეთ პაროლი',
  'Repeat password': 'გაიმეორეთ პაროლი',
  'At least 8 characters, 1 number, 1 capital letter':
    'მინიმუმ 8 სიმბოლო, 1 ციფრი, 1 დიდი ასო',
  'So we can keep you updated on fixing.': 'რომ შეკეთების შესახებ გვაცნობოთ.',
  'I have a problem': 'პრობლემა მაქვს',
  'I fix problems': 'პრობლემებს ვაგვარებ',
  'Welcome back': 'კეთილი იყოს თქვენი დაბრუნება',

  /* ---- worker registration ---- */
  'Tell us what you\'re great at. You can change all of this later.':
    'გვითხარით, რაში ხართ ძლიერი. ყველაფერი მოგვიანებით შეგიძლიათ შეცვალოთ.',
  'What can you fix?': 'რის შეკეთება შეგიძლიათ?',
  'What you can fix': 'რის შეკეთება შეგიძლიათ',
  'This helps managers match you to the right jobs.':
    'ეს ეხმარება მენეჯერებს შესაბამისი დავალებები შეურჩიონ.',
  'your qualifications — pick all that apply':
    'თქვენი კვალიფიკაცია — მონიშნეთ ყველა შესაბამისი',
  'Qualifications': 'კვალიფიკაცია',
  'Other speciality': 'სხვა სპეციალობა',
  'type your own — comma-separate for more':
    'ჩაწერეთ თქვენი — რამდენიმეს გამოსაყოფად გამოიყენეთ მძიმე',
  'comma-separate for more': 'რამდენიმეს გამოსაყოფად გამოიყენეთ მძიმე',
  'Years of experience': 'გამოცდილების წლები',
  'How do you work?': 'როგორ მუშაობთ?',
  'How you work': 'როგორ მუშაობთ',
  'Remote only': 'მხოლოდ დისტანციურად',
  'In person only': 'მხოლოდ ადგილზე',
  'Remote & in person': 'დისტანციურად და ადგილზე',
  'Short bio': 'მოკლე ბიოგრაფია',
  'Profile photo': 'პროფილის ფოტო',
  'Optional — click to add': 'არასავალდებულო — დასამატებლად დააჭირეთ',
  'optional': 'არასავალდებულო',
  'CV / résumé': 'CV / რეზიუმე',
  'Your CV / résumé': 'თქვენი CV / რეზიუმე',
  'Upload your CV': 'ატვირთეთ CV',
  'Tap to upload your CV': 'დააჭირეთ CV-ის ატვირთვისთვის',
  'optional — PDF or Word': 'არასავალდებულო — PDF ან Word',
  'PDF or Word, up to 8 MB': 'PDF ან Word, მაქსიმუმ 8 MB',
  'Less than 1': '1-ზე ნაკლები',

  /* ---- post a problem ---- */
  'Describe your problem': 'აღწერეთ თქვენი პრობლემა',
  'Post a new problem': 'ახალი პრობლემის გამოგზავნა',
  'What\'s going wrong?': 'რა არ მუშაობს?',
  'Describe': 'აღწერეთ',
  'of the problem': 'პრობლემის',
  'A short title': 'მოკლე სათაური',
  'Tell us what\'s happening in your own words — a sentence or two is plenty. Add a photo if it helps.':
    'გვითხარით რა ხდება თქვენივე სიტყვებით — ერთი-ორი წინადადება საკმარისია. დაამატეთ ფოტო, თუ ეს დაეხმარება.',
  'Add photos': 'ფოტოების დამატება',
  'Tap to add photos': 'დააჭირეთ ფოტოების დასამატებლად',
  'optional — up to 4': 'არასავალდებულო — მაქსიმუმ 4',
  'How soon do you need help?': 'რამდენად სასწრაფოდ გჭირდებათ დახმარება?',
  'Timing': 'დრო',
  'Urgency': 'სასწრაფოება',
  'No rush — whenever': 'არ არის სასწრაფო — ნებისმიერ დროს',
  'Within a few days': 'რამდენიმე დღეში',
  'As soon as possible': 'რაც შეიძლება მალე',
  'No rush — whenever · free': 'არ არის სასწრაფო — ნებისმიერ დროს · უფასო',
  'Within a few days · +₾20': 'რამდენიმე დღეში · +₾20',
  'As soon as possible · +₾30 rush fee': 'რაც შეიძლება მალე · +₾30 სასწრაფო',
  'This urgency fee is added on top of the price the manager sets for the work.':
    'ეს სასწრაფოების საკომისიო ემატება მენეჯერის დადგენილ ფასს.',
  'A manager will review your problem and send you a price — you can accept it, or negotiate back and forth before agreeing. Faster help costs a little more.':
    'მენეჯერი განიხილავს თქვენს პრობლემას და გამოგიგზავნით ფასს — შეგიძლიათ დაეთანხმოთ ან შეთანხმებამდე მოილაპარაკოთ. სწრაფი დახმარება ცოტა მეტი ღირს.',
  'Go to my problems': 'ჩემს პრობლემებზე გადასვლა',
  'Posting is for client accounts.': 'გამოგზავნა კლიენტის ანგარიშებისთვისაა.',

  /* ---- profile ---- */
  'Update your details — you\'re signed in as a': 'განაახლეთ მონაცემები — შესული ხართ როგორც',
  'Save changes': 'ცვლილებების შენახვა',
  'Change password': 'პაროლის შეცვლა',
  'Current password': 'მიმდინარე პაროლი',
  'New password': 'ახალი პაროლი',
  'Repeat new password': 'გაიმეორეთ ახალი პაროლი',
  'Click to change': 'შესაცვლელად დააჭირეთ',
  'Your status': 'თქვენი სტატუსი',
  'Availability': 'ხელმისაწვდომობა',
  'Set your availability': 'დააყენეთ ხელმისაწვდომობა',

  /* ---- dashboards: shared ---- */
  'My problems': 'ჩემი პრობლემები',
  'Worker dashboard': 'სპეციალისტის პანელი',
  'Manager dashboard': 'მენეჯერის პანელი',
  'Admin dashboard': 'ადმინის პანელი',
  'Track every fix from review to done.': 'თვალი ადევნეთ ყოველ შეკეთებას განხილვიდან დასრულებამდე.',
  'Review new problems, set fair prices, route to workers.':
    'განიხილეთ ახალი პრობლემები, დააყენეთ სამართლიანი ფასები, გადაამისამართეთ სპეციალისტებთან.',
  'Manage people and triage tasks by state.': 'მართეთ მომხმარებლები და დაალაგეთ დავალებები სტატუსით.',
  'Worker profiles': 'სპეციალისტების პროფილები',
  'Worker profiles are for managers and admins.': 'სპეციალისტების პროფილები მენეჯერებისა და ადმინებისთვისაა.',
  'Analytics is for managers and admins.': 'ანალიტიკა მენეჯერებისა და ადმინებისთვისაა.',
  'How the business is doing — money, throughput, workers and clients.':
    'როგორ მიდის ბიზნესი — თანხები, გამტარობა, სპეციალისტები და კლიენტები.',
  'Who can do what — skills, availability, ratings and stats to help you assign the right person.':
    'ვინ რას აკეთებს — უნარები, ხელმისაწვდომობა, შეფასებები და სტატისტიკა სწორი ადამიანის შესარჩევად.',
  'Can fix': 'შეუძლია შეკეთება',
  'Assigned to me': 'ჩემზე მინიჭებული',
  'People': 'მომხმარებლები',
  'Everyone': 'ყველა',
  'Admins': 'ადმინები',
  'Managers': 'მენეჯერები',
  'Workers': 'სპეციალისტები',
  'Clients': 'კლიენტები',
  'Client': 'კლიენტი',
  'Worker': 'სპეციალისტი',
  'client': 'კლიენტი',
  'worker': 'სპეციალისტი',
  'manager': 'მენეჯერი',
  'admin': 'ადმინი',
  'Role': 'როლი',
  'Change role': 'როლის შეცვლა',
  'primary admin': 'მთავარი ადმინი',
  'Client:': 'კლიენტი:',
  'Worker:': 'სპეციალისტი:',
  'Fixed by': 'შეაკეთა',

  /* ---- task states / tabs ---- */
  'Review queue': 'განსახილველი',
  'Negotiating': 'მოლაპარაკება',
  'Ready to assign': 'მისანიჭებელი',
  'In progress': 'მიმდინარე',
  'Awaiting confirmation': 'დასადასტურებელი',
  'Completed': 'დასრულებული',
  'completed': 'დასრულებული',
  'Cancelled': 'გაუქმებული',
  'Awaiting price': 'ელოდება ფასს',
  'Awaiting client payment': 'ელოდება კლიენტის გადახდას',
  'Finding a worker': 'სპეციალისტის ძებნა',
  'Price agreed': 'ფასი შეთანხმებულია',
  'Price agreed — a worker will be assigned to you shortly.':
    'ფასი შეთანხმებულია — მალე მოგინიჭებთ სპეციალისტს.',
  'Assigned': 'მინიჭებული',
  'Ongoing': 'მიმდინარე',
  'Finished': 'დასრულებული',
  'Declined': 'უარყოფილი',
  'Dismissed': 'უარყოფილი',
  'dismissed': 'უარყოფილი',
  'Rated': 'შეფასებული',
  'Counter sent': 'შემხვედრი შეთავაზება გაგზავნილია',
  'Done — confirm?': 'დასრულდა — დაადასტურებთ?',
  'Your problem is with a manager.': 'თქვენი პრობლემა მენეჯერთანაა.',
  'A manager is reviewing it now. They\'ll confirm the price (or suggest a fair one) and then a qualified worker takes over.':
    'მენეჯერი ახლა განიხილავს. ის დაადასტურებს ფასს (ან სამართლიანს შემოგთავაზებს) და შემდეგ კვალიფიციური სპეციალისტი გადაიბარებს.',
  'Waiting for the manager to reply.': 'ველოდებით მენეჯერის პასუხს.',
  '— waiting for the client to reply.': '— ველოდებით კლიენტის პასუხს.',
  'Nothing waiting on a client to confirm.': 'არაფერი ელოდება კლიენტის დადასტურებას.',

  /* Empty and loading states. These only render when a bucket has nothing in it,
     which never happened on the seeded local database — every tab had tasks — so
     they went untranslated until production, where most buckets are empty. */
  'Nothing to review. Inbox zero! 🎉': 'განსახილველი არაფერია. სია ცარიელია! 🎉',
  'No price negotiations in progress.': 'მიმდინარე მოლაპარაკება არ არის.',
  'Nothing waiting to be assigned right now.': 'ამჟამად მინიჭებას არაფერი ელოდება.',
  'No tasks in progress right now.': 'ამჟამად მიმდინარე დავალება არ არის.',
  'No completed tasks yet.': 'დასრულებული დავალება ჯერ არ არის.',
  'No declined or cancelled tasks.': 'უარყოფილი ან გაუქმებული დავალება არ არის.',
  'Could not load reviews.': 'შეფასებები ვერ ჩაიტვირთა.',
  'Could not load worker profiles.': 'სპეციალისტების პროფილები ვერ ჩაიტვირთა.',
  'No workers have joined yet.': 'სპეციალისტები ჯერ არ შემოგვიერთდნენ.',
  'Loading worker profiles…': 'იტვირთება სპეციალისტების პროფილები…',
  'Loading your workers…': 'იტვირთება თქვენი სპეციალისტები…',
  'No jobs assigned to you yet. A manager will assign work that fits your skills.':
    'ჯერ არ გაქვთ მინიჭებული დავალება. მენეჯერი მოგანიჭებთ თქვენს უნარებს შესაბამის სამუშაოს.',

  /* ---- task actions ---- */
  'Set a price': 'ფასის დადგენა',
  'Offer to review': 'შეთავაზების განხილვა',
  'Assign a worker': 'სპეციალისტის მინიჭება',
  'Reassign': 'ხელახლა მინიჭება',
  'Respond': 'პასუხი',
  'Negotiate': 'მოლაპარაკება',
  'Decline': 'უარი',
  'Declined the price': 'უარი თქვა ფასზე',
  'Confirm it\'s fixed ✓': 'დაადასტურეთ, რომ მოგვარდა ✓',
  'I fixed it myself — cancel': 'თავად მოვაგვარე — გაუქმება',
  'Fixed it yourself? You can call off a request before it\'s completed.':
    'თავად მოაგვარეთ? მოთხოვნის გაუქმება შესაძლებელია დასრულებამდე.',
  'You offered': 'თქვენ შესთავაზეთ',
  'You rated': 'თქვენ შეაფასეთ',
  'Your rating:': 'თქვენი შეფასება:',

  /* Labels that only render for particular data or inside a modal, so they were
     invisible to a sweep of the default screens: a manager's note on a task, the
     card fields in the payment dialog, and the price inputs. */
  'Your note:': 'თქვენი შენიშვნა:',

  /* Photo viewer */
  'Close photo': 'ფოტოს დახურვა',
  'Previous photo': 'წინა ფოტო',
  'Next photo': 'შემდეგი ფოტო',
  'Tap to enlarge': 'დააჭირეთ გასადიდებლად',
  'Photo': 'ფოტო',
  'Problem': 'პრობლემა',
  'Details': 'დეტალები',
  'Price': 'ფასი',
  'Price for the work (₾)': 'სამუშაოს ფასი (₾)',
  'Your price (₾)': 'თქვენი ფასი (₾)',
  'Card number': 'ბარათის ნომერი',
  'Name on card': 'სახელი ბარათზე',
  'Expiry': 'ვადა',
  'CVC': 'CVC',
  'Client rated you': 'კლიენტმა შეგაფასათ',
  'Client countered with': 'კლიენტმა შემოგთავაზა',
  'Rating': 'შეფასება',
  'Ratings': 'შეფასებები',
  'Share': 'გაზიარება',

  /* ---- categories (labels come from the server by key) ---- */
  'Hardware & crashes': 'აპარატურა და ავარიები',
  'Operating system': 'ოპერაციული სისტემა',
  'Wi-Fi & networking': 'Wi-Fi და ქსელი',
  'Virus & security': 'ვირუსები და უსაფრთხოება',
  'Website development': 'ვებგვერდის შემუშავება',
  'Backend & APIs': 'ბექენდი და API-ები',
  'Phone & apps': 'ტელეფონი და აპლიკაციები',
  'Data recovery': 'მონაცემების აღდგენა',
  'Something else': 'სხვა რამ',
  '🖥️ Blue screen': '🖥️ ლურჯი ეკრანი',
  '🐌 Slow PC': '🐌 ნელი კომპიუტერი',
  '🌐 Website': '🌐 ვებგვერდი',
  '⚙️ Backend': '⚙️ ბექენდი',
  '📶 Wi-Fi': '📶 Wi-Fi',
  '🛡️ Virus': '🛡️ ვირუსი',
  '📱 Phone & apps': '📱 ტელეფონი და აპლიკაციები',
  '💾 Data recovery': '💾 მონაცემების აღდგენა',
  '✨ Something else': '✨ სხვა რამ',

  /* ---- availability ---- */
  'Available': 'ხელმისაწვდომი',
  'Busy': 'დაკავებული',
  'Away': 'არ არის ადგილზე',
  'Offline': 'გათიშული',
  'Active': 'აქტიური',
  'Active now': 'ახლა აქტიური',
  'active now': 'ახლა აქტიური',
  'Resigned': 'გათავისუფლებული',
  'resigned': 'გათავისუფლებული',

  /* ---- analytics: section headings (rendered as raw <h2>, so plain '&') ---- */
  'Revenue & payments': 'შემოსავალი და გადახდები',
  'Task funnel & throughput': 'დავალებების ძაბრი და გამტარობა',
  'Categories, pricing & clients': 'კატეგორიები, ფასები და კლიენტები',

  /* ---- analytics: funnel stage + duration labels (built server-side) ---- */
  'Priced': 'დაფასებული',
  'Work done': 'სამუშაო დასრულდა',
  'Confirmed': 'დადასტურებული',
  'Posted → first price': 'გამოგზავნა → პირველი ფასი',
  'First price → agreed': 'პირველი ფასი → შეთანხმება',
  'Agreed → assigned': 'შეთანხმება → მინიჭება',
  'Assigned → work done': 'მინიჭება → სამუშაოს დასრულება',
  'Work done → confirmed': 'სამუშაოს დასრულება → დადასტურება',
  'Posted → completed': 'გამოგზავნა → დასრულება',
  'Before a price was set': 'ფასის დადგენამდე',
  'During price negotiation': 'ფასზე მოლაპარაკებისას',
  'Waiting to be assigned': 'მინიჭების მოლოდინში',
  'After work started': 'სამუშაოს დაწყების შემდეგ',

  /* ---- analytics: chrome ---- */
  'Analytics': 'ანალიტიკა',
  'Last 7 days': 'ბოლო 7 დღე',
  'Last 30 days': 'ბოლო 30 დღე',
  'Last 90 days': 'ბოლო 90 დღე',
  'Last 12 months': 'ბოლო 12 თვე',
  'All time': 'მთელი პერიოდი',
  'From': 'დან',
  'To': 'მდე',
  '↻ Refresh': '↻ განახლება',
  'Refresh now': 'განაახლეთ ახლა',
  'Print': 'ბეჭდვა',
  'Table': 'ცხრილი',
  'Hide table': 'ცხრილის დამალვა',
  'CSV': 'CSV',
  'No data in this range': 'ამ პერიოდში მონაცემები არ არის',
  'Nothing in this range.': 'ამ პერიოდში არაფერია.',
  'Showing only the tasks you managed. Revenue figures are admin-only.':
    'ნაჩვენებია მხოლოდ თქვენ მიერ მართული დავალებები. შემოსავლის მაჩვენებლები მხოლოდ ადმინისთვისაა.',
  'vs previous period': 'წინა პერიოდთან შედარებით',
  'of tasks posted in range': 'პერიოდში გამოგზავნილი დავალებებიდან',

  /* ---- analytics: headline ---- */
  'Collected': 'შემოსული',
  'Booked': 'დაჯავშნილი',
  'Outstanding': 'დარჩენილი',
  'Tasks completed': 'დასრულებული დავალებები',
  'Tasks posted': 'გამოგზავნილი დავალებები',
  'Average worker score': 'სპეციალისტის საშუალო შეფასება',
  'Completion rate': 'დასრულების მაჩვენებელი',
  'Cancelled or declined': 'გაუქმებული ან უარყოფილი',
  'Cancelled/declined': 'გაუქმებული/უარყოფილი',

  /* ---- analytics: revenue ---- */
  'Revenue over time': 'შემოსავალი დროში',
  'Collected is money received; booked is the agreed value of work completed.':
    'შემოსული — მიღებული თანხა; დაჯავშნილი — დასრულებული სამუშაოს შეთანხმებული ღირებულება.',
  'Revenue by category': 'შემოსავალი კატეგორიით',
  'Completed jobs in this range.': 'ამ პერიოდში დასრულებული დავალებები.',
  'Payment health': 'გადახდების მდგომარეობა',
  'Average job value': 'დავალების საშუალო ღირებულება',
  'Median job value': 'დავალების მედიანური ღირებულება',
  'Average time to pay': 'გადახდის საშუალო დრო',
  'Income from urgency fees': 'შემოსავალი სასწრაფოების საკომისიოდან',
  'Outstanding payments': 'დაუფარავი გადახდები',
  'Every completed job still unpaid — a running balance, not limited to the selected range.':
    'ყოველი დასრულებული, მაგრამ გადაუხდელი დავალება — მიმდინარე ბალანსი, არჩეული პერიოდით შეუზღუდავი.',
  'Top clients by spend': 'მთავარი კლიენტები დანახარჯით',
  'Payments received in this range.': 'ამ პერიოდში მიღებული გადახდები.',
  'Amount (₾)': 'თანხა (₾)',
  'Collected (₾)': 'შემოსული (₾)',
  'Booked (₾)': 'დაჯავშნილი (₾)',
  'Revenue (₾)': 'შემოსავალი (₾)',
  'Spent (₾)': 'დახარჯული (₾)',
  'Total (₾)': 'სულ (₾)',
  'Fee each (₾)': 'საკომისიო თითო (₾)',
  'Days outstanding': 'დაუფარავი დღეები',
  'Paid jobs': 'გადახდილი დავალებები',
  'Jobs paid': 'გადახდილი დავალებები',
  'Jobs': 'დავალებები',

  /* ---- analytics: funnel ---- */
  'Task funnel': 'დავალებების ძაბრი',
  'Of the tasks posted in this range, how far each one got.':
    'ამ პერიოდში გამოგზავნილი დავალებებიდან, თითოეული სადამდე მივიდა.',
  'Posted': 'გამოგზავნილი',
  'Posted vs completed': 'გამოგზავნილი დასრულებულთან შედარებით',
  'How long each step takes': 'რამდენ ხანს გრძელდება თითოეული ეტაპი',
  'Average across tasks that reached both ends of the step. Tasks still in flight are excluded.':
    'საშუალო იმ დავალებებზე, რომლებმაც ეტაპის ორივე ბოლოს მიაღწიეს. მიმდინარე დავალებები არ ითვლება.',
  'Where tasks are lost': 'სად იკარგება დავალებები',
  'When problems get posted': 'როდის იგზავნება პრობლემები',
  'Day of week against hour of day. Darker means busier.':
    'კვირის დღე საათის მიხედვით. მუქი ნიშნავს უფრო დატვირთულს.',
  'Stage': 'ეტაპი',
  'Stage reached': 'მიღწეული ეტაპი',
  'Share of posted': 'წილი გამოგზავნილიდან',
  'Tasks': 'დავალებები',
  'Tasks lost': 'დაკარგული დავალებები',
  'Tasks measured': 'გაზომილი დავალებები',
  'Step': 'ეტაპი',
  'Average': 'საშუალო',
  'Median': 'მედიანა',
  'Period': 'პერიოდი',
  'Day': 'დღე',
  'Hour': 'საათი',
  'Hours': 'საათი',

  /* ---- analytics: workers ---- */
  'Worker scores': 'სპეციალისტების შეფასებები',
  'Skill coverage vs demand': 'უნარების დაფარვა მოთხოვნასთან შედარებით',
  'Active workers holding each skill, against the tasks posted in that category.':
    'აქტიური სპეციალისტები თითოეული უნარით, ამ კატეგორიაში გამოგზავნილ დავალებებთან შედარებით.',
  'Workers with the skill': 'სპეციალისტები ამ უნარით',
  'Worker leaderboard': 'სპეციალისტების რეიტინგი',
  'Click a worker for their own breakdown.': 'დააჭირეთ სპეციალისტს დეტალური ხედისთვის.',
  'Avg score': 'საშ. შეფასება',
  'Avg time to fix': 'საშ. შეკეთების დრო',
  'Average time to fix': 'შეკეთების საშუალო დრო',
  'Average score over time': 'საშუალო შეფასება დროში',
  'Jobs completed': 'დასრულებული დავალებები',
  'What they work on': 'რაზე მუშაობს',
  'Stars': 'ვარსკვლავები',
  'Category': 'კატეგორია',
  'Task': 'დავალება',

  /* ---- analytics: pricing / clients ---- */
  'Categories by volume': 'კატეგორიები მოცულობით',
  'Pricing & negotiation': 'ფასები და მოლაპარაკება',
  'Manager\'s opening offer': 'მენეჯერის საწყისი შეთავაზება',
  'Agreed in the end': 'ბოლოს შეთანხმებული',
  'Offers per task': 'შეთავაზება დავალებაზე',
  'Accepted first offer': 'მიიღო პირველი შეთავაზება',
  'Agreed after haggling': 'შეთანხმდა მოლაპარაკების შემდეგ',
  'Outcome': 'შედეგი',
  'New clients': 'ახალი კლიენტები',

  /* ---- misc ---- */
  'Digit': 'Digit',
  'optional — click to add': 'არასავალდებულო — დასამატებლად დააჭირეთ',
  'How can we help?': 'რით შეგვიძლია დახმარება?',
  'Trust & safety': 'ნდობა და უსაფრთხოება',
  'Language': 'ენა',
  'Your experience & availability': 'თქვენი გამოცდილება და ხელმისაწვდომობა',
  'Your experience': 'თქვენი გამოცდილება',
  'Tell clients what you\'re great at.': 'უთხარით კლიენტებს, რაში ხართ ძლიერი.',

  /* ---- form placeholders ---- */
  'e.g. Laptop won\'t start': 'მაგ. ლეპტოპი არ ირთვება',
  'e.g. My laptop turns on but freezes on a blue screen with white text. It started yesterday.':
    'მაგ. ლეპტოპი ირთვება, მაგრამ ლურჯ ეკრანზე თეთრი ტექსტით იყინება. გუშინ დაიწყო.',
  'e.g. My printer won\'t connect to Wi-Fi': 'მაგ. პრინტერი Wi-Fi-ს ვერ უკავშირდება',
  'e.g. Printer setup, Smart-home devices': 'მაგ. პრინტერის დაყენება, ჭკვიანი სახლის მოწყობილობები',
  'e.g. 6 years in IT support. Fast with Windows crashes, Wi-Fi issues, and small business websites.':
    'მაგ. 6 წელი IT მხარდაჭერაში. სწრაფად ვაგვარებ Windows-ის ავარიებს, Wi-Fi პრობლემებს და მცირე ბიზნესის ვებგვერდებს.',

  /* ==== demo content: generated by tools/gen-i18n-demo.js, do not edit by hand ==== */
  /* seeded task titles */
  "Laptop won't turn on": "ლეპტოპი არ ირთვება",
  "Blue screen every morning": "ყოველ დილით ლურჯი ეკრანი",
  "Fan noise and overheating": "ქულერის ხმაური და გადახურება",
  "Screen flickers randomly": "ეკრანი პერიოდულად ციმციმებს",
  "Windows is painfully slow": "Windows ძალიან ნელია",
  "Stuck on the update screen": "განახლების ეკრანზე გაიჭედა",
  "Can't log in after update": "განახლების შემდეგ ვერ შევდივარ",
  "Printer driver keeps failing": "პრინტერის დრაივერი მუდმივად ვარდება",
  "Wi-Fi drops every hour": "Wi-Fi ყოველ საათში წყდება",
  "Router needs setting up": "როუტერის კონფიგურაცია მჭირდება",
  "No internet in the back room": "უკანა ოთახში ინტერნეტი არ არის",
  "VPN won't connect": "VPN არ უკავშირდება",
  "Pop-ups everywhere": "ყველგან ამომხტარი რეკლამებია",
  "Think I clicked a bad link": "მგონი საეჭვო ბმულზე დავაჭირე",
  "Email account was hacked": "ელფოსტა გატეხეს",
  "Ransomware warning": "გამომძალველი ვირუსის გაფრთხილება",
  "Shop page loads forever": "მაღაზიის გვერდი დიდხანს იტვირთება",
  "Need a landing page built": "ლენდინგ გვერდის აწყობა მჭირდება",
  "Contact form stopped sending": "საკონტაქტო ფორმა აღარ აგზავნის",
  "Site broken on phones": "საიტი ტელეფონზე გატეხილია",
  "API returns 500 at checkout": "API ყიდვისას 500-ს აბრუნებს",
  "Database keeps timing out": "ბაზასთან კავშირი მუდმივად წყდება",
  "Need a payment webhook": "გადახდის webhook მჭირდება",
  "Cron job stopped running": "Cron დავალება აღარ სრულდება",
  "App crashes on open": "აპლიკაცია გახსნისთანავე ითიშება",
  "Photos won't sync": "ფოტოები არ სინქრონიზდება",
  "Phone storage always full": "ტელეფონის მეხსიერება მუდამ სავსეა",
  "Need help moving to a new phone": "ახალ ტელეფონზე გადასვლაში მჭირდება დახმარება",
  "Deleted the wrong folder": "შეცდომით წავშალე საქაღალდე",
  "External drive not recognised": "გარე დისკი არ იკითხება",
  "Recover photos from a dead phone": "ფოტოების აღდგენა მკვდარი ტელეფონიდან",
  "Spreadsheet is corrupted": "ცხრილის ფაილი დაზიანდა",
  "Smart TV won't cast": "Smart TV-ზე ტრანსლაცია არ მუშაობს",
  "Set up a home office": "სახლის ოფისის მოწყობა",
  "Scanner won't talk to the Mac": "სკანერი Mac-ს არ უკავშირდება",
  "Need a general tech health check": "ტექნიკის ზოგადი შემოწმება მჭირდება",

  /* seeded task descriptions */
  "Nothing happens when I press the power button - no lights, no sound. It was working fine yesterday.":
    "ჩართვის ღილაკზე დაჭერისას არაფერი ხდება — არც შუქი და არც ხმა. გუშინ ჯერ კიდევ მუშაობდა.",
  "It crashes to a blue screen almost every time I start it up, then works fine after a second restart.":
    "თითქმის ყოველ ჩართვაზე ლურჯ ეკრანზე ვარდება, მეორედ გადატვირთვის შემდეგ კი ნორმალურად მუშაობს.",
  "The fan runs loudly the whole time and the case gets too hot to touch near the vents.":
    "ქულერი მუდმივად ხმამაღლა მუშაობს და კორპუსი ხვრელებთან ხელის შესახებად ძალიან ცხელდება.",
  "The picture flickers for a second or two at random, more often when I move the lid.":
    "გამოსახულება წამ-ორ წამში უცაბედად ციმციმებს, განსაკუთრებით ხუფის მოძრაობისას.",
  "It takes several minutes to boot and every program hangs before it opens.":
    "ჩატვირთვას რამდენიმე წუთი სჭირდება და ყველა პროგრამა გახსნამდე ჭედავს.",
  "It has been sitting on the same update percentage since last night and will not move.":
    "გუშინ საღამოდან განახლების ერთსა და იმავე პროცენტზე დგას და აღარ იძვრის.",
  "After the last update my password is rejected, though I am certain it is correct.":
    "ბოლო განახლების შემდეგ პაროლს არ იღებს, თუმცა დარწმუნებული ვარ, რომ სწორია.",
  "The printer disappears from the list every few days and I have to reinstall the driver.":
    "პრინტერი ყოველ რამდენიმე დღეში სიიდან ქრება და დრაივერის ხელახლა დაყენება მიწევს.",
  "The connection cuts out for a minute or so roughly once an hour on every device in the flat.":
    "ბინაში ყველა მოწყობილობაზე კავშირი დაახლოებით საათში ერთხელ წუთით წყდება.",
  "New router straight out of the box - I need it configured with a proper password and guest network.":
    "ახალი როუტერი ყუთიდან — მჭირდება გამართვა ნორმალური პაროლითა და სასტუმრო ქსელით.",
  "The signal is fine near the router but there is almost nothing at the back of the flat.":
    "როუტერთან სიგნალი კარგია, ბინის სიღრმეში კი თითქმის არაფერი აღწევს.",
  "The work VPN times out every time. It connects fine from my colleague's laptop.":
    "სამსახურის VPN ყოველ ჯერზე დროის ამოწურვით წყდება. კოლეგის ლეპტოპიდან კი ნორმალურად უკავშირდება.",
  "Adverts open in new windows even when the browser is closed. Something is clearly installed.":
    "რეკლამები ახალ ფანჯრებში იხსნება მაშინაც კი, როცა ბრაუზერი დახურულია. აშკარად რაღაცაა დაყენებული.",
  "I opened a link in an email that looked like it came from my bank. Now I am worried.":
    "ელფოსტაში გავხსენი ბმული, რომელიც თითქოს ბანკიდან იყო. ახლა ვღელავ.",
  "Friends are getting messages I never sent and my password no longer works.":
    "მეგობრებს მისდით წერილები, რომლებიც არ გამომიგზავნია, და პაროლიც აღარ მუშაობს.",
  "A full-screen message says my files are encrypted and demands payment. I have not paid anything.":
    "მთელ ეკრანზე წერია, რომ ფაილები დაშიფრულია და გადახდას ითხოვს. არაფერი გადამიხდია.",
  "The product pages take ten seconds or more, and customers are leaving before they load.":
    "პროდუქტის გვერდები ათ წამზე მეტს იტვირთება და მომხმარებლები ჩატვირთვამდე მიდიან.",
  "One clean page for a new service, with a contact form and our branding.":
    "ერთი მოწესრიგებული გვერდი ახალი სერვისისთვის, საკონტაქტო ფორმითა და ჩვენი ბრენდის სტილით.",
  "The form says it was sent but nothing arrives in our inbox any more.":
    "ფორმა წერს, რომ გაიგზავნა, მაგრამ ჩვენს ფოსტაში აღარაფერი შემოდის.",
  "On mobile the menu overlaps the text and half the buttons cannot be tapped.":
    "მობილურზე მენიუ ტექსტს ფარავს და ღილაკების ნახევარზე დაჭერა შეუძლებელია.",
  "Roughly one order in five fails at the payment step with a server error.":
    "დაახლოებით ყოველი მეხუთე შეკვეთა გადახდის ეტაპზე სერვერის შეცდომით ვარდება.",
  "Queries that used to be instant now time out under any real load.":
    "მოთხოვნები, რომლებიც ადრე მყისიერი იყო, ახლა ნებისმიერი დატვირთვისას ვადის ამოწურვით წყდება.",
  "We need paid orders to be marked automatically instead of checking them by hand.":
    "გვჭირდება, რომ გადახდილი შეკვეთები ავტომატურად აღინიშნოს, ხელით შემოწმების ნაცვლად.",
  "The nightly export has not produced a file for about a week and there is nothing in the log.":
    "ღამის ექსპორტს დაახლოებით კვირაა ფაილი არ შეუქმნია და ლოგში არაფერი წერია.",
  "It closes itself within a second of opening, every time, since the last phone update.":
    "ბოლო განახლების შემდეგ გახსნიდან წამში თავად იხურება, ყოველ ჯერზე.",
  "New pictures stay on the phone and never appear in the cloud or on my laptop.":
    "ახალი სურათები ტელეფონში რჩება და არც ღრუბელში ჩნდება და არც ლეპტოპზე.",
  "I delete things constantly and it fills up again within a day.":
    "მუდმივად ვშლი რაღაცეებს და ერთ დღეში ისევ ივსება.",
  "I want my contacts, photos and chats moved across without losing anything.":
    "მინდა კონტაქტები, ფოტოები და მიმოწერა გადმოვიტანო ისე, რომ არაფერი დაიკარგოს.",
  "I emptied the bin before realising a year of work documents was in there.":
    "ურნა გავასუფთავე და მერე მივხვდი, რომ იქ წლიური სამუშაო დოკუმენტები იყო.",
  "The drive spins up and the light comes on, but it never appears on the computer.":
    "დისკი ტრიალებს და ინდიკატორიც ანთია, მაგრამ კომპიუტერზე საერთოდ არ ჩნდება.",
  "The screen is black and it will not charge. The photos were never backed up.":
    "ეკრანი შავია და არ იტენება. ფოტოების სარეზერვო ასლი არასდროს გამიკეთებია.",
  "Excel refuses to open our main accounts file and offers to repair it, then fails.":
    "Excel ჩვენს მთავარ საბუღალტრო ფაილს არ ხსნის, აღდგენას გვთავაზობს და მერე ვერ ახერხებს.",
  "The TV and the phone are on the same Wi-Fi but casting never finds the screen.":
    "ტელევიზორი და ტელეფონი ერთსა და იმავე Wi-Fi-ზეა, მაგრამ ტრანსლაცია ეკრანს ვერ პოულობს.",
  "A desk, two monitors, a printer and stable Wi-Fi - I would like it all set up properly.":
    "მაგიდა, ორი მონიტორი, პრინტერი და სტაბილური Wi-Fi — მინდა ყველაფერი გამართულად დაიდგას.",
  "It worked before the last macOS update and now it is not detected at all.":
    "macOS-ის ბოლო განახლებამდე მუშაობდა, ახლა კი საერთოდ არ აღმოაჩენს.",
  "Nothing is broken exactly, I would just like someone to look over everything and tidy it up.":
    "კონკრეტულად არაფერია გაფუჭებული, უბრალოდ მინდა ვინმემ ყველაფერი გადახედოს და მოაწესრიგოს.",

  /* seeded review comments */
  "Fast and friendly, explained everything clearly.":
    "სწრაფი და თავაზიანი, ყველაფერი გასაგებად ამიხსნა.",
  "Fixed in under an hour. Brilliant.": "საათზე ნაკლებში მოაგვარა. შესანიშნავია.",
  "Very patient with someone who is not technical at all.":
    "ძალიან მომთმენი იყო ადამიანთან, ვინც ტექნიკაში საერთოდ ვერ ერკვევა.",
  "Sorted it remotely, no fuss.": "დისტანციურად მოაგვარა, ყოველგვარი პრობლემის გარეშე.",
  "Knew exactly what the problem was.": "ზუსტად იცოდა, რაში იყო პრობლემა.",
  "Polite and thorough. Would use again.": "თავაზიანი და საფუძვლიანი. კიდევ მივმართავ.",
  "Good work, though it took longer than I expected.":
    "კარგი სამუშაოა, თუმცა მოლოდინზე მეტი დრო დასჭირდა.",
  "Problem is solved, but it took a couple of visits.":
    "პრობლემა მოგვარდა, თუმცა ორი ვიზიტი დასჭირდა.",
  "Fine in the end. Communication could have been better.":
    "საბოლოოდ კარგად დასრულდა. კომუნიკაცია შეიძლებოდა უკეთესი ყოფილიყო.",
  "Turned up late and the problem came back the next day.":
    "დაგვიანებით მოვიდა და პრობლემა მეორე დღეს დაუბრუნდა.",
  "Not really what I asked for, had to call someone else.":
    "სულ სხვა რამ გამიკეთა, სხვისთვის მომიწია მიმართვა.",
  /* ==== end demo content ==== */
};

/* ------------------------------------------------------------------
   Patterns for text that carries a value, including the task-timeline
   entries the server stored in English. $1..$n map to the capture groups.
------------------------------------------------------------------- */
/* Georgian marks the subject of a completed action with the ergative case, so an
   actor name needs "-მა" rather than sitting bare. The generic role words the
   seeded events use get their proper ergative form; real names take the suffix. */
const I18N_ACTOR = {
  Worker: 'სპეციალისტმა', Manager: 'მენეჯერმა', Client: 'კლიენტმა', Admin: 'ადმინმა',
};
const i18nActor = (n) => I18N_ACTOR[n] || `${n}-მა`;

const I18N_PATTERNS = [
  // --- stored task events
  [/^Manager offered ₾(\d+) \(₾(\d+) for the work \+ ₾(\d+) (.+?) fee\)(.*)$/,
    (m) => `მენეჯერმა შესთავაზა ₾${m[1]} (₾${m[2]} სამუშაოსთვის + ₾${m[3]} „${I18N.t(m[4])}“ საკომისიო)${m[5]}`],
  [/^Manager offered ₾(\d+)\.?(.*)$/, (m) => `მენეჯერმა შესთავაზა ₾${m[1]}.${m[2]}`],
  [/^Client accepted the price of ₾(\d+)\. Ready for a manager to assign a worker\.$/,
    (m) => `კლიენტმა მიიღო ფასი ₾${m[1]}. მზადაა მენეჯერმა მიანიჭოს სპეციალისტი.`],
  [/^Manager accepted the client's price of ₾(\d+)\. Ready to assign a worker\.$/,
    (m) => `მენეჯერმა მიიღო კლიენტის ფასი ₾${m[1]}. მზადაა სპეციალისტის მინიჭებისთვის.`],
  [/^Client countered with ₾(\d+)[.:](.*)$/, (m) => `კლიენტმა შემოგვთავაზა ₾${m[1]}${m[2] ? ':' + m[2] : '.'}`],
  [/^Manager countered with ₾(\d+)[.:](.*)$/, (m) => `მენეჯერმა შემოგვთავაზა ₾${m[1]}${m[2] ? ':' + m[2] : '.'}`],
  [/^Client declined the price\. Task closed\.$/, () => 'კლიენტმა უარი თქვა ფასზე. დავალება დაიხურა.'],
  [/^Manager declined the client's price\. Task closed\.$/, () => 'მენეჯერმა უარი თქვა კლიენტის ფასზე. დავალება დაიხურა.'],
  [/^Client cancelled the request — they no longer need help\.$/, () => 'კლიენტმა გააუქმა მოთხოვნა — დახმარება აღარ სჭირდება.'],
  [/^Client confirmed the problem is fixed\. ✅$/, () => 'კლიენტმა დაადასტურა, რომ პრობლემა მოგვარდა. ✅'],
  [/^Client paid ₾(\d+)\. 💳$/, (m) => `კლიენტმა გადაიხადა ₾${m[1]}. 💳`],
  /* Events the live routes write that the seeded demo data never produces, so
     they only surfaced once a real task was posted end to end. */
  [/^Problem posted \((.+?), \+₾(\d+) urgency fee\)\. Waiting for a manager to set a price\.$/,
    (m) => `პრობლემა გამოგზავნილია (${I18N.t(m[1])}, +₾${m[2]} სასწრაფოების საკომისიო). ველოდებით მენეჯერის ფასს.`],
  [/^Problem posted \((.+?), free tier\)\. Waiting for a manager to set a price\.$/,
    (m) => `პრობლემა გამოგზავნილია (${I18N.t(m[1])}, უფასო). ველოდებით მენეჯერის ფასს.`],
  [/^Client paid ₾(\d+) \(card ending (\d+)\)\. 💳$/,
    (m) => `კლიენტმა გადაიხადა ₾${m[1]} (ბარათი ბოლოთი ${m[2]}). 💳`],
  [/^Client rated (.+?) (★+) \((\d)\/5\)(?::\s*(.+))?\.$/,
    (m) => `კლიენტმა შეაფასა ${m[1]} ${m[2]} (${m[3]}/5)${m[4] ? ': ' + m[4] : ''}.`],
  [/^Client cancelled the request — they no longer need help\. It has been removed from the worker's jobs\.$/,
    () => 'კლიენტმა გააუქმა მოთხოვნა — დახმარება აღარ სჭირდება. დავალება მოხსნილია სპეციალისტის სიიდან.'],
  [/^(.+) marked the work as done\. Waiting for the client to confirm\.$/,
    (m) => `${i18nActor(m[1])} სამუშაო დასრულებულად მონიშნა. ველოდებით კლიენტის დადასტურებას.`],
  [/^(.+) assigned (.+) to this task\. (.+) is now marked Busy\.$/,
    (m) => `${i18nActor(m[1])} ამ დავალებაზე მიანიჭა ${m[2]}. ${m[3]} ახლა დაკავებულია.`],
  [/^(.+) unassigned the task from (.+?)\.(.*) Ready to assign a different worker\.$/,
    (m) => `${i18nActor(m[1])} დავალება ჩამოხსნა ${m[2]}-ს.${m[3]} მზადაა სხვა სპეციალისტის მინიჭებისთვის.`],
  [/^(.+) unassigned the task\.(.*) Ready to assign a different worker\.$/,
    (m) => `${i18nActor(m[1])} დავალება ჩამოხსნა.${m[2]} მზადაა სხვა სპეციალისტის მინიჭებისთვის.`],
  [/^(.+) is Available again\.$/, (m) => `${m[1]} ისევ ხელმისაწვდომია.`],
  [/^Client rated the worker (.+) \((\d)\/5\)\.$/, (m) => `კლიენტმა შეაფასა სპეციალისტი ${m[1]} (${m[2]}/5).`],

  // --- UI text carrying a count or amount
  [/^Show timeline \((\d+)\)$/, (m) => `ისტორიის ჩვენება (${m[1]})`],
  [/^Hide timeline \((\d+)\)$/, (m) => `ისტორიის დამალვა (${m[1]})`],
  [/^✓ Paid ₾(\d+) · card ···· (\d+)$/, (m) => `✓ გადახდილია ₾${m[1]} · ბარათი ···· ${m[2]}`],
  [/^✓ Paid ₾(\d+)$/, (m) => `✓ გადახდილია ₾${m[1]}`],
  [/^(\d+(?:\.\d+)?)★ avg rating \((\d+)\)$/, (m) => `${m[1]}★ საშ. შეფასება (${m[2]})`],
  [/^avg rating \((\d+)\)$/, (m) => `საშ. შეფასება (${m[1]})`],
  [/^average across (\d+) ratings?$/, (m) => `საშუალო ${m[1]} შეფასების მიხედვით`],
  [/^(\d+) rating$/, (m) => `${m[1]} შეფასება`],
  [/^(\d+) ratings$/, (m) => `${m[1]} შეფასება`],
  [/^(\d+) paid jobs?$/, (m) => `${m[1]} გადახდილი დავალება`],
  [/^(\d+) completed jobs?$/, (m) => `${m[1]} დასრულებული დავალება`],
  [/^(\d+) completed but unpaid$/, (m) => `${m[1]} დასრულებული, მაგრამ გადაუხდელი`],
  [/^(\d+) job$/, (m) => `${m[1]} დავალება`],
  [/^(\d+) jobs$/, (m) => `${m[1]} დავალება`],
  [/^median (.+) · (\d+) tasks?$/, (m) => `მედიანა ${m[1]} · ${m[2]} დავალება`],
  [/^(\d+) completed · (\d+(?:\.\d+)?)% lost$/, (m) => `${m[1]} დასრულებული · ${m[2]}% დაკარგული`],
  [/^Best rated: (.+) at (.+)$/, (m) => `საუკეთესო შეფასება: ${m[1]} — ${m[2]}`],
  [/^No ratings in this range yet\.$/, () => 'ამ პერიოდში შეფასებები ჯერ არ არის.'],
  [/^No ratings in this range\.$/, () => 'ამ პერიოდში შეფასებები არ არის.'],
  [/^No tasks in this range\.$/, () => 'ამ პერიოდში დავალებები არ არის.'],
  [/^Everything completed has been paid for\.$/, () => 'ყველა დასრულებულზე გადახდილია.'],
  [/^(\d+) cancelled or declined · (\d+(?:\.\d+)?)% of tasks needed reassigning\.$/,
    (m) => `${m[1]} გაუქმებული ან უარყოფილი · დავალებების ${m[2]}% საჭიროებდა ხელახლა მინიჭებას.`],
  [/^Average (\d+(?:\.\d+)?|—) offers? per priced task\.$/, (m) => `საშუალოდ ${m[1]} შეთავაზება ერთ დაფასებულ დავალებაზე.`],
  [/^(\d+) registered · (\d+) have come back \((\d+(?:\.\d+)?)% of those who ever posted\)\.$/,
    (m) => `${m[1]} რეგისტრირებული · ${m[2]} დაბრუნდა (ოდესმე გამომგზავნელთა ${m[3]}%).`],
  [/^Range (.+) → (.+) · (\d+) days · bucketed by (\w+)$/,
    (m) => `პერიოდი ${m[1]} → ${m[2]} · ${m[3]} დღე · დაჯგუფება: ${I18N.t(m[4][0].toUpperCase() + m[4].slice(1))}`],
  [/^Updated (.+)$/, (m) => `განახლდა ${m[1]}`],
  [/^(\d+(?:\.\d+)?)% of (\d+) completed jobs paid \((\d+)\)$/,
    (m) => `${m[2]} დასრულებული დავალების ${m[1]}% გადახდილია (${m[3]})`],
  [/^Prices settle (.+) the opening offer, across (\d+) tasks?\.$/,
    (m) => `ფასები საწყის შეთავაზებაზე ${m[1]} დგება, ${m[2]} დავალების მიხედვით.`],
  [/^Your prices settle (.+) the opening offer, across (\d+) tasks?\.$/,
    (m) => `თქვენი ფასები საწყის შეთავაზებაზე ${m[1]} დგება, ${m[2]} დავალების მიხედვით.`],
  [/^Not enough negotiated tasks to compare yet\.$/, () => 'შესადარებლად საკმარისი მოლაპარაკებული დავალება ჯერ არ არის.'],
  [/^Amounts are admin-only\.$/, () => 'თანხები მხოლოდ ადმინისთვისაა.'],
  /* The pricing sentence wraps its percentage in <b>, which splits it across
     three text nodes — so each fragment needs its own entry. */
  [/^Prices settle$/, () => 'ფასები დგება'],
  [/^Your prices settle$/, () => 'თქვენი ფასები დგება'],
  [/^(\d+(?:\.\d+)?)% above$/, (m) => `საწყისზე ${m[1]}%-ით მაღლა`],
  [/^(\d+(?:\.\d+)?)% below$/, (m) => `საწყისზე ${m[1]}%-ით დაბლა`],
  [/^the opening offer, across (\d+) tasks?\.$/, (m) => `საწყისი შეთავაზებიდან, ${m[1]} დავალების მიხედვით.`],
  [/^the opening offer, across (\d+) tasks?\. Amounts are admin-only\.$/,
    (m) => `საწყისი შეთავაზებიდან, ${m[1]} დავალების მიხედვით. თანხები მხოლოდ ადმინისთვისაა.`],
  [/^₾(\d+) across (\d+) jobs?, oldest (\d+) days?\.$/,
    (m) => `₾${m[1]} — ${m[2]} დავალება, უძველესი ${m[3]} დღის.`],
  /* Comma-joined skill lists ("Data recovery, Hardware & crashes"). Only
     translated when every part is a known category, so a user's comma-containing
     text is never touched. */
  [/^([^,]+(?:, [^,]+)+)$/, (m) => {
    const parts = m[1].split(', ');
    if (!parts.every(p => Object.prototype.hasOwnProperty.call(I18N_KA, p))) return null;
    return parts.map(p => I18N_KA[p]).join(', ');
  }],
  [/^(\d+)–(\d+) years experience$/, (m) => `${m[1]}–${m[2]} წლის გამოცდილება`],
  [/^(\d+)\+ years experience$/, (m) => `${m[1]}+ წლის გამოცდილება`],
  [/^(\d+)–(\d+) years$/, (m) => `${m[1]}–${m[2]} წელი`],
  [/^(\d+)\+ years$/, (m) => `${m[1]}+ წელი`],
  // --- task card figures and greetings
  [/^Your counter: ₾(\d+)$/, (m) => `თქვენი შემხვედრი: ₾${m[1]}`],
  [/^Manager's offer: ₾(\d+)$/, (m) => `მენეჯერის შეთავაზება: ₾${m[1]}`],
  [/^Your offer: ₾(\d+)$/, (m) => `თქვენი შეთავაზება: ₾${m[1]}`],
  [/^Accept ₾(\d+)$/, (m) => `დათანხმება ₾${m[1]}`],
  [/^Pay ₾(\d+)$/, (m) => `გადახდა ₾${m[1]}`],
  [/^Agreed: ₾(\d+)$/, (m) => `შეთანხმებული: ₾${m[1]}`],
  [/^Welcome back, (.+)\.$/, (m) => `კეთილი იყოს დაბრუნება, ${m[1]}.`],
  [/^(\d+) reviews?$/, (m) => `${m[1]} შეფასება`],
  [/^Manager assigned a worker to this task\.$/, () => 'მენეჯერმა ამ დავალებაზე სპეციალისტი მიანიჭა.'],
  [/^No rush — whenever · (?:free|\+₾0)(?: urgency)?$/, () => 'არ არის სასწრაფო — ნებისმიერ დროს · უფასო'],
  [/^Within a few days · \+₾(\d+)(?: (?:urgency|rush fee))?$/, (m) => `რამდენიმე დღეში · +₾${m[1]} სასწრაფოება`],
  [/^As soon as possible · \+₾(\d+)(?: (?:urgency|rush fee))?$/, (m) => `რაც შეიძლება მალე · +₾${m[1]} სასწრაფოება`],
  [/^Manager unassigned the task\. Ready to assign a different worker\.$/,
    () => 'მენეჯერმა დავალება ჩამოხსნა. მზადაა სხვა სპეციალისტის მინიჭებისთვის.'],
  [/^Thanks for rating!$/, () => 'გმადლობთ შეფასებისთვის!'],
  [/^Payment successful — thank you! 🎉$/, () => 'გადახდა წარმატებულია — გმადლობთ! 🎉'],
  [/^Unassigned — ready to assign a different worker\.$/,
    () => 'ჩამოხსნილია — მზადაა სხვა სპეციალისტის მინიჭებისთვის.'],
  [/^That task is no longer available\.$/, () => 'ეს დავალება აღარ არის ხელმისაწვდომი.'],
  [/^Crunching the numbers…$/, () => 'მონაცემები მუშავდება…'],
  [/^Loading…$/, () => 'იტვირთება…'],
  [/^Couldn't load analytics — (.+)$/, (m) => `ანალიტიკა ვერ ჩაიტვირთა — ${m[1]}`],
];

/* ------------------------------------------------------------------
   Engine
------------------------------------------------------------------- */
const I18N = (() => {
  let lang = 'en';
  let observer = null;
  /* Original English, kept per node so switching back is lossless rather
     than a reverse lookup (which would be ambiguous). */
  const original = new WeakMap();

  function dict() { return lang === 'ka' ? I18N_KA : null; }

  const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);

  function lookup(k) {
    const d = dict();
    if (has(d, k)) return d[k];
    for (const [re, fn] of I18N_PATTERNS) {
      const m = k.match(re);
      if (!m) continue;
      /* A pattern may match the shape but still decline — the comma-list rule
         only fires when every part is a known category. Keep looking rather
         than treating the first match as final, or a broad pattern earlier in
         the list silently shadows every specific one after it. */
      const out = fn(m);
      if (out != null) return out;
    }
    return null;
  }

  function translate(s) {
    if (!dict() || !s) return null;
    const key = s.trim();
    if (!key) return null;
    // Preserve the surrounding whitespace the layout may rely on.
    const direct = lookup(key);
    if (direct != null) return s.replace(key, direct);
    /* Two things arrive with a prefix ahead of the translatable part: timeline
       entries ("— Manager offered ₾40.") and category labels carrying their
       emoji ("🖥️ Hardware & crashes"). Split off any leading run of non-letters,
       translate the rest, and put the prefix back — otherwise every ^-anchored
       key and pattern misses by one character. */
    const pre = key.match(/^([^\p{L}\p{N}]+?\s*)([\p{L}\p{N}][\s\S]*)$/u);
    if (pre) {
      const out = lookup(pre[2]);
      if (out != null) return s.replace(key, pre[1] + out);
    }
    return null;
  }

  /* t() for callers that want a single string translated (used by the
     patterns above, and available to app code if it ever wants it). */
  function t(s) {
    const out = translate(s);
    return out == null ? s : out;
  }

  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-phrase'];

  function applyTo(root) {
    if (!root) return;
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
    else if (root.nodeType === Node.ELEMENT_NODE) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || p.closest(I18N_SKIP_SEL)) return NodeFilter.FILTER_REJECT;
          return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      let n; while ((n = w.nextNode())) nodes.push(n);
    }
    for (const n of nodes) {
      if (!original.has(n)) original.set(n, n.nodeValue);
      const en = original.get(n);
      const out = lang === 'en' ? en : translate(en);
      const want = out == null ? en : out;
      if (n.nodeValue !== want) n.nodeValue = want;
    }
    // Attributes
    const els = root.nodeType === Node.ELEMENT_NODE
      ? [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[alt],[data-phrase]')]
      : [];
    for (const el of els) {
      if (!el.getAttribute) continue;
      for (const a of ATTRS) {
        const cur = el.getAttribute(a);
        if (cur == null) continue;
        const memo = `__i18n_${a}`;
        if (el[memo] === undefined) el[memo] = cur;
        const en = el[memo];
        const out = lang === 'en' ? en : translate(en);
        const want = out == null ? en : out;
        if (cur !== want) el.setAttribute(a, want);
      }
    }
  }

  /* The app re-renders whole subtrees with innerHTML, so translation has to
     follow the DOM rather than run once.

     Deliberately never disconnects. The obvious shape here is to disconnect
     while writing so our own edits don't re-trigger the callback — but
     disconnect() also clears the pending record queue, so anything that
     mutated between the callback firing and the disconnect is lost. That
     dropped the login toast, which lands in the same tick as the dashboard
     render. Staying connected is safe because applyTo only writes when the
     value actually changes: our own edits produce one extra pass that
     computes the same string, writes nothing, and terminates. */
  function observe() {
    if (observer) return;
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') for (const n of m.addedNodes) applyTo(n);
        else if (m.type === 'characterData') applyTo(m.target);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* app.js and analytics.js call toLocaleString/toLocaleTimeString with no
     locale (or []), so patching the default is the least invasive way to get
     Georgian dates and numbers without touching those files. */
  function patchLocales() {
    const wrap = (proto, name) => {
      const orig = proto[name];
      proto[name] = function (locales, options) {
        const l = (locales == null || (Array.isArray(locales) && !locales.length)) ? I18N_LOCALE[lang] : locales;
        return orig.call(this, l, options);
      };
    };
    ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'].forEach(n => wrap(Date.prototype, n));
    wrap(Number.prototype, 'toLocaleString');
  }

  function setLang(next, { rerender = true } = {}) {
    lang = I18N_LANGS[next] ? next : 'en';
    try { localStorage.setItem('digit.lang', lang); } catch (e) {}
    // Cookie so the server can localise its error messages too.
    document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
    applyTo(document.body);
    reveal();
    syncToggle();
    // Anything already rendered with a locale-formatted date needs rebuilding.
    if (rerender && typeof window.__i18nRerender === 'function') window.__i18nRerender();
    // The terminal types a translated phrase, so it has to start over.
    if (typeof window.__armFx === 'function') window.__armFx();
  }

  function syncToggle() {
    document.querySelectorAll('[data-lang-btn]').forEach(b => {
      const on = b.getAttribute('data-lang-btn') === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* The inline gate in <head> hid the page for a non-English visitor so the
     English markup never flashes. Reveal the moment the first pass is done. */
  function reveal() { document.documentElement.classList.remove('i18n-wait'); }

  function init() {
    // The gate already resolved the language before first paint; trust it and
    // fall back to storage only if this ran without one.
    let saved = document.documentElement.getAttribute('data-lang');
    if (!saved) { try { saved = localStorage.getItem('digit.lang'); } catch (e) {} }
    patchLocales();
    lang = I18N_LANGS[saved] ? saved : 'en';
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
    applyTo(document.body);
    reveal();
    syncToggle();
    observe();
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-lang-btn]');
      if (!b) return;
      e.preventDefault();
      setLang(b.getAttribute('data-lang-btn'));
    });
  }

  return { init, setLang, t, apply: applyTo, get lang() { return lang; } };
})();

/* Runs as soon as the body exists rather than waiting for DOMContentLoaded. This
   script sits at the end of <body>, so by the time it executes the static markup
   is already parsed — waiting would just hold the page hidden for longer. */
if (document.body) I18N.init();
else document.addEventListener('DOMContentLoaded', () => I18N.init());
