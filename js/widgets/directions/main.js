define(["jquery","knockout","config","ghc"],function($,ko,config,GHC) {

	var Point = function(options) {
		if (!options) options = {};
		this.value = ko.observable(options.value||"");
		this.afterInitCallback = options.afterInitCallback;
	}
	Point.prototype.createAutocomplete = function(self,e) {
		if (this.autocomplete) return;
		this.autocomplete = new GHC.Autocomplete(e.target);
		if (typeof this.afterInitCallback == "function") this.afterInitCallback(this);
	}
	Point.prototype.getDataAsync = function(callback) {
		if (this.autocomplete) this.autocomplete.getDataAsync(callback);
		else if (typeof callback == "function") callback(null);
	}
	Point.prototype.destroy = function() {
		this.autocomplete && this.autocomplete.destroy();
	}
	Point.prototype.setCoords = function(coords) {
		this.autocomplete && this.autocomplete.setCoordsData(coords);
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
			self.apply();
		});
		this.eventEmitter.on("directions.insertPoint",function(ar) {
			if (!ar || !ar.lat || !ar.lng || typeof ar.index == "undefined") return;
			self.addPoint({afterInitCallback: function(point) {
				point.setCoords(ar);
				self.apply();
			}},ar.index);
		});
		this.eventEmitter.on("directions.removePoint",function(index) {
			self.removePointAndApply(index);
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
		var target = $(domNode).find("input.form-control").focus().get(0);
		point && point.createAutocomplete(point,{target:target});
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

	Directions.prototype.apply = function() {
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
					self.drawRoute(points);
				}
			});
		});
	}

	Directions.prototype.removePointAndApply = function(index) {
		this.removePoint(index);
		this.apply();
	}

	Directions.prototype.drawRoute = function(points) {
		var self = this;
		this.eventEmitter.emit("map.clearAll");
		if (points.length<2) return;
		points && this.eventEmitter.emit("map.drawMarkers",points);
		points && this.eventEmitter.emit("map.setBBox",points);

		this.summaryIsReady(false);
		this.instructionsAreVisible(false);
		this.totalTime(0);
		this.totalDistance(0);
		this.instructions([]);

		var directionsService = new GHC.DirectionsService();
		for (var i = 0; i < points.length-1; i++) {
			(function(i) {
				directionsService.route({
					points: [points[i],points[i+1]],
					travelMode: self.vehicle()
				},function(result) {
					if (!result || !result.points) return;
					self.eventEmitter.emit("map.drawPath",result.points,i);
					self.summaryIsReady(true);
					self.totalTime(self.totalTime()+result.time);
					self.totalDistance(self.totalDistance()+result.distance);
					self.instructions.push(result.instructions);
				});
			})(i);
		}
	}

	return Directions;
});