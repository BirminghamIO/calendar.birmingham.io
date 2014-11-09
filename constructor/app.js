var ical = require("ical"),
    async = require("async"),
    request = require("request");

function fetchIcalUrlsFromLocalFile(cb) {
    cb(null, [
        "http://lanyrd.com/topics/nodejs/nodejs.ics",
        "http://lanyrd.com/topics/python/python.ics"
    ]);
}

// first, get a list of ics urls from various places
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
                console.log("here are a zillion events");
                for (var k in results) {
                    if (results.hasOwnProperty(k)) {
                        var ev = results[k];
                        console.log("Conference", ev.summary, 'is in', ev.location,
                            'on the', ev.start.getDate(), 'of month', ev.start.getMonth());
                    }
                }
            });
        });
    });