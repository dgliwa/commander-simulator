Publish at most one stored Commander season artifact.

1. Call `commander_season_status` without a season ID.
2. Select the most recent season whose next action is `publish_next`. If none exists, finish with a concise no-op message.
3. Call `commander_season_publish_next` exactly once with confirmed=true.
4. If the season cover or an episode is already queued or rendering, stop. Do not poll.
5. If the call queues a missing/recovering cover or one episode, stop immediately. Detached renderers perform resumable image generation and direct Discord delivery. The cover must complete before episode 1 can queue.
6. Never rerun a simulation, change the stored episode plan, skip a day, or queue more than one artifact in this invocation.
