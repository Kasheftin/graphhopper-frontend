// GraphHopper Components | (c) 2014 Alexey Kuznetsov (http://rag.lt) | http://www.opensource.org/licenses/mit-license 
// Dependencies: jquery
;(function(window,document,undefined) {

	var factory = function($) {
		var GHC = {}

		GHC.apiKey = null;
		GHC.geocodeServiceOptions = {
			baseUrl: "http://graphhopper.com/api/1/geocode",
			minlength: 2,
			limit: 10
		}
		GHC.directionsServiceOptions = {
			baseUrl: "http://graphhopper.com/api/1/route",
			defaultTravelMode: "car"
		}
		GHC.autocompleteOptions = {
			requestDelay: 200,
			blurDelay: 200
		}

		GHC.error = function() {
			if (typeof console == "object" && typeof console.error == "function") {
				console.error.apply(undefined,arguments);
			}
		}

		GHC.GeocodeService = function() { }
		GHC.geocodeService = function() {
			return new GHC.GeocodeService();
		}
		GHC.GeocodeService.prototype.geocode = function(options,callback) {
			var self = this;
			if (typeof callback != "function") return GHC.error("GHC.GeocodeService: geocode callback function is not defined");
			if (!GHC.apiKey) {
				GHC.error("GHC.apiKey is not defined");
				return callback([]);
			}
			if (!options.value || options.value.length<GHC.geocodeServiceOptions.minlength) return callback([]);
			if (/[\d\.]+\s*,\s*[\d.]+/.test(options.value)) {
				var ar = options.value.split(/,/);
				var lat = parseFloat(ar[0]);
				var lng = parseFloat(ar[1]);
				if (isNaN(lat) || isNaN(lng)) {
					GHC.error("GHC.Autocomplete: setCoordsData coords are not numbers");
					return callback([]);
				}
				return callback([{
					name: lat + ", " + lng,
					point: {lat:lat,lng:lng}
				}]);
			}
			if (this._ajax) this._ajax.abort();
			this._ajax = $.ajax({
				url: GHC.geocodeServiceOptions.baseUrl,
				data: {
					limit: (options.limit||GHC.geocodeServiceOptions.limit),
					key: GHC.apiKey,
					q: options.value,
					type: "json"
				},
				dataType: "json",
				success: function(result) {
					callback(result?result.hits||[]:[]);
				},
				error: function() {
					callback([]);
				}
			});
		}

		GHC.Autocomplete = function(domElementOrId) {
			var self = this;
			if (!domElementOrId) return GHC.error("GHC.Autocomplete: container is not set");
			this.$container = (typeof domElementOrId == "object") ? $(domElementOrId) : $("#"+domElementOrId.toString());
			if (!this.$container || this.$container.length==0) return GHC.error("GHC.Autocomplete: container is not defined");
			if (this.$container.data("GHC.Autocomplete")) return this.$container.data("GHC.Autocomplete");
			this.$container.data("GHC.Autocomplete",this);

			this.items = [];
			this.selectedItem = null;
			this.$listContainer = null;
			this.geocodeService = new GHC.GeocodeService();

			this.$container.on("input.GHC.Autocomplete propertychange.GHC.Autocomplete paste.GHC.Autocomplete",function() {
				if (self._requestTimeout) clearTimeout(self._requestTimeout);
				self._requestTimeout = setTimeout(function() {
					self.geocodeService.geocode({value:self.$container.val()},function(items) {
						self.items = items||[];
						self.rebuildListContainer();
					});
				},GHC.autocompleteOptions.requestDelay);
			});

			this.$container.on("keypress.GHC.Autocomplete",function(e) {
				var l = self.items.length, i = self.selectedItem;
				if (e.key=="Up" || e.key=="Down") {
					if (!self.$listContainer || l==0) {
						self.$container.trigger("input.GHC.Autocomplete");
						return;
					}
					e.preventDefault();
					e.stopPropagation();
					var dir = (e.key=="Up")?-1:1;
					if (i == null) {
						console.log("i=null",i,self,self.selectedItem,self.selectItem);
						self.selectItem(dir>0?0:l-1);
					}
					else {
						i+=dir;
						while (i>=l) i-=l;
						while (i<0) i+=l;
						self.selectItem(i);
					}
				}
				else if (e.key=="Enter" || e.key=="Tab" || e.key=="Esc") {
					self.closeList();
				}
			});

			this.$container.on("blur.GHC.Autocomplete",function() {
				setTimeout(function() {
					self.closeList();
				},GHC.autocompleteOptions.blurDelay);
			});
		}
		GHC.autocomplete = function(options) {
			return new GHC.Autocomplete(options);
		}

		GHC.Autocomplete.prototype.rebuildListContainer = function() {
			var self = this;
			this.selectedItem = null;
			if (!this.$listContainer) this.$listContainer = $("<div class='ghc-autocomplete-list'></div>").appendTo("body");
			this.$listContainer.width(this.$container.outerWidth()).css({top:this.$container.offset().top+this.$container.outerHeight(),left:this.$container.offset().left});
			this.$listContainer.empty();
			if (this.items.length>1) {
				this.items.forEach(function(item,index) {
					var $link = $("<a class='ghc-autocomplete-item' href='#'></a>");
					var $spanName = $("<span class='ghc-autocomplete-item-name'></span>").append(item.name).appendTo($link);
					var $spanCountry = $("<span class='ghc-autocomplete-item-country'></span>").append(item.country).appendTo($link);
					$link.on("click",function() {
						self.selectItemAndClose(index);
					});
					self.$listContainer.append($link);
				});
			}
		}

		GHC.Autocomplete.prototype.selectItem = function(index) {
			if (this.items.length==0) return;
			while (index>=this.items.length) index -= this.items.length;
			while (index<0) index += this.items.length;
			this.selectedItem = index;
			this.$listContainer && this.$listContainer.find("a.ghc-autocomplete-item").removeClass("ghc-autocomplete-item-selected").eq(index).addClass("ghc-autocomplete-item-selected");
			this.$container && this.$container.val(this.items[this.selectedItem].name);
		}

		GHC.Autocomplete.prototype.closeList = function() {
			this.$listContainer && this.$listContainer.remove();
			this.$listContainer = null;
		}

		GHC.Autocomplete.prototype.selectItemAndClose = function(index) {
			this.selectItem(index);
			this.closeList();
		}

		GHC.Autocomplete.prototype.reset = function() {
			this.items = [];
			this.selectItem = null;
			this.closeList();
		}

		GHC.Autocomplete.prototype.destroy = function() {
			this.closeList();
			this.$container && this.$container.off(".GHC.Autocomplete");
			$.removeData(this.$container,"GHC.Autocomplete");
		}

		GHC.Autocomplete.prototype.getData = function() {
			var self = this;
			if (this.items && this.items.length>0) return this.items[this.selectedItem==null?0:this.selectedItem];
			return null;
		}

		GHC.Autocomplete.prototype.setCoordsData = function(coords) {
			if (!coords) return GHC.error("GHC.Autocomplete: setCoordsData called without coords");
			var lat = parseFloat(coords.lat);
			var lng = parseFloat(coords.lng);
			if (isNaN(lat) || isNaN(lng)) return GHC.error("GHC.Autocomplete: setCoordsData coords are not numbers");
			this.items = [{
				name: parseFloat(coords.lat) + ", " + parseFloat(coords.lng),
				point: coords
			}];
			this.selectItem(0);
		}

		// Copyed from http://graphhopper.com/maps/js/ghrequest.js?v=0.4.2
		// Lat and Lng switched in results for Leaflet
		GHC.decodePath = function(encoded, is3D) {
		    var len = encoded.length;
		    var index = 0;
		    var array = [];
		    var lat = 0;
		    var lng = 0;
		    var ele = 0;
		    while (index < len) {
		        var b;
		        var shift = 0;
		        var result = 0;
		        do {
		            b = encoded.charCodeAt(index++) - 63;
		            result |= (b & 0x1f) << shift;
		            shift += 5;
		        } while (b >= 0x20);
		        var deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
		        lat += deltaLat;
		        shift = 0;
		        result = 0;
		        do {
		            b = encoded.charCodeAt(index++) - 63;
		            result |= (b & 0x1f) << shift;
		            shift += 5;
		        } while (b >= 0x20);
		        var deltaLon = ((result & 1) ? ~(result >> 1) : (result >> 1));
		        lng += deltaLon;
		        if (is3D) {
		            shift = 0;
		            result = 0;
		            do {
		                b = encoded.charCodeAt(index++) - 63;
		                result |= (b & 0x1f) << shift;
		                shift += 5;
		            } while (b >= 0x20);
		            var deltaEle = ((result & 1) ? ~(result >> 1) : (result >> 1));
		            ele += deltaEle;
		            array.push([lat * 1e-5,lng * 1e-5, ele / 100]);
		        } else
		            array.push([lat * 1e-5,lng * 1e-5]);
		    }
		    return array;
		}

		GHC.DirectionsService = function() {}
		GHC.directionsService = function() {
			return new GHC.DirectionsService();
		}

		// Lat and lng switched in bbox for leaflet
		GHC.DirectionsService.prototype.route = function(options,callback) {
			var self = this;
			if (typeof callback != "function") return GHC.error("GHC.DirectionsService: route callback function is not defined");
			if (!GHC.apiKey) {
				GHC.error("GHC.apiKey is not defined");
				return callback(null);
			}
			if (!options.points || options.points.length<2) return callback(null);
			var query = GHC.directionsServiceOptions.baseUrl + "?type=json&key=" + GHC.apiKey + "&vehicle=" + (options.travelMode||GHC.directionsServiceOptions.defaultTravelMode);
			var validPointCnt = 0;
			options.points.forEach(function(point) {
				if (point && point.lat && point.lng) {
					query+="&point="+point.lat+","+point.lng;
					validPointCnt++;
				}
			});
			if (validPointCnt<2) return callback(null);
			this._ajax = $.ajax({
				url: query,
				dataType:"json",
				success: function(result) {
					if (result && result.paths && result.paths.length>0) {
						var out = result.paths[0];
						out.pointsOrig = out.points;
						out.points = GHC.decodePath(out.points);
						out.bboxOrig = out.bbox;
						out.bbox = [out.bbox[1],out.bbox[0],out.bbox[3],out.bbox[2]];
						return callback(out);
					}
					return callback(null);
				},
				error: function() {
					return callback(null);
				}
			});
		}

		return GHC;
	}

	if (typeof define == "function" && define.amd) {
		define(["jquery"],factory);
	}
	else {
		var noConflictGHC = window.GHC;
		var GHC = factory(window.jQuery);
		GHC.noConflict = function() {
			window.GHC = noConflictGHC;
			return this;
		}
		window.GHC = GHC;
	}
	
}(window,document));