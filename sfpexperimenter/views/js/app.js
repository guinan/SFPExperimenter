var origSetBaseTable;

var sfpList;
var presetList;

var currentURI, currentParams;

var CANVAS_OFFSET;

var audioSfpReady;

var networkSet;
var networkDoc;

$(document).ready(
    function() {
        audioSfpReady = new Audio("audio/sfp_ready.m4a");
        // load sfp data
        $.ajax({
            type: "POST",
            url: window.location.href + "getSFPs"
        }).then(function(data) {
            sfpList = data;
            updateSFPTables(sfpList);
            $.notify("Database updated", "info");
        });

        $.ajax({
            type: "POST",
            url: window.location.href + "getPresets"
            }).then(function(data) {
                presetList = data;
                updatePresetTables(presetList);
        });
        
        // Take special care of table headers
        sortableTableHeadersOnClick(document.getElementById("presets-selector-table"));
        sortableTableHeadersOnClick(document.getElementById("set-selector-table"));
        sortableTableHeadersOnClick(document.getElementById("doc-selector-table"));
        
        // Add various onclick-events
        document.getElementById("spec-button").addEventListener("click", function() { toggleSelectionOnClick(false); });
        document.getElementById("presets-button").addEventListener("click", function() { toggleSelectionOnClick(true); });
        document.getElementById("add-preset-button").addEventListener("click", addPresetOnClick);
        document.getElementById("generate-sfp-button").addEventListener("click", generateSFPOnClick);
        document.getElementById("select-set-base").addEventListener("click", toggleSetDocTables);
        document.getElementById("select-doc-base").addEventListener("click", toggleSetDocTables);
        document.getElementById("export-csv-set").addEventListener("click", function() { exportCSV(true); });
        document.getElementById("export-csv-doc").addEventListener("click", function() { exportCSV(false); });
        
        
        // Fix disabled status of switching buttons (in case it's broken)
        document.getElementById("spec-button").setAttribute("disabled", "");
        document.getElementById("presets-button").removeAttribute("disabled");
        
        
        // Don't actually enable sorting, just making use of those fixed headers :)
        // The disabling is done as a class in the html file (class="sorter-false")
        $("#set-selector-table").tablesorter({
            widthFixed : true,
            widgets: ['stickyHeaders'],     // Make the headers of the table stick so they don't scroll out of view
            widgetOptions: {
                stickyHeaders_attachTo : '#set-base-toggle'
            },
            headers: {
                '.header': {
                    sorter: false
                }
            }
        });
        $("#doc-selector-table").tablesorter({
            widthFixed : true,
            widgets: ['stickyHeaders'],     // Make the headers of the table stick so they don't scroll out of view
            widgetOptions: {
                stickyHeaders_attachTo : '#doc-base-toggle',
            },
            headers: {
                '.header': {
                    sorter: false
                }
            }
        });
        $("#set-properties-table").tablesorter({
            widthFixed : true,
            widgets: ['stickyHeaders'],
            widgetOptions: {
                stickyHeaders_attachTo : '#set-properties-wrapper',
            }
        });
        $("#doc-properties-table").tablesorter({
            widthFixed : true,
            widgets: ['stickyHeaders'],
            widgetOptions: {
                stickyHeaders_attachTo : '#doc-properties-wrapper',
            }
        });
        
        // Periodically check the job queue, display remaining jobs and pull if jobs are done
        setInterval(function() {
            updateJobQueueCounter();
        }, 10000);
        
        // Options for the graph networks
        var options = {
            physics: {
                enabled: true,
                solver: "repulsion",
                repulsion: {
                    centralGravity: 0.15,
                    springLength: 200,
                    springConstant: 0.05,
                    nodeDistance: 150,
                    damping: 0.09
                },

                minVelocity: 0
            },
            height: '100%',
            width: '100%'
        };
        
        networkSet = new vis.Network(document.getElementById("set-network"), {nodes: [], edges: []}, options);
        networkDoc = new vis.Network(document.getElementById("doc-network"), {nodes: [], edges: []}, options);
        networkSet.setSize(400, 200);
        networkDoc.setSize(400, 200);
        
        $("#set-network-container").resizable({
            autoHide: true,
            minWidth: 400,          // Arbitrary
            minHeight: 200,         // Arbitrary
            maxWidth: 927,
            containment: "document",
            handles: {
                se: "#set-segrip",
            },
            stop: function(event, ui) {                        // Specify what to do when the resizing is done
                return  (function() {
                    // Set the corresponding width for the button row
                    document.getElementById("set-btns").style.width = ""+ui.size.width+"px";
                    document.getElementById("set-network").style.width = ""+ui.size.width+"px";
                    document.getElementById("set-network").style.height = ""+ui.size.height+"px";
                    // Resize and -paint the network
                    networkSet.setSize(ui.size.width, ui.size.height);
                    networkSet.redraw();
                    // Move the properties table to the next row if the div gets too big
                    if(ui.size.width + (document.getElementById("main-container").offsetWidth - (40 + 36))*5/12.0 + 12 > (document.getElementById("main-container").offsetWidth - (40 + 36)))
                        document.getElementById("set-properties-panel").classList.remove("col-md-5");
                    else
                        document.getElementById("set-properties-panel").classList.add("col-md-5");
                })();
            }
        });
        
        $("#doc-network-container").resizable({
            autoHide: true,
            minWidth: 400,          // Arbitrary
            minHeight: 200,         // Arbitrary
            maxWidth: 927,
            containment: "document",
            handles: {
                se: "#doc-segrip",
            },
            stop: function(event, ui) {                        // Specify what to do when the resizing is done
                return  (function() {
                    // Set the corresponding width for the button row
                    document.getElementById("doc-btns").style.width = ""+ui.size.width+"px";
                    document.getElementById("doc-network").style.width = ""+ui.size.width+"px";
                    document.getElementById("doc-network").style.height = ""+ui.size.height+"px";
                    // Resize and -paint the network
                    networkDoc.setSize(ui.size.width, ui.size.height);
                    networkDoc.redraw();
                    // Move the properties table to the next row if the div gets too big
                    if(ui.size.width + (document.getElementById("main-container").offsetWidth - (40 + 36))*5/12.0 + 24 > (document.getElementById("main-container").offsetWidth - (40 + 36)))
                        document.getElementById("doc-properties-panel").classList.remove("col-md-5");
                    else
                        document.getElementById("doc-properties-panel").classList.add("col-md-5");
                })();
            }
        });
        
        // set sizes manually again...
        // and AGAIN
        // and AGAIN!
        document.getElementById("set-network-container").style.width = "400px";
        document.getElementById("set-network-container").style.height = "200px";
        document.getElementById("doc-network-container").style.width = "400px";
        document.getElementById("doc-network-container").style.height = "200px";
    }
);

// export the selected SFPs as CSV
function exportCSV(set) {
    var toBeExported = [];
    
    if(set) {
        if(document.getElementById("export-csv-set").classList.contains("disabled"))
            return;
        set = 5;
    }
    else {
        if(document.getElementById("export-csv-doc").classList.contains("disabled"))
            return;
        set = 6;
    }
    
    for(var i = 0; i < sfpList.length; i++) {
        if(sfpList[i][set])
            toBeExported.push(i);
    }
    
    // TODO: generate CSVs
}

function updateJobQueueCounter() {
    // pull remaining jobs and display
    var jobDisp = document.getElementById("jobqueue-disp");
    $.ajax({
        type: "POST",
        url: window.location.href + "getJobQueueCount"
    }).then(function(data) {
        var jobsQueued = data;
        updateSFPTables(sfpList);
        jobDisp.innerHTML = "Jobs queued: "+jobsQueued;
        
        $.ajax({
            type: "POST",
            url: window.location.href + "getSFPs"
        }).then(function(innerData) {
                if(innerData.length > sfpList.length) {
                    $.notify("New SFP added", {className: "success", autoHide: false});
                    audioSfpReady.play();
                    updateSFPTables(innerData);
                }
        });
    });
}

// What to do when our canvas' are resized
function canvasResizeOnStop(event, ui, canvas, stage, panel) {
    // Set the new canvas dimensions
    canvas.width = ui.size.width;
    canvas.height = ui.size.height;
    
    // Modify property table width, depending on if it'd fit next to the canvas
    if(canvas.width + (document.getElementById("main-container").offsetWidth - (40 + 36))*5/12.0 + 24 > (document.getElementById("main-container").offsetWidth - (40 + 36)))
        panel.classList.remove("col-md-5");
    else
        panel.classList.add("col-md-5");
}

// Make sortable table headers respond to clicks
function sortableTableHeadersOnClick(table) {
    // Manually switch asc and desc for the sorting direction and update the table accordingly
    for(var i = 0; i < table.tHead.rows[0].children.length - 1; i++) {
        table.tHead.rows[0].children[i].addEventListener("click", function() {
            for(var j = 0; j < table.tHead.rows[0].children.length - 1; j++) {
                if(table.tHead.rows[0].children[j] == this)
                    continue;
                table.tHead.rows[0].children[j].classList.remove("headerAsc");
                table.tHead.rows[0].children[j].classList.remove("headerDesc");
            }
            if(this.classList.contains("headerAsc")) {
                this.classList.remove("headerAsc");
                this.classList.add("headerDesc");
            } else {
                this.classList.remove("headerDesc");
                this.classList.add("headerAsc");
            }
            // Finally update the table sorting
            if(table.id == "presets-selector-table")
                updatePresetTables(presetList);
            else
                updateSFPTables(sfpList);
        });
    }
}

// Update the SFP tables set and doc
function updateSFPTables(newSfpList, sortOnly) {
    // Remove the table bodies
    var setTable = document.getElementById("set-selector-table");
    var docTable = document.getElementById("doc-selector-table");
    setTable.removeChild(setTable.tBodies[0]);
    docTable.removeChild(docTable.tBodies[0]);
    
    // Add new (clean) ones
    var setBody = document.createElement("tbody");
    setBody.setAttribute("id", "set-selector-table-body");
    setTable.appendChild(setBody);
    var docBody = document.createElement("tbody");
    docBody.setAttribute("id", "doc-selector-table-body");
    docTable.appendChild(docBody);
    
    // Add the rows from the (updated) sfpList
    var index1 = 0;
    var index2 = 0;
    for(var i = 0; i < newSfpList.length; i++) {
        // Determine if row was previously present
        var selectedS = false;
        var selectedD = false;
        for(var j = 0; j < sfpList.length; j++) {
            if(newSfpList[i][1] == sfpList[j][1]) {
                selectedS = sfpList[j][5];
                selectedD = sfpList[j][6];
                break;
            }
        }
        
        newSfpList[i][5] = selectedS;
        newSfpList[i][6] = selectedD;
        
        // Check for a match in URI selection
        if((currentURI == undefined) || (currentURI == newSfpList[i][0])) {
            var newRowS = setBody.insertRow(index1++);
            // If it was previously in dataset and selected, make it selected now
            if(selectedS)
                newRowS.classList.add("selected");
            
            // Add the cell content
            var cell = newRowS.insertCell(0);
            cell.innerHTML = newSfpList[i][0];
            cell.classList.add("col-md-5");
            
            cell = newRowS.insertCell(1);
            cell.innerHTML = newSfpList[i][1];
            cell.classList.add("col-md-3");
            
            cell = newRowS.insertCell(2);
            cell.innerHTML = newSfpList[i][2];
            cell.classList.add("col-md-3");
            
            cell = newRowS.insertCell(3);
            cell.style.padding = "0px";
            
            // Add "delete" button
            var btn = document.createElement("button");
            btn.setAttribute("type", "button");
            btn.setAttribute("aria-label", "Close");
            btn.classList.add("close");
            btn.style.width = "100%";
            btn.style.height = "39px";
            btn.style.margin = "0px";
            btn.style.paddingTop = "5px";
            btn.addEventListener("click", function(globIndex) {
                return function() {
                    var gi = globIndex;

                    if(confirm("Are you sure you want to remove this SFP from the database?")) {
                        // Fadeout animation
                        var currBtn = this;
                        for(var c = 0; c < this.parentElement.parentElement.children.length; c++)
                            currBtn.parentElement.parentElement.children[c].classList.add("hide-item");
                        
                        setTimeout(function() {
                            // remove SFP from database
                            var data = {};
                            data.timestamp = sfpList[gi][1];

                            $.ajax({
                                type: "POST",
                                contentType: "application/json",
                                data: JSON.stringify(data),
                                url: window.location.href + "deleteSFP"
                            }).then(function(data) {
                                    $.notify("SFP deleted", "success");
                            });
                            
                            // Update table from Database
                            $.ajax({
                                type: "POST",
                                url: window.location.href + "getSFPs"
                            }).then(function(data) {
                                sfpList = data;
                                updateSFPTables(sfpList);
                            });

                            currentParams = undefined;
                            
                            // Find local row index
                            var ri = -1;
                            for(var i = 0; i < setTable.tBodies[0].rows.length; i++) {
                                if(setTable.tBodies[0].rows[i].children[1].innerHTML == currBtn.parentElement.parentElement.children[1].innerHTML) {
                                    ri = i;
                                    break;
                                }
                            }
                            // Remove the buttons from the current canvas
                            setTable.tBodies[0].rows[ri].classList.remove("selected");
                            updateCanvasButtons(document.getElementById("set-selector-table"),
                                                 document.getElementById("set-btns"),
                                                 document.getElementById("set-properties-table"), ri, gi);
                            // Check if we have to give up the filter
                            var last = true;
                            for(var i = 0; i < setTable.tBodies[0].rows.length; i++) {
                                if(setTable.tBodies[0].rows[i].classList.contains("selected")) {
                                    last = false;
                                    break;
                                }
                            }
                            if(last)
                                currentURI = undefined;
                            // Update the SFP tables
                            // updateSFPTables(sfpList);
                            // Update the global index for the buttons left
                            for(var i = 2; i < document.getElementById("set-canvas-panel").children.length; i++) {
                                if(document.getElementById("set-canvas-panel").children[i].tableEntry > gi)
                                    document.getElementById("set-canvas-panel").children[i].tableEntry--;
                            }
                            // Clear the set canvas (can't be updated like the current one because it isn't visible :/ )
                            cleanButtonsAndSelection(document.getElementById("doc-selector-table"),
                                                      document.getElementById("doc-btns"),
                                                      document.getElementById("doc-properties-table"));
                        }, 500);
                    }
                }
            }(i));
            
            var span = document.createElement("span");
            span.setAttribute("aria-hidden", "true");
            span.innerHTML = "&times;";
            btn.appendChild(span);
            cell.appendChild(btn);
            cell.classList.add("col-md-1");
        }
        // Check for a match in parameters
        if((currentParams == undefined) || (currentParams == newSfpList[i][2])) {
            var newRowD = docBody.insertRow(index2++);
            // If it was previously in dataset and selected, make it selected now
            if(selectedD)
                newRowD.classList.add("selected");
            // Add the cell content
            cell = newRowD.insertCell(0);
            cell.innerHTML = newSfpList[i][0];
            cell.classList.add("col-md-5");
            
            cell = newRowD.insertCell(1);
            cell.innerHTML = newSfpList[i][1];
            cell.classList.add("col-md-3");
            
            cell = newRowD.insertCell(2);
            cell.innerHTML = newSfpList[i][2];
            cell.classList.add("col-md-3");
            
            cell = newRowD.insertCell(3);
            cell.style.padding = "0px";
            
            // Create a "delete" button
            btn = document.createElement("button");
            btn.setAttribute("type", "button");
            btn.setAttribute("aria-label", "Close");
            btn.classList.add("close");
            btn.style.width = "100%";
            btn.style.height = "39px";
            btn.style.margin = "0px";
            btn.style.paddingTop = "5px";
            btn.addEventListener("click", function(globIndex) {
                return function() {
                    var gi = globIndex;
                    // TODO: pull new sfp list from server
                    
                    // Cricked: remove it locally (can't be final due to synchronization problems)
                    if(confirm("Are you sure you want to remove this SFP from the database?")) {
                        // Fadeout animation
                        for(var c = 0; c < this.parentElement.parentElement.children.length; c++) {
                            this.parentElement.parentElement.children[c].classList.add("hide-item");
                        }
                        setTimeout(function(currBtn) {
                            // remove SFP from database
                            var data = {};
                            data.timestamp = sfpList[gi][1];

                            $.ajax({
                                type: "POST",
                                contentType: "application/json",
                                data: JSON.stringify(data),
                                url: window.location.href + "deleteSFP"
                            }).then(function(data) {
                                    $.notify("SFP deleted", "success");
                            });
                            
                            // Update table from Database
                            $.ajax({
                                type: "POST",
                                url: window.location.href + "getSFPs"
                            }).then(function(data) {
                                sfpList = data;
                                updateSFPTables(sfpList);
                            });

                            // Remove entry from list
                            // sfpList.splice(gi, 1);
                            // Revoke the currently selected URI/params
                            currentURI = undefined;
                            
                            // Find local row index
                            var ri = -1;
                            for(var i = 0; i < docTable.tBodies[0].rows.length; i++) {
                                if(docTable.tBodies[0].rows[i].children[1].innerHTML == currBtn.parentElement.parentElement.children[1].innerHTML) {
                                    ri = i;
                                    break;
                                }
                            }
                            
                            // Remove the button from the current canvas
                            docTable.tBodies[0].rows[ri].classList.remove("selected");
                            updateCanvasButtons(document.getElementById("doc-selector-table"),
                                                 document.getElementById("doc-btns"),
                                                 document.getElementById("doc-properties-table"), ri, gi);
                            // Check if we have to give up the filter
                            var last = true;
                            for(var i = 0; i < docTable.tBodies[0].rows.length; i++) {
                                if(docTable.tBodies[0].rows[i].classList.contains("selected")) {
                                    last = false;
                                    break;
                                }
                            }
                            // Update the SFP tables
                            // updateSFPTables(sfpList);
                            // Update the global index for the buttons left
                            for(var i = 2; i < document.getElementById("doc-canvas-panel").children.length; i++) {
                                if(document.getElementById("doc-canvas-panel").children[i].tableEntry > gi)
                                    document.getElementById("doc-canvas-panel").children[i].tableEntry--;
                            }
                            if(last)
                                currentParams = undefined;
                            // Clear the set canvas (can't be updated like the current one because it isn't visible :/ )
                            cleanButtonsAndSelection(document.getElementById("set-selector-table"),
                                                      document.getElementById("set-btns"),
                                                      document.getElementById("set-properties-table"));
                        }(this), 500);
                    }
                }
            }(i));
            var span = document.createElement("span");
            span.setAttribute("aria-hidden", "true");
            span.innerHTML = "&times;";
            btn.appendChild(span);
            cell.appendChild(btn);
            cell.classList.add("col-md-1");
        }
    }
    
    // Replace old sfp array
    sfpList = newSfpList;
    
    // Update onclicks and buttons
    tableOnClick(document.getElementById("set-selector-table"),
                     document.getElementById("set-btns"),
                     document.getElementById("set-properties-table"));
    tableOnClick(document.getElementById("doc-selector-table"),
                     document.getElementById("doc-btns"),
                     document.getElementById("doc-properties-table"));
    
    // Manually sort the table
    var setCrit = -1;
    var docCrit = -1;
    var setAsc = true;
    var docAsc = true;
    for(var i = 0; i < document.getElementById("set-selector-head").rows[0].children.length; i++) {
        if(document.getElementById("set-selector-head").rows[0].children[i].classList.contains("headerDesc")) {
            setCrit = i;
            setAsc = false;
            break;
        } else if(document.getElementById("set-selector-head").rows[0].children[i].classList.contains("headerAsc")) {
            setCrit = i;
            setAsc = true;
            break;
        }
    }
    
    for(var i = 0; i < document.getElementById("doc-selector-head").rows[0].children.length; i++) {
        if(document.getElementById("doc-selector-head").rows[0].children[i].classList.contains("headerDesc")) {
            docCrit = i;
            docAsc = false;
            break;
        } else if(document.getElementById("doc-selector-head").rows[0].children[i].classList.contains("headerAsc")) {
            docCrit = i;
            docAsc = true;
            break;
        }
    }
    
    if(setCrit != -1) {
        
        // Add new (clean) ones
        setBody = document.createElement("tbody");
        setBody.setAttribute("id", "set-selector-table-body");
        
        var sort = tablesort(setTable.tBodies[0].rows, setCrit, setAsc);
        for(var i = 0; i < sort.length; i++)
            setBody.appendChild(sort[i]);
        
        setTable.removeChild(setTable.tBodies[0]);
        setTable.appendChild(setBody);
    }
    
    if(docCrit != -1) {
        
        docBody = document.createElement("tbody");
        docBody.setAttribute("id", "doc-selector-table-body");
        
        var sort = tablesort(docTable.tBodies[0].rows, docCrit, docAsc);
        for(var i = 0; i < sort.length; i++)
            docBody.appendChild(sort[i]);
        
        docTable.removeChild(docTable.tBodies[0]);
        docTable.appendChild(docBody);
    }
}

// Simple quicksort to sort the tables; pivot is always first entry
function tablesort(rows, criterium, asc) {
    if(rows.length == 0)
        return [];
    
    var pivot = rows[0];
    
    var left = [];
    var right = [];
    
    for(var i = 1; i < rows.length; i++) {
        if(rows[i].children[criterium].innerHTML < pivot.children[criterium].innerHTML)
            left.push(rows[i]);
        else
            right.push(rows[i]);
    }
    
    if(asc)
        return tablesort(left, criterium, asc).concat(pivot, tablesort(right, criterium, asc));
    else
        return tablesort(right, criterium, asc).concat(pivot, tablesort(left, criterium, asc));
}

function updatePresetTables(newPresetList) {
    // Remove all rows
    var presetTable = document.getElementById("presets-selector-table");
    presetTable.removeChild(presetTable.tBodies[0]);
    
    // Create new body element
    var presetBody = document.createElement("tbody");
    presetBody.setAttribute("id", "presets-selector-table-body");
    presetTable.appendChild(presetBody);
    
    for(var i = 0; i < newPresetList.length; i++) {
        // Check if row was previously present and selected
        var selected = false;
        for(var j = 0; j < presetList.length; j++) {
            if(newPresetList[i][0] == presetList[j][0]) {
                selected = presetList[j][2];
                break;
            }
        }
        
        // Add every row anew
        var newRow = presetBody.insertRow(i);
        // Select if previously selected
        if(selected) {
            newRow.classList.add("selected");
        }
        var cell = newRow.insertCell(0);
        cell.innerHTML = newPresetList[i][0];
        cell.classList.add("col-md-6");
        
        cell = newRow.insertCell(1);
        cell.innerHTML = newPresetList[i][1];
        cell.classList.add("col-md-5");
        
        cell = newRow.insertCell(2);
        cell.style.padding = "0px";
        
        // Add "delete" button
        var btn = document.createElement("button");
        btn.setAttribute("type", "button");
        btn.setAttribute("aria-label", "Close");
        btn.classList.add("close");
        btn.style.width = "100%";
        btn.style.height = "39px";
        btn.style.margin = "0px";
        btn.style.paddingTop = "5px";
        btn.addEventListener("click", function(index) {
            return function() {
                var i = index;
                
                if(confirm("Are you sure you want to remove this SFP from the database?")) {
                    // Fadeout animation
                    for(var c = 0; c < this.parentElement.parentElement.children.length; c++) {
                        this.parentElement.parentElement.children[c].classList.add("hide-item");
                    }
                    var data = {};
                    data.name = presetList[i][0];

                    $.ajax({
                        type: "POST",
                        contentType: "application/json",
                        data: JSON.stringify(data),
                        url: window.location.href + "deletePreset"
                    }).then(function(data) {
                            $.notify("Preset deleted", "success");
                    });
                    
                    // Update table from Database
                    $.ajax({
                        type: "POST",
                        url: window.location.href + "getPresets"
                    }).then(function(data) {
                        presetList = data;
                        updatePresetTables(presetList);
                    });

                }
            }
        }(i));
        
        var span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        span.innerHTML = "&times;";
        btn.appendChild(span);
        cell.appendChild(btn);
        cell.classList.add("col-md-1");
    }
    
    presetList = newPresetList;
    
    presetsTableOnClick(document.getElementById("presets-selector-table"));
    
    // Manually sort the table
    var crit = -1;
    var asc = true;
    for(var i = 0; i < document.getElementById("presets-selector-head").rows[0].children.length; i++) {
        if(document.getElementById("presets-selector-head").rows[0].children[i].classList.contains("headerDesc")) {
            crit = i;
            asc = false;
            break;
        } else if(document.getElementById("presets-selector-head").rows[0].children[i].classList.contains("headerAsc")) {
            crit = i;
            asc = true;
            break;
        }
    }
    
    if(crit != -1) {
        
        // Add new (clean) ones
        presetBody = document.createElement("tbody");
        presetBody.setAttribute("id", "presets-selector-table-body");
        
        var sort = tablesort(presetTable.tBodies[0].rows, crit, asc);
        for(var i = 0; i < sort.length; i++)
            presetBody.appendChild(sort[i]);
        
        presetTable.removeChild(presetTable.tBodies[0]);
        presetTable.appendChild(presetBody);
    }
}

// Complete clean sweep
function cleanButtonsAndSelection(sfps, parentDiv, propTable) {
    var index = 0;
    while(index < parentDiv.children.length) {
        parentDiv.removeChild(parentDiv.children[index]);
    }
    
    for(var i = 0; i < sfps.tBodies[0].rows.length; i++) {
        if(sfps.tBodies[0].rows[i].classList.contains("selected")) {
            sfps.tBodies[0].rows[i].classList.remove("selected");
        }
    }
    
    propTable.tBodies[0].rows[0].children[1].innerHTML = "";
    propTable.tBodies[0].rows[1].children[1].innerHTML = "";
    propTable.tBodies[0].rows[2].children[1].innerHTML = "";
    propTable.tBodies[0].rows[3].children[1].innerHTML = "";
    propTable.tBodies[0].rows[4].children[1].innerHTML = "";
    
    if(parentDiv.id == "set-btns")
        document.getElementById("export-csv-set").classList.add("disabled");
    else
        document.getElementById("export-csv-doc").classList.add("disabled");
}

// Update the buttons drawn on the canvas'
// Params: the corresponding table, the parent panel of the canvas,
// the row index of the clicked row and the global index of the clicked row (entry)
function updateCanvasButtons(sfps, parentDiv, propTable, rowIndex, globalIndex)
{
    // If row got deselected, remove the corresponding button, else add one
    if(!sfps.tBodies[0].rows[rowIndex].classList.contains("selected")) {
        var clicked = -1;
        for(var i = 0; i < parentDiv.children.length; i++) {
            if(parentDiv.children[i].tableEntry == globalIndex) {
                // If removed button was clicked, automatically select new clicked button
                if(parentDiv.children[i].hasAttribute("clicked"))
                    clicked = i;
                
                parentDiv.removeChild(parentDiv.children[i]);
                break;
            }
        }
        
        // If the removed button was clicked and there are buttons remaining, pass on the click
        if(parentDiv.children.length > 0) {
            if(clicked > -1) {
                if(clicked >= parentDiv.children.length)
                    clicked--;
                
                canvasButtonOnClick(propTable, parentDiv, parentDiv.children[clicked])();
            }
        } else {
            // If no button is left, clean out the property table
            propTable.tBodies[0].rows[0].children[1].innerHTML = "";
            propTable.tBodies[0].rows[1].children[1].innerHTML = "";
            propTable.tBodies[0].rows[3].children[1].innerHTML = "";
            propTable.tBodies[0].rows[2].children[1].innerHTML = "";
            
            // AND clean the canvas
            if(parentDiv.id === "set-btns") {
                networkSet.setData({nodes: [], edges: []});
                document.getElementById("export-csv-set").classList.add("disabled");
            }
            else {
                networkDoc.setData({nodes: [], edges: []});
                document.getElementById("export-csv-doc").classList.add("disabled");
            }
        }
    }
    else {
        btn = document.createElement("button");
        
        // Set style and classes
        btn.classList.add("btn");
        btn.classList.add("btn-default");
        
        // Get the right label from the global table
        btn.tableEntry = globalIndex;
        if(sfps.id == "set-selector-table")
            btn.innerHTML = sfpList[globalIndex][2];
        else
            btn.innerHTML = sfpList[globalIndex][0];
        
        // If it's the first button, make it clicked
        if(parentDiv.children.length == 0)
            canvasButtonOnClick(propTable, parentDiv, btn)();
        
        // Onclick of button: set 'clicked' tag
        btn.onclick = (function() {
                return canvasButtonOnClick(propTable, parentDiv, btn);
            })();
        
        // Add the new button
        parentDiv.appendChild(btn);
        
        // Activate the export button
        if(parentDiv.id === "set-btns") 
            document.getElementById("export-csv-set").classList.remove("disabled");
        else
            document.getElementById("export-csv-doc").classList.remove("disabled");
    }
}

// Canvas button onclick to fill the property tables
function canvasButtonOnClick(propTable, parentDiv, button) {
    return function() {
        // First remove the click from every other button (only one allowed/reasonable)
        for(var j = 0; j < parentDiv.children.length; j++) {
            parentDiv.children[j].removeAttribute("clicked");
        }
        // Then mark the clicked button as clicked
        button.setAttribute("clicked", "");
        
        // Fill the property table with the correct table entries
        propTable.tBodies[0].rows[0].children[1].innerHTML = sfpList[button.tableEntry][1];
        propTable.tBodies[0].rows[1].children[1].innerHTML = sfpList[button.tableEntry][0];
        propTable.tBodies[0].rows[3].children[1].innerHTML = sfpList[button.tableEntry][2];
        propTable.tBodies[0].rows[2].children[1].innerHTML = sfpList[button.tableEntry][3];
        
        // Parse the corresponding sfp XML
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString("<?xml version='1.0'?>"+sfpList[button.tableEntry][4], "text/xml");
         
        // Setup the nodes and edges
        var nodeStrings = [];
        var nodes = [];
        var edges = [];
        
        // The subjects are in the description tags
        var descs = xmlDoc.getElementsByTagNameNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "Description");
        
        for(var i = 0; i < descs.length; i++)
        {
            var child = descs[i].firstChild;
            
            // Get the RDF triple
            var subject = descs[i].getAttributeNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "about");
            var relation = child.localName.replace(/[0-9]/g, '');
            var object = child.textContent;
            
            // See if we already have a node with the same name (aka the same node) for both subject and object
            var nodeIndex1 = nodeStrings.indexOf(subject);
            if(nodeIndex1 < 0) {
                nodeIndex1 = nodeStrings.length;
                nodeStrings.push(subject);
                nodes.push({id: nodeIndex1, label: subject});
            }
            var nodeIndex2 = nodeStrings.indexOf(object);
            if(nodeIndex2 < 0) {
                nodeIndex2 = nodeStrings.length;
                nodeStrings.push(object);
                nodes.push({id: nodeIndex2, label: object});
            }
            
            // Add a new edge
            edges.push({from: nodeIndex1, to: nodeIndex2, label: relation});
        }
        
        // Setup the nodes and edges (for visjs this time)
        var nodesNet = new vis.DataSet(nodes);
        var edgesNet = new vis.DataSet(edges);
        
        var data = {
            nodes: nodesNet,
            edges: edgesNet
        };
        
        // Determine the relevant network and set data
        if(parentDiv.id === "set-btns") {
            networkSet.setData(data);
            networkSet.redraw();
        }
        else {
            networkDoc.setData(data);
            networkDoc.redraw();
        }
    }
}

// Change caption of buttons on toggle
function toggleSetDocTables() {
    if(this.classList.contains("collapsed"))
        this.innerHTML = "Hide SFP selection";
    else
        this.innerHTML = "Show SFP selection";
}

// If only a mark when clicked is necessary, use this function
function presetsTableOnClick(table) {
    for(var i = 0; i < table.tBodies[0].rows.length; i++) {
        for(var j = 0; j < table.tBodies[0].rows[i].children.length - 1; j++) {
            table.tBodies[0].rows[i].children[j].addEventListener("click", function(row) {
                return function() {
                    row.classList.toggle("selected");
                    
                    // Toggle the select in the preset list as well
                    var glob = -1;
                    var name = row.children[0].innerHTML;
                    for(var k = 0; k < presetList.length; k++) {
                        if(name == presetList[k][0]) {
                            glob = k;
                            break;
                        }
                    }
                    presetList[glob][2] = !presetList[glob][2];
                }
            }(table.tBodies[0].rows[i]));
        }
    }
};

// TODO: optimizable...
// Here the rows of the set and doc table for SFP selection get their onclicks
function tableOnClick(table, panel, prop) {
    // Exclude table header
    for(var i = 0; i < table.tBodies[0].rows.length; i++) {
        for(var j = 0; j < table.tBodies[0].rows[i].children.length - 1; j++) {
            table.tBodies[0].rows[i].children[j].addEventListener("click", function(row) {
                return function() {
                    // Exclude the headers, they are already dealt with using the tablesorter library
                    if(row.parentElement.tagName.toLowerCase != "thead") {
                        // Get the local row index
                        // Unfortunately, we can't just use the index from the outer loop due to the potential discrepancy
                        // caused by the sorting. TODO: find a way around that?
                        var k = -1;
                        var sel = 0;
                        for(var a = 0; a < table.tBodies[0].rows.length; a++) {
                            if(table.tBodies[0].rows[a] == row)
                                k = a;
                            else if(table.tBodies[0].rows[a].classList.contains("selected"))
                                sel++;
                        }
                        // Mark the corresponding table row
                        
                        table.tBodies[0].rows[k].classList.toggle("selected");
                        
                        // Get the global index
                        // The timestamp entry is used as a key, so don't get sloppy with that!
                        var g = -1;
                        var timestamp = row.children[1].innerHTML;
                        for(var a = 0; a < sfpList.length; a++) {
                            if(sfpList[a][1] == timestamp) {
                                g = a;
                                break;
                            }
                        }
                        if(table.id == "set-selector-table")
                            sfpList[g][5] = !sfpList[g][5];
                        else
                            sfpList[g][6] = !sfpList[g][6];
                        
                        // See if we have new filters (URI or params)
                        if(table.tBodies[0].rows[k].classList.contains("selected"))
                            sel++;
                        
                        if(sel == 1) {
                            if(table.id == "set-selector-table")
                                currentURI = sfpList[g][0];
                            else
                                currentParams = sfpList[g][2];
                        } else if(sel == 0) {
                            if(table.id == "set-selector-table")
                                currentURI = undefined;
                            else
                                currentParams = undefined;
                        }
                        
                        // Finally, update the canvas buttons (remove/add one)
                        updateCanvasButtons(table,
                                             panel,
                                             prop,
                                             k, g);
                        updateSFPTables(sfpList);
                    }
                }
            }(table.tBodies[0].rows[i]));
        }
        
    }
};

// Animation function
function toggleSelectionOnClick(toPresets) {
    // Toggle the classes designating the animations from left/right etc.
    var specButton = document.getElementById("spec-button");
    var presetsButton = document.getElementById("presets-button");
    
    // Switch button state (enabled/disabled) depending on animation direction
    if(toPresets) {
        specButton.removeAttribute("disabled");
        presetsButton.setAttribute("disabled", "");
    } else {
        specButton.setAttribute("disabled", "");
        presetsButton.removeAttribute("disabled");
    }
    
    // Toggle all animation classes for the elements involved
    
    // Rotate the (clickable) labels aka. the buttons
    document.getElementById("spec-label").classList.toggle("div-rotate-center-left");
    document.getElementById("spec-label").classList.toggle("div-rotate-left-center");
    document.getElementById("presets-label").classList.toggle("div-rotate-right-center");
    document.getElementById("presets-label").classList.toggle("div-rotate-center-right");
    
    // Move and scale the form and the table for the parameters/presets
    document.getElementById("param-specification").classList.toggle("div-center-to-left");
    document.getElementById("param-specification").classList.toggle("div-left-to-center");
    document.getElementById("presets-selector").classList.toggle("div-right-to-center");
    document.getElementById("presets-selector").classList.toggle("div-center-to-right");
    
    // Move and scale the name+save button for a potential new preset
    document.getElementById("save-params").classList.toggle("div-center-to-bottom");
    document.getElementById("save-params").classList.toggle("div-bottom-to-center");
};

function addPresetOnClick() {
    // Grab the input field values
    var name = document.getElementById("input-set-name").value;
    
    var paramVals = [0, 0, 0, 0, 0];
    
    paramVals[0] = document.getElementById("param1max").value;
    paramVals[1] = document.getElementById("param2max").value;
    paramVals[2] = document.getElementById("param3max").value;
    paramVals[3] = document.getElementById("param4max").value;
    paramVals[4] = document.getElementById("param5").value;

    // Make sure every parameter is specified and valid
    for(var i = 0; i < paramVals.length; i++) {
        if((i < 4) && isNaN(Number(paramVals[i]))) {
            $.notify("Non-numerical parameters!", "error");
            return ;
        }
        if(paramVals[i] == "") {
            $.notify("Undefined parameters!", "error");
            return ;
        }
    }
    
    if(document.getElementById("input-set-name").value == "") {
        $.notify("Preset name required!", "error");
        return ;
    }
    
    // Add new preset to table/server-side list
    var data = {};
    data.name = document.getElementById("input-set-name").value;
    
    data.params = paramVals;
    presetList[presetList.length] = [name, paramVals, false];
    updatePresetTables(presetList);
    
    $.ajax({
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(data),
        url: window.location.href + "addPreset"
    }).then(function(data){   
            $.notify("Preset added", "success");   
    });
}

// Generate a new SFP (or rather send a request to the server to make that SFP)
function generateSFPOnClick() {
    // 2d array holding the parameters of one or more sets
    var paramList = [];
    
    // Check which inputs to use
    if(document.getElementById("spec-button").disabled) {
        // Grab input field values
        var paramVals = [0, 0, 0, 0, 0];
        paramVals[0] = document.getElementById("param1max").value;
        paramVals[1] = document.getElementById("param2max").value;
        paramVals[2] = document.getElementById("param3max").value;
        paramVals[3] = document.getElementById("param4max").value;
        paramVals[4] = document.getElementById("param5").value;
        
        // Make sure every parameter is specified and valid
        for(var i = 0; i < paramVals.length; i++) {
            if((i < 4) && isNaN(Number(paramVals[i]))) {
                $.notify("Non-numerical parameters!", "error");
                return ;
            }
            if(paramVals[i] == "") {
                $.notify("Undefined parameters!", "error");
                return ;
            }
        }
        
        paramPush = [[paramVals[0]], [paramVals[1]], [paramVals[2]], [paramVals[3]], [paramVals[4]]];
        
        paramList.push(paramPush);
    } else {
        // Add all selected presets to the list
        var table = document.getElementById("presets-selector-table");
        for(var i = 0; i < table.tBodies[0].rows.length; i++) {
            if(table.tBodies[0].rows[i].classList.contains("selected")) {
                var params = table.tBodies[0].rows[i].children[1].innerHTML;
                
                // Split the strings to get the numbers
                // TODO: if other format is desirable, change this accordingly
                var paramSplit = params.toString().split(",");
                var paramVals = [];
                for(var j = 0; j < paramSplit.length; j++)
                    paramVals.push(paramSplit[j].split("/"));
                
                paramList.push(paramVals);
            }
        }
        
        // At least one preset has to be selected if this method was chosen
        if(paramList.length == 0) {
            $.notify("No preset selected!", "error");
            return ;
        }
    }
    
    // Check if any URIs were specified
    if(document.getElementById("uri-area").value == "") {
        $.notify("URI required!", "error");
        return ;
    }

    var data = {};
    data.weburis = document.getElementById("uri-area").value;
    data.params = JSON.stringify(paramList);
    
    $.ajax({
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(data),
        processData: false,
        url: window.location.href + "generateSFP"
    }).then(function(data){
        
        $.notify("SFP added to jobqueue", "success");
        updateJobQueueCounter();
    });
};