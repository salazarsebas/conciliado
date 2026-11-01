# Brand book

Conciliado pays a batch of contractor invoices in USDC on Arc mainnet and then proves the
books from the chain. This book says how that sounds, reads, and looks. It is written
for this product: a ledger that can be deleted and rebuilt, and a tie-out that lands on
$0.00.

Tokens live in [brand/tokens.json](brand/tokens.json). Components, states, and motion live in
[design-system.md](design-system.md). Response times live in [performance.md](performance.md).

## Who it is for

- **A finance person at a small business.** They close the month by hand today, matching
  payment lines to invoices in a spreadsheet. They care about one question: does the total tie?
  They do not care about the chain, and they should never need to.
- **A judge or reviewer.** They read quickly, with other entries open, and they check claims.
  Every number they see must be one they can reproduce from a transaction hash.

The brand has to feel like a clean ledger to the first reader and like checkable evidence to
the second. Both want the same thing: exact numbers and no decoration.

## Idea

**Two records, one length.** The payer's books and the chain's record describe the same money.
When they agree, they have equal length. That is the whole product, and it is the whole mark:
two equal bars.

The tagline is the demo in six words: **Pay the batch. Rebuild the books.**

The line for the hook, used on the landing page and in the video: **Delete the ledger. Rebuild
it from the chain.**

## Name

- The name is **Conciliado**. Spanish for "reconciled". Say it once where it helps ("conciliado
  is the Spanish word for reconciled") and then leave it alone.
- One word, capital C, lowercase after. Never `CONCILIADO`, `conciliado` in running text,
  `Conciliado App`, `the Conciliado`, or a version with a domain suffix.
- In running text it is a name, not a noun: "Conciliado rebuilds the ledger", not "a
  conciliado".
- Pronounced kon-see-lyah-doh. Do not add a pronunciation guide to the UI.
- The product has no mascot, no nickname, and no abbreviation.
- Descriptor when one is needed: **batch USDC payouts with a ledger that rebuilds from the
  chain**. Not "a Web3 payments platform".

## Voice

Conciliado sounds like a careful colleague in accounts payable who also reads code. Calm,
exact, and short. It tells you what happened to the money before it tells you anything else.

| It is | It is not |
| --- | --- |
| Plain and specific | Clever or playful |
| Exact about numbers | Rounded or vague about them |
| Honest about what was checked | Promising safety it cannot show |
| Short | Padded with reassurance |
| Calm when something fails | Alarmed, apologetic, or cute |

Write the way a person would say it across a desk. Use "you" for the payer and "Conciliado"
for the product. Avoid "we" in the app; it is not a team talking, it is a tool reporting.

### Words we use

| Use | Instead of |
| --- | --- |
| pay a batch, payout | disburse, settle, transmit |
| invoice reference | hash, identifier (in the UI) |
| ledger | record set, data room |
| rebuild | reconstruct, regenerate, sync |
| tie out, ties to the cent | verify, validate (unless it is the CSV) |
| final | confirmed, settled, secured |
| pending | processing, in progress |
| Arc mainnet | the blockchain, the network |
| transaction | tx (outside developer views) |
| USDC | stablecoin, digital dollars |

### Words we avoid

`seamless`, `effortless`, `revolutionary`, `trustless`, `secure` (as a claim), `Web3`,
`blockchain-powered`, `unlock`, `supercharge`, `leverage`, `simply`, `just`, exclamation
marks, emoji, and the em dash. If a sentence needs "simply" to feel easy, the step is not
easy, and the copy should say what the step is.

## Tone rules for finance copy

These rules decide how every number, unit, and state reads. They apply to the app, the docs,
the demo video captions, and the write-up.

### Numbers

1. **Fixed decimals, always.** USDC amounts show six decimals, the precision of the token:
   `0.020000 USDC`. Never trim trailing zeros. A column of amounts must line up.
2. **`$` means rounded to the cent, `USDC` means six decimals.** A figure with a dollar sign
   has two decimals (`$0.21`). A figure with the unit `USDC` has six. A reader can tell which
   kind they are looking at without a footnote.
3. **The fee carries more precision than the payouts.** Gas on Arc has 18 decimals. The fee
   row shows it rounded half up to six (`0.011014 USDC`), and the row detail shows the full
   figure (`0.011013954 USDC`). The tie-out compares the full figure, never the rounded one.
4. **Never show a rounded zero for a non-zero difference.** If the exact difference is not
   zero, show the exact figure, even when it would round to `$0.00`. `$0.00` appears only when
   the exact difference is exactly zero, and the exact figure sits next to it
   (`0.000000 USDC`, `0 wei`).
5. **Tabular figures, right aligned**, in tables and in the tie-out. Thousands separators with
   a comma. No abbreviations: `1,250.000000`, never `1.25K`.
6. **Minus is a plain hyphen** (`-0.000001`), so a value pastes into a spreadsheet unchanged.
7. **Say which direction money moved.** Payouts and the fee are amounts that left the payer.
   Label them "Paid out" and "Network fee". The balance figure is "Wallet balance change", and
   it is shown as the amount that left the wallet, a positive number, so the ledger total and
   the balance change read as the same quantity.
8. **Counts are written with both numbers.** `6 of 6 matched`, not `all matched` and not
   `100%`.
9. **The fee is its own row, in USDC.** Gas on Arc is paid in USDC, so the network fee is
   booked as a ledger row, never folded into a payout and never hidden in a footnote.

### Units

- The unit is **USDC**. Put it in the column header or once beside the figure, not on every
  cell of a column.
- Developer views may show raw units (6 decimals as an integer) or wei (18 decimals). Label
  them `units` or `wei` every time, and keep them out of the default view.
- Durations: `320 ms` under a second, `1.4 s` above. One space before the unit.
- Time: `2026-10-19 14:32 UTC`, always UTC, always labeled. No relative time ("2 minutes ago")
  on a financial row.
- Block numbers use thousands separators in the UI (`26,689,516`). Copying one yields the plain
  digits.

### Pending and final

Arc finality is deterministic: a transaction either has a receipt or it does not. There is no
confirmation counter, so the app must not draw one.

| State | Meaning | Words |
| --- | --- | --- |
| Pending | The transaction was sent. No receipt yet. The ledger cannot be built. | "Pending. Waiting for the receipt." |
| Final | The receipt is in. The result will not change. | "Final" |
| Final, reverted | The receipt is in and the batch failed. Only the network fee left the wallet. | "Reverted. No payouts were made. The network fee was charged." |

- Never call a pending transaction "confirmed", "complete", or "settled".
- Never show a partial ledger as if it were the final one. While pending, show what is known
  and mark every figure that depends on the receipt as "not final yet".
- After 15 seconds of pending, add one line: "Still waiting for the receipt. You can leave
  this page. The transaction hash rebuilds the ledger whenever you come back."

### Errors and warnings

Every error answers three questions, in this order, in at most two sentences:

1. What happened.
2. Where the money is. This is mandatory. Say "No USDC moved." or say what did move.
3. What to do next.

Examples:

- "Row 4: the payee is not a valid address. No USDC moved. Fix the address and upload again."
- "The batch reverted. No payouts were made and the network fee of 0.011014 USDC was charged.
  Check the CSV and try again."
- "The ledger total and the wallet balance differ by 0.000012 USDC. Another transaction from
  this wallet is in the same block. Open the block in the explorer."

Do not apologize, do not say "Oops" or "Something went wrong", and do not blame the user.

### Claims

Claim what was checked, with the number. "6 of 6 invoices matched. Difference 0.000000 USDC."
Never "verified", "guaranteed", "audited", or "secure" unless a named artifact backs it.
Do not call the product "trustless". Say where the evidence is: a transaction hash and a link
to read it.

## Copy bank

| Where | Copy |
| --- | --- |
| Tagline | Pay the batch. Rebuild the books. |
| Landing hook | Delete the ledger. Rebuild it from the chain. |
| Landing subhead | Conciliado pays a batch of contractor invoices in USDC on Arc mainnet, one transaction, each line stamped with its invoice reference. Then it rebuilds the ledger from the chain and ties it to the wallet to the cent. |
| Primary action | Pay batch |
| Rebuild action | Rebuild from chain |
| Delete action | Delete ledger |
| Tie-out, tied | Ties out. Difference $0.00 |
| Tie-out headline | 6 of 6 matched |
| Empty ledger | No ledger yet. Pay a batch, or rebuild one from a transaction hash. |
| Loading | Reading Arc mainnet: logs, receipt, balances |
| Privacy note | The chain holds only an opaque reference per line. Your invoice IDs stay in this browser. |
| Mainnet badge | Arc mainnet |

The delete action removes the ledger held in the browser. It does not touch the chain, and the
confirmation says so: "This removes the ledger from this browser. The payments on Arc mainnet
are not affected."

## Logo

The mark is two equal horizontal bars inside a rounded square: an equals sign. The upper bar
is the ledger and is paper colored. The lower bar is the chain and is accent colored. Equal
length is the point; if the bars are ever shown at different lengths, it must mean a
difference, and that is the tie-out bar's job, not the logo's.

| Asset | Use |
| --- | --- |
| [logo-mark.svg](brand/logo-mark.svg) | Default. Ink square, for light backgrounds, the favicon, and the app icon. |
| [logo-mark-inverse.svg](brand/logo-mark-inverse.svg) | Paper square, for dark backgrounds. |

![Conciliado mark](brand/logo-mark.svg) ![Conciliado mark, inverse](brand/logo-mark-inverse.svg)

Geometry, in a 32 unit square: tile radius 7, bars 18 wide and 4 tall with radius 2, bars at
y=10 and y=18, left and right margin 7. The gap between the bars equals one bar height.

**Wordmark.** The word "Conciliado" set in the UI sans at weight 600, tracking -0.01em,
sentence case, in `ink`. It is text, not an image, so it follows the user's font and theme.

**Lockup.** Mark on the left, wordmark on the right, vertically centered. The mark is 1.75
times the wordmark's font size tall. The gap is half the mark's width.

**Clear space.** Keep one mark width free on every side. **Minimum size.** 16 px for the mark
alone, 20 px in a lockup.

Do not:

- recolor a bar to a status color (green for final, amber for pending). The mark is not a
  status indicator
- make the bars different lengths, tilt them, round them into a check mark, or add a third
  bar
- add a gradient, shadow, outline, or glow
- place the ink mark on a dark background or the inverse mark on a light one
- animate it, except for the single entrance on the landing page: the lower bar draws in from
  the left over `slow` while the upper bar stays put, and it ends at equal length

## Color

The palette is **paper and ink**: a warm ledger-paper background, near-black blue ink, and one
accent, a pen-ink blue. Status colors are reserved for state and never decorate.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#FAF8F3` | `#12141C` | Page background |
| `surface` | `#FFFFFF` | `#1A1D28` | Table, card, and input background |
| `sunken` | `#F1EEE6` | `#0E1016` | Table header, zebra row, code |
| `ink` | `#1C2030` | `#ECE9E1` | Body text and headings |
| `accent` | `#2A3F8F` | `#9DB0FF` | The one brand color: links, primary button, focus ring |
| `final` | `#14653F` | `#6FD39A` | Final, matched, ties out |
| `pending` | `#7A4E00` | `#F0C060` | Pending, warnings, testnet |
| `danger` | `#A12525` | `#FF9F98` | Errors, a difference that is not zero |

The full set (muted and subtle ink, washes, borders, focus, mainnet badge) and the checked
contrast ratios are in [design-system.md](design-system.md#color). Rules:

1. **Color is never the only signal.** Every status has a word and a shape (icon) next to the
   color. A finance reader on a grayscale printout must read the same ledger.
2. **One accent.** Accent marks the primary action and links. It never means a status.
3. **Green means final and matched, nothing else.** Do not use green for "good" decoration.
4. **The mainnet badge is the only solid ink chip** in the app. It must stand apart from every
   status pill.
5. **Text always meets WCAG AA**: 4.5:1 for text, 3:1 for borders and focus rings that carry
   meaning. Both themes. The checker in `bun run brand:check` enforces it.
6. **Dark mode is a first-class theme**, not an inversion. Light follows the system setting
   unless the user chooses.

## Type

No web font. The UI uses the system sans and the system monospace.

**Why.** The first paint target is 1.2 s on a throttled phone. A web font adds a request and a
layout shift to the one page every judge opens first. System fonts add neither, and they render
tabular figures that line up.

- **Sans** for all interface text and headings.
- **Mono** for addresses, transaction hashes, invoice references, block numbers, and the raw
  CSV preview. Anything a person might copy and compare character by character is mono.
- **Tabular, slashed-zero figures** (`font-variant-numeric: tabular-nums slashed-zero`) on
  every amount, count, and duration.
- Sentence case for every heading and label. No all caps except the three-letter `CSV` and
  the unit `USDC`.
- Body 16 px. Nothing below 12 px, and 12 px only for captions and pill labels.

The scale (12 to 40 px) is in [design-system.md](design-system.md#type-scale).

## Imagery

There is no illustration and no stock photography. The product is the picture: the ledger,
the tie-out bar, and the transaction in the explorer. Screenshots are of the live deploy, with
the mainnet badge visible, and never of a testnet labeled as mainnet. Diagrams use the
Graphviz kit in [diagrams/generator/](../diagrams/generator/) and have Markdown twins in
[diagrams/](diagrams/).

## Do and do not

| Do | Do not |
| --- | --- |
| Show `0.206014 USDC` and `$0.21` side by side where it matters | Show only the rounded figure |
| Say "6 of 6 matched" | Say "all matched" or "100%" |
| Name the network: "Arc mainnet" | Say "on-chain" with no network |
| Put the fee in its own row | Fold the fee into a payout |
| Say "No USDC moved." in an error | Leave the reader guessing about funds |
| Link every hash to the explorer | Show a hash that cannot be opened |
| Keep the mainnet badge on every screen that moves money | Show a testnet result as if it were mainnet |
| Write "Pending" until there is a receipt | Say "complete" before the receipt |
