define(["jquery","knockout","leaflet","config"],function($,ko,L,config) {

	var Map = function(o) {
		var self = this;
		this.eventEmitter = o.core.eventEmitter;
		this.markers = [];
		this.paths = [];
		this.overPath = null;
		this.overIndex = null;
		this.overEnabled = true;

		this.eventNames = "setBBox clearMarkers clearPaths clearAll drawMarker drawPath drawMarkers drawPaths".split(/ /);
		this.eventNames.forEach(function(eventName) {
			self.eventEmitter.on("map."+eventName,function() {
				if (typeof self[eventName] == "function")
					self[eventName].apply(self,arguments);
			});
		});
	}

	Map.prototype.setBBox = function(points) {
		var bounds = new L.LatLngBounds();
		points.forEach(function(point) {
			point && point.lat && point.lng && bounds.extend([point.lat,point.lng]);
		});
		this.map && bounds.isValid() && this.map.fitBounds(bounds);
	}

	Map.prototype.clearMarkers = function() {
		var self = this;
		this.map && this.markers && (this.markers.length>0) && this.markers.forEach(function(marker) {
			self.map.removeLayer(marker);
		});
		this.markers = [];
	}

	Map.prototype.clearPaths = function() {
		var self = this;
		this.map && this.paths && (this.paths.length>0) && this.paths.forEach(function(path) {
			self.map.removeLayer(path);
		});
		this.paths = [];
		this.clearOverPath();
	}

	Map.prototype.clearOverMarker = function() {
		this.map && this.overMarker && this.map.removeLayer(this.overMarker);
		this.overMarker = null;
		this.overMarkerIsHovered = false;
		this.overMarkerIsDragged = false;
	}

	Map.prototype.clearOverPath = function() {
		this.map && this.overPath && this.map.removeLayer(this.overPath);
		this.overPath = null;	
		this.overIndex = null;
	}

	Map.prototype.clearAll = function() {
		this.clearMarkers();
		this.clearPaths();
		this.clearOverMarker();
		this.clearOverPath();
	}

	Map.prototype.drawMarker = function(point,index,isMiddlePoint) {
		var self = this;
		if (this.map && point && point.lat && point.lng) {
			var markerOptions = {draggable:true};
			if (isMiddlePoint) markerOptions.icon = L.icon(config.middleMarkerIcon);
			var m = L.marker([point.lat,point.lng],markerOptions).addTo(this.map);
			m.on("dragend",function(e) {
				var position = e.target.getLatLng();
				self.eventEmitter.emit("directions.setPointCoords",{lat:position.lat,lng:position.lng,index:index});
			}).on("click",function(e) {
				if (isMiddlePoint) {
					self.eventEmitter.emit("directions.removePoint",index);
				}
			});
			this.markers.push(m);
		}
	}

	Map.prototype.findClosestPolyPoint = function(p,points) {
		if (!p || !points || points.length==0) return null;
		var dMin = null, dp1 = null, dp2 = null;
		var pC = new L.Point(p.lat,p.lng);
		for (var i = 0; i < points.length-1; i++) {
			var p1 = new L.Point(points[i].lat,points[i].lng);
			var p2 = new L.Point(points[i+1].lat,points[i+1].lng);
			var d = L.LineUtil.pointToSegmentDistance(pC,p1,p2);
			if (d && (dMin==null || d<dMin)) { dMin = d; dp1 = p1; dp2 = p2; di = i; }
		}
		if (dp1!=null && dp2!=null) {
			var p = L.LineUtil.closestPointOnSegment(pC,dp1,dp2);
			return {lat:p.x,lng:p.y};
		}		
		return null;
	}

	Map.prototype.refreshOverMarker = function(e) {
		var self = this;
		if (!e || !e.latlng || !this.map) return;
		if (!this.overMarker) {
			this.overMarker = L.marker(e.latlng,{draggable:true,icon:L.icon(config.overMarkerIcon)}).addTo(this.map);
			this.overMarker.on("mouseover",function() {
				self.overMarkerIsHovered = true;
			}).on("mouseout",function() {
				self.overMarkerIsHovered = false;
			}).on("dragstart",function() {
				self.overMarkerIsDragged = true;
			}).on("dragend",function() {
				self.overMarkerIsDragged = false;
				var latlng = self.overMarker.getLatLng();
				self.eventEmitter.emit("directions.insertPoint",{lat:latlng.lat,lng:latlng.lng,index:self.overIndex+1});
				self.clearOverPath();
				self.clearOverMarker();
			});
		}
		var overPath = this.overIndex>=0 ? this.paths[this.overIndex] : null;
		if (overPath) {
			var p = this.findClosestPolyPoint(e.latlng,overPath.getLatLngs());
			if (p && p.lat && p.lng) this.overMarker.setLatLng(p);
		}
	}

	Map.prototype.drawOverPath = function(path) {
		var self = this;
		if (this.map && path && path.length>0) {
			this.overPath = L.polyline(path,{weight:70,opacity:0.04,smoothFactor:10}).addTo(this.map);
			this.overPath.on("mousemove",function(e) {
				self.refreshOverMarker(e);
			}).on("mouseover",function(e) {
				self._clearOverPathTimeout && clearTimeout(self._clearOverPathTimeout);
				delete self._clearOverPathTimeout;
			}).on("mouseout",function(e) {
				if (self.overMarkerIsHovered || self.overMarkerIsDragged) return;
				self._clearOverPathTimeout = setTimeout(function() {
					if (self.overMarkerIsHovered || self.overMarkerIsDragged) return;
					self.clearOverPath();
					self.clearOverMarker();
				},200);
			});
		}
	}

	Map.prototype.drawPath = function(path,index) {
		var self = this;
		if (this.map && path && path.length>0) {
			var p = L.polyline(path,{smoothFactor:2}).addTo(this.map);
			p.on("mouseover",function(e) {
				if (!self.overEnabled || self.overMarkerIsHovered || self.overMarkerIsDragged) return;
				if (index != self.overIndex) {
  					self.clearOverPath();
					self.overIndex = index;
					self.drawOverPath(path);
					self.refreshOverMarker(e);
				}
			});
			this.paths[index] = p;
		}
	}

	Map.prototype.drawMarkers = function(data) {
		var self = this;
		var l = data.length;
		data.forEach(function(point,index) {
			self.drawMarker(point,index,index>0 && index<l-1);
		});
	}
  
	Map.prototype.drawPaths = function(data) {
		data.forEach(function(path,index) {
			self.drawPath(path,index);
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