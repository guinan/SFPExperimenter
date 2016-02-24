var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var basex = require("basex/index");
var db_log = require("basex/debug");
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("config.json"));
var http = require("http");
var xmldoc = require("xmldoc");

var jobQueueCount = 0;

// output information according to debug-status set in config
function debugLog(str)
{
    if (config.serverDebug)
        console.log(str);
}

// helper function that generates a timestamp (YYYYMMDDhhmmss)
function getDateTime()
{
    var date = new Date();
    var hour = date.getHours();
    var min  = date.getMinutes();
    var sec  = date.getSeconds();
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day  = date.getDate();

    hour = (hour < 10 ? "0" : "") + hour;
    min = (min < 10 ? "0" : "") + min;
    sec = (sec < 10 ? "0" : "") + sec;
    month = (month < 10 ? "0" : "") + month;
    day = (day < 10 ? "0" : "") + day;

    return year + month + day + hour + min + sec;
}

// connect to database server: new basex.Session(#IP, #Port, #user, #password)
var client = new basex.Session(config.dbHost, config.dbPort, config.dbUser, config.dbPassword);
basex.debug_mode = config.dbDebug;

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded (POST)
app.use(express.static("views"));
app.use(express.static("lib"));


// default URL sends index file (contains the whole webinterface)
app.get("/",
    function(req, res)
    {
        res.sendFile("views/index.html", {root: __dirname});
    }
);

app.post("/getJobQueueCount",
    function(req, res)
    {
        res.send(JSON.stringify(jobQueueCount));
    }
);

app.post("/addPreset",
    function(req, res)
    {
        // Add preset document to database
        // Öffnet die Datenbank und erstellt das XML Dokument für das abzuspeichernde Preset. Das ist dann in der Datenbank unter "Pre_#name" ansprechbar. (Nützlich beim löschen).
        debugLog("Added Preset: " + req.body.name + "_" + req.body.params);
        client.execute("open " + config.dbName, db_log.print);
        client.execute("add to Pre_" + req.body.name.replace(/:|\.|\/|\\/g, "") +
            " \"<?xml version='1.0'?><preset><name>" +
            req.body.name.replace(/:|\.|\/|\\/g, "") + "</name><parameters>" +
            req.body.params + "</parameters></preset>\" ", db_log.print);
        client.execute("close");
        res.send();
    }
);

app.post("/deletePreset",
    function(req, res)
    {
        // Löscht das entsprechende Preset. Benutzt log.print als callback, um das Ergebnis in der Konsole auszugeben.
        debugLog("Deleted preset with timestamp: " + req.body.name);
        client.execute("open " + config.dbName, db_log.print);
        client.execute("delete Pre_" + req.body.name.replace(/:|\.|\/|\\/g, ""), db_log.print);
        client.execute("close");
        res.send();
    }
);

app.post("/deleteSFP",
    function(req, res)
    {
        // Löscht das entsprechende SFP Document. Benutzt log.print als callback, um das Ergebnis in der Konsole auszugeben.
        debugLog("Deleted SFP with timestamp: " + req.body.timestamp);
        client.execute("open " + config.dbName, db_log.print);
        client.execute("delete Doc_" + req.body.timestamp, db_log.print);
        client.execute("close");
        res.send();
    }
);

app.post("/generateSFP",
    function(req, res)
    {
        debugLog("GenerateSFP: " + req.body.weburis + " " + req.body.params);
        var uris = req.body.weburis.split("\r\n");
        var params = JSON.parse(req.body.params)[0];

        // q denotes keyword parameter for Guinan, multiple q arguments can be present in the url
        var queryArray = params[4][0].split(";"); // collect keywords
        var queryStr = "";
        for (j = 0; j < queryArray.length; j++)
            queryStr += "&q=" + escape(queryArray[j]);

        for (i = 0; i < uris.length; i++)
        {
            var index = i; // used to avoid callback issues with new values

            // Get SFP via Guinan REST-Service
            var options =
            {
                host: config.guinanHost,
                port: config.guinanPort,
                path: "/Guinan/webapp/SemFP/getSFPforDoc?uri=" + uris[index] + queryStr +
                    "&maxSearchResults=" + params[1] + "&maxSearchDepth=" + params[0] +
                    "&maxPathLength=" + params[2] + "&numRelevantNodes=" + params[3],
                method: "GET"
            };
            http.request(options, // HTTP-Request to Guinan REST-Service
                function(_res)
                {
                    debugLog("STATUS: " + _res.statusCode);
                    debugLog("HEADERS: " + JSON.stringify(_res.headers));
                    var output = "";
                    _res.setEncoding("utf8");
                    _res.on("data", // collect data
                        function(data)
                        {
                            output += data;
                        }
                    );
                    _res.on("end", // Response from Guinan contains JobId to check back for SFP completion
                        function()
                        {
                            jobQueueCount++;
                            // get jobURI by cutting it out of the link provided by Guinan (will have to be adjusted if Guinan's response format is changed)
                            var jobURI = output.substring(output.indexOf("\">") + 2, output.indexOf("</a"));
                            
                            // periodically (every 10 sec) check JobURI for completed SFP generation (delayed recursive function)
                            (function poll()
                            {
                                setTimeout(function()
                                {
                                    http.request({
                                        host: config.guinanHost,
                                        port: config.guinanPort,
                                        path: "/Guinan/webapp/" + jobURI,
                                        method: "GET"},
                                        function(__res)
                                        {
                                            debugLog("STATUS: " + __res.statusCode);
                                            debugLog("HEADERS: " + JSON.stringify(__res.headers));
                                            var _output = "";
                                            __res.setEncoding("utf8");
                                            __res.on("data",
                                                function(data)
                                                {
                                                    _output += data;
                                                }
                                            );
                                            __res.on("error",
                                                function()
                                                {
                                                    console.log("ERROR: " + __res.statusCode);
                                                    jobQueueCount--;
                                                }
                                            );
                                            __res.on("end",
                                                function()
                                                {
                                                    // SFP not ready yet, poll again in 10 sec
                                                    if (__res.statusCode == 200)
                                                        poll();
                                                    else if (__res.statusCode == 303) // SFP is ready at this point
                                                    {
                                                        jobQueueCount--;
                                                        debugLog("REST ANSWER: " + _output);

                                                        // access completed SFP-document from Guinan at /Guinan{JobId}
                                                        http.request({
                                                            host: config.guinanHost,
                                                            port: config.guinanPort,
                                                            path: __res.headers.location.substr(__res.headers.location.indexOf("/Guinan")),
                                                            method: "GET"},
                                                            function(___res)
                                                            {
                                                                var sfp = "";
                                                                ___res.setEncoding("utf8");
                                                                ___res.on("data", // collect data
                                                                    function(data)
                                                                    {
                                                                        sfp += data;
                                                                    }
                                                                );
                                                                ___res.on("end",
                                                                    function()
                                                                    {
                                                                        var dateTime = getDateTime();
                                                                        // check whether the user wants to save the SFP in a file
                                                                        if (config.serverSaveSfpInFile)
                                                                            fs.writeFileSync(__dirname + "/sfp_" + dateTime + ".xml", sfp);

                                                                        // count properties (Edges/Nodes) or drop them here (see TODO-comment in app.js:926)
                                                                        //var props = "";

                                                                        // Add SFP document to database
                                                                        client.execute("open " + config.dbName, db_log.print);
                                                                        client.execute("add to Doc_" + dateTime +
                                                                            " \"<?xml version='1.0'?><document><document-uri>" + uris[index] +
                                                                            "</document-uri><timestamp>" + dateTime + "</timestamp><parameters>" +
                                                                            params[0] + ";" + params[1] + ";" + params[2] + ";" + params[3] + "</parameters><keywords>"+
                                                                            params[4] + "</keywords><sfp>" + sfp + "</sfp></document>\" ");
                                                                        client.execute("close");
                                                                    }
                                                                );
                                                            }
                                                        ).end();
                                                    }
                                                    else
                                                        console.log("Error: statusCode = " + __res.statusCode);
                                                }
                                            );
                                        }
                                    ).end();
                                }, 10000);
                            })();
                        }
                    );
                }
            ).end();
        }
        res.send();
    }
);

// sending out the database-stored presetlist to the client
app.post("/getPresets",
    function(req, res)
    {
        // read all presets from the database
        client.execute("open " + config.dbName);
        client.execute("xquery //preset",
            function(err, reply)
            {
                if (err)
                    debugLog("Error: " + err);
                else
                {
                    // split resulting string at end-tag (</preset>) to distinguish between presets
                    var rep = reply.result;
                    var presetList = rep.split("</preset>").clean("");
                    for (i = 0; i < presetList.length; i++)
                    {
                        // remove XML-tags and only store their content
                        presetList[i] = presetList[i].replace(/(<([^>]+)>)/ig, "").trim().split("\r\n")
                        for (j = 0; j < presetList[i].length; j++)
                            presetList[i][j] = presetList[i][j].trim();
                        presetList[i][2] = false;
                    }
                    res.send(presetList);
                    debugLog(presetList);
                }
            }
        );
        client.execute("close");
    }
);

// sending out the database-stored SFP-list to the client
app.post("/getSFPs",
    function(req, res)
    {
        // read all SFPs from the database
        client.execute("open " + config.dbName);
        client.execute("xquery //document",
            function(err, reply)
            {
                if (err)
                    console.log("Error: " + err);
                else
                {
                    // add root element to make xquery-result well formed XML
                    var xmlStr = "<root>" + reply.result + "</root>";
                    var xmlReply = new xmldoc.XmlDocument(xmlStr);

                    // extract document children for the loop (to know how many there are)
                    var docList = xmlReply.childrenNamed("document");
                    var sfpList = [];

                    for (var i = 0; i < docList.length; i++)
                    {
                        // store everything in an array and add two booleans used for selection purposes in the webinterface
                        sfpList[i] = [
                            docList[i].valueWithPath("document-uri"),
                            docList[i].valueWithPath("timestamp"),
                            docList[i].valueWithPath("parameters"),
                            docList[i].valueWithPath("keywords"),
                            docList[i].descendantWithPath("sfp").toString({compressed:true}),
                            false,
                            false
                        ];
                    }

                    res.send(sfpList);
                    debugLog(sfpList);
                }
            }
        );
        client.execute("close");
    }
);

// helper function (extends the default array type) to remove empty elements that are created by the xquery
Array.prototype.clean = function(deleteValue)
{
    for (var i = 0; i < this.length; i++)
    {
        if (this[i] == deleteValue)
        {
            this.splice(i, 1);
            i--;
        }
    }
    return this;
};

app.listen(config.serverPort);
console.log("Listening on port: " + config.serverPort);