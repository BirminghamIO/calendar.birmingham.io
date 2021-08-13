import test from "ava";
import sinon from "sinon";

import fs from "fs";

import { getLocalEvents } from "../../src/events/local.js";

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
  t.deepEqual(events, [
    {
      source: "sauce",
      url: "https://github.com/BirminghamIO/calendar.birmingham.io",
    },
  ]);
});
