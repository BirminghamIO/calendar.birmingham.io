var ical = require("ical"),
    async = require("async"),
    request = require("request"),
    config = require("./config"),
    googleapis = require('googleapis'),
    crypto = require("crypto");

var CLIENT_ID = config.CLIENTID;
var CLIENT_SECRET = config.CLIENTSECRET;
 
var SERVICE_ACCOUNT_EMAIL = '721976846481-1s5altpg8afuc4opnlr13nua86hg0ul9@developer.gserviceaccount.com';
var SERVICE_ACCOUNT_KEY_FILE = './key.pem';
var jwt = new googleapis.auth.JWT(
        SERVICE_ACCOUNT_EMAIL,
        SERVICE_ACCOUNT_KEY_FILE,
        null,
        ['https://www.googleapis.com/auth/calendar']);

var MEETUP_KEY = config.MEETUPKEY;
var MEETUP_URL = "https://api.meetup.com/find/groups?" +
                    "&sign=true" +
                    "&photo-host=public" +
                    "&category=34" + /* Technology */
                    "&lat=52.483056&lon=-1.893611" + /* Birmingham */
                    "&radius=5" + /* radius (in miles) */
                    "&page=40" + /* results per page */
                    "&key=";

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
    cb(null, [
        //"http://lanyrd.com/topics/nodejs/nodejs.ics",
        //"http://lanyrd.com/topics/python/python.ics"
    ]);
}

function fetchIcalUrlsFromMeetup(cb) {
    var req = request(MEETUP_URL + MEETUP_KEY, function(err, response, body) {
        if (err) {
            console.log("Meetup: Error connecting:", err);
            return;
        }
        else if (response.statusCode != 200) {
            console.log("Meetup: HTTP error code:", response.statusCode);
            return;
        }
        else {
            try {
                results = JSON.parse(body);
                if(results.length == 0) {
                    console.log("Meetup: Warning: no results received:");
                }
                urls = [];
                for (var result in results) {
                    urls.push({source: "meetup", url: results[result].link + "events/ical/"});
                }
                cb(null, urls);
            } catch(e) {
                console.log("Meetup: Error parsing JSON:", e);
            }
        }
    });
}

// first, get a list of ics urls from various places
function mainJob() {
    async.parallel([
        fetchIcalUrlsFromLocalFile,
        fetchIcalUrlsFromMeetup
    ], function(err, results) {
        if (err) {
            console.log("We failed to get a list of ics URLs", err);
            return;
        }
        // flatten results list and fetch them all
        var icsurls = [];
        icsurls = icsurls.concat.apply(icsurls, results);
        async.map(icsurls, function(icsurlobj, cb) {
            request(icsurlobj.url, function(err, response, body) {
                if (err) { 
                    console.log("Failed to fetch URL", icsurlobj.url, err);
                    body = null;
                }
                cb(null, {source: icsurlobj.source, body: body});
            });
        }, function(err, results) {
            if (err) { 
                console.log("We failed to fetch any ics URLs", err);
                return;
            }
            // parse them all into ICS structures
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
                            shasum.update(ev.uid);
                            ev.birminghamIOCalendarID = "bio" + icsbodyobj.source + shasum.digest('hex');
                            events.push(ev);
                        }
                    }
                }
                cb(null, events);
            }, function(err, results) {
                if (err) { 
                    console.log("We failed to create a list of events", err);
                    return;
                }

                // auth to the google calendar
                jwt.authorize(function(err, tokens) {
                    if (err) {
                        console.log(err);
                        return;
                    }
                    var gcal = googleapis.calendar('v3');
                    // temporarily create one event, just to see if inserting works. Remove this once we've made inserting work.
                    gcal.events.insert({
                        auth: jwt, 
                        calendarId: 'limeblast.co.uk_343bi2q6qgpt5rc95nrjemq34s@group.calendar.google.com', 
                        resource: {
                            start: { dateTime: "2014-11-16T02:00:01+00:00"},
                            end: { dateTime: "2014-11-16T03:00:01+00:00"},
                            id: "siltest00001",
                            description: "description",
                            location: "location",
                            summary: "hack on calendar app"
                        }
                    }, function(err, resp) {
                        console.log("inserted, now delete.", err, resp);
                    });
                    gcal.events.list({auth: jwt, calendarId: 'limeblast.co.uk_343bi2q6qgpt5rc95nrjemq34s@group.calendar.google.com'}, function(err, resp) {
                        console.log("got response", err, resp);
                    });
                });
            });
        });
    });
}

if (require.main === module) {
    mainJob();
}