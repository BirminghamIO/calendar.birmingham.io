import test from "ava";
import sinon from "sinon";

import fs from "fs";
import axios from "axios";

import { getLocalEvents } from "../../src/loaders/local.js";

test("Load event iCal URLs from local JSON", async (t) => {
  // Arrange
  sinon.stub(fs.promises, "readFile").returns(
    JSON.stringify([
      {
        url: "https://example.com/calendar",
        source: "sauce",
        notes: "This is a note!",
      },
    ])
  );

  sinon
    .stub(axios, "get")
    .withArgs("https://example.com/calendar")
    .returns({
      data:
        "BEGIN:VCALENDAR\r\n" +
        "VERSION:2.0\r\n" +
        "PRODID:-//sebbo.net//ical-generator//EN\r\n" +
        "BEGIN:VEVENT\r\n" +
        "UID:eventID\r\n" +
        "SEQUENCE:0\r\n" +
        "DTSTAMP:20210815T001542Z\r\n" +
        "DTSTART:20210815T001542Z\r\n" +
        "DTEND:20210815T011542Z\r\n" +
        "SUMMARY:Example\r\n" +
        "END:VEVENT\r\n" +
        "END:VCALENDAR",
    });

  // Act
  const events = await getLocalEvents();

  // Assert
  // TODO: Write a "compare ICS data" function reusable between tests
  t.is(events.length, 1);
  t.is(events[0].source, "sauce");

  t.is(events[0].icsData.hasOwnProperty("eventID"), true);

  const event = events[0].icsData["eventID"];
  t.is(event.summary, "Example");
  t.is(event.type, "VEVENT");
});
