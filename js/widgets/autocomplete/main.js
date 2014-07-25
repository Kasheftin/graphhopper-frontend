define(["jquery","knockout","config"],function($,ko,config) {

	var Autocomplete = function(o) {
		var self = this;
		this.list = ko.observableArray();
		this.item = ko.observable(null);
		this.itemData = o.options.clonedOptions?o.options.clonedOptions.itemData:null;
		this.inputStr = ko.observable(o.options.clonedOptions?o.options.clonedOptions.inputStr:"");
		this.str = ko.computed(function() { return self.inputStr(); }).extend({throttle:200});
		this._strUpdating = false;
		this.str.subscribe(function(str) {
			if (self._strUpdating) {
				self._strUpdating = false;
				return;
			}
			if (str.length<config.autocomplete.minlength || !self.$target.is(":focus")) {
				self.close();
				return;
			}
			self._ajax = $.ajax({
				url: "http://graphhopper.com/api/1/geocode",
				data: {
					limit: config.autocomplete.limit,
					type: "json",
					key: config.graphhopperKey,
					q: str
				},
				dataType: "json",
				success: function(result) {
					self.list(result.hits);
					self.item(null);
					self.recalcListPosition();
					self._ajax = null;
				}
			});
		});
	}

	Autocomplete.prototype.clone = function() {
		return {
			inputStr: this.inputStr(),
			itemData: this.itemData
		}
	}

	Autocomplete.prototype.selectHit = function(index) {
		this.item(index);
		this.itemData = this.list()[index];
		this._strUpdating = true;
		console.log("selectHit",this.itemData);
		this.inputStr(this.itemData.name);
	}

	Autocomplete.prototype.close = function() {
		this.list([]);
		this._ajax && this._ajax.abort();
	}

	Autocomplete.prototype.selectHitAndClose = function(index) {
		this.selectHit(index);
		this.close();
	}

	Autocomplete.prototype.recalcListPosition = function() {
		this.$listContainer.width(this.$target.outerWidth()).css({top:this.$target.offset().top+this.$target.outerHeight(),left:this.$target.offset().left});
	}

	Autocomplete.prototype.setCoords = function(coords) {
		this.itemData = {
			point: coords
		}
		var str = coords.lat + ", " + coords.lng;
		this.inputStr(str);
	}

	Autocomplete.prototype.keyHandler = function(e) {
		var l = this.list().length;
		if (l==0) return;
		if (e.key=="Up" || e.key=="Down") {
			e.preventDefault();
			e.stopPropagation();
			var dir = (e.key=="Up")?-1:1;
			if (this.item()==null) this.item(dir>0?0:l-1);
			else {
				var i = this.item() + dir;
				while (i >= l) i -= l;
				while (i < 0) i+=l;
				this.item(i);
			}
			this.itemData = this.list()[this.item()];
			this._strUpdating = true;
			this.inputStr(this.itemData.name);
		}
		else if (e.key=="Enter" || e.key=="Tab") {
			this.close();
		}
		else {
			this.itemData = null;
		}
	}

	Autocomplete.prototype.getDataAsync = function(callback) {
		var self = this;
		if (this.itemData) return callback(this.itemData);
		if (!this.str() || this.str().length<config.autocomplete.minlength) return callback(null);
		$.ajax({
			url: "http://graphhopper.com/api/1/geocode",
			data: {
				limit: 1,
				type: "json",
				key: config.graphhopperKey,
				q: this.str()
			},
			dataType: "json",
			success: function(result) {
				self.itemData = result.hits[0];
				callback(self.itemData);
			}
		});
	}

	Autocomplete.prototype.domInit = function(o) {
		var self = this;
		this.listContainer = document.createElement("div");
		this.$listContainer = $(this.listContainer).appendTo("body").addClass("gh-autocomplete-list");
		this.$target = $(o.firstDomChild);
		require(["text!widgets/"+o.widgetName+"/list.html"],function(html) {
			self.$listContainer.append(html);
			ko.applyBindings(self,self.listContainer);
			self.recalcListPosition();
			self.$target.on("keypress",self.keyHandler.bind(self));
			self.$target.on("blur",function() {
				setTimeout(function() {
					self.close.bind(self);
				},0);
			});
		});
	}

	Autocomplete.prototype.domDestroy = function() {
		this.close();
		this.$listContainer.remove();
		console.log("I'm destroyed");
	}

	return Autocomplete;
});