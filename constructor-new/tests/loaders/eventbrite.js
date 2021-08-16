import test from "ava";
import sinon from "sinon";

import fs from "fs";
import axios from "axios";

import { getEventbriteEvents } from "../../src/loaders/eventbrite.js";

const eventsListPage = fs
  .readFileSync(new URL("./data/eventbrite-events-list.html", import.meta.url))
  .toString();

const eventbriteEventPage = fs
  .readFileSync(new URL("./data/eventbrite-event-page.html", import.meta.url))
  .toString();

test("Get events from Eventbrite HTML", async (t) => {
  // Arrange
  sinon.stub(fs.promises, "readFile").returns(
    JSON.stringify([
      {
        id: "0123456789",
        name: "Test Organiser",
        link: "http://www.eventbrite.co.uk/o/test-organiser",
      },
    ])
  );

  const stub = sinon.stub(axios, "get");
  stub
    .withArgs("http://www.eventbrite.co.uk/o/test-organiser")
    .returns({ data: eventsListPage });
  stub
    .withArgs("https://www.eventbrite.co.uk/e/test-event")
    .returns({ data: eventbriteEventPage });

  // Act
  const result = await getEventbriteEvents();

  const eventKey = "123456123456";
  const event = result.icsData[eventKey];

  // Assert
  t.is(result.source, "eventbrite");

  t.is(event.type, "VEVENT");
  t.is(event.params.length, 0);
  t.is(event.uid, eventKey);
  t.is(event.sequence, "0");
  t.is(event.start.toISOString(), "2021-09-22T11:30:00.000Z");
  t.is(event.end.toISOString(), "2021-09-22T13:30:00.000Z");
  t.is(
    event.summary,
    "Test Event Title! Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
  );
  t.is(event.location, "Online event");
  t.is(event.description, "Description about the test event, Ut enim ad minim veniam.");
});
