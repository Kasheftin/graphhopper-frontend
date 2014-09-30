define(function() {
	return {
		attach: function(ko) {

			var Widget = function() { }
			Widget.prototype.destroy = function(options) {
/*
				// Destroying children widgets reqursively
				while (ko.isObservable(this._childrenWidgets) && this._childrenWidgets().length>0)
					this._childrenWidgets()[0].destroy();
				// Destroying the current widget from it's parentWidget
				while (this._parentWidget && this._parentWidget._childrenWidgets && this._parentWidget._childrenWidgets.indexOf(this)!=-1)
					this._parentWidget._childrenWidgets.splice(this._parentWidget._childrenWidgets.indexOf(this),1);
*/
				// Clearing DOM
				ko.virtualElements.emptyNode(this._widgetElement);
				if (typeof this.domDestroy == "function")
					this.domDestroy();
			}
			Widget.prototype._isWidget = true;

			var _reinitWidget = function(o) {
				if (!o.widgetName) return;
				var requireParams = o.widgetMode=="html"?["widgets/"+o.widgetName+"/main","text!widgets/"+o.widgetName+"/main.html"]:["widgets/"+o.widgetName+"/main"];
				require(requireParams,function(Model,html) {
					// Destroying previous widget in case widgetName is observable.
					// Actually this is the only reason why widget update bindingHandler is wrapped to computed and is placed into init-action.
					o.w && o.w._isWidget && o.w.destroy(o);
					html && (o.html = html);

					// Extending Model with Widget and EventEmitter prototypes
					if (typeof Model == "function") {
						for (var i in Widget.prototype)
							Model.prototype[i] = Widget.prototype[i];
						o.w = new Model(o);
					}
					else o.w = Model;

					// We need _parentWidget and _widgetElement in widget.destroy method 
//					o.w._parentWidget = o.parentWidget;
					o.w._widgetElement = o.element;
//					o.w._widgetName = o.widgetName;

					// Registering widget in parentWidget
//					if (!o.w._childrenWidgets)
//						o.w._childrenWidgets = ko.observableArray();
//					if (!o.parentWidget._childrenWidgets)
//						o.parentWidget._childrenWidgets = ko.observableArray();
//					o.parentWidget._childrenWidgets.push(o.w);

					// Generating template value accessor - taking options.template property and appending it with data as current widget and html string from file.
					var templateValueAccessor = function() {
						var value = ko.utils.unwrapObservable(o.valueAccessor());
						value = (value||{}).template||{};
						value.data = o.w;
						if (o.widgetMode=="html") value.html = html;
						return value;					
					}

					ko.bindingHandlers.template.init(o.element,templateValueAccessor);
					ko.bindingHandlers.template.update(o.element,templateValueAccessor,o.allBindingsAccessor,o.viewModel,o.bindingContext);

					// Very often we want to have a link to affected DOM in widget domInit.
					o.firstDomChild = ko.virtualElements.firstChild(o.element);
					while (o.firstDomChild && o.firstDomChild.nodeType != 1)
						o.firstDomChild = ko.virtualElements.nextSibling(o.firstDomChild);

					o.w.domInit && (typeof o.w.domInit == "function") && o.w.domInit(o);
					o.options.callback && (typeof o.options.callback == "function") && o.options.callback(o);
				});
			}


			var init = function(element,valueAccessor,allBindingsAccessor,viewModel,bindingContext,widgetMode) {
				var o = {
					element: element,
					valueAccessor: valueAccessor,
					allBindingsAccessor: allBindingsAccessor,
					viewModel: viewModel,
					bindingContext: bindingContext,
					widgetMode: widgetMode,
					core: bindingContext.$root,
					w: null,
					parentWidget: null,
					options: null
				}
				// In knockout>=3.0.0 viewModel is deprecated, instead of this bindingContext.$data should be used.
				// But widget binding could be called inside foreach or while cycle, and $data context is not necessary a (parent) widget.
				// Here we try to find the first parent context that is widget. If there's no such contest, we set $root as parentWidget.
				o.parentWidget = bindingContext.$data;
				if (!o.parentWidget._isWidget && bindingContext.$parents.length>0) {
					for (var i = 0; i < bindingContext.$parents.length; i++) {
						o.parentWidget = bindingContext.$parents[i];
						if (o.parentWidget._isWidget) break;
					}
				}
				if (!o.parentWidget._isWidget)
					o.parentWidget = bindingContext.$root;

	            ko.utils.domNodeDisposal.addDisposeCallback(element,function() {
	            	o.w && o.w._isWidget && o.w.destroy();
	            });

				ko.computed(function() {
					o.options = ko.utils.unwrapObservable(valueAccessor())||{};
					if (typeof o.options == "string") {
						o.widgetName = o.options;
						o.options = {name:o.widgetName};
					}
					else o.widgetName = ko.utils.unwrapObservable(o.options.name);
			        // We don't want any other observables affect recomputing widget binging (especially _childrenWidgets observableArray in widget.destroy method).
			        setTimeout(function() {
			        	_reinitWidget(o);
			        },0);
				},null,{disposeWhenNodeIsRemoved:element});
		        return {controlsDescendantBindings:true};
			}

			ko.bindingHandlers.widget = {
				init: function(element,valueAccessor,allBindingsAccessor,viewModel,bindingContext) {
					return init(element,valueAccessor,allBindingsAccessor,viewModel,bindingContext,"html");
				}
			}
			ko.bindingHandlers.widgetInline = {
				init: function(element,valueAccessor,allBindingsAccessor,viewModel,bindingContext) {
					return init(element,valueAccessor,allBindingsAccessor,viewModel,bindingContext,"inline");
				}
			}

			ko.virtualElements.allowedBindings.widget = true;
			ko.virtualElements.allowedBindings.widgetInline = true;

			ko.createWidget = function(node,widgetOptions,viewModel) {
				var r = ko.applyBindingsToNode(node,{widget: widgetOptions},viewModel);
			}
			ko.createWidgetInline = function(node,widgetOptions,viewModel) {
				var r = ko.applyBindingsToNode(node,{widgetInline: widgetOptions},viewModel);
			}
		}
	}
});