# Nova – onboarding experiment (master's thesis)

An online experiment that tests how **pre-set defaults** and the **wording (framing)** of a privacy setting change whether people agree to let an AI assistant use their chats for model training.

Participants go through the realistic set-up of **Nova**, a fictional AI assistant. Near the end of the set-up they see one setting about using their chats to train Nova's AI models. Its default and its wording depend on the condition they were assigned to. Afterwards they answer a short questionnaire.

The study runs in the browser. A small Python server delivers the pages and saves the responses. It uses only the Python standard library, so there is nothing to install.

---

## Quick start

Requirement: Python 3.8 or newer.

```bash
python serve.py
```

This opens the study at <http://localhost:8000/?debug> (on Windows use `py serve.py`). Stop the server with `Ctrl+C`.

| URL | What you get |
|---|---|
| `http://localhost:8000` | The study exactly as a participant sees it |
| `http://localhost:8000/?debug` | The same study with a debug bar: shows the condition and lets you jump to any screen |
| `http://localhost:8000/?debug&cond=3` | Forces condition 3 (any of 1–6) |

The study only works through `serve.py`. Opening `index.html` by double-click does not work, because browsers don't load `content.json` from a local file.

---

## Experimental design

The design crosses two factors:

| Factor | Levels |
|---|---|
| **Default** | *opt-in*: sharing is switched off by default · *opt-out*: sharing is switched on by default · *active choice*: nothing is pre-selected and the participant must pick an option |
| **Frame** | *gain*: "Allow the use of your chats … to train and improve Nova AI models" · *loss*: "Do not allow the use of your chats … to train and improve Nova AI models" |

This gives six conditions, all defined in `content.json` → `conditions.list`:

| ID | Condition | Control shown |
|---|---|---|
| 1 | opt-in × gain | On/off switch |
| 2 | opt-in × loss | On/off switch |
| 3 | opt-out × gain | On/off switch |
| 4 | opt-out × loss | On/off switch |
| 5 | active choice × gain | Two buttons ("Allow" / "Don't allow") |
| 6 | active choice × loss | Two buttons ("Yes, don't allow" / "No") |

**Currently active: conditions 1–4**, i.e. a 2 × 2 design (default × frame). The list `conditions.active` in `content.json` controls which conditions participants can be assigned to. Each participant is assigned one of them at random, with equal probability.

How the switch maps to consent: in the gain frame, switch **on** means the participant shares their chats. In the loss frame the sentence is negated, so switch **on** means they do **not** share. The app handles this mapping and stores the actual decision as `consent_to_share`. A small "On"/"Off" label under the switch shows its current state.

---

## Participant flow

| # | Screen ID | Content |
|---|---|---|
| – | `study_intro` | Study information and consent to take part |
| 1 | `scenario` | Role-play instruction: "Imagine you have decided to try Nova AI …" |
| 2 | `register` | Enter an email address |
| 3 | `verify` | Enter a verification code. A pop-up in the top-right corner shows the code, and only that code is accepted |
| 4 | `terms` | Accept the terms (required) and promotional emails (optional) |
| 5 | `birthday` | Date of birth |
| 6 | `name` | Name |
| 7 | `role` | Kind of work (can be skipped) |
| 8 | `usage` | Personal use or with a team |
| 9 | `treatment` | **Experimental manipulation:** "Before your first chat", with two information rows and the data-use setting |
| 10 | `all_set` | "Almost done!", then on to the questionnaire |
| – | `questionnaire` | Questions about the set-up, plus demographics |
| – | `debrief` | Explains that Nova is fictional and what the study examined. The response is saved when this screen appears |

Screens 1–10 imitate a real app's onboarding, so the privacy setting appears in a realistic context rather than as an isolated survey question.

---

## Data

### What is stored

When a participant reaches the debrief screen, `serve.py` saves:

- `data/<participant_id>.json`: the full record of that participant
- one row in `data/responses.csv`: a summary of all participants, ready for R, SPSS or Excel

**Not stored:** anything typed into the fake sign-up (email, verification code, birthday, name). Form fields whose names start with `_` are never saved.

**`data/` is excluded from git** (see `.gitignore`), so responses stay on the machine that runs the server and never end up in this repository.

### Variables

| Variable | Meaning |
|---|---|
| `participant_id` | Random anonymous ID |
| `condition_id`, `condition_label`, `default_share`, `frame`, `ui` | Assigned condition |
| `forced_condition` | `true` if the condition was forced via `?cond=` (testing only, exclude these rows) |
| `started_at`, `finished_at` | Timestamps (UTC) |
| **`decision.consent_to_share`** | **Main dependent variable:** `true` = allows chats to be used for training |
| `decision.changed_default` | `true` if the participant left the default (switch conditions only) |
| `decision.toggle_initial`, `decision.toggle_final` | Switch position before and after (on = `true`); its meaning depends on the frame |
| `decision.toggle_changes` | How often the switch was flipped |
| `decision.choice` | Button picked in the active-choice conditions (`yes` / `no`) |
| `decision.learn_more_clicks` | Clicks on "Learn more" next to the setting |
| `decision.first_interaction_ms` | Time from opening the treatment screen to the first interaction with the setting (including "Learn more") |
| `decision.decision_time_ms` | Total time spent on the treatment screen |
| `onboarding.*` | Answers given during set-up: `study_consent`, `promo_emails`, `role`, `usage` |
| `answers.*` | Questionnaire answers |
| `screen_order`, `screen_times_ms` | Screens visited and time per screen (JSON file only) |
| `user_agent`, `screen_size` | Browser and screen size |

---

## Repository structure

```
├── index.html      All screens, in the order participants see them (layout only, no texts)
├── content.json    ALL texts, the conditions and the questionnaire – edit this file to change wording
├── js/app.js       Flow logic: condition assignment, navigation, recording the decision, saving
├── css/style.css   Visual design
├── serve.py        Local web server that also saves responses to data/
├── assets/         Place for images (currently empty)
└── data/           Collected responses (created automatically, not in git)
```

### Common changes

- **Change wording:** edit `content.json`. Placeholders such as `{brand}` and `{email}` are filled in automatically.
- **Change which conditions run:** edit `conditions.active` in `content.json`, for example `[1, 2, 3, 4, 5, 6]` for the full 3 × 2 design.
- **Add or change questionnaire items:** edit the `questionnaire` list in `content.json`. Supported types are `radio`, `likert`, `number`, `select` and `text`.
- **Remove a screen:** delete its `<section class="screen">` block in `index.html`.

---

## Status / open points

- [ ] Questionnaire items are still placeholders (`[TODO]`: manipulation check, trust item)
- [ ] Debrief text (`[TODO]`)
- [ ] "Learn more" explanation on the treatment screen (`[TODO]`)
- [ ] Data deletion date in the study information ("(date)")
- [ ] Hosting for real participants: responses are only saved when the study runs through `serve.py`. A static host such as GitHub Pages would show the study but not save any data.
