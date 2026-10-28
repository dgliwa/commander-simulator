Prepare one complete seven-day Commander comic season for the current America/Chicago ISO week.

This is an autonomous scheduled workflow. Treat simulation outcomes as immutable facts. The two owned heroes are protagonists, but never protect them from losing and never rewrite a winner.

Resume before creating:
1. Derive `seasonKey` as `season-YYYY-wNN` for the current America/Chicago ISO week.
2. Call `commander_season_status`. If that key already exists, resume its `nextAction` instead of creating another season.
3. If its next action is `publish_next` or `complete`, stop successfully; daily publication owns those states.

If no season exists:
1. Call `commander_deck_list`. Select exactly two real owned hero decks: each must have `built` and must not have `generated` or `not-owned`. Prefer a pair not used by the latest season. Do not alter their tags.
2. Call `magic_moxfield_registry_list` with tag `season:<seasonKey>` (for example `season:season-2026-w44`) to find decks from an interrupted attempt. Reuse valid generated/not-owned decks from this week before creating more.
3. Until exactly four generated opponent decks exist, create them one at a time:
   - Call `magic_commander_random`. Reroll cards requiring Partner, Friends forever, Doctor's companion, Choose a Background, or a Background; use a single self-contained commander.
   - Choose a mechanically natural but narratively distinct theme without waiting for user input.
   - Call `magic_commander_theme_search` with confirmed=true, one established tier near $125, and role-specific searches covering mana/ramp, lands, draw, interaction, protection, recursion, theme enablers, payoffs, and win conditions.
   - Construct one complete legal 100-card list: one commander plus 99 mainboard cards. Use basic lands to finish the mana base. Do not include cards outside the returned color identity. Avoid duplicate nonbasic cards.
   - Call `magic_commander_deck_validate`. Repair every reported error and validate again. Never save an invalid list.
   - Call `magic_generated_deck_save` with confirmed=true and the current season key. Its mandatory `generated` and `not-owned` tags distinguish the synthetic deck from real owned decks.
4. Invent a concise weekly story title based on the six commanders. Call `commander_season_create` with the two owned IDs and four generated IDs.

Simulation:
1. Call `commander_season_simulate_next` exactly until seven games are stored. Stop and report if a call returns stored=false twice for the same game.
2. The service rotates every opponent pair through games 1-6 and chooses the two strongest opponents for game 7. Do not create independent pods or rerun stored games.
3. After all games, call `commander_run_log` for every stored run. Page through each log until `hasMore` is false. Preserve winners, eliminations, important casts, attacks, blocks, removal, sacrifice, recursion, commander damage, and reversals.

Whole-season planning:
1. Create the full arc only after reading all seven factual logs.
2. Call `commander_season_plan` once with exactly days 1-7 and 3 pages per day, 4-6 panels per page.
3. Use this dramatic progression: introduction, first rivalry, setback/discovery, midpoint reversal, consequences/alliances, approach to finale, finale/aftermath.
4. Bind day N to game N. Every page needs at least one concrete factual `gameplayCue` from that run and every episode needs at least two visibly distinct settings.
5. Write one detailed continuity guide reused verbatim across all seven episodes. Define exact visual appearance, silhouette, clothing, equipment, scale, color accents, voice, injuries, recurring locations, weather progression, and props for all six commanders. The renderer locks medium and background style by season automatically.
6. `personaDirections` for an episode must include that game's four participants and use commander names—not deck names—as acting characters.
7. Keep all published prose entirely in-world. Translate cards, spells, and mechanics into natural actions, magic, and consequences. Optionally add sparse, cheeky Easter eggs with natural double meanings—such as tapping out, counters, a stack of reactions, returning from a graveyard, command, or an improbably timely draw. Each reference must still work for a reader who misses it. Never explain the story as a game or overtly refer to players, turns, decks, episodes, Commander, Magic: The Gathering, or the publication schedule in titles, dialogue, or captions.
8. If both heroes lose the finale, write an honest tragic, bittersweet, or legacy-centered ending. Never convert defeat into victory.
9. Storing the plan automatically queues one full-bleed season cover using the locked continuity and art direction.

Finish with a concise season-prepared summary: title, heroes, four generated opponents, seven winners, cover status, and confirmation that seven episodes are stored. Do not publish episode 1; the daily job owns episode publication.
