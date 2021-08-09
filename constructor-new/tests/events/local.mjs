import test from "ava";

import fs from "fs";
import sinon from "sinon";

import { getLocalEvents } from "../../src/events/local.mjs";

test("Load event iCal URLs from local JSON", async (t) => {
  // Arrange
  sinon.stub(fs.promises, "readFile").returns(
    JSON.stringify([
      {
        url: "https://github.com/BirminghamIO/calendar.birmingham.io",
        source: "sauce",
        notes: "This is a note!",
      },
    ])
  );

  // Act
  const events = await getLocalEvents();

  // Assert
  t.snapshot(events);
});
