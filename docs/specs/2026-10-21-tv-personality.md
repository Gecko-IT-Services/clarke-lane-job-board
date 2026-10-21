# A bit of personality on the TV and the shop floor (21 Oct)

Philip: "if a job is late present it with an image that represents being late and needing to hurry up; on time has a cool composed look". Agreed with him: drawn icons rather than web GIFs (always load, sharp on a big screen, nothing off-brand), subtle enough to read across the workshop, playful not mocking (customers may see the TV), office screens and anything a customer receives stay plain.

- `src/core/mood.js` (tests `tests/mood.mjs`): `jobMood()` (held, ready, late, soon, ok), `boardMood()` (the TV's line for the day: clear, calm, push for 1 to 2 late, rush for 3 or more; the same wording all day), `newDispatches()` (delivery notes made since the TV last looked; none when it first starts).
- `src/mood.js`: the animated SVG marks (stopwatch ticking, hourglass turning, sunglasses face nodding now and then, lorry rumbling, zzz, runner, steaming mug), the mood line, and the **On its way!** cheer with confetti for 10 seconds.
- TV: the mark beside each due date (the Due column is a little wider, Customer and Notes a little narrower); the mood line under the counts. Shop floor job cards: the same mark beside the due chip.
- `prefers-reduced-motion` stops all movement.
