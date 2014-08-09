define(["jquery","knockout","leaflet","config"],function($,ko,L,config) {

	var Map = function(o) {
		var self = this;
		this.resetData();
		this.eventEmitter = o.core.eventEmitter;
		this.eventNames = "setBBox clearAll updatePoints updateRoutes".split(/ /);
		this.eventNames.forEach(function(eventName) {
			self.eventEmitter.on("map."+eventName,function() {
				if (typeof self[eventName] == "function")
					self[eventName].apply(self,arguments);
			});
		});
	}

	Map.prototype.resetData = function() {
		this.points = [];
		this.routes = [];
		this.overId = null;
		this.overPolyline = null;
		this.overMarker = null;
		this.overMarkerIsHovered = false;
		this.overMarkerIsDragged = false;		
	}

	Map.prototype.setBBox = function(points) {
		var bounds = new L.LatLngBounds();
		points.forEach(function(point) {
			point && point.lat && point.lng && bounds.extend([point.lat,point.lng]);
		});
		this.map && bounds.isValid() && this.map.fitBounds(bounds);
	}

	Map.prototype.clearAll = function() {
		var self = this;
		if (this.map) {
			this.points && (this.points.length>0) && this.points.forEach(function(point) {
				point.marker && self.map.removeLayer(point.marker);
			});
			this.routes && (this.routes.length>0) && this.routes.forEach(function(route) {
				route.polyline && self.map.removeLayer(route.polyline);
			});
			this.overMarker && this.map.removeLayer(overMarker);
			this.overPolyline && this.map.removeLayer(overPolyline);
		}
		resetData();
	}

	Map.prototype.clearOverMarker = function() {
		this.map && this.overMarker && this.map.removeLayer(this.overMarker);
		this.overMarker = null;
		this.overMarkerIsHovered = false;
		this.overMarkerIsDragged = false;
	}

	Map.prototype.clearOverPolyline = function() {
		this.map && this.overPolyline && this.map.removeLayer(this.overPolyline);
		this.overPolyline = null;	
		this.overId = null;
	}

	Map.prototype.updatePoints = function(points) {
		var self = this;
		if (!this.map) return;
		var pointsByIds = {};
		points.forEach(function(p) {
			pointsByIds[p.id] = p;
		});
		var existPointsByIds = {};
		for (var i = 0; i < this.points.length; i++) {
			var point = this.points[i];
			var newData = pointsByIds[point.id];
			if (newData) {
				point.marker && point.marker.setLatLng([newData.lat,newData.lng]);
				existPointsByIds[point.id] = point;
			}
			else {
				point.marker && this.map.removeLayer(point.marker);
				this.points.splice(i,1);
				i--;				
			}
		}
		for (var i = 0; i < points.length; i++) {
			(function(i) {
				var newData = points[i];
				var isMiddle = (i>0&&i<points.length-1);
				var point = existPointsByIds[newData.id];
				if (point) {
					point.marker && point.marker.setIcon(isMiddle?L.icon(config.middleMarkerIcon):new L.Icon.Default);
					point.isMiddle = isMiddle;
				}
				else {
					var markerOptions = {draggable:true};
					if (isMiddle) markerOptions.icon = L.icon(config.middleMarkerIcon);
					var point = {id:newData.id,isMiddle:isMiddle};
					point.marker = L.marker([newData.lat,newData.lng],markerOptions).addTo(self.map);
					point.marker.on("dragend",function(e) {
						var position = e.target.getLatLng();
						self.eventEmitter.emit("directions.setPointCoords",{lat:position.lat,lng:position.lng,id:point.id});
					}).on("click",function(e) {
						if (point.isMiddle) {
							self.eventEmitter.emit("directions.removePoint",point.id);
						}
					});
					self.points.push(point);
				}
			})(i);	
		}
	}

	Map.prototype.updateRoutes = function(routes) {
		var self = this;
		if (!this.map) return;
		var routesByIds = {};
		var oldIds = {};
		routes.forEach(function(route) {
			routesByIds[route.id] = route;
		});
		this.routes.forEach(function(route) {
			oldIds[route.id] = true;
		});
		for (var i = 0; i < this.routes.length; i++) {
			var route = this.routes[i];
			if (routesByIds[route.id]) {
				this.routes[i].pointIndex = routesByIds[route.id].pointIndex;
			}
			else {
				route.polyline && this.map.removeLayer(route.polyline);
				this.routes.splice(i,1);
				i--;
			}
		}
		for (var i = 0; i < routes.length; i++) {
			(function(i) {
				var newData = routes[i];
				if (!oldIds[newData.id]) {
					var route = {id:newData.id,points:newData.points,pointIndex:newData.pointIndex};
					route.polyline = L.polyline(newData.points,{smoothFactor:2}).addTo(self.map);
					route.polyline.on("mouseover",function(e) {
						if (self.overMarkerIsHovered || self.overMarkerIsDragged) return;
						if (route.id != self.overId) {
							console.log("over pointIndex",route.pointIndex);
  							self.clearOverPolyline();
							self.overId = route.id;
							self.drawOverPolyline(route);
							self.refreshOverMarker(e);
						}
					});
					self.routes.push(route);
				}
			})(i);
		}
	}

	Map.prototype.drawOverPolyline = function(route) {
		var self = this;
		if (this.map && route && route.points && route.points.length>0) {
			this.overPolyline = L.polyline(route.points,{weight:70,opacity:0.04,smoothFactor:10}).addTo(this.map);
			this.overPolyline.on("mousemove",function(e) {
				self.refreshOverMarker(e);
			}).on("mouseover",function(e) {
				self._clearOverPolylineTimeout && clearTimeout(self._clearOverPolylineTimeout);
				delete self._clearOverPolylineTimeout;
			}).on("mouseout",function(e) {
				if (self.overMarkerIsHovered || self.overMarkerIsDragged) return;
				self._clearOverPolylineTimeout = setTimeout(function() {
					if (self.overMarkerIsHovered || self.overMarkerIsDragged) return;
					self.clearOverPolyline();
					self.clearOverMarker();
				},200);
			});
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
				var overRoute = self.findRouteById(self.overId);
				if (overRoute) self.eventEmitter.emit("directions.insertPoint",{lat:latlng.lat,lng:latlng.lng,index:(overRoute.pointIndex||0)+1});
				self.clearOverPolyline();
				self.clearOverMarker();
			});
		}
		var overRoute = this.findRouteById(this.overId);
		if (overRoute && overRoute.polyline) {
			var p = this.findClosestPolyPoint(e.latlng,overRoute.polyline.getLatLngs());
			if (p && p.lat && p.lng) this.overMarker.setLatLng(p);
		}
	}

	Map.prototype.findRouteById = function(id) {
		for (var i = 0; i < this.routes.length; i++)
			if (this.routes[i].id==id) return this.routes[i];
		return null;
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