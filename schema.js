//model lookup
var mongoose  = require('mongoose');
var Schema = mongoose.Schema;
var Models =  {};
var Plugin = require("./plugin.js");

function isAsync (func) {
    const string = func.toString().trim();

    return !!(
        // native
        string.match(/^async /) ||
        // babel (this may change, but hey...)
        string.match(/return _ref[^\.]*\.apply/)
        // insert your other dirty transpiler check

        // there are other more complex situations that maybe require you to check the return line for a *promise*
    );
}

class Event
{
	constructor()
	{
		this.events = {};
	}

	async emit(str,...args)
	{
		if(!this.events[str])
			return args[args.length-1]();
		return this.events[str](...args);
	}

	on(str,cb)
	{
		this.events[str] = cb;
	}
}

class Model
{
	//CORE FUNCTIONS

	constructor(name,options={})
	{
		this.name = name;
		this.schema = {};
		this.methods_route = [];
		this.events = new Event();
		this.fields = {};

		//@DEPRECATE Private variable to be deprecated soon
		this.mw 	= [];
		this.mwAPI  = [[],[],[],[]];
		this.mwAfterModelInit = [];

		this.pre_mw  = [];
		this.post_mw = [];

		if(Models[name]) throw new Error("ERR: SCHEMA "+name+" is already defined");
		Models[name] = this;

		//import default plugins

		if(options.cache)
		{
			let cache_options = options.cache;
			this.install( require("./plugins/redis/cacher.js").plugin(cache_options) );
		}
		if(options.socket)
		{
			let socket_options = options.socket;
			this.install( require("./plugins/socket/socket.js").plugin(socket_options) );
		}
		if(options.channel)
		{
			let channel_options = options.channel;
			this.install( require("./plugins/redis/channel.js").plugin(channel_options) );
		}
	}

	install( plugin )
	{
		//plugins are methods emebeded in the model
		if(!this.isNamespaceAvailable(plugin.plugin_name))
			return new Error("ERR: Plugin Failure. Plugin is already installed or namespace is unavailable.");

		this[plugin.plugin_name] = Plugin(this,plugin);
		return true;	
	}

	isNamespaceAvailable(namespace)
	{
		return !this[namespace];
	}

	define(raw)
	{
		this.schema      = raw.schema;
		this.permissions = raw.permissions;
		this.required    = raw.required;
		this.populate    = raw.populate;
		this.deep        = raw.deep;
		this.filled      = raw.filled;
		this.fill        = raw.fill;
		this.config		 = raw.config;
		this.methods     = raw.methods;
		this.statics     = raw.statics;
		this.virtual     = raw.virtual;
		this.endpoints     = raw.endpoints;

		return this;
	}

	compile()
	{
		if(!this.schema) throw new Error("ERR: COMPILE schema is not defined");

		this.mongoose_schema = new Schema(this.schema,this.config);

		//methods
		for(let i in this.methods)	this.mongoose_schema.methods[i] = this.methods[i];
		//static
		for(let i in this.statics)	this.mongoose_schema.statics[i] = this.statics[i];
		//virtuals
		for(let i in this.virtual)
		{
			let a = this.mongoose_schema.virtual(i,this.virtual[i].config);
			if(this.virtual[i].get )
			 a.get(this.virtual[i].get)
			if(this.virtual[i].set )
			 a.set(this.virtual[i].set);
		}
		//fill
		for(let i in this.fill)
			this.mongoose_schema.fill(i,this.fill[i]);

		//parse populate
		let populate = [];
		for(let i in this.populate)
		{
			if( typeof this.populate[i] == "string" )
				populate.push({ path: i, select: this.populate[i] });
			else
			{
				this.populate[i].path = i;
				populate.push( this.populate[i] );
			}
		}
		//parse deep
		let deep = [];
		for(let i in this.deep)
		{
			if( typeof this.deep[i] == "string" )
				deep.push({ path: i, select: this.deep[i] });
			else
			{
				this.deep[i].path = i;
				deep.push( this.deep[i] );
			}
		}

		this.mongoose_model = mongoose.model(this.name, this.mongoose_schema);
		this.mongoose_model.config = 
		{
			permissions: this.permissions,
			populate   : populate,
			deep	   : deep,
			filled	   : this.filled,
			required   : this.required,
			endpoints  : this.endpoints,
			endpoints_permissions: this.endpoints_permissions,
		}


		return this;
	}

	//overriding routes
	route(cb)
	{
		this.router = cb;
		return this;
	}
	
	routeExtend(cb)
	{
		this.routerExtend = cb;
		return this;
	}

	//Middlewares



	//@DEPRECATE Functions to be deprecated soon
	use(mw,...args)
	{
		console.log("TENT: WARNING TentModel.use() will be deprecated soon. Please use TentModel.pre() or TentModel.post() instead.")
		if(typeof mw == "string")
		{
			if(mw=='before init')
				this.useAPI(...args);
			else
				this.useAPIafter(...args);			

		}
		else
		if(mw)
			this.mw.push(mw);

		return this;
	}

	useAPI(mw,num)
	{
		console.log("TENT: WARNING TentModel.useAPI() will be deprecated soon. Please use TentModel.pre() instead.");
		if(mw)
		this.mwAPI[num].push(mw);

		return this;
	}
	useAPIafter(mw)
	{
		console.log("TENT: WARNING TentModel.useAPIafter() will be deprecated soon. Please use TentModel.post() instead.");
		if(mw)
			this.mwAfterModelInit.push(mw);
		return this;
	}

	//updated middleware functions
	pre(...args)
	{
		this.pre_mw.push(...args);
	}
	post(...args)
	{
		this.post_mw.push(...args);
	}



	//Having methods and statics in routes

	method(name,type="get",cb)
	{
		if(type=="list") type = "get";
		this.methods_route.push({ name: name, definition: cb, type: type, local: true});
		return this;
	}

	staticMethod(name,type="get",cb)
	{
		if(type=="list") type = "get";
		this.methods_route.push({ name: name, definition: cb, type: type, local: false});
		return this;
	}


	//private variables / utility functions
	_constainsFieldRef(field)
	{
		let contains_dot = field.indexOf(".") >=0;
		if(!contains_dot)
			return false;

		let first_field = field.split(".")[0];

		for(let f in this.populate )
			if( first_field == f )
				return f;

		return false;
	}

	_getDef(field)
	{
		let paths =  field.split(".");
		let current = this.schema;

		for(let path of paths)
		{
			current = current[path];

			if(current.constructor === Array)
				current = current[0];
			if(!current)
				return false;
		}
		return current;
	}

	_getRef(field)
	{
		let obj  = this._getDef(field);
		if(!obj)
			return false;
		return obj.ref;
	}

	_trimSpareField(field,populateField)
	{
		field 			= field.split(".");
		populateField	= populateField.split(".");

		while(populateField.length)
		{
			field.shift();
			populateField.shift();
		}

		return field.join(".");
	}

	_getPopulateProjection(path)
	{
		if( typeof this.populate[path] == "string" )
			return this.populate[path];
		else
			return this.populate[path].select;
	}



	//Field Listeners 
	fieldListen(field,cb)
	{
		async function exec(...args)
		{
			if(isAsync(cb))
				return await cb(...args);
			else
				return cb(...args);
		}
		this.fields[field] = exec;
		return this;
	}

	async _onEditField(i,body,req,res,assign)
	{
		if(!this.fields[i])
		{
			assign();
			return true;
		}
		return await this.fields[i](body[i],req,res,assign,body);
	}
}


module.exports.get = function(model_name)
{
	return Models[model_name].mongoose_model;
}

module.exports.new = function( model_name ,options )
{
	return new Model(model_name , options);
}

module.exports.all = function()
{
	return Models;
}