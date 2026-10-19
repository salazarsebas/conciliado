# Design system

How Conciliado looks and behaves. The voice, the name, and the tone rules for numbers are in
[brand-book.md](brand-book.md); this file does not repeat them. The tokens are in
[brand/tokens.json](brand/tokens.json), the source of truth. Everything here is mobile first
(360 px wide and up) with 44 px touch targets.

## Files

| File | What it is |
| --- | --- |
| [brand/tokens.json](brand/tokens.json) | Source of truth: color (light and dark), type, spacing, radius, shadow, motion, layout, and the contrast pairs to check |
| [brand/tokens.css](brand/tokens.css) | Generated. CSS variables, light, dark, and reduced motion |
| [brand/tailwind.tokens.js](brand/tailwind.tokens.js) | Generated. A Tailwind v3 theme extension that reads the CSS variables |
| [brand/logo-mark.svg](brand/logo-mark.svg), [brand/logo-mark-inverse.svg](brand/logo-mark-inverse.svg) | The mark |
| [performance-targets.json](performance-targets.json) | Response-time targets, see [performance.md](performance.md) |

Regenerate and check:

```bash
bun run brand:tokens   # rewrites tokens.css, tailwind.tokens.js, and the contrast table below
bun run brand:check    # fails on a stale generated file or any pair under its WCAG AA minimum
```

## Using it in Arc Studio and in the app

The app is React, Vite, and Tailwind v3 (`tailwindcss` ^3.4). To use the system:

1. Put `tokens.css` and `tailwind.tokens.js` in the app, and import the CSS once, before
   Tailwind's layers, in `src/index.css`:

   ```css
   @import './brand/tokens.css';
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

2. Spread the theme into `tailwind.config.js`:

   ```js
   import brandTheme from './tailwind.tokens.js';

   export default {
     content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
     theme: { extend: brandTheme },
     plugins: [],
   };
   ```

   Extending adds the brand names (`paper`, `ink`, `accent`, `final`, `pending`, and the
   rest) next to Tailwind's defaults. Do not use the default palette (`slate-500`,
   `blue-600`) in components.

3. Set the body to `bg-paper text-ink font-sans`, and put `tabular-nums` on every figure.
4. Theme switching needs no `dark:` prefix. Colors are CSS variables that change under
   `prefers-color-scheme: dark`, or under `data-theme="dark"` or `data-theme="light"` on
   `<html>` when the user picks one.

Rules for every component:

- No raw hex values and no default Tailwind colors. If a color is missing, add a token.
- Text is `ink`, `ink-muted`, or `ink-subtle`. Nothing lighter.
- Status is color plus word plus icon.
- Every interactive element is at least `min-h-touch min-w-touch` (44 px) on touch screens.
- Every interactive element has a visible focus ring: `focus-visible:outline-2
  focus-visible:outline-offset-2 focus-visible:outline-focus`.

A prompt-ready brief for an Arc Studio turn: "Use the Conciliado design tokens in
`tailwind.tokens.js` and `tokens.css`. Colors are semantic Tailwind names (`paper`, `surface`,
`ink`, `accent`, `final`, `pending`, `danger`). Amounts use the sans font with `tabular-nums`,
six decimals, right aligned. Addresses, hashes, and invoice references use `font-mono`. No raw
hex, no default Tailwind colors, 44 px touch targets, light and dark through the CSS
variables."

## Color

Semantic names only. Light and dark are defined for every name, and the same name means the
same role in both.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `paper` | `#FAF8F3` | `#12141C` | Page background |
| `surface` | `#FFFFFF` | `#1A1D28` | Table, card, input |
| `sunken` | `#F1EEE6` | `#0E1016` | Table header, zebra row, code |
| `line` | `#D9D4C7` | `#2D3243` | Decorative hairlines and row dividers |
| `line-strong` | `#85806F` | `#7B829E` | Borders that identify a control (input, button, dropzone) |
| `ink` | `#1C2030` | `#ECE9E1` | Text |
| `ink-muted` | `#4A4F5E` | `#B9B7B0` | Secondary text, column headers |
| `ink-subtle` | `#5F6474` | `#9C9EA9` | Captions, hints |
| `accent` | `#2A3F8F` | `#9DB0FF` | Links, primary button, selected |
| `accent-hover` | `#1F3078` | `#B5C3FF` | Hover and pressed accent |
| `accent-ink` | `#FFFFFF` | `#0E1330` | Label on an accent fill |
| `accent-wash` | `#E6EAF6` | `#222B52` | Selected row, tinted chip |
| `final` / `final-wash` | `#14653F` / `#E1F1E8` | `#6FD39A` / `#133222` | Final, matched, ties out |
| `pending` / `pending-wash` | `#7A4E00` / `#FBEED3` | `#F0C060` / `#35290D` | Pending, warning, testnet |
| `danger` / `danger-wash` | `#A12525` / `#FBE4E1` | `#FF9F98` / `#3C1917` | Error, a difference that is not zero |
| `mainnet` / `mainnet-ink` | `#1C2030` / `#FAF8F3` | `#ECE9E1` / `#12141C` | The mainnet badge, the only solid chip |
| `focus` | `#2A3F8F` | `#9DB0FF` | Focus ring |

### Contrast, WCAG AA

Every pair below is computed from the token values by `scripts/brand-tokens.ts` using the
WCAG 2.x relative luminance formula, and `bun run brand:check` fails if any ratio is under its
minimum or if this table is out of date. Text needs 4.5:1. Borders and focus rings that carry
meaning need 3:1. Ratios are rounded down, so a displayed 4.50 is at least 4.50.

<!-- contrast:start -->

| Foreground on background | Used for | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| `ink` on `paper` | body text on the page | 4.5 | 15.23 | 15.14 |
| `ink` on `surface` | text in tables and cards | 4.5 | 16.17 | 13.84 |
| `ink` on `sunken` | text on table headers and zebra rows | 4.5 | 13.94 | 15.67 |
| `ink-muted` on `paper` | secondary text on the page | 4.5 | 7.69 | 9.15 |
| `ink-muted` on `surface` | secondary text in tables and cards | 4.5 | 8.16 | 8.36 |
| `ink-muted` on `sunken` | column headers | 4.5 | 7.04 | 9.47 |
| `ink-subtle` on `paper` | hints and captions on the page | 4.5 | 5.55 | 6.89 |
| `ink-subtle` on `surface` | hints and captions in cards | 4.5 | 5.89 | 6.30 |
| `ink-subtle` on `sunken` | hints on table headers | 4.5 | 5.08 | 7.13 |
| `accent` on `paper` | links on the page | 4.5 | 8.96 | 8.82 |
| `accent` on `surface` | links in cards and tables | 4.5 | 9.51 | 8.06 |
| `accent` on `accent-wash` | selected row and tinted chip text | 4.5 | 7.91 | 6.57 |
| `accent-ink` on `accent` | primary button label | 4.5 | 9.51 | 8.73 |
| `accent-ink` on `accent-hover` | primary button label on hover | 4.5 | 11.98 | 10.58 |
| `final` on `final-wash` | final pill, matched row, tie-out at zero | 4.5 | 6.05 | 7.60 |
| `final` on `surface` | final text on a card | 4.5 | 7.08 | 9.16 |
| `pending` on `pending-wash` | pending pill, warning row, testnet badge | 4.5 | 6.26 | 8.41 |
| `pending` on `surface` | pending text on a card | 4.5 | 7.19 | 9.92 |
| `danger` on `danger-wash` | error row, tie-out difference not zero | 4.5 | 6.15 | 7.93 |
| `danger` on `surface` | error text on a card | 4.5 | 7.48 | 8.52 |
| `mainnet-ink` on `mainnet` | mainnet badge | 4.5 | 15.23 | 15.14 |
| `line-strong` on `paper` | input and button borders on the page (non-text) | 3 | 3.72 | 4.83 |
| `line-strong` on `surface` | input borders on cards (non-text) | 3 | 3.95 | 4.42 |
| `focus` on `paper` | focus ring on the page (non-text) | 3 | 8.96 | 8.82 |
| `focus` on `surface` | focus ring on cards (non-text) | 3 | 9.51 | 8.06 |
| `focus` on `sunken` | focus ring on table headers (non-text) | 3 | 8.21 | 9.13 |

<!-- contrast:end -->

Decorative `line` is exempt from the non-text rule because row dividers repeat information
the layout already carries. Any border that is the only cue to a control uses `line-strong`.

## Type scale

System fonts, no web font (the reason is in the brand book). Sans for the interface, mono for
anything copied and compared. Figures are tabular and slashed-zero.

| Token | Size / line | Weight | Tracking | Used for |
| --- | --- | --- | --- | --- |
| `text-xs` | 12 / 16 | 500 | 0.02em | Pill labels, captions, table footnotes |
| `text-sm` | 14 / 20 | 400 | 0 | Table cells, helper text, mono values |
| `text-base` | 16 / 24 | 400 | 0 | Body, form fields, buttons |
| `text-lg` | 18 / 28 | 500 | 0 | Lead paragraph, card titles, tie-out figures |
| `text-xl` | 20 / 28 | 600 | -0.005em | Section headings |
| `text-2xl` | 24 / 32 | 600 | -0.01em | Page headings |
| `text-3xl` | 30 / 36 | 600 | -0.015em | Landing subhead figures |
| `text-4xl` | 40 / 44 | 700 | -0.02em | Landing hook, tie-out difference figure |

The scale steps are close to a minor third from 16 px. Hierarchy comes from size and weight,
not from color. One `h1` per page. Reading width is capped at 40 rem (`max-w-reading`).

## Spacing, radius, layout

- **Spacing** is a 4 px base: 0, 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32),
  10 (40), 12 (48), 16 (64), 24 (96), plus 0.5 (2) and `px`. Related things sit 2 to 4 apart,
  sections 8 to 16 apart. Table cells use 3 vertical, 4 horizontal.
- **Radius** is small because the product is a ledger: `sm` 4 px (chips inside controls),
  `md` 6 px (buttons, inputs, the table container), `lg` 10 px (cards), `full` (pills, the
  status dot).
- **Borders** are `hairline` 1 px (default) and `strong` 2 px (focus, selected row marker).
- **Shadow** is `raised` (a one pixel lift for cards) and `overlay` (menus, toasts). In dark
  mode both become a faint ring instead of a drop shadow.
- **Layout**: content max 72 rem, page gutter 16 px (32 px from `lg`). Breakpoints are `sm`
  40 rem, `md` 48 rem, `lg` 64 rem, `xl` 80 rem. Below `md`, the ledger table becomes stacked
  cards.
- **Touch targets** are 44 px (`touchTarget`, 2.75 rem) tall and wide for every control.

## Components

Each component lists its parts, its states, and what must be true for a reader who cannot see
color. The copy comes from the brand book.

### Status pill

A small rounded label for the state of a transaction or a ledger.

- **Parts**: dot or icon, word. `text-xs`, `rounded-full`, `px-2`, `py-0.5`, height 24 px. The
  pill is a label, not a control, so the 44 px target does not apply.
- **Variants**:

  | Variant | Tokens | Icon | Word |
  | --- | --- | --- | --- |
  | Pending | `text-pending bg-pending-wash` | Hollow dot | Pending |
  | Final | `text-final bg-final-wash` | Filled dot with a check | Final |
  | Reverted | `text-danger bg-danger-wash` | Cross | Reverted |

- **Rules**: the word is always visible, never only in a tooltip. Pending has a hollow shape
  and final a filled one, so they differ in grayscale. No spinner inside the pill and no
  pulse. The pill changes from Pending to Final with a color cross-fade over `fast`. The
  element that holds the pill has `role="status"`.

### Network badge

Says which network a screen is about. Present on every screen that moves or reads money.

- **Mainnet**: solid `mainnet` fill, `mainnet-ink` text, the words "Arc mainnet", `text-xs`,
  `rounded-full`. The only solid chip in the app, so it cannot be confused with a status.
- **Testnet**: `pending-wash` fill, `pending` text, dashed `pending` 1 px border, the words
  "Arc testnet". Never shown in the demo path. If it appears, the screen says "No real USDC".
- The network is named in words, never conveyed by color alone.
- A screenshot or a video frame of testnet never carries the mainnet badge.

### Address and hash display

For payee addresses, transaction hashes, invoice references, and block numbers.

- **Format**: mono, `text-sm`. Addresses show 4 and 4 characters after `0x`: `0xFe2b…a571`.
  Transaction hashes and invoice references show 8 and 8: `0x50d56ea9…00987056`. The
  ellipsis is the real character `…`, not three periods.
- **Full value** is always reachable: in a tooltip on hover and focus, in the accessible name
  of the control, and in the copy action. Screen readers get the full value, not the
  truncated form.
- **Actions**: a copy button (44 px target, icon, label "Copy address" or "Copy transaction
  hash") and the value itself as a link to the explorer. After copy the icon becomes a check
  and the live region says "Copied" for 2 s.
- **Explorer links** open `https://explorer.arc.io/address/<address>` or
  `https://explorer.arc.io/tx/<hash>` in a new tab with `rel="noopener noreferrer"`, and carry
  an external-link icon plus the text "Open in explorer" for assistive tech.
- **Wrapping**: truncated values never wrap. In a detail view (`md` and up) the full value is
  shown, wrapped with `break-all`.
- Addresses keep their checksum casing. Never lowercase a displayed address.

### Ledger table

The main object. One row per payout, then the fee row, then the total.

- **Columns**: `#`, Invoice, Payee, Paid out (USDC), Invoice reference, Match.
- **Rows**: six payout rows for the demo batch, then **Network fee** (its own row, its own
  label, no invoice and no payee address, amount rounded to six decimals with the full figure
  in the row detail), then **Ledger total**.
- **Type**: `text-sm`, amounts right aligned with `tabular-nums`, header in `ink-muted` on
  `sunken`, row dividers `line`, container `surface` with `rounded-md` and a `hairline` `line`
  border. The total row is `font-semibold` with a `strong` top border.
- **Match column**: "Matched" with the `final` check icon, "Not matched" with the `danger`
  cross icon, or "Checking" with the `ink-subtle` hollow dot. Words are always present.
- **Unmatched on-chain lines** (a reference on chain that the local CSV does not have) are
  never dropped. They appear as extra rows on `danger-wash`, labeled "On chain, not in your
  CSV". The reverse, a CSV invoice with no payment on chain, shows "In your CSV, not paid".
- **Pending**: rows that depend on the receipt show "not final yet" in `ink-subtle`, and the
  total row says "Total (not final)".
- **Mobile**: below `md` each row becomes a card: invoice and amount on the first line, payee
  and reference below, the match state at the end. Same content, same order.
- **Empty**: "No ledger yet. Pay a batch, or rebuild one from a transaction hash." with the
  rebuild input and a primary button. **Loading**: skeleton rows in `sunken`, as many as the
  batch has lines when known, with the line "Reading Arc mainnet: logs, receipt, balances".
  **Error**: a `danger-wash` panel above the table with the three-part error copy; the table is
  hidden, never half shown.
- Semantics: a real `<table>` with `<th scope>`; the card layout keeps a list with labels.

### Tie-out bar

The signature element. It restates the logo: two bars that are equal when the books tie.

- **Parts**: a row labeled "Ledger total" with a bar and its figure; a row labeled "Wallet
  balance change" with a bar and its figure; a result line.
- **Bars**: both on the same scale, the larger value at 100 percent of the track. The ledger bar
  is `ink` on a `sunken` track; the wallet bar is `accent`. Height 12 px, `rounded-full`.
  Figures sit beside the bar, `text-lg`, tabular, six decimals with `USDC`.
- **Result line**, `text-4xl` for the figure:

  | State | Display | Tokens | Words |
  | --- | --- | --- | --- |
  | Calculating | Bars empty, no figure | `ink-subtle` | "Reading Arc mainnet" |
  | Tied | `$0.00` with `0.000000 USDC, 0 wei` beneath | `final`, check icon | "Ties out. 6 of 6 matched." |
  | Difference | The exact difference, never rounded to zero | `danger`, cross icon | "Does not tie. Difference 0.000012 USDC." |
  | Unavailable | A dash | `ink-muted` | "Could not read the wallet balance. No USDC moved." |

- When the bars differ, the shorter one shows its gap as a hatched segment in `danger`, so the
  shortfall is visible without reading numbers.
- The comparison is made in 18 decimals; the display is the six decimal rounding, and the exact
  figure is one tap away.
- When the rebuild reports that the wallet sent other transactions in the same block, a
  warning in `pending` colors sits above the result: "This wallet sent other transactions in
  the same block."
- Semantics: the bars are decorative (`aria-hidden`); the result line is `role="status"` and
  carries the full meaning in text.

### CSV validation row

One row per CSV line, shown after upload and before payment. The rows validate locally, then
check the chain.

| State | Icon | Tokens | Text pattern |
| --- | --- | --- | --- |
| Checking | Hollow dot | `ink-subtle` on `surface` | "Row 3: checking" |
| Valid | Check | `final` on `final-wash` | "Row 3: ready" |
| Warning | Triangle | `pending` on `pending-wash` | "Row 3: payee is not on your allow-list yet. It will be added first." |
| Error | Cross | `danger` on `danger-wash` | "Row 4: the payee is not a valid address." |

- Errors cover: invalid address, amount not a positive decimal or with more than six
  decimals, missing invoice ID, duplicate invoice reference inside the file, reference already
  used on chain, more than 200 lines.
- Layout: row number, invoice ID, payee (address display), amount, state. A left marker of
  `strong` width in the state color. The error text is under the row, not in a tooltip.
- The summary above the list states the count and the money: "6 rows ready. 0 warnings. 0
  errors. 0.195000 USDC to pay." The pay button is disabled while any error exists, and the
  reason sits beside it ("Fix 1 error to continue"), not only in a disabled state.
- Warnings do not block payment; errors do. A file with an error pays nothing.

### Buttons

- **Primary**: `bg-accent text-accent-ink`, hover `bg-accent-hover`, `rounded-md`, `text-base`
  weight 600, `min-h-touch`, `px-5`. One primary button per view: "Pay batch" or "Rebuild from
  chain".
- **Secondary**: `bg-surface text-ink` with a `line-strong` border. "Copy", "Choose CSV".
- **Destructive**: secondary shape with `danger` text and border. "Delete ledger" uses it and
  asks for a confirmation that says what is and is not affected (brand book).
- **Disabled**: `ink-subtle` text on `sunken`, with a visible reason nearby. Not `opacity`.
- **Busy**: the label changes to the present tense ("Paying batch"), the button keeps its
  width, and no spinner outlasts the wait.

### Inputs and the CSV drop zone

- Inputs: `bg-surface`, `line-strong` border, `rounded-md`, `min-h-touch`, labels above, never
  placeholder-as-label. The transaction hash input is mono.
- Drop zone: `surface` with a dashed `line-strong` border, `rounded-lg`, and a text button
  "Choose CSV" inside it, so the file picker works without drag. Hover and drag-over use
  `accent-wash` and a solid `accent` border. It states the format: "Columns: invoice_id,
  payee, amount, invoice_ref. Amounts in USDC units." and links to an example file.

### Feedback: toast, empty, loading, error

- **Toast** (sonner): `surface` with `overlay` shadow, the status icon, one sentence, 6 s,
  pausable on hover. Never the only place an error appears; errors live in the page too.
- **Empty, loading, error** are defined for every data view (ledger, tie-out, CSV list,
  transaction status) with the patterns above. Loading names what is being read. Errors use the
  three-part pattern. A view never shows a spinner with no words.

## Motion

Motion explains cause and effect. It is never decoration, and it never delays a number.

| Token | Value | Used for |
| --- | --- | --- |
| `instant` | 80 ms | Press feedback, checkbox |
| `fast` | 140 ms | Color changes, pill state change, row delete |
| `base` | 220 ms | Panels opening, toasts in |
| `slow` | 360 ms | Tie-out bars growing, the logo entrance |
| `out` | `cubic-bezier(0.2, 0, 0, 1)` | Things entering |
| `in` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving |
| `inOut` | `cubic-bezier(0.4, 0, 0.2, 1)` | Things moving or resizing |

Rules:

1. **Numbers never animate their value.** No count-up, no rolling digits. A figure fades in
   once, already correct. A number that passes through wrong values is a lie on a ledger.
2. **The rebuild beat is the one choreographed moment.** Delete: rows collapse together over
   `fast`. Rebuild: rows return top to bottom with a 60 ms stagger, capped at 600 ms in total
   whatever the row count, and each row's match mark appears as its row lands. Then the
   tie-out bars grow over `slow`, and the difference figure fades in last. For 200 lines the
   stagger shrinks so the cap still holds.
3. **Motion follows data, not the other way round.** Animation starts when data has resolved.
   It is excluded from `rebuild-6` and `rebuild-200`, and counted in `rebuild-visible`.
4. **Only `transform`, `opacity`, and color animate.** Never layout properties, so the page
   does not shift (CLS target 0.05).
5. **Nothing loops.** The only continuous indicator is a static "Reading Arc mainnet" line. No
   pulsing pending pill, no looping spinner on the page.
6. **Reduced motion removes the choreography.** Under `prefers-reduced-motion: reduce`, all
   duration tokens become 0.01 ms (set in `tokens.css`), there is no stagger and no bar growth;
   states change at once. Information is never conveyed by motion alone.

## Accessibility

- AA contrast in both themes, enforced by `bun run brand:check`.
- Status is never color alone. Every status has a word and an icon with a different shape.
- Focus is always visible, 2 px `focus`, offset 2 px, with at least 3:1 against every
  background it sits on (checked above).
- Touch targets are 44 px. Controls are real `button`, `a`, `input`, and `table` elements.
- Live updates (pending to final, CSV checks, tie-out result) use `role="status"` and are
  announced once, in words.
- Page text zooms to 200 percent with no horizontal scroll at 360 px wide, except the full
  hash view, which wraps.
- One `h1` per page, headings in order, a unique title and meta description per page.
