var ical = require("ical"), // parser
    icalendar = require("icalendar"), // generator
    async = require("async"),
    request = require("request"),
    config = require("./config"),
    googleapis = require('googleapis'),
    crypto = require("crypto"),
    moment = require("moment-range"),
    fs = require("fs"),
    time = require("time"),
    Handlebars = require("handlebars"),
    logger = require("js-logger"),
    cliArgs = require("command-line-args");

// Command line arguments
var cli = cliArgs([
    { name: "help", type: Boolean, alias: "h", description: "show usage" },
    { name: "quiet", type: Boolean, alias: "q", description: "Only show errors" },
    { name: "verbose", type: Boolean, alias: "v", description: "verbose (show warnings)"},
    { name: "debug", type: Boolean, alias: "d", description: "Show all messages"},
    { name: "dryrun", type: Boolean, alias: "r",
        description: "Dry run: fetch all sources and print results, but do not update the actual calendar"}
]);
var argv = cli.parse();
if(argv.help) {
    console.log(cli.getUsage());
    process.exit(0);
}

var IS_DRY_RUN = false;

logger.useDefaults();
logger.setLevel(logger.WARN); //default level (on stderr)
if(argv.quiet)
    logger.setLevel(logger.ERROR); // (on stderr)
if(argv.verbose)
    logger.setLevel(logger.INFO); // (on stdout)
if(argv.debug) {
    logger.setLevel(logger.DEBUG); // (on stdout)
    console.log(argv);
}
if (argv.dryrun) {
    IS_DRY_RUN = true;
}

/* Override the ical library's RRULE parser because Google Calendar doesn't
   want parsed rrules, it wants an unparsed string, so we stash the unparsed
   string on the object so we can get at it later. */
var existing_rrule_handler = ical.objectHandlers.RRULE;
ical.objectHandlers.RRULE = function(val, params, curr, stack, line) {
    if (curr.unparsed_rrules) {
        curr.unparsed_rrules.push(line);
    } else {
        curr.unparsed_rrules = [line];
    }
    return existing_rrule_handler(val, params, curr, stack, line);
};

/* Google */
var SERVICE_ACCOUNT_EMAIL = '721976846481-1s5altpg8afuc4opnlr13nua86hg0ul9@developer.gserviceaccount.com';
var SERVICE_ACCOUNT_KEY_FILE = './key.pem';
var GOOGLE_CALENDAR_ID = 'movdt8poi0t3gfedfd80u1kcak@group.calendar.google.com';
var jwt = new googleapis.auth.JWT(
        SERVICE_ACCOUNT_EMAIL,
        SERVICE_ACCOUNT_KEY_FILE,
        null,
        ['https://www.googleapis.com/auth/calendar']);
var gcal = googleapis.calendar('v3');

/* Birmingham */
var LOCATION_LAT = "52.483056";
var LOCATION_LONG = "-1.893611";
var LOCATION_RADIUS = "5"; /* in miles */

/* Meetup */
var MEETUP_KEY = config.MEETUPKEY;
var MEETUP_URL = "https://api.meetup.com/find/groups?" +
                    "&sign=true" +
                    "&photo-host=public" +
                    "&category=34" + /* Technology */
                    "&lat=" + LOCATION_LAT +
                    "&lon=" + LOCATION_LONG +
                    "&radius=" + LOCATION_RADIUS +
                    "&page=4000" + /* results per page */
                    "&key=";

var tz = new time.Date();
var TIMEZONE = tz.getTimezone();

/* FetchIcalUrls functions have to return a list of {source, url} objects.
   A source must be a short word which identifies the source somehow
   (for example, "meetup" for meetup iCal files) -- it is used to make sure
   that IDs from different sources don't collide. For boring technical reasons 
   (https://developers.google.com/google-apps/calendar/v3/reference/events#id)
   the source must also contain only characters 0-9 and a-v (not a-z, and not
   capital letters). 

   NOTE: a source is expected and required to provide UIDs for each event, and
   those UIDs must be both unique in that source and unchanging over time; if
   we request data from that source again later and one of the events that comes
   back was in this fetch too, then it must have the same UID. Otherwise it will
   be duplicated in the b.io calendar. Any source which does not enforce this is
   stupid, but if it does, it is your responsibility to provide a URL which *does*
   enforce it.
*/

function fetchIcalUrlsFromLocalFile(cb) {
    var fn = "explicitIcalUrls.json";
    logger.info("Reading local file of iCals: " + fn);
    fs.readFile(fn, function(err, data) {
        if (err) {
            logger.error("Failed to read local file of icals", fn);
            cb(null, []);
            return;
        }
        var j;
        try {
            j = JSON.parse(data);
        } catch(e) {
            logger.error("Failed to read local file of icals", fn, e);
            cb(null, []);
            return;
        }
        var urls = [];
        j.forEach(function(item) {
            urls.push({source: item.source, url: item.url});
        });
        cb(null, urls);
    });
}

function fetchIcalUrlsFromMeetup(cb) {
    if(MEETUP_URL && MEETUP_KEY) {
        var reqOptions = {
            url: MEETUP_URL + MEETUP_KEY,
            headers: {
                Accept: "application/json"
            }
        };
        var req = request(reqOptions, function(err, response, body) {
            if (err) {
                logger.error("Meetup: Error connecting:", err);
                cb(null, []);
                return;
            }
            else if (response.statusCode != 200) {
                logger.error("Meetup: HTTP error code:", response.statusCode);
                logger.info(body);
                cb(null, []);
                return;
            }
            else {
                try {
                    results = JSON.parse(body);
                    if (results.length === 0) {
                        logger.warn("Meetup: Warning: no results received:");
                    }
                    urls = [];
                    for (var result in results) {
                        urls.push({source: "meetup", url: results[result].link + "events/ical/"});
                    }
                    cb(null, urls);
                } catch(e) {
                    logger.error("Meetup: Error parsing JSON:", e);
                    cb(null, []);
                    return;
                }
            }
        });
    }
    else {
        logger.warn("Meetup: No MEETUP_URL and/or MEETUP_KEY found in config");
        cb(null, []);
        return;
    }
}

function fetchICSFromEventBrite(cb) {
    logger.info("Searching Eventbrite for matching events");
    var evurl = "https://www.eventbriteapi.com/v3/events/search/?" +
        "organizer.id=ORG" +
        "&token=" + config.EVENTBRITE_TOKEN +
        "&location.latitude=" + LOCATION_LAT +
        "&location.longitude=" + LOCATION_LONG +
        "&location.within=" + LOCATION_RADIUS + "mi" +
        "&format=json";
    var fn = "explicitEventBriteOrganisers.json";
    fs.readFile(fn, function(err, data) {
        if (err) {
            logger.warn("Failed to read local file of EventBrite organisers", fn);
            cb(null, []);
            return;
        }
        var j;
        try {
            j = JSON.parse(data);
        } catch(e) {
            logger.error("Failed to read local file of EventBrite organisers", fn, e);
            cb(null, []);
            return;
        }
        async.map(j, function(eborg, cb) {
            var url = evurl.replace("ORG", eborg.id);
            request.get(url, function(err, response) {
                if (err) return cb(err);
                // we now have a collection of eventbrite events. Turn them into ICS.
                // this seems a bit stupid, since we're just going to have to parse the ICS data
                // back into objects later, but it means that the core functionality continues
                // as normal, and also that we know we're not relying on weird EB-specific stuff
                // which doesn't fit into an ICS format.
                var obj;
                try {
                    obj = JSON.parse(response.body);
                } catch(e) {
                    return cb(e);
                }
                if (!obj.events || !Array.isArray(obj.events)) {
                    logger.warn("EventBrite: we didn't get any events");
                    if (obj.error) logger.error("EventBrite: We got an error response", obj.error, obj.error_description);
                    return cb(null, {
                        source: "eventbrite",
                        // something broke, so return an empty ical
                        icsdata: "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//wp-events-plugin.com//5.53//EN\nEND:VCALENDAR\n"
                    });
                }
                var ics = new icalendar.iCalendar();
                obj.events.forEach(function(ebev) {
                    var ev = ics.addComponent('VEVENT');
                    ev.setSummary(ebev.name.text);
                    var start = new Date(), end = new Date();
                    start.setTime(Date.parse(ebev.start.utc));
                    end.setTime(Date.parse(ebev.end.utc));
                    ev.setDate(start, end);
                    if(ebev.venue) {
                        var ven = ebev.venue.name;
                        if (ebev.venue.address) {
                            var addr = [ebev.venue.address.address_1, ebev.venue.address.address_2, ebev.venue.address.city, 
                                ebev.venue.address.postal_code].filter(function(x) { return x; });
                            ven += " (" + addr.join(", ") + ")";
                        }
                        ev.setLocation(ven);
                    }
                    ev.addProperty("DESCRIPTION", ebev.description.text + "\n" + ebev.url);
                    ev.addProperty("UID", ebev.id);
                });

                cb(null, {source: "eventbrite", icsdata: ics.toString()});
            });
        }, function(err, results) {
            cb(err, results);
        });

    });
}

var renderWebsite = function(events, done) {
    var now = moment();
    var ne = [];
    events.forEach(function(ev) {
        ev.start_parsed = moment(ev.start.dateTime);
        logger.info(ev.summary, ev.start_parsed.toString(), ev.start.dateTime);
        ev.end_parsed = moment(ev.end.dateTime);
        ev.date_as_str = ev.start_parsed.format("ha") + "&ndash;" + ev.end_parsed.format("ha") + " " +
            ev.start_parsed.format("ddd Do MMM");
        ev.dateparts = {};
        ev.url_escaped_location = encodeURIComponent(ev.location);
        if (ev.start_parsed.diff(now, "hours") < -1) {
            // discard
        } else if (ev.status == "cancelled") {
            // discard
        } else {
            ne.push(ev);
        }
    });
    events = ne;
    events.sort(function(a,b) {
        if (b.start.dateTime < a.start.dateTime) { return 1; }
        if (b.start.dateTime > a.start.dateTime) { return -1; }
        return 0;
    });

    var next_midnight = moment().endOf("day"), next_week = moment().add(7, 'days');
    if (next_midnight.diff(now, "hours") > -3) {
        // the next midnight is less than three hours away (it's after 9pm), so get the one after that
        next_midnight = next_midnight.add(1, "days");
    }

    fs.readFile("./templates/index.handlebars", function(err, tplsrc) {
        if (err) { return done(err); }
        Handlebars.registerHelper('breaklines_linkify', function(text) {
            if (text) text = text.replace(/&nbsp;/g, ' ');
            text = Handlebars.Utils.escapeExpression(text);
            text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
            text = text.replace(/(https?:\/\/\S+)/gi, function (s) {
                return '<a href="' + s + '">' + s + '</a>';
            });
            text = text.replace(/(^|\s)(@(\w+))/gi, function (whole, beforespace, twitterhandle, twitterhandleword) {
                return '<a href="http://twitter.com/' + twitterhandleword + '">' + twitterhandle + '</a>';
            });
            text = text.replace(/(^|[^&])#(\w+)/gi, function (s) {
                return '<a href="http://search.twitter.com/search?q=' + s.replace(/#/,'%23') + '">' + s + '</a>';
            });
            return new Handlebars.SafeString(text);
        });
        Handlebars.registerHelper('datepart', function(fmt) {
            return this.start_parsed.format(fmt);
        });
        Handlebars.registerHelper('enddatepart', function(fmt) {
            return this.end_parsed.format(fmt);
        });
        var tpl = Handlebars.compile(tplsrc.toString());
        var idxhtml = tpl({
            upcoming: events.filter(function(ev) { return ev.start_parsed.diff(next_midnight) < 0; }),
            thisweek: events.filter(function(ev) { 
                return ev.start_parsed.diff(next_midnight) >= 0 && ev.start_parsed.diff(next_week) < 0; 
            }),
            remaining: events.filter(function(ev) { return ev.start_parsed.diff(next_week) >= 0; }).length
        });
        var tw = [];
        events.filter(function(ev) { 
                return ev.start_parsed.diff(next_midnight) >= 0 && ev.start_parsed.diff(next_week) < 0; 
            }).forEach(function(ev) {
                tw.push(ev.summary + " | " + ev.date_as_str);
            });
        fs.writeFile("../website/index.html", idxhtml, function(err) {
            if (err) { return done(err); }
            done();
        });
    });

};

var getEventsFromGCal = function(CACHEFILE, done) {
    jwt.authorize(function(err, tokens) {
        if (err) { return done(err); }
        var gcal = googleapis.calendar('v3');
        /* Get list of events, which may be in multiple pages */
        var events = [];
        var week_ago = moment().subtract(7, 'days');
        var fortnight_away = moment().add(14, 'days');

        function getListOfEvents(cb, nextPageToken) {
            var params = {auth: jwt, calendarId: GOOGLE_CALENDAR_ID, showDeleted: true, 
                singleEvents: true, 
                timeMin: week_ago.format(),
                timeMax: fortnight_away.format()
            };
            if (nextPageToken) { params.pageToken = nextPageToken; }
            gcal.events.list(params, function(err, resp) {
                if (err) { return done(err); }
                events = events.concat(resp.items);
                if (resp.nextPageToken) {
                    getListOfEvents(cb, resp.nextPageToken);
                } else {
                    cb(events);
                }
            });
        }

        getListOfEvents(function(events) {
            fs.writeFile(CACHEFILE, JSON.stringify(events), function(err) {
                if (err) { console.warn("Couldn't write cache file", err); }
                renderWebsite(events, done);
            });
        });
    });
};

exports.createWebsite = function(done) {
    // if there's a cache file locally and it's less than 50 minutes old, use it
    var CACHEFILE = "./events.json.cache";
    fs.stat(CACHEFILE, function(err, stats) {
        if (!err && ((new Date()).getTime() - stats.mtime.getTime()) < 3000000) {
            fs.readFile(CACHEFILE, function(err, data) {
                if (err) {
                    logger.warn("Tried to read cachefile", CACHEFILE, "and couldn't because", err);
                    getEventsFromGCal(CACHEFILE, done);
                    return;
                }
                var events;
                try {
                    events = JSON.parse(data);
                } catch(e) {
                    logger.warn("Cachefile was not valid JSON:", e);
                    getEventsFromGCal(CACHEFILE, done);
                    return;
                }
                logger.info("Read events from cache");
                renderWebsite(events, done);
            });
        } else {
            getEventsFromGCal(CACHEFILE, done);
        }
    });
};

function deduper(existingUndeleted, results, callback) {
    /* Deduplication. Some people put their events in more than one calendar,
       and this means that they'll show up twice in our calendar. Sadly, they
       do not tend to put in the exact same record in multiple calendars; indeed,
       they're often not even consistent about start and end times. So, we
       consider two events to be the same thing if they have the same name *and*
       they overlap in time. */
    logger.info("Dedupe checker");
    var events_and_times = {};
    for (var bioid in existingUndeleted) {
        events_and_times[bioid] = {
            bioid: bioid,
            start: moment(existingUndeleted[bioid].start.dateTime),
            end: moment(existingUndeleted[bioid].end.dateTime),
            title: existingUndeleted[bioid].summary,
            source: "google",
            description: existingUndeleted[bioid].description || "",
            location: existingUndeleted[bioid].location || "",
            toString: function() {
                return "[Google event '" + this.title + "' (" + this.start.format("YYMMDD-HHmm") + "), " + this.bioid;
            }
        };
    }
    results.forEach(function(r) {
        // ignore events already in the google calendar for dupe checking
        if (existingUndeleted[r.birminghamIOCalendarID]) return;

        events_and_times[r.birminghamIOCalendarID] = {
            bioid: r.birminghamIOCalendarID,
            start: moment(r.start), end: moment(r.end),
            title: r.summary, source: "new", event: r,
            description: r.description || "",
            location: r.location || "",
            toString: function() {
                return "[Feed event '" + this.title + "' (" + this.start.format("YYMMDD-HHmm") + "), " + this.bioid;
            }
        };
    });
    /* We have a dict of events, keyed on bioid, with start and end times.
       Find any "duplicates" in this list and throw one of them away.
       Note that if we fetch an event from the feeds and this event was in the
       feeds last time we ran (so it's in Google), then that is not a duplicate;
       we already take care of that by updating the Google event with the details
       from the feed event. This is where the event record seems to be referring
       to an event we already have, BUT has a different ID. This normally happens
       when an event is in two feeds, but can also happen if an upstream feed
       changes the ID of an event, which isn't supposed to happen. */
    var new_events_throw_away_as_dupes = {};
    var google_throw_away_as_dupes = {};

    /* Deduping every event against every other event takes *ages*. Since duplicate events must overlap,
       we break up the Big List Of Events into a bunch of separate sublists, one per week. We then process
       one sublist at a time and dedupe each event in that sublist against other events in that sublist,
       which is a lot, lot faster. */

    var events_and_times_by_week = {};
    for (var thisbioid in events_and_times) {
        var week_year = events_and_times[thisbioid].start.week() + "w" + events_and_times[thisbioid].start.year();
        if (!events_and_times_by_week[week_year]) { events_and_times_by_week[week_year] = {}; }
        events_and_times_by_week[week_year][thisbioid] = events_and_times[thisbioid];
    }

    for (var wy in events_and_times_by_week) {
        var this_events_and_times = events_and_times_by_week[wy];
        logger.debug("Processing events in week", wy);

        for (var thisbioid in this_events_and_times) {
            var trn = moment().range(events_and_times[thisbioid].start,
                                    events_and_times[thisbioid].end),
                ts = events_and_times[thisbioid].title,
                tl = events_and_times[thisbioid].location,
                td = events_and_times[thisbioid].description;
            for (var otherbioid in this_events_and_times) {
                if (otherbioid == thisbioid) {
                    continue;
                }
                var orn = moment().range(events_and_times[otherbioid].start,
                                         events_and_times[otherbioid].end),
                    os = events_and_times[otherbioid].title,
                    ol = events_and_times[otherbioid].location,
                    od = events_and_times[otherbioid].description;

                if (trn.overlaps(orn) && ts == os) {

                    if (events_and_times[thisbioid].source == "google" && 
                        events_and_times[otherbioid].source == "google") {
                        /* console.log("Google 2 Google duplicates:");
                        console.log(thisbioid, events_and_times[thisbioid].title);
                        console.log(events_and_times[thisbioid].start.toString(),
                            events_and_times[thisbioid].end.toString());
                        console.log("-----------------------");
                        console.log(otherbioid, events_and_times[otherbioid].title);
                        console.log(events_and_times[otherbioid].start.toString(),
                            events_and_times[otherbioid].end.toString());
                        console.log("=======================\n"); */

                        /* two events, dupes of one another, both in Google.
                           We need to explicitly delete one of them. */

                        // first, check in case we've already thrown away one of these
                        if (events_and_times[thisbioid].title == "Tech Wednesday" &&
                            events_and_times[otherbioid].title == "Tech Wednesday") {
                        }
                        if (google_throw_away_as_dupes[thisbioid] || 
                            google_throw_away_as_dupes[otherbioid]) {
                            // we have, so don't do anything
                            if (events_and_times[thisbioid].title == "Tech Wednesday" &&
                                events_and_times[otherbioid].title == "Tech Wednesday") {
                            }
                        } else {
                            /* check description and location and throw away the shorter one.
                               check location first, because descriptions are likely to vary only
                               in small parts, where locations are often a useful one
                               "53 The Glebe, Orpington, G1R 0AA" and a crap one "G1R 0AA" */
                            if (ol.length > tl.length) {
                                google_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            } else if (tl.length > ol.length) {
                                google_throw_away_as_dupes[otherbioid] = events_and_times[otherbioid];
                            } else if (od.length > td.length) {
                                google_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            } else if (td.length > od.length) {
                                google_throw_away_as_dupes[otherbioid] = events_and_times[otherbioid];
                            } else {
                                // both the same. arbitrarily throw away this one
                                google_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            }
                        }

                    } else if (events_and_times[thisbioid].source == "new" && 
                        events_and_times[otherbioid].source == "new") {
                        /* two events, both in the newly-fetched set, dupes of one another.
                           Choose which one looks best and throw the other away.
                           if one is already thrown away, then don't do anything. */
                        //console.log("New 2 new duplicates:");
                        if (new_events_throw_away_as_dupes[thisbioid]) {
                            //console.log("we've already thrown away", thisbioid);
                        } else if (new_events_throw_away_as_dupes[otherbioid]) {
                            //console.log("we've already thrown away", otherbioid);
                        } else {
                            // choose one to throw away
                            if (ol.length > tl.length) {
                                new_events_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            } else if (tl.length > ol.length) {
                                new_events_throw_away_as_dupes[otherbioid] = events_and_times[otherbioid];
                            } else if (od.length > td.length) {
                                new_events_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            } else if (td.length > od.length) {
                                new_events_throw_away_as_dupes[otherbioid] = events_and_times[otherbioid];
                            } else {
                                // both the same. arbitrarily throw away this one
                                new_events_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            }
                        }
                        //console.log("=======================\n");
                    } else {
                        /* two events, one new, one in gcal already, dupes of one another
                           (but, importantly, not the *same* event from the same source,
                           because they have different bioIDs. This is where we've already
                           got this meeting in the calendar from, say, meetup, and then
                           it shows up new in, say, InnoBham calendar.)
                           Throw away the new one. */
                        if (events_and_times[thisbioid].source == "new") {
                            new_events_throw_away_as_dupes[thisbioid] = events_and_times[thisbioid];
                            //console.log("Throwing away this");
                        } else {
                            new_events_throw_away_as_dupes[otherbioid] = events_and_times[otherbioid];
                            //console.log("Throwing away other");
                        }
                        /*
                        console.log("New 2 new duplicates:");
                        console.log("-----------------------");
                        console.log(thisbioid, events_and_times[thisbioid].title);
                        console.log(events_and_times[thisbioid].start.toString(),
                            events_and_times[thisbioid].end.toString());
                        console.log("-----------------------");
                        console.log(otherbioid, events_and_times[otherbioid].title);
                        console.log(events_and_times[otherbioid].start.toString(),
                            events_and_times[otherbioid].end.toString());
                        console.log("=======================\n");
                        */
                    }
                }
            }
        }
    }

    /* Throw away new events in our throwaway list by reconstructing the
       results list without them in. */
    var nresults = [];
    var remaining = [];
    results.forEach(function(r) {
        if (new_events_throw_away_as_dupes[r.birminghamIOCalendarID]) {
            //console.log("not adding", r.summary);
        } else {
            nresults.push(r);
            remaining.push(r.summary + " (" + r.start + ")");
        }
    });
    results = nresults;
    callback(null, nresults, google_throw_away_as_dupes);
}

function throwAwayGoogleDupes(google_throw_away_as_dupes, existing, callback) {
    /* Throw away Google dupes by actually deleting them. */
    async.eachSeries(Object.keys(google_throw_away_as_dupes), function(bioid, cb) {
        //console.log("Deleting Google item which is a dupe of another item", bioid, existing[bioid].summary, existing[bioid].start);
        gcal.events.delete({
            auth: jwt,
            calendarId: GOOGLE_CALENDAR_ID,
            eventId: bioid
        }, cb);
    }, callback);
}

function updateCalendar(results, existing, callback) {
    /* Now, go through each of our fetched events and either update them 
       if they exist, or create them if not. Note that we do not pass an
       err in the update/insert to the callback, because that will terminate
       the async.map; instead, we always say that there was no error, and
       then if there was we pass it inside the results, so we can check later. */
    async.mapSeries(results, function(ev, callback) {
        var event_resource = {
            start: { dateTime: moment(ev.start).format() },
            end: { dateTime: moment(ev.end).format() },
            description: ev.description || "",
            location: ev.location || "",
            summary: ev.summary,
            status: "confirmed"
        };
        if (ev.unparsed_rrules) {
            event_resource.recurrence = ev.unparsed_rrules;
            /* Recurring events require an explicit start and end timezone.
               Timezones are hard. Fortunately, we are in England and so don't care.
               Send her victorious. */
            event_resource.start.timeZone = TIMEZONE;
            event_resource.end.timeZone = TIMEZONE;
        }
        if (existing[ev.birminghamIOCalendarID]) {
            //console.log("Update event", ev.birminghamIOCalendarID);
            gcal.events.patch({
                auth: jwt, 
                calendarId: GOOGLE_CALENDAR_ID,
                eventId: ev.birminghamIOCalendarID,
                resource: event_resource
            }, function(err, resp) {
                if (err) {
                    callback(null, {success: false, err: err, type: "update", event: ev});
                    return;
                }
                callback(null, {success: true, type: "update", event: ev});
            });
        } else {
            var event_resource_clone = JSON.parse(JSON.stringify(event_resource));
            event_resource_clone.id = ev.birminghamIOCalendarID;
            gcal.events.insert({
                auth: jwt, 
                calendarId: GOOGLE_CALENDAR_ID,
                resource: event_resource_clone
            }, function(err, resp) {
                if (err) {
                    callback(null, {success: false, err: err, type: "insert", event: ev});
                    return;
                }
                callback(null, {success: true, type: "insert", event: ev});
            });
        }
    }, function(err, results) {
        if (err) { logger.warn("Update/insert got an error (this shouldn't happen!)", err); return; }
        var successes = [], failures = [], inserts = 0, updates = 0;
        results.forEach(function(r) {
            if (r.success) {
                successes.push(r.event);
                if (r.type == "insert") { inserts += 1; }
                if (r.type == "update") { updates += 1; }
            } else {
                failures.push({event: r.event, err: r.err});
            }
        });
        logger.info("Successfully dealt with", successes.length,
            "events (" + inserts, "new events,", updates, "existing events)");
        if (failures.length > 0) {
            logger.warn("Failed to deal with", failures.length, "events");
            logger.warn("== Failures ==");
            failures.forEach(function(f) {
                logger.warn("Event", f.event.summary,
                    "(" + f.event.uid + ", " + f.event.birminghamIOCalendarID + ")", 
                    JSON.stringify(f.err));
            });
        } else {
            logger.info("Failed to deal with", failures.length, "events");
        }
    });
}

function handleListOfParsedEvents(err, results) {
    if (err) { 
        logger.error("We failed to create a list of events", err);
        return;
    }
    logger.info("Now processing " + results.length + " events");

    // auth to the google calendar
    jwt.authorize(function(err, tokens) {
        if (err) { logger.error("Problem authorizing to Google", err); return; }

        var respitems = [];
        function getListOfEvents(cb, nextPageToken) {
            var params = {auth: jwt, calendarId: GOOGLE_CALENDAR_ID, showDeleted: true, singleEvents: true};
            if (nextPageToken) { params.pageToken = nextPageToken; }
            gcal.events.list(params, function(err, resp) {
                if (err) { return cb(err); }
                respitems = respitems.concat(resp.items);
                if (resp.nextPageToken) {
                    getListOfEvents(cb, resp.nextPageToken);
                } else {
                    cb(null, respitems);
                }
            });
        }

        /* Get list of events */
        getListOfEvents(function(err, respitems) {
            if (err) { logger.error("Problem getting existing events", err); return; }
            // Make a list of existing events keyed by uid, which is the unique key we created
            var existing = {};
            respitems.forEach(function(ev) { existing[ev.id] = ev; });

            // Make a list of events which are in the google calendar and are *not* upstream, and flag them
            var deletedUpstream = [];
            var presentUpstream = {};
            results.forEach(function(upstr) {
                presentUpstream[upstr.birminghamIOCalendarID] = "yes";
            });
            for (var bioid in existing) {
                if (!presentUpstream[bioid]) {
                    deletedUpstream.push(existing[bioid]);
                }
            }

            var existingUndeleted = {};
            for (var k in existing) {
                if (existing[k].status != "cancelled") existingUndeleted[k] = existing[k];
            }

            deduper(existingUndeleted, results, function(err, results, google_deletes) {
                if (err) { console.error("Error in deduper!", err); return; }
                if (IS_DRY_RUN) {
                    logger.info("=== DRY RUN ONLY: aborting ===");

                    /* add debug code here */

                    return;
                }
                throwAwayGoogleDupes(google_deletes, existing, function(err) {
                    if (err) { console.error("Deleting dupes already in Google failed!", err); return; }
                    updateCalendar(results, existing, function(err) {
                        if (err) { console.error("Updating the calendar failed", err); return; }
                        logger.info("== Events present in the Google calendar but not present in sources: %d ==", deletedUpstream.length);
                        deletedUpstream.forEach(function(duev) {
                            logger.info(duev.summary + " (" + duev.id + ")", duev.start.dateTime);
                        });
                    });
                });
            });
        });
    });
}

function processICSData(err, results) {
    if (err) { 
        logger.warn("We failed to fetch any ics URLs", err);
        return;
    }
    // parse them all into ICS structures
    logger.info("Now processing " + results.length + " ICS datasets");
    async.concat(results, function(icsbodyobj, cb) {
        var events = [];
        if (icsbodyobj.body) {
            var parsedEvents = ical.parseICS(icsbodyobj.body);
            for (var k in parsedEvents) {
                if (parsedEvents.hasOwnProperty(k)) {
                    var ev = parsedEvents[k];
                    if (ev.type != "VEVENT") {
                        /* Some ical files, including those from meetup, contain VTIMEZONE entries.
                           Skip them, since they are not actually events, and epic fail lies within. */
                        continue;
                    }
                    ev.icalLibraryId = k;
                    /* the birminghamIOCalendarID is the ID we eventually
                       use to store this event in Google Calendar. As for
                       sources, above, it must match /^[a-v0-9]+$/, and must
                       be unique in the calendar. So, we assume that event.uid
                       exists and is unique in the thing that we fetched, but
                       can take any form it likes, and we construct an actually
                       unique ID as "bio" + source + sha1(event.uid).hexdigest
                       (because the hex digest of anything is /^[0-9a-f]+$/).
                       That way, this ID is all of calendar-unique, probably
                       globally-unique (because of the "bio"), and suitable
                       for use as a gcal ID. */
                    var shasum = crypto.createHash('sha1');
                    try {
                        shasum.update(ev.uid);
                        ev.birminghamIOCalendarID = "bio" + icsbodyobj.source + shasum.digest('hex');
                        events.push(ev);
                    } catch(e) {
                        logger.warn("Missing ev.uid", e, ev);
                    }
                }
            }
        }
        cb(null, events);
    }, handleListOfParsedEvents);
}

function processICSURLs(err, results) {
    if (err) {
        logger.warn("We failed to get a list of ics URLs", err);
        return;
    }
    // flatten results list and fetch them all
    var icsurls = [];
    icsurls = icsurls.concat.apply(icsurls, results);
    logger.info("Now processing " + icsurls.length + " ICS URLs");
    async.map(icsurls, function(icsurlobj, cb) {
        if (icsurlobj.url) { // we were given back a URL, so fetch ICS data from it
            request(icsurlobj.url, function(err, response, body) {
                if (err) { 
                    logger.warn("Failed to fetch URL", icsurlobj.url, err);
                    body = null;
                }
                // sanitise source name. Shouldn't need this, because people are
                // supposed to read the above comment, but nobody ever does. So,
                // a source name must match [a-v0-9] (no punctuation)
                var source = icsurlobj.source.toLowerCase().replace(/[^a-v0-9]/g, '').substr(0,40);
                cb(null, {source: source, body: body});
            });
        } else { // we were given back something which is *already* ICS data, so use it
            // sanitise source name. Shouldn't need this, because people are
            // supposed to read the above comment, but nobody ever does. So,
            // a source name must match [a-v0-9] (no punctuation)
            var source = icsurlobj.source.toLowerCase().replace(/[^a-v0-9]/g, '').substr(0,40);
            cb(null, {source: source, body: icsurlobj.icsdata});
        }
    }, processICSData);
}

exports.mainJob = function mainJob() {
    // first, get a list of ics urls from various places
    async.parallel([
        fetchIcalUrlsFromLocalFile,
        fetchIcalUrlsFromMeetup,
        fetchICSFromEventBrite
    ], processICSURLs);
};

if (require.main === module) {
    exports.mainJob();
}
