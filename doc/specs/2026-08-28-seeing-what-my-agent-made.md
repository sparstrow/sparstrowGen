# Spec: Seeing what my agent made

| | |
|---|---|
| **Status** | Draft |
| **Created** | 2026-08-28 |
| **Trigger** | Owner, 2026-08-28: *"the models can also generate media which I should see accordingly in the chat"* and *"On the right preview pane, should we add another folder icon preview, on input and output folder for media."* Elaborated as [`I-16`](../Ideas.md); shaped by [the Multica comparison](../research/2026-08-28-multica-chat-comparison.md) |
| **Plan** | not planned yet |
| **Open questions** | none blocking — two inline `[NEEDS CLARIFICATION]` markers on limits |

## The experience today

You ask an agent for a picture. It replies *"I've generated a picture of a man
for you! Let me know if you would like me to modify it or generate something
else."* — and there is nothing to see. No image, no thumbnail, no filename, no
link. The reply is confident and the screen is empty, so you cannot tell
whether the agent did the work and the app lost it, or the agent did nothing
and said otherwise.

The same is true of everything else an agent produces that isn't words. If it
writes a chart, a PDF, a spreadsheet, or a screenshot, the conversation
mentions it and the app never shows it. The only way to find out is to go to
the machine yourself and look — which defeats the point of asking from your
phone.

The panel on the right of a conversation, where something like this would
naturally live, currently says "Nothing to preview" for every chat that isn't
tied to a project.

## What I expect instead

When an agent makes something, I see it. In the reply that talks about it, so
it reads like a conversation — and gathered in one list per conversation, so I
can find the thing from three days ago without scrolling through the whole
chat. It should still be there when I open the conversation on my phone with
my desktop asleep, because that is when I most often want to look.

---

## User stories

### US1 — See the thing the agent made, in the reply that mentions it (Priority: P1)

You ask an agent to produce something — an image, a chart, a file. When the
reply arrives, whatever it produced is shown inside that reply: images as
pictures you can enlarge, other files as a named row you can open or save.

**Why this priority:** This is the reported problem, in the place the owner
reported it. It is also the story that makes the app honest — today a reply can
claim work that the app silently discarded, and no other story fixes that.

**Independent test:** Ask an agent for an image in a fresh chat. When the reply
lands, the image is visible in it. Reload the page; it is still there.

**Acceptance scenarios:**

1. **Given** a conversation with an agent that can produce files, **When** I ask
   it to generate an image and the turn succeeds, **Then** the reply shows the
   image, and clicking it opens a larger view.
2. **Given** an agent that produced a file which is not an image, **When** the
   reply arrives, **Then** I see the file's name, its kind, and its size, with a
   way to open or save it — not a broken picture.
3. **Given** an agent that produced something but wrote no text at all, **When**
   the turn ends, **Then** I still get a reply containing what it made, rather
   than an empty conversation that looks like nothing happened.
4. **Given** an agent's reply claims it made something but nothing was actually
   produced, **When** I read the reply, **Then** the app shows only the text and
   does not invent a placeholder — and this case is distinguishable from a file
   that failed to load.
5. **Given** a turn that fails partway after producing a file, **When** I look at
   the conversation, **Then** I can still see what it managed to produce, along
   with the failure — partial work is not thrown away.
6. **Given** a conversation about one of my projects, **When** the agent edits,
   creates or deletes files inside that project's folder, **Then** those files
   are **not** shown as things the agent "made" and no copy of them is kept —
   they belong to the project, and the app does not duplicate a folder I already
   have. See the scope boundary under Assumptions.

---

### US2 — Find everything this conversation produced, in one place (Priority: P2)

The panel beside the conversation lists everything the agent made across the
whole chat, newest first, grouped by the request that produced it — so you can
find a thing without remembering which message it came from.

**Why this priority:** US1 makes each item visible; this makes a long
conversation navigable. A chat that produced thirty files under US1 alone is
thirty items scattered through the scroll with no index. Second because it is
worthless without something to list.

**Independent test:** In a conversation where an agent produced several files
across different turns, open the panel and see all of them listed, each labelled
with the request it came from. Click one; it opens.

**Acceptance scenarios:**

1. **Given** a conversation where an agent produced files across three separate
   turns, **When** I open the panel, **Then** I see every file grouped under the
   request that produced it, newest group first.
2. **Given** a conversation where nothing has been produced yet, **When** I open
   the panel, **Then** it explains that things the agent makes will collect here,
   rather than showing a bare "Nothing to preview".
3. **Given** I am on a phone, **When** I open a conversation, **Then** I can
   still reach this list — it is not a desktop-only feature.
4. **Given** a file in the list that can no longer be loaded, **When** I try to
   open it, **Then** I am told plainly that it is unavailable and why, and the
   rest of the list keeps working.

---

### US3 — See what I sent alongside what the agent made (Priority: P3)

The same panel also lists the files and images you attached to your own
messages, kept visually distinct from what the agent produced, so one place
answers "what went into this conversation and what came out".

**Why this priority:** It completes the owner's original framing of an input
side and an output side. Last because attaching files is being built separately
and this story is a second view over that work rather than new capability — and
because US1 and US2 are worth having without it.

**Independent test:** In a conversation where you attached an image and the
agent produced one, open the panel and see both, clearly told apart.

**Acceptance scenarios:**

1. **Given** a conversation where I attached two files and the agent produced
   one, **When** I open the panel, **Then** all three appear, and I can tell at a
   glance which came from me and which from the agent.
2. **Given** a conversation where I attached files but the agent produced
   nothing, **When** I open the panel, **Then** my attachments are listed and the
   agent's side explains it is empty — not an error.

---

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| The assistant reply in a conversation | existing | Sees what that specific turn produced, in context |
| The panel beside a conversation | existing (currently a placeholder) | Finds anything the conversation produced or received, without scrolling |
| Enlarged view of a single item | new | Looks at one image properly, or opens/saves one file |

### The four states

**The assistant reply (US1)**

| State | What the owner sees |
|---|---|
| **Populated** | The reply's text, with what it produced shown beneath: images as pictures sized to the reading column, other files as named rows with kind and size |
| **Empty** | Nothing extra at all — a reply that produced nothing looks exactly as it does today. No empty tray, no "0 files" |
| **Loading** | While the turn runs, produced items appear as they arrive rather than all at the end; each is a placeholder shaped like the item until it can be shown |
| **Error** | An item that cannot be shown says so in place, naming what it was — "chart.png couldn't be loaded" — and never renders as a broken image icon |

**The panel (US2, US3)**

| State | What the owner sees |
|---|---|
| **Populated** | Everything the conversation produced or received, newest first, grouped by the request it belongs to, with a clear marker for mine versus the agent's |
| **Empty** | An explanation that files the agent makes and files you attach will collect here, so the panel reads as ready rather than broken. This replaces today's "Nothing to preview" |
| **Loading** | Rows shaped like real rows, matching the count where it is known |
| **Error** | If the list cannot be loaded, the panel says so and offers to retry; if one item in a loaded list is unavailable, only that row says so and the rest stay usable |

### Flow

Ask for something in a conversation → the reply arrives with what it produced
shown inside it → click an image to enlarge, or a file to open or save → open
the side panel to see that item alongside everything else the conversation
produced → click any entry to reach the same enlarged view.

Dead ends to avoid: an item that cannot be loaded must not swallow the panel;
an agent that produced nothing must not leave an empty container suggesting
something is missing.

## Edge cases

- What happens when a single turn produces a hundred files? Does the reply show
  all of them inline, or collapse past a threshold with a way to see the rest?
- What happens when a produced file is very large? See the size limit under
  Requirements — the owner must be told when something was too big to keep,
  rather than it silently vanishing.
- What happens when the agent produces the same filename twice in one
  conversation — is the earlier one replaced, or are both kept as separate
  moments in time?
- What happens if the machine goes offline midway through handing something
  back? Is a half-transferred item hidden, or shown as incomplete?
- What happens to everything a conversation produced when that conversation is
  deleted? (Deletion is being added separately; this spec must not leave orphans
  behind it.)
- What happens in an archived, read-only conversation — can produced items still
  be opened and saved?
- What happens when the same conversation is continued on a different machine
  than the one that produced an earlier file?
- What does someone see who was not the person that ran the turn?

## Requirements

### Functional requirements

- **FR-001**: When an agent produces a file during a conversation turn, the
  system MUST keep it and associate it with the reply for that turn.
- **FR-002**: The owner MUST see images produced by a turn rendered as images
  within that turn's reply, sized to the reading column and enlargeable.
- **FR-003**: The owner MUST see non-image files produced by a turn as a named
  entry showing kind and size, with a way to open or save it.
- **FR-004**: The system MUST produce a reply for a turn that produced files but
  no text, rather than showing nothing.
- **FR-005**: Produced files MUST remain viewable when the machine that made
  them is offline, from any device the owner signs in on.
- **FR-006**: The owner MUST be able to see, in one list per conversation,
  everything that conversation produced, grouped by the request that produced it.
- **FR-007**: That list MUST also include files the owner attached to their own
  messages, visually distinguished from what the agent produced.
- **FR-008**: That list MUST be reachable on a phone, not only on a wide screen.
- **FR-009**: A file that cannot be shown MUST say so in plain words, in place,
  without breaking the surrounding reply or list.
- **FR-010**: The system MUST NOT show produced files to anyone outside the
  workspace the conversation belongs to.
- **FR-011**: The system MUST refuse to keep a file above a size limit, and MUST
  tell the owner that it did rather than failing silently. [NEEDS CLARIFICATION:
  what the limit is — the existing image-upload limit elsewhere in the app is a
  reasonable starting point, but produced files skew larger than avatars]
- **FR-012**: When a conversation is deleted, everything kept for it MUST be
  removed too.
- **FR-013**: Files produced by a turn that later failed MUST still be visible,
  alongside the failure.
- **FR-014**: Only the agent working on a given turn may attach files to that
  turn's reply.
- **FR-015**: The system SHOULD retain produced files for as long as the
  conversation exists. [NEEDS CLARIFICATION: whether a retention window is needed
  before storage cost becomes a problem — see Assumptions]
- **FR-016**: The system MUST NOT keep a copy of any file the agent writes
  inside a folder belonging to one of the owner's projects, and MUST NOT list
  such files as things the agent produced. Those files belong to the project and
  are reached through the project, not duplicated into the conversation.

### Key entities

- **Produced item**: something an agent made during one turn of a conversation —
  a picture, a document, a data file. Belongs to the reply for that turn, and
  through it to the conversation. Carries enough to describe itself without being
  opened: a name, a kind, a size, and when it was made.
- **Attached item**: something the owner added to their own message. Same shape
  as a produced item, differing in who it came from — which is why one list can
  hold both.

## Success criteria

- **SC-001**: Asking an agent to generate an image and seeing it, without
  leaving the conversation or touching the machine, works end to end.
- **SC-002**: A reply never claims to have produced something that the app then
  fails to show — either the thing appears, or the reply is accompanied by a
  plain statement that it could not be kept.
- **SC-003**: On a phone, with the machine that ran the turn powered off, every
  item the conversation produced is still viewable.
- **SC-004**: In a conversation with items spread over ten or more turns, the
  owner can find a specific one without scrolling the transcript.
- **SC-005**: A conversation that produced nothing looks exactly as it does
  today — no new empty containers appear anywhere.

## Assumptions

- **Agents are given a way to hand files back, and told to use it.** This spec
  does not assume any agent CLI spontaneously emits images in a form the app can
  read today. The comparable system solves this by offering agents an explicit
  way to hand a file back during a task; this spec assumes the same. The open
  question in `I-16` about whether models "really" generate media therefore does
  not block this — it determines how often the feature is exercised, not whether
  it can exist.
- **The owner chose both surfaces and cloud availability**, 2026-08-28: what the
  agent made appears both inline and in the panel, and stays viewable when the
  machine that produced it is off. The alternatives — one surface only, or
  machine-must-be-online — were considered and rejected. Machine-must-be-online
  was rejected specifically because the owner reported this from a phone.
- **US3 depends on chat attachments existing**, which is being built separately
  as part of the chat session and conversation work in flight. If that has not
  landed, US1 and US2 are unaffected and US3 simply has nothing to list.
- **Storage cost is unquantified.** FR-011 and FR-015 are the two places this
  spec knowingly leaves a limit unset. Both are cheap to set once and expensive
  to change after a year of files, so they want a decision before building, not
  during.
- **Deliberately excluded, and the most important boundary here: files an agent
  changes inside one of my projects.** Raised by the owner 2026-08-28 while
  reviewing this draft — *"what if we chat about the project… agents can make
  file edits, create new files, media, delete etc."* That is a different
  problem wearing the same clothes, and it is elaborated as
  [`I-17`](../Ideas.md).

  The distinction this spec turns on is **artifact versus change**. Here, an
  agent *produces* something that has no other home, so the app keeps it. In a
  project, an agent *changes a folder that already exists on a machine* — and
  copying those files into the app would create a second, immediately-stale
  copy of a repository that already owns and versions them. Media is not the
  special case in that situation; a generated logo and an edited source file
  have the same problem, which is that the app does not know the turn touched
  either.

  **What this means for building this spec:** produced items are things with no
  home of their own. Anything written inside a bound project folder is out of
  scope, is not copied, and is not listed here. Getting this wrong duplicates
  the owner's repository into app storage, so FR-016 states it as a
  requirement rather than leaving it as prose.

  The viewing half of that problem already has an owner-accepted home:
  [`reaching-my-machine`](2026-08-24-reaching-my-machine-from-the-browser.md)
  US1 reads a project's real files from a browser, and needs only to render an
  image rather than offer it as text. Worth shipping before `I-17` is scoped —
  it may turn out to be enough on its own.
- **Deliberately excluded: browsing arbitrary folders on a machine.** The owner's
  word "folder" is honoured as a list of what a conversation produced, not as a
  file browser. General machine browsing stays with [`I-11`](../Ideas.md), which
  is a different feature with different questions.
- **Deliberately excluded: editing, regenerating, or versioning produced items.**
  Asking the agent again produces a new item; there is no in-app editor.
- **Deliberately excluded: media as *input* to the model** — attaching a picture
  and having the agent look at it. That is the attachment work already specified
  elsewhere; this spec only displays what was attached.
- **Not addressed: whether the same treatment should apply outside chat** — runs
  and issues also produce files. Kept out to keep this demoable; worth revisiting
  once this ships.

## Owner review

**Reviewed:** — pending
