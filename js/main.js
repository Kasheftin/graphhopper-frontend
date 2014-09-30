require.config({
    waitSeconds: 0,
    paths: {
        "jquery"             : "../lib/jquery/dist/jquery",
        "knockout-source"    : "../lib/knockout/dist/knockout.debug",
        "domReady"           : "../lib/requirejs-domready/domReady",
        "EventEmitter"       : "../lib/EventEmitter/EventEmitter",
        "text"               : "../lib/requirejs-text/text",
        "leaflet"            : "../lib/leaflet/dist/leaflet-src",
        "knockout.sortable"  : "../lib/knockout-sortable/build/knockout-sortable"
    },
    packages: [{
        name: "jquery.ui.sortable",
        location: "../lib/jquery-ui/ui",
        main: "sortable"
    }]
});

require(["domReady!","knockout","EventEmitter","ghc","config","knockout.sortable"],function(doc,ko,EventEmitter,GHC,config) {
    var RootContext = function() {
        this.eventEmitter = new EventEmitter();
    }

    GHC.apiKey = config.graphhopperKey;

    ko.applyBindings(new RootContext);
});
