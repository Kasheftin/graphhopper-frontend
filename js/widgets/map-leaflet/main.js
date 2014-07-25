define(["jquery","knockout","leaflet","config","pathDecoder"],function($,ko,L,config,PathDecoder) {

	var Map = function(o) {
		var self = this;
		this.eventEmitter = o.core.eventEmitter;
		this.eventEmitter.on("map.setBBox",function(data) {
			self.map && data && self.map.fitBounds(L.latLngBounds([data[1],data[0]],[data[3],data[2]]));
		});
		this.eventEmitter.on("map.redrawPath",function(path,data) {
			self.clearPath();
			self.drawPath(path);
			self.clearMarkers();
			self.drawMarkers(data);
		});
		this.eventEmitter.on("map.clearPath",function() {
			self.clearPath();
			self.clearMarkers();
		});
		this.markers = [];
	}

	Map.prototype.clearPath = function() {
		if (this.map && this.path) {
			this.map.removeLayer(this.path);
		}
	}

	Map.prototype.drawPath = function(path) {
		if (!this.map) return;
		var decoder = new PathDecoder;
		var points = decoder.decodePath(path);
		if (points && points.length>0) {
			this.path = L.polyline(points).addTo(this.map);
		}
	}

	Map.prototype.clearMarkers = function() {
		var self = this;
		if (this.map && this.markers && this.markers.length>0)
			this.markers.forEach(function(marker) {
				self.map.removeLayer(marker);
			});
		this.markers = [];
	}

	Map.prototype.drawMarkers = function(data) {
		if (!this.map) return;
		var self = this;
		data.forEach(function(hit,index) {
			var m = L.marker([hit.point.lat,hit.point.lng],{draggable:true}).addTo(self.map);
			m.on("dragend",function(e) {
				var position = e.target.getLatLng();
				self.eventEmitter.emit("directions.setHitCoords",{lat:position.lat,lng:position.lng,index:index});
			});
			self.markers.push(m);
		});
	}
  
	Map.prototype.domInit = function(o) {
		var container = $(o.firstDomChild).find("#map").get(0);
		this.map = L.map(container,{zoomControl:false}).setView([config.startPosition.lat,config.startPosition.lng],config.startPosition.zoom);

		var tileLayer = L.tileLayer('http://{s}.tiles.mapbox.com/v3/kasheftin.j1doepbn/{z}/{x}/{y}.png',{
		    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
		    maxZoom: 18
		});
		tileLayer.addTo(this.map);

		var zoomControl = new L.Control.Zoom({position:"topright"});
		zoomControl.addTo(this.map);
	}

	return Map;
});