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
		if (this.autocomplete) return;
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
		this.vehicle = ko.observable("car");
		this.points = ko.observableArray();
		this.addPoint({},0);
		this.addPoint({},0);
		this.eventEmitter.on("directions.setPointCoords",function(ar) {
			if (!ar || !ar.lat || !ar.lng || typeof ar.index == "undefined") return;
			var point = self.points()[ar.index];
			point && point.setCoords(ar);
			self.apply("movePoint",ar.index);
		});
		this.eventEmitter.on("directions.insertPoint",function(ar) {
			if (!ar || !ar.lat || !ar.lng || typeof ar.index == "undefined") return;
			self.addPoint({coords:ar},ar.index);
			self.apply("insertPoint",ar.index);
		});
		this.eventEmitter.on("directions.removePoint",function(index) {
			self.removePoint(index);
			self.apply("removePoint",index);
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

	Directions.prototype.removePointAndApply = function(index) {
		this.removePoint(index);
		this.apply("removePoint",index);
	}

	/*
		TODO: Optimize redraw
		Here we have to get everything and rebuild routes and points.
		The task consists on such async steps:
			- 	Getting coordinates for each point (destination).
			- 	Checking apply mode.
				We do not keep track of previously built routes, instead of this we define the reason of rebuilding.
				If it's, for example, adding a middle point - redraw only affected part of a route.
				The possible reasons (mode param): 
					- apply (the button apply pressed): rebuild everything,
					- removePoint: get route for i-1,i destroy i-1, i routes and 
	*/

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
		var l = result.points.length;
		var loadedI = 0;
		result.routes = [];
		if (l==0) callback(result);
		var directionsService = new GHC.DirectionsService();
		for (var i = 0; i < l-1; i++) {
			(function(i) {
				directionsService.route({
					points: [result.points[i],result.points[i+1]],
					travelMode: self.vehicle()
				},function(route) {
					result.routes[i] = route;
					loadedI++;
					if (loadedI==l-1) {
						callback(result);
					}
				});
			})(i);
		}
	}

	Directions.prototype.redraw = function(result) {
		var self = this;
		this.eventEmitter.emit("map.clearAll");
		if (!result.points || result.points.length<2) return;

		if (result.mode=="apply") this.eventEmitter.emit("map.setBBox",result.points);
		this.eventEmitter.emit("map.drawMarkers",result.points);

		this.summaryIsReady(false);
		this.instructionsAreVisible(false);
		this.totalTime(0);
		this.totalDistance(0);
		this.instructions([]);

		result.routes.forEach(function(route,i) {
			if (!route || !route.points || route.points.length==0) return;
			self.eventEmitter.emit("map.drawPath",route.points,i);
			self.summaryIsReady(true);
			self.totalTime(self.totalTime()+route.time);
			self.totalDistance(self.totalDistance()+route.distance);
			self.instructions.push(route.instructions);			
		});
	}

	return Directions;
});