# Interview guide

The question sequence, per situation. Adapt freely — this is a route, not a
script, and an owner who volunteers three answers at once should not be walked
back through them one at a time.

Throughout: **ask few questions at a time, and show a board wherever a board can
replace a question.** A long list of abstract questions produces short vague
answers, which is the failure mode this whole skill is built to avoid.

## Universal opening

Regardless of situation, establish three things before design questions start:

1. **Who uses this, and in what context?** A tool someone lives in for eight
   hours a day has near-opposite requirements to one they touch twice a month.
   Density, contrast, and motion all follow from this.
2. **What is the screen they will spend the most time on?** Design that screen's
   character first; everything else is downstream of it. Designing the settings
   page first is how apps end up with a beautiful settings page.
3. **What should it never feel like?** Negative constraints are easier to state
   than positive ones and are unusually informative — "not like enterprise
   software", "not a toy" each rule out a great deal quickly.

Then go to references (SKILL.md Step 1) before anything abstract.

## New app

Nothing exists, so nothing constrains you — which is harder, not easier.

- References first, and take them seriously. With no existing product to react
  to, references are carrying nearly all the signal.
- Run the **character** board early, before any detail questions. The owner's
  reaction reshapes everything after it.
- Ask about the component library (SKILL.md Step 3) before the component
  vocabulary section — the library determines what the vocabulary can name.
- Expect more "deliberately undecided" entries than in the other modes, and
  don't treat that as failure. Some decisions genuinely can't be made before
  real screens exist; parking them honestly beats inventing them.

## Codify

The app looks roughly right. The job is capturing it so it stops drifting.

- **Read the real code first**: the stylesheet's tokens, a few components, two
  or three screens. Come with observations.
- Lead with the inconsistencies you found. "Status colour is done three
  different ways across these screens — which is right?" is a productive
  question, and it's one only someone who read the code can ask.
- The main risk here is **transcribing accidents as rules**. Something being in
  the code is not evidence anyone chose it. For each rule you're about to
  write, ask whether it was decided or just happened.
- Boards are still worth building for anything genuinely inconsistent — show
  the two or three treatments already in the app and let the owner pick which
  becomes the rule.

## Improve

The look is in the right neighbourhood but weak — the most common situation, and
the one where the interview matters most.

- **Start from the complaint.** The owner usually has one: it feels plain, it
  feels busy, it feels dated. That complaint is the thesis of the whole session;
  find its cause before proposing anything.
- Trace the complaint to a rule, not a screen. "Plain" is very often an absent
  icon or motion section rather than anything on the page the owner was looking
  at. A complaint that traces to a missing rule is worth far more than one
  patched on a single screen.
- Keep what works, explicitly. Naming the parts that are staying makes the
  changes safer to agree to, and stops the session sliding into a redesign
  nobody asked for.
- Build boards that vary **only the weak dimension**, holding the rest constant.
  That is what makes the improvement legible as an improvement.

## Redesign

The look is wrong; start over.

- Say the cost out loud first: every existing screen goes off-doctrine the
  moment this lands, and someone has to work through them. The owner should
  choose that knowingly.
- Ask what specifically is being abandoned and why — a redesign that can't
  articulate what was wrong tends to reproduce it in a new palette.
- Run two or three genuinely divergent character boards. This is the one
  situation where wide exploration is clearly worth the rounds.
- Record the retired doctrine's provenance in the new doc's References row.
  Knowing what the previous direction was, and why it was dropped, stops it
  quietly returning a year later.

## Closing the interview

Before writing the doc, confirm you can answer all of these. Any you can't is
either a question you skipped or an entry for "deliberately undecided":

- What does this product feel like in one sentence, in the owner's words?
- What is the accent colour, and how much of a screen may it cover?
- Does depth come from shadow, border, surface lightness, or a combination?
- What is the base spacing unit and the row density?
- Which icon set, at what size and weight — and are decorative icons allowed?
- What animates, for how long, and what must never animate?
- Which component library, and what does an agent reach for by default for a
  list row, a detail panel, a confirm, and a status indicator?

Then read the draft back — or better, show a board built entirely from the
finished doctrine — and get an explicit yes before handing off to
`design-system`. "No objections" is not a yes; people don't object to documents
they haven't fully read.
