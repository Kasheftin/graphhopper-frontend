define(["jquery","knockout","config","ghc"],function($,ko,config,GHC) {

	var Point = function(options) {
		if (!options) options = {};
		this.id = options.id||this.generateUniqueId();
		this.value = ko.observable(options.value||"");
		options.coords && this.setCoords(options.coords);
	}
	Point.prototype.generateUniqueId = function() {
		var out = "point-";
		var availLetters = "1234567890qwertyuiopasdfghjklzxcvbnm";
		for (var i = 0; i < 16; i++)
			out += availLetters.substr(Math.floor(Math.random()*availLetters.length),1);
		return out;
	}
	Point.prototype.createAutocomplete = function(self,e) {
		if (this.autocomplete) return this.autocomplete.setTarget(e.target);
		this.autocomplete = new GHC.Autocomplete(e.target);
	}
	Point.prototype.destroy = function() {
		this.autocomplete && this.autocomplete.destroy();
	}
	Point.prototype.getDataAsync = function(callback) {
		if (this.autocomplete) {
			var data = this.autocomplete.getData();
			if (data) return callback(data);
		}
		GHC.geocodeService().geocode({value:this.value(),limit:1},function(result) {
			return callback(result[0]);
		});
	}
	Point.prototype.setCoords = function(coords) {
		this.value(coords.lat+", "+coords.lng);
		this.autocomplete && this.autocomplete.reset();
	}


	var Directions = function(o) {
		var self = this;
		this.eventEmitter = o.core.eventEmitter;
		this.travelMode = ko.observable("car");
		this.points = ko.observableArray();
		this.addPoint({},0);
		this.addPoint({},0);
		this.eventEmitter.on("directions.setPointCoords",function(ar) {
			if (!ar || !ar.id) return;
			var point = self.findPointById(ar.id);
			point && point.setCoords(ar);
			self.apply("movePoint",ar.index);
		});
		this.eventEmitter.on("directions.insertPoint",function(ar) {
			if (!ar || !ar.lat || !ar.lng || typeof ar.index == "undefined") return;
			self.addPoint({coords:ar},ar.index);
			self.apply("insertPoint",ar.index);
		});
		this.eventEmitter.on("directions.removePoint",function(id) {
			self.removePointById(id);
			self.apply("removePoint");
		});

		this.summaryIsReady = ko.observable(false);
		this.instructionsAreVisible = ko.observable(false);
		this.totalDistance = ko.observable();
		this.totalTime = ko.observable();
		this.instructions = ko.observableArray();
		this.totalTimeFormatted = ko.computed(function() {
			return self.formatTime(self.totalTime());
		});
		this.totalDistanceFormatted = ko.computed(function() {
			return self.formatDistance(self.totalDistance());
		});
	}

	Directions.prototype.findPointById = function(id) {
		for (var i = 0; i < this.points().length; i++)
			if (this.points()[i].id==id) return this.points()[i];
		return null;
	}

	Directions.prototype.afterRenderPoint = function(domNode,point) {
		$(domNode).find("input.form-control").focus();
	}

	Directions.prototype.beforeRemovePoint = function(domNode,index,point) {
		point && point.destroy();
		$(domNode).remove();
	}

	Directions.prototype.formatTime = function(t) {
		if (!t) return "";
		t = Math.floor(t/1000);
		if (t>7200) return Math.ceil(t/3600) + " hours";
		if (t>120) return Math.ceil(t/60) + " min";
		return Math.ceil(t/1000) + " sec";		
	}

	Directions.prototype.formatDistance = function(d) {
		if (!d) return;
		d = Math.floor(d);
		if (d>2000) return Math.ceil(d/1000) + "km";
		return d + "m";		
	}

	Directions.prototype.switchInstructionsVisibility = function() {
		this.instructionsAreVisible(!this.instructionsAreVisible());
	}

	Directions.prototype.addPoint = function(options,index) {
		if (index>=0) this.points.splice(index,0,new Point(options));
		else this.points.push(new Point(options));
	}

	Directions.prototype.removePoint = function(i) {
		this.points.splice(i,1);
	}

	Directions.prototype.removePointById = function(id) {
		for (var i = 0; i < this.points().length; i++) {
			if (this.points()[i].id==id) {
				this.points.splice(i,1);
				i--;
			}
		}
	}

	Directions.prototype.removePointAndApply = function(index) {
		this.removePoint(index);
		this.apply("removePoint",index);
	}

	Directions.prototype.apply = function(mode,index) {
		var self = this;
		// We create result object and append it step by step by points data, then by routes, and then draw it
		var result = {mode:mode,index:index};
		this.getPointsData(result,function(result) {
			self.getRoutesData(result,function(result) {
				self.redraw(result);
			});
		});
	}

	Directions.prototype.getPointsData = function(result,callback) {
		var self = this;
		var l = this.points().length;
		var loadedI = 0;
		var points = [];
		this.points().forEach(function(p,i) {
			p.getDataAsync(function(hit) {
				points[i] = (hit && hit.point ? hit.point : null);
				if (points[i]!=null) points[i].id = p.id;
				loadedI++;
				if (loadedI==l) {
					for (var ii = 0; ii < l; ii ++) {
						if (points[ii]==null) {
							points.splice(ii,1);
							if (l>2) self.removePoint(ii);
							ii--;
							l--;
						}
					}
					result.points = points;
					callback(result);
				}
			});
		});
	}

	Directions.prototype.getRoutesData = function(result,callback) {
		var self = this;
		if (!this.routesByIds) this.routesByIds = {};
		var l = result.points.length;
		var loadedI = 0;
		result.routes = [];
		if (l==0) callback(result);
		var addRoute = function(route,index) {
			route.pointIndex = index;
			result.routes[index] = route;
			loadedI++;
			if (loadedI==l-1) callback(result);
		}
		for (var i = 0; i < l-1; i++) {
			(function(i) {
				var routeId = self.generateRouteId({start:result.points[i],end:result.points[i+1],travelMode:self.travelMode()});
				if (self.routesByIds[routeId]) addRoute(self.routesByIds[routeId],i);
				else {
					GHC.directionsService().route({
						points: [result.points[i],result.points[i+1]],
						travelMode: self.travelMode()
					},function(route) {
						route.id = routeId;
						self.routesByIds[routeId] = route;
						addRoute(route,i);
					});
				}
			})(i);
		}
	}

	Directions.prototype.generateRouteId = function(options) {
		var out = "route-";
		if (!options) return out;
		out += (options.travelMode||"")+"-";
		if (options.start) out += options.start.lat+","+options.start.lng;
		out += "-";
		if (options.end) out += options.end.lat+","+options.end.lng;
		return out;
	}

	Directions.prototype.redraw = function(result) {
		var self = this;

		this.summaryIsReady(false);
		this.instructionsAreVisible(false);
		this.totalTime(0);
		this.totalDistance(0);
		this.instructions([]);

		if (!result.points || result.points.length<2) return this.eventEmitter.emit("map.clearAll");
		if (result.mode=="apply") this.eventEmitter.emit("map.setBBox",result.points);

		this.eventEmitter.emit("map.updatePoints",result.points);
		this.eventEmitter.emit("map.updateRoutes",result.routes);

		result.routes.forEach(function(route,i) {
			if (!route || !route.points || route.points.length==0) return;
			self.summaryIsReady(true);
			self.totalTime(self.totalTime()+route.time);
			self.totalDistance(self.totalDistance()+route.distance);
			self.instructions.push(route.instructions);			
		});
	}

	return Directions;
});