var ical = require("ical"),
    async = require("async"),
    request = require("request"),
    config = require("./config"),
    googleapis = require('googleapis');

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

function fetchIcalUrlsFromLocalFile(cb) {
    cb(null, [
        "http://lanyrd.com/topics/nodejs/nodejs.ics",
        "http://lanyrd.com/topics/python/python.ics"
    ]);
}

function fetchIcalUrlsFromMeetup(cb) {
    var req = request(MEETUP_URL + MEETUP_KEY, function(error, res, body) {
        if (!error && res.statusCode == 200) {
            results = JSON.parse(body);

            urls = [];
            for(var result in results)
                urls.push(results[result].link + "events/ical/");
            cb(null, urls);
        }
    });
}

// first, get a list of ics urls from various places
function mainJob() {
    async.parallel([
        fetchIcalUrlsFromLocalFile
    ], function(err, results) {
        if (err) {
            console.log("We failed to get a list of ics URLs", err);
            return;
        }
        // flatten results list and fetch them all
        var icsurls = [];
        icsurls = icsurls.concat.apply(icsurls, results);
        async.map(icsurls, function(icsurl, cb) {
            request(icsurl, function(err, response, body) {
                if (err) { 
                    console.log("Failed to fetch URL", icsurl, err);
                    body = null;
                }
                cb(null, body);
            });
        }, function(err, results) {
            if (err) { 
                console.log("We failed to fetch any ics URLs", err);
                return;
            }
            // parse them all into ICS structures
            async.concat(results, function(icsbody, cb) {
                var events = [];
                if (icsbody) {
                    var parsedEvents = ical.parseICS(icsbody);
                    for (var k in parsedEvents) {
                        if (parsedEvents.hasOwnProperty(k)) {
                            var ev = parsedEvents[k];
                            ev.icalLibraryId = k;
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
                console.log(results.length);
                // blow away the contents of the Google calendar
                jwt.authorize(function(err, tokens) {
                    if (err) {
                        console.log(err);
                        return;
                    }
                    var gcal = googleapis.calendar('v3');
                    gcal.events.list({auth: jwt, calendarId: 'limeblast.co.uk_343bi2q6qgpt5rc95nrjemq34s@group.calendar.google.com'}, function(err, resp) {
                        console.log("got response", err, resp);
                    });
                });
            });
        });
    });
}
