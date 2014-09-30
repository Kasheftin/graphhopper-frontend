define(["knockout-source","./ko-widget/stringTemplateEngine","./ko-widget/widgetBinding"],function(ko,stringTemplateEngine,widgetBinding) {
	stringTemplateEngine.attach(ko);
	widgetBinding.attach(ko);
	return ko;
});
