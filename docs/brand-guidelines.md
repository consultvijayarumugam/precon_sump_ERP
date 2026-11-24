# Precon Sump: brand guidelines

How Precon Sump looks and sounds: in the CRM (web and phone app), and in what staff send to customers.
This records the brand as built today (November 2026). Where something is missing or off, it is listed
under **Gaps** at the end rather than invented here.

**Source of truth for values:** `web/src/app/globals.css` (`--ps-*` and `--color-brand-*`) and
`mobile/src/theme.ts` (`colors`). This document explains them; if a value changes, change it there and
update this page.

---

## 1. Who we are

Precon makes two things: **precast concrete sumps** (3,000 to 20,000 litres) and **microbes** (in
packs). Customers are mostly homeowners and builders in Tamil Nadu who found us through a WhatsApp ad.
Most arrive as just a phone number.

**Brand idea:** *Strong, reliable, built to last.* Concrete and water: deep, solid blues with one
bright aqua accent.

**Personality:**

| Trait | Means | Not |
|---|---|---|
| Dependable | Says what will happen and when; numbers are exact | Vague, hedging, over-promising |
| Plain-spoken | Short sentences, everyday words, no jargon | Corporate, salesy, clever |
| Helpful | Tells people the next step | Lectures or explains what they already know |
| Respectful | Polite to customers, warm but not over-familiar | Pushy, slangy, emoji-heavy |

---

## 2. Name and wordmark

- The name is **Precon Sump**, two words, both capitalised. Inside the CRM, "Precon" alone is fine.
  Never "PreconSump", "PRECON SUMP" in running text, or "Precon Sumps".
- **Wordmark:** "Precon" in semibold plus "Sump" in light, in one line:
  - on navy, "Sump" is sky blue (`sky-300`, `#7DD3FC`);
  - on light backgrounds, "Sump" is brand blue `#2557EB`.
  - See `Logo` in `web/src/components/app-shell.tsx`.
- **Mark:** three stacked white concrete blocks (the precast tank) on a rounded square with an
  aqua-to-blue gradient (`#0EA5E9` to `#2557EB`).
  - The mark's corner radius is 8 px (`rounded-lg`) at its 32 px size.
  - Keep at least a quarter of the mark's width clear around it.
  - **Files:** `docs/brand/mark.svg` (master), `docs/brand/blocks-white.svg` (blocks alone, for
    one-colour use), `mark-512.png`, `mark-1024.png`, and `whatsapp-profile.png` (a square, for the
    company's WhatsApp Business profile picture).
  - **Where it's used:** the web sidebar, the browser tab (`web/src/app/favicon.ico`, `icon.svg`,
    `apple-icon.png`), and the phone app's icon, Android adaptive icon and launch screen
    (`mobile/assets/`, on `#071A33`).
  - To change it, edit `mark.svg` and the sidebar's `Logo` together, then render the PNGs again.
  - Don't recolour, outline, rotate or stretch it.
- **Illustration:** the login scene, a lorry carrying a "PRECON" sump through a night city, is the
  brand's one illustration.
  - It is used on web and phone (`web/src/components/delivery-scene.tsx`,
    `mobile/src/components/delivery-scene.tsx`).
  - Use it on entry screens only, not inside working screens.

---

## 3. Colour

### Brand palette

| Role | Name | Hex | Use |
|---|---|---|---|
| Deepest | Navy 950 | `#071A33` | Hero bands, phone header, splash background, sidebar |
| Deep | Navy 900 | `#0B2545` | Hero gradients, pressed states on navy |
| Ocean | Ocean 700 | `#0F4C81` | End of hero gradients |
| **Brand blue** | Blue 600 | `#2557EB` | Primary buttons, links, active nav, "you are here", single-series charts |
| Accent | Aqua 500 | `#0EA5E9` | Highlights and "today" only; **never body text on white** |
| Wash | Tint 50 | `#EAF2FE` | Soft background behind numbers and selected rows |

### Neutrals

| Name | Hex | Use |
|---|---|---|
| Page (web) | `#F4F6FB` | App background (phone: `#F3F6FB`) |
| Card | `#FFFFFF` | Cards, tables, sheets |
| Line | `#E3E8F0` | Hairlines, borders, grid |
| Ink | `#0F1B2D` | Headings, main text |
| Ink 2 | `#4A5568` | Secondary text |
| Ink 3 | `#5F6B80` | Hints, captions, placeholders (dark mode: `#8592AA`) |

### Status colours: meaning, never decoration

| Meaning | Hex | Rule |
|---|---|---|
| Urgent / overdue | `#B91C1C` | **Red is reserved for overdue and urgent only.** Not for "delete" decoration or charts. The one exception is unread-count badges (`#DC2626`, white text). |
| Warning / needs a person | `#B45309` | Not assigned, rotation switched off, missing data |
| Done / good | `#047857` | Saved, won, qualified, on time |
| WhatsApp actions | `#047857` | WhatsApp buttons (outline or light fill), never WhatsApp's own green |

### Module accents (web only)

These help people know where they are: CRM violet, Finance emerald, Operations amber, HR cyan, Admin
slate. Use them only on the module's own badge, dot or chip; buttons stay brand blue.

### Charts

- **Pipeline stages:** one blue ramp, light to dark, in stage order: `#86B6EF`, `#3987E5`, `#1C5CAB`,
  `#0D366B`.
  - With five stages use `--ps-ramp5-*`.
  - Past five, stages share steps, and labels tell them apart.
- **Single series:** `#2557EB`. **Comparison or previous period:** `#C9D7EF`.

### Contrast (checked against WCAG AA)

| Pair | Ratio | Verdict |
|---|---|---|
| Brand blue on white, white on brand blue | 5.77 | Text OK |
| Ink on white | 17.28 | Text OK |
| Ink 2 on white | 7.53 | Text OK |
| Ink 3 `#5F6B80` on white / page / tint | 5.38 / 4.98 / 4.78 | Text OK |
| Ink 3 dark `#8592AA` on dark card / page / tint | 5.52 / 6.02 / 4.77 | Text OK |
| Aqua `#0EA5E9` on white | 2.77 | **Not for text**; accents and large shapes only |
| Aqua on Navy 950 | 6.29 | Text OK |
| Brand blue on Tint 50 | 5.12 | Text OK |
| Red / amber / green status on white | 6.47 / 5.02 / 5.48 | Text OK |

### Dark mode (web)

Dark mode follows the system setting. The same hues are stepped for the navy surface; the values are
in the `prefers-color-scheme: dark` block of `globals.css`. Don't hand-pick dark colours elsewhere.

---

## 4. Type

- **Web:** Geist (sans) for everything; Geist Mono only for codes, keys and tag names.
- **Phone:** the system font (Roboto on Android), so it reads like the rest of the phone.
- **Weights:**
  - 600 to 800 for names, headings and big numbers;
  - 400 for reading text;
  - "Sump" in the wordmark is the only light (300) text.
- **Numbers that get compared** (counts, money, durations) use tabular figures.
- **Sizes:**
  - web body 14 px (tables 14, captions 12 to 13);
  - phone body 15 to 16 px.
  - Nothing a user needs to read is under 12 px. The one exception is count badges (11 px, bold, white on colour).
- **Casing:** sentence case for headings, buttons and labels ("New lead", "Hand over leads").
  Uppercase only for small section labels with letter-spacing (e.g. "NEEDS ATTENTION").

---

## 5. Shape, space and touch

- **Corners:**
  - web: buttons and inputs 6 px (`rounded-md`), cards and panels 8 px (`rounded-lg`), dashboard hero bands larger;
  - phone: buttons and cards 12 to 14 px (`space.radius`);
  - pills, chips and badges fully rounded everywhere.
- **Cards:** white, 1 px `#E3E8F0` border, at most a faint shadow. No heavy drop shadows or glass effects.
- **Phone tap targets:** at least **48 px** (`space.tap`); main actions **54 px** (`space.tapLarge`).
  The main action sits pinned at the bottom of the screen, within thumb reach.
- **Icons:** Lucide on web, Ionicons on phone. Line style, one size per row, always with a text label
  or an accessible name.
- **Motion:** quick and purposeful. The login scene is the only decorative animation; everything else
  confirms an action or shows where something went. Respect "reduce motion".

---

## 6. How we write

### In the app (staff-facing)

- **Say what happened, then the next step:** "Priya Sales deactivated; 10 open leads handed to Suresh
  Sales." Or "Not assigned: no telecaller is taking leads right now. An admin can switch one on in
  Lead assignment."
- **Errors say what's wrong and how to fix it,** in plain words: "+91 97910 06137 is already an open
  lead (New, not assigned). Open that lead instead." Never "Error 409" or "Invalid input".
- **Buttons name the action:** "Hand over 10 leads and deactivate", not "Submit" or "OK".
- **People are named, not "the user":** "Suresh Sales", "you".
- **No exclamation marks** in the app, except in a genuine celebration (a won deal).

### Formats (India)

| Thing | Write it as |
|---|---|
| Phone | `+91 97910 06137` (stored as `+919791006137`) |
| Money | `₹1,25,000` (Indian grouping) |
| Sump size | `10,000 L` |
| Date and time | `21 Nov, 11:43 am` (business time zone: Asia/Kolkata) |
| A lead with no name | its phone number, never "Unnamed" or "Unknown" |

### To customers (WhatsApp templates)

The voice gets warmer and more polite, but stays brief.

- **Open with their name if we have it:** "Hi Ravi,". If we don't, "Hi," or "Dear Sir/Madam,". The
  template system does this automatically.
- **One message, one purpose:** introduce, follow up, or send the quote.
- **Name the sender and the company:** "this is Tara from Precon".
- **End with one clear question or next step:** "Shall I call you today, or is tomorrow better?"
- **Keep it short:** under about 60 words, with no more than one emoji (or none), no ALL CAPS, and no
  pressure lines ("Offer ends today!!").
- **Quotes:** the PDF or link carries the detail; the message says what it is and what's included.

**On voice:**

| Do | Don't |
|---|---|
| "Hi Ravi, this is Tara from Precon. Thank you for your enquiry about our precast concrete sumps." | "Greetings!! Precon Sump is the BEST sump manufacturer 💧💧" |
| "Shall I call you today, or is tomorrow better?" | "Please revert at the earliest." |
| "Delivery and installation in Erode are included." | "All charges extra as applicable T&C apply." |

---

## 7. Checklist for anything new

- [ ] Colours come from the `--ps-*` / `brand-*` tokens (web) or `colors` (phone), with no new hex values.
- [ ] Red appears only for overdue or urgent things.
- [ ] Every text colour meets 4.5:1, or 3:1 for text 18 px and above. Aqua is never used as text on white.
- [ ] Phone buttons are at least 48 px tall; the main action is at least 54 px and within thumb reach.
- [ ] Copy is sentence case, names the action, and tells the person the next step.
- [ ] Numbers use Indian formats; a lead without a name shows its phone number.
- [ ] It works in web dark mode and on a small phone (360 px wide).

---

## Gaps fixed (21 Nov 2026)

1. **Phone app icon and launch screen:** they were Expo's placeholder images. They now use the mark:
   - a full-bleed icon;
   - an Android adaptive icon (white blocks on the water gradient, plus a monochrome version for
     themed icons);
   - the mark centred on `#071A33` at launch.
   - This takes effect from the next APK.
2. **Web favicon:** it was the default Next.js "N". It is now the mark (16, 32 and 48 px
   `favicon.ico`, plus `icon.svg` and a 180 px `apple-icon.png`).
3. **Hint grey:** it was too faint. Ink 3 is now `#5F6B80` on web and phone (`#8592AA` in web dark
   mode); both pass 4.5:1 on every surface they sit on.
4. **The mark as files:** it was only inline SVG. It is now saved in `docs/brand/` (SVG master plus
   PNGs).
