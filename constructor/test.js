var should = require('should'),
    Mitm = require('mitm'),
    rewire = require('rewire'),
    app = rewire('./app');



describe('End-to-end', function() {
    it('should correctly parse an iCal URL and put the results in Google', function(done) {
        // intercept outbound http requests (specifically, those to google and the external ical)
        mitm = Mitm();
        mitm.on('request', function(req, res) {
            if (req.headers.host == "testurl") {
                // this is the request for an iCal file. Return something sensible
                res.end("BEGIN:VCALENDAR\nVERSION:2.0\nMETHOD:PUBLISH\nBEGIN:VEVENT\n" +
                    "SUMMARY:Test Event\nLOCATION:Test Location\nUID:abc123\n" +
                    "DESCRIPTION:Test Description\nDTSTART;VALUE=DATE:20141116T180000\n" +
                    "DTEND;VALUE=DATE:20141116T183000\nEND:VEVENT\nEND:VCALENDAR\n");
                return;
            }
            console.log("got request to", req.url, req.headers.host);
            res.end("FAIL");
        });

        // override the fetch functions to provide test ical urls
        app.__set__('fetchIcalUrlsFromLocalFile', function(cb) {
            cb(null, []);
        });
        app.__set__('fetchIcalUrlsFromMeetup', function(cb) {
            cb(null, [{source: "testsuite", url: "http://testurl/ical"}]);
        });

        // override all the google stuff
        app.__set__('jwt', {
            authorize: function(cb) {
                cb(null, "no actual tokens here");
            }
        });
        app.__set__('googleapis', {
            calendar: function(version) {
                return {
                    events: {
                        list: function(details, cb) {
                            cb(null, {items:[]});
                        },
                        insert: function(details, cb) {
                            // Here we confirm that our ical event is being inserted
                            details.should.have.property("resource");
                            details.resource.should.have.property("summary");
                            details.resource.summary.should.equal("Test Event");
                            details.resource.should.have.property("location");
                            details.resource.location.should.equal("Test Location");
                            cb(null);
                            done();
                        }
                    }
                };
            }
        });

        app.mainJob();
    });
})