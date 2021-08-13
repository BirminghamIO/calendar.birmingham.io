import test from "ava";
import sinon from "sinon";

import fs from "fs";
import axios from "axios";

import { getEventbriteEvents } from "../../src/events/eventbrite.js";

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

  result.icsdata = result.icsdata
    .replace(/\r/g, "")
    .replace(/DTSTAMP:\d{8}T\d{6}Z/g, "<dtstamp>");

  // Assert
  t.deepEqual(result, {
    source: "eventbrite",
    icsdata: expectedIcsData,
  });
});

const expectedIcsData = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//sebbo.net//ical-generator//EN
BEGIN:VEVENT
UID:123456123456
SEQUENCE:0
<dtstamp>
DTSTART:20210922T113000Z
DTEND:20210922T133000Z
SUMMARY:Test Event Title! Lorem ipsum dolor sit amet\\, consectetur adipisc
 ing elit\\, sed do eiusmod tempor incididunt ut labore et dolore magna aliq
 ua.
LOCATION:Online event
DESCRIPTION:Description about the test event\\, Ut enim ad minim veniam.
END:VEVENT
END:VCALENDAR
`.trim();
