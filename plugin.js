module.exports = function(model,pkg)
{
	if(pkg.required_plugins)
		for(let i of pkg.required_plugins)
			if(model.isNamespaceAvailable(i))
				throw new Error("ERR: Plugin Failure. Plugin "+pkg.plugin_name+" is dependent on plugin "+i);
	
	pkg.model = model;
	pkg.initialize();
	return pkg;
};