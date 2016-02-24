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

// Hilfsfunktion die einen Timestamp (ohne Füllerlines) mit Format: YYYYMMDDHHMMSS (das zweite mal M ist Minute) generiert.
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

// Stellt die Verbindung zum Datenbankserver her: new basex.Session(#IP, #Port, #user, #password);
var client = new basex.Session(config.dbHost, config.dbPort, config.dbUser, config.dbPassword);
basex.debug_mode = false;

// Create database
// Erstellt neue Datenbank auf dem Server mit Namen test_db
// Muss vor jeder weiteren Aktion geöffnet werden
//client.create("test_db", "", db_log.print);
//client.close();

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(express.static('views'));
app.use(express.static('lib'));


// default URL sends index file
app.get("/",
    function(req, res)
    {
        res.sendFile("views/index.html", { root : __dirname});
    }
);

app.post("/getJobQueueCount",
    function(req, res)
    {
        console.log("getJobQueueCount = " + jobQueueCount);
        res.send(JSON.stringify(jobQueueCount));
    }
);

app.post("/addPreset",
    function(req, res)
    {
        // Add preset document to database
        // Öffnet die Datenbank und erstellt das XML Dokument für das abzuspeichernde Preset. Das ist dann in der Datenbank unter "Pre_#name" ansprechbar. (Nützlich beim löschen).
        console.log(req.body.name + "_" + req.body.params);
        client.execute("open test_db2", db_log.print);
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
        client.execute("open test_db2", db_log.print);
        client.execute("delete Pre_" + req.body.name.replace(/:|\.|\/|\\/g, ""), db_log.print);
        client.execute("close");
        res.send();
    }	
);

app.post("/deleteSFP",
    function(req, res)
    {
        // Löscht das entsprechende SFP Document. Benutzt log.print als callback, um das Ergebnis in der Konsole auszugeben.
        client.execute("open test_db2", db_log.print);
        console.log("Name: "+(req.body.timestamp));
        client.execute("delete Doc_" + (req.body.timestamp), db_log.print);
        client.execute("close");
        res.send();
    }
);

app.post("/generateSFP",
    function(req, res)
    {
        var uris = req.body.weburis.split("\r\n");
        console.log(req.body.weburis + " " + req.body.params + " " + uris[0] + " " + uris.length);
        //var localFiles = req.body.localFiles; // SFP generation only supports web URIs, TODO: remove in all other files
        var params = JSON.parse(req.body.params)[0];

        // q denotes keyword parameter for Guinan, multiple q arguments can be present in the url
        var queryArray = params[4][0].split(";");
        var queryStr = "";
        for (j = 0; j < queryArray.length; j++)
            queryStr += "&q=" + escape(queryArray[j]);

        for (i = 0; i < uris.length; i++)
        {
            var index = i;
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
                    console.log("STATUS: " + _res.statusCode);
                    console.log("HEADERS: " + JSON.stringify(_res.headers));
                    var output = "";
                    _res.setEncoding("utf8");
                    _res.on("data",
                        function(data)
                        {
                            output += data;
                        }
                    );
                    _res.on("end", // Response from Guinan contains JobId to check back for SFP completion
                        function()
                        {
                            jobQueueCount++;
                            var jobURI = output.substring(output.indexOf("\">") + 2, output.indexOf("</a"));
                            
                            // periodically (every 10 sec) check JobURI for completed SFP generation
                            (function poll()
                            {
                                setTimeout(function()
                                {
                                    http.request({host: config.guinanHost, port: config.guinanPort, path: "/Guinan/webapp/" + jobURI, method: "GET"},
                                        function(__res)
                                        {
                                            console.log("STATUS: " + __res.statusCode);
                                            console.log("HEADERS: " + JSON.stringify(__res.headers));
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
                                                        // SFP is saved to database
                                                        // TODO: adjust formatting (also in /getSFPs), so whole SFP can be saved in database
                                                        // TODO: client needs to periodically update SFPs from database to get newly generated ones
                                                        console.log("REST ANSWER: " + _output);
                                                        
                                                        http.request({host: config.guinanHost, port: config.guinanPort,
                                                            path: __res.headers.location.substr(__res.headers.location.indexOf("/Guinan")), method: "GET"},
                                                            function(___res)
                                                            {
                                                                var sfp = "";
                                                                ___res.setEncoding("utf8");
                                                                ___res.on("data",
                                                                    function(data)
                                                                    {
                                                                        sfp += data;
                                                                    }
                                                                );
                                                                ___res.on("end",
                                                                    function()
                                                                    {
                                                                        var dateTime = getDateTime();
                                                                        fs.writeFileSync(__dirname + "/sfp_" + dateTime + ".xml", sfp);

                                                                        // TODO: count properties (Edges/Nodes) or drop them here
                                                                        var props = "";

                                                                        // Add SFP document to database
                                                                        // Öffnet die Datenbank und fügt dann das entsprechende XML Dokument zur Datenbank hinzu.
                                                                        // Das Dokument ist dann durch "Doc_#docuri" ansprechbar. (Ist dann nützlich beim Löschen)
                                                                        client.execute("open test_db2", db_log.print);
                                                                        /*client.execute("add to Doc_" + uris[index].replace(/:|\.|\/|\\/g, "") +
                                                                            " \"<?xml version='1.0'?><document><document-uri>" +
                                                                            uris[index] + "</document-uri><timestamp>" + getDateTime() +
                                                                            "</timestamp><parameters><maxSearchDepth>" + params[0] +
                                                                            "</maxSearchDepth><maxSearchResults>" + params[1] +
                                                                            "</maxSearchResults><maxPathLength>" + params[2] +
                                                                            "</maxPathLength><numRelevantNodes>" + params[3] +
                                                                            "</numRelevantNodes></parameters><keywords>" + params[4] +
                                                                            "</keywords><properties>" + props + "</properties><sfp>" +
                                                                            _output + "</sfp></document>\" "); // TODO: save sfp properly*/
                                                                        client.execute("add to Doc_" + (dateTime).replace(/:|\.|\/|\\/g, "") +
                                                                            " \"<?xml version='1.0'?><document><document-uri>" + uris[index] +
                                                                            "</document-uri><timestamp>" + dateTime + "</timestamp><parameters>" +
                                                                            params/*[0] + params[1] + params[2] + params[3]*/ + "</parameters><keywords>"+
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

// Callback Funktionen für die SFPs bzw. Presets. Liest alle SFPs bzw. Presets aus der Datenbank aus,
// schneidet jeweils am "</document>", damit die Dokumente im Array getrennt sind. Kürzt dann die
// Tags und überflüssige Leerzeichen weg und gibt eine Liste von SFPs in der Form wie in Flos Code
// zurück. Gibt das Ergebnis im Moment in der Konsole aus.
app.post("/getPresets",
    function(req, res)
    {
        // Öffnet die Datenbank und gibt dann Dokumente bzw. Presets aus.
        client.execute("open test_db2");
        client.execute("xquery //preset",
            function(err, reply)
            {
                if (err)
                    console.log("Error: " + err);
                else
                {
                    var rep = reply.result;
                    var presetList = rep.split("</preset>").clean("");
                    for (i = 0; i < presetList.length; i++)
                    {
                        presetList[i] = presetList[i].replace(/(<([^>]+)>)/ig, "").trim().split("\r\n")
                        for (j = 0; j < presetList[i].length; j++)
                            presetList[i][j] = presetList[i][j].trim();
                        presetList[i][2] = false;
                    }
                    res.send(presetList);
                    console.log(presetList);
                }
            }
        );
        client.execute("close");
    }
);

app.post("/getSFPs",
    function(req, res)
    {
        client.execute("open test_db2");
        client.execute("xquery //document",
            function(err, reply)
            {
                if (err)
                    console.log("Error: " + err);
                else
                {
                    // add root element to make xquery result well formed
                    var xmlStr = "<root>" + reply.result + "</root>";
                    var xmlReply = new xmldoc.XmlDocument(xmlStr);

                    // extract document children for the loop (know how many there are)
                    var docList = xmlReply.childrenNamed("document");
                    var sfpList = [];

                    for (var i = 0; i < docList.length; i++)
                    {
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
                    //console.log(sfpList);
                }
            }
        );
        client.execute("close");
    }
);

// Return SFP or preset documents to Flos code
// Hilfsfunktion, erweitert den Array-Typen. Wird benutzt um leere Elemente zu entfernen,
// die bei der Verarbeitung der XML-Anfrage entstehen. (von Stackoverflow)
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