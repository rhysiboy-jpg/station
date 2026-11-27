# Playtest checklist: prototype sandbox

_The prototype exists to answer one question: **is the layout puzzle fun?** This checklist is for a 60 to 90 minute session. Terms in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md). Spec: [prototype-sandbox.md](specs/prototype-sandbox.md)._

Write down what you **did**, what you **expected**, and what **happened**. Surprise is the most useful thing to record, whether it's good or bad. Don't fix anything mid-session: note it and keep playing.

## Before you start

- [ ] Open https://rhysiboy-jpg.github.io/station/ in a private window, so no old autosave loads.
- [ ] Note the date and the latest commit on `main` (the commit list on GitHub shows it).
- [ ] Have somewhere to take notes, and a timer.
- [ ] If someone else is playing, watch without helping. Note where they get stuck, and only step in after 2 minutes of being stuck.

## 1. Cold start (10 minutes, no guidance)

Can a new player work out the basics from the screen alone?

- [ ] Within 2 minutes, did they place a **Module**? Did the green or red preview make sense?
- [ ] Did they find **R** to rotate, and work out why a module wouldn't connect (its **Ports** must line up)?
- [ ] Did they fit internal **Equipment** in a **Slot** and external equipment on a **Hardpoint**? Was "point at the empty cell beside one" clear?
- [ ] Did they notice the red "No power" alert on the core node? Did it help or confuse them? _(open question 6)_
- [ ] Did they find the inspector by clicking a module, and the crew **+** button?
- [ ] Did they find the overlay keys (**P H O U T**) unprompted?

Notes:

## 2. Challenges, in order (40 to 50 minutes)

Start each challenge from the **Challenge** panel. Play at 1x until the station seems stable, then 10x. For each one, fill in a row:

| Challenge | Won? | Attempts | Minutes | What failed, in the game's words | Was the reason clear? (y/n) | Fun? (1 to 5) |
|---|---|---|---|---|---|---|
| Shakedown | | | | | | |
| Night shift | | | | | | |
| Cool running | | | | | | |
| Science return | | | | | | |
| Long haul | | | | | | |
| Station keeping | | | | | | |

While playing each one, watch for:

- [ ] **Night shift:** did the battery floors (labs stop at 50%) come across as a rule you could plan around, or as a surprise? Did the battery bar's floor marks and the "Off: battery below 50%" reason get noticed?
- [ ] **Cool running:** did heat build-up feel like a problem you could see coming? Was it a puzzle (where to put radiators, which connections carry heat) or just "add radiators"?
- [ ] **Science return:** did crew tending (2 racks per crew member) and antenna rate shape the layout, or was data an afterthought?
- [ ] **Long haul:** did water ever run short? With 5 and 10 kg tanks, did recycling matter? _(balance, open question 4)_
- [ ] **Station keeping:** was it winnable? How long did the build take, and was the build itself the fun part or a chore?

Notes:

## 3. Free build (15 minutes): the layout puzzle itself

Start a **New station** in free play and build something ambitious: 6 or more crew, 2 labs, and a full life support loop.

- [ ] **Packing against surface.** Did tight packing ever cost a hardpoint (shown **Blocked**) that you wanted? Did you change a layout because of it?
- [ ] **Truss.** Did hanging panels and radiators on truss away from living space feel like a real choice?
- [ ] **Bottlenecks.** Did a narrow connection (a corridor, 6 kW of power and 4 kW of heat) ever limit you? Did the red connection in the power or heat overlay show you where, and did you understand the fix?
- [ ] **Heat leakage.** Did a hot module next to a habitat ever matter?
- [ ] **Air per module.** Did crew far from the scrubber get worse air than those near it? Did that change where you put people?
- [ ] **Load shedding.** When power ran short, did the right things stop (science first, life support last)? Did the "why it's off" reasons make sense? Did whole tiers stopping per module ever feel wrong, for example all four lab racks off when two would fit? _(open question 5)_
- [ ] **Failure.** Did a module go **Offline** at least once? Did the countdown give you time to react? Did crew moving out make sense? Did it recover the way you expected?
- [ ] **Difficulty.** Try one failure on **Hard**, where an offline module cuts its **Networks**. More interesting, or just harsher?

**The judgement** (answer these honestly):

- [ ] Did where things go matter as much as what you built? Give one example where it did and one where it didn't.
- [ ] Was there a moment of "oh, I should have put that there"? Describe it.
- [ ] Did you want to rebuild a station to do it better?
- [ ] What was the most tedious part?
- [ ] At 10x, did watching it run hold your attention?

Notes:

## 4. Readability

- [ ] Could you tell every network apart by colour (power cyan, heat orange, air mint, water blue, data violet)? Was cyan for power fine, or did you miss gold? _(open question 3)_
- [ ] Did yellow and red always read as warnings, and never get confused with a network?
- [ ] Was the alerts list useful, or noise?
- [ ] Was any text in the panels hard to read, too small, or wrapped badly?
- [ ] At your screen size, did anything overlap or need scrolling that shouldn't?

Notes:

## 5. Pace and strictness

- [ ] Heat: about 1 °C per orbit for each kW of unshed heat. Too fast, too slow, or right? _(open question 4)_
- [ ] Challenges: a hold can slip for a quarter orbit (about 30 s at 1x) before failing, and a result pauses the game. Too strict or too loose? _(open question 2)_
- [ ] Starting a challenge on your current station, with building allowed during it: did that feel like cheating, or fine? Would you rather start fresh? _(open question 1)_
- [ ] Connection capacities and data rates: anything that felt arbitrary or never mattered? _(open question 4)_

Notes:

## 6. Saves and robustness

- [ ] Reload mid-game: did the station come back with "Welcome back"?
- [ ] Export a station, start a new one, then import the file: is it identical?
- [ ] Import something that isn't a save, such as any other `.json` file: is there a clear message, with the game unharmed?
- [ ] Undo after a reload does nothing (history isn't saved): did that bother you?
- [ ] Play 20 orbits or more at 10x on a big station: any slowdown or stutter? Note the module count.

Notes:

## Bugs and rough edges

| What happened | Steps to reproduce | Severity (blocker, annoying, cosmetic) |
|---|---|---|
| | | |

## After the session

- [ ] Answer the judgement: **is the layout puzzle fun?** Yes, no, or "yes if...". One paragraph.
- [ ] Update the balance changes list in [design.md](design.md) with every number that should change, and why.
- [ ] Settle the open questions above, and record any that are hard to reverse as ADRs.
- [ ] File bugs as GitHub issues.
- [ ] Decide what comes next: tuning the sandbox, designing the campaign, or revisiting Godot ([ADR 0001](adr/0001-typescript-sim-core-separate-from-rendering.md)).
