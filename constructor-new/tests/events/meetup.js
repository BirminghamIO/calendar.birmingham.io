import test from "ava";

import fs from "fs/promises";

import { getMeetupEvents } from "../../src/events/meetup.js";

test("Get events from Meetup HTML", async (t) => {
  // Arrange
  const html = await fs.readFile(new URL("./data/meetup.html", import.meta.url));

  // Act
  const events = await getMeetupEvents(html);

  // Assert
  t.is(events.length, 2);

  t.deepEqual(events, [
    {
      source: "meetup",
      url: "https://www.meetup.com/code-party/events/123456789ical/t.ics",
    },
    {
      source: "meetup",
      url: "https://www.meetup.com/brum-calendar-constructor-club/events/012101210ical/t.ics",
    },
  ]);
});
