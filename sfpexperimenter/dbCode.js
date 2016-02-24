//Die Requires, Pfade müssen natürlich angepasst werden
var basex  = require("...\\node_modules\\basex/index");
var log = require("...\\node_modules\\basex/debug");
//Ist nur nötig für Commandline-Input: Nimmt die cmd-Inputs, schneidet die ersten zwei ab (weil die standardmäßig benutzt werden für Ausführinfozeugs) und packt den Rest in ein Array
var arg = process.argv.slice(2);
//Stellt die Verbindung zum Datenbankserver her: new basex.Session(#IP, #Port, #user, #password); 
var client = new basex.Session("127.0.0.1", 1984, "admin", "admin");
basex.debug_mode = false;

//Hilfsfunktion die einen Timestamp (ohne Füllerlines) mit Format: YYYYMMDDHHMMSS (das zweite mal M ist Minute) generiert.
function getDateTime() {
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
//--------Create database----------
//Erstellt neue Datenbank auf dem Server mit Namen test_db
//Muss vor jeder weiteren Aktion geöffnet werden
client.create("test_db","", log.print);
client.close();

//------------Add SFP document to database------------
//Variablen zum Erstellen von SFP Dokumenten in der Datenbank (werden momentan aus der cmd genommen, sollten dann anders gesetzt werden)
var docuri = arg[0];
var keys = arg[2];
var paras = arg[1];
var props = arg[3];

//Öfnet die Datenbank und fügt dann das entsprechende XML Dokument zur Datenbank hinzu. Das Dokument ist dann durch "Doc_#docuri" ansprechbar. (Ist dann nützlich beim löschen). 
client.execute("open test_db",log.print);
client.execute("add to Doc_" + docuri + " \"<?xml version='1.0'?><document><document-uri>" + docuri + "</document-uri><timestamp>" + getDateTime() + "</timestamp><parameters>" + paras + "</parameters><keywords>" + keys + "</keywords><properties>" + props + "</properties></document>\" ");
client.close();

//-------------Add preset document to database----------------
//Variablen für das Preset
var name = arg[0];
var paras = arg[1];

//Öffnet die Datenbank und erstellt das XML Dokument für das abzuspeichernde Preset. Das ist dann in der Datenbank unter "Pre_#name" ansprechbar. (Nützlich beim löschen).
client.execute("open test_db",log.print);
client.execute("add to Pre_" + name + " \"<?xml version='1.0'?><preset><name>" + name + "</name><parameters>" + paras + "</parameters></preset>\" ");

//------------Return SFP or preset documents to Flo's code-----------
//Hilfsfunktion, erweitert den Array-Typen. Wird benutzt um leere Elemente zu entfernen die bei der Verarbeitung der XML-Anfrage entstehen. (von Stackoverflow)
Array.prototype.clean = function(deleteValue) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] == deleteValue) {         
      this.splice(i, 1);
      i--;
    }
  }
  return this;
};

//Callback Funktionen für die SFPs bzw. Presets. Liest alle SFPs bzw. Presets aus der Datenbank aus, schneidet jeweils am "</document>", damit die Dokumente im Array getrennt sind. Kürzt dann die Tags und überflüssige Leerzeichen weg und gibt dann eine Liste von SFPs in der Form wie in Flos Code zurück. Gibt das Ergebnis im Moment in der Konsole aus. 
function printSFP(err, reply){
	if (err) {
		console.log("Error: " + err);
	} 
	else {
		var rep = reply.result; 
		var sfpList = rep.split("</document>").clean("");
		for (i = 0; i < sfpList.length; i++){
			sfpList[i] = sfpList[i].replace(/(<([^>]+)>)/ig,"").trim().split("\r\n")
			for (j = 0; j < sfpList[i].length; j++){
				sfpList[i][j] = sfpList[i][j].trim();
			}
		}
		console.log(sfpList);
	}
}

function printPreset(err, reply){
	if(err){
		console.log("Error: " + err);
	}	
	else{
		var rep = reply.result; 
		var presetList = rep.split("</preset>").clean("");
		for (i = 0; i < presetList.length; i++){
			presetList[i] = presetList[i].replace(/(<([^>]+)>)/ig,"").trim().split("\r\n")
			for (j = 0; j < presetList[i].length; j++){
				presetList[i][j] = presetList[i][j].trim();
			}
		}
		console.log(presetList);
	}
}
//Öffnet die Datenbank und gibt dann Dokumente bzw. Presets aus.
client.execute("open test_db");
client.execute("xquery //document", printSFP);
client.execute("xquery //preset", printPreset);

//------------------- Delete SFP Documents / Presets ---------------
//Nimmt den Namen als CMD-Argument, müsste über die Anfrage dann gesteuert werden
var name = arg[0];
//Löscht dann das entsprechende Preset bzw. das SFP Document. Benutzt log.print als callback, um das Ergebnis in der Konsole auszugeben.
client.execute("open test_db",log.print);
client.execute("delete Pre_" + name, log.print);
client.execute("delete Doc_" + name, log.print);








