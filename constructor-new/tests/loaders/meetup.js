import test from "ava";
import sinon from "sinon";

import fs from "fs/promises";
import axios from "axios";

import { getMeetupEvents } from "../../src/loaders/meetup.js";

test("Get events from Meetup HTML", async (t) => {
  // Arrange
  const html = await fs.readFile(new URL("./data/meetup.html", import.meta.url));

  const stubAxiosGet = sinon.stub(axios, "get");

  stubAxiosGet
    .withArgs("https://www.meetup.com/code-party/events/123456789/ical")
    .returns({
      data:
        "BEGIN:VCALENDAR\r\n" +
        "VERSION:2.0\r\n" +
        "PRODID:-//sebbo.net//ical-generator//EN\r\n" +
        "BEGIN:VEVENT\r\n" +
        "UID:meetupEventId\r\n" +
        "SEQUENCE:0\r\n" +
        "DTSTAMP:20210816T001542Z\r\n" +
        "DTSTART:20210816T001542Z\r\n" +
        "DTEND:20210816T011542Z\r\n" +
        "SUMMARY:MeetupEvent\r\n" +
        "END:VEVENT\r\n" +
        "END:VCALENDAR",
    });

  stubAxiosGet
    .withArgs("https://www.meetup.com/brum-calendar-constructor-club/events/012101210")
    .returns({ data: "oops bad data! this won't parse" });

  // Act
  const events = await getMeetupEvents(html);

  // Assert
  t.is(events.length, 1);
  t.is(events[0].source, "meetup");
  t.is(events[0].icsData["meetupEventId"].summary, "MeetupEvent");
});
