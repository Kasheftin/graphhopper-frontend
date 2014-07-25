define(["jquery","knockout","config"],function($,ko,config) {

	var Point = function() {
	}
	Point.prototype.registerAutocomplete = function(o) {
		this.autocomplete = o.w;
	}
	Point.prototype.destroy = function() {
		this.autocomplete && this.autocomplete.destroy();
	}
	Point.prototype.getDataAsync = function(callback) {
		if (!this.autocomplete) return callback(null);
		return this.autocomplete.getDataAsync(callback);
	}
	Point.prototype.clone = function() {
		return this.autocomplete ? this.autocomplete.clone() : null;
	}
	Point.prototype.setCoords = function(coords) {
		this.autocomplete && this.autocomplete.setCoords(coords);
	}


	var Directions = function(o) {
		var self = this;
		this.eventEmitter = o.core.eventEmitter;
		this.vehicle = ko.observable("car");
		this.points = ko.observableArray();
		this.clonedOptions = {};
		this.addPoint();
		this.addPoint();
		this.eventEmitter.on("directions.setHitCoords",function(ar) {
			if (!ar) return;
			var point = self.points()[ar.index];
			point && point.setCoords(ar);
			self.apply();
		});
	}

	Directions.prototype.afterMove = function(options) {
		if (options.item) {
			var clonedOptions = options.item.clone();
			if (clonedOptions) {
				$.extend(this.clonedOptions,clonedOptions);
			}
			options.item.destroy();
		}
	}

	Directions.prototype.afterRender = function() {
		this.clonedOptions.inputStr = null;
		this.clonedOptions.itemData = null;
	}

	Directions.prototype.addPoint = function() {
		this.points.push(new Point);
	}

	Directions.prototype.removePoint = function(i) {
		var p = this.points()[i];
		p && p.destroy();
		p && this.points.splice(i,1);
	}

	Directions.prototype.apply = function() {
		var self = this;
		var l = this.points().length;
		var loadedI = 0;
		var data = [];
		this.points().forEach(function(p) {
			p.getDataAsync(function(pointData) {
				pointData && data.push(pointData);
				loadedI++;
				if (loadedI==l)
					self.drawRoute(data);
			});
		});
	}

	Directions.prototype.drawRoute = function(data) {
		var self = this;
		this.eventEmitter.emit("map.clearPath");
		if (data.length<2) return;
		var q = "http://graphhopper.com/api/1/route?type=json&key=" + config.graphhopperKey + "&vehicle=" + this.vehicle();
		data.forEach(function(hit) {
			q+="&point="+hit.point.lat+","+hit.point.lng;
		});
		$.ajax({
			url: q,
			dataType:"json",
			success: function(result) {
				if (result.paths.length>0) {
					self.eventEmitter.emit("map.setBBox",result.paths[0].bbox);
					self.eventEmitter.emit("map.redrawPath",result.paths[0].points,data);
				}
			}
		});
	}

	return Directions;
});