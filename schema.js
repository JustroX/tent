//model lookup
var mongoose  = require('mongoose');
var Schema = mongoose.Schema;
var Models =  {};

class Model
{
	constructor(name)
	{
		this.name = name;
		this.schema = {};
		this.mw 	= [];
		this.mwAPI  = [[],[],[],[]];
		this.mwAfterModelInit = [];
		this.methods_route = [];

		if(Models[name]) throw new Error("ERR: SCHEMA "+name+" is already defined");

		Models[name] = this;
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
		for(let i in this.static)	this.mongoose_schema.static[i] = this.static[i];
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

	use(mw,...args)
	{
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
		console.log(num);
		if(mw)
		this.mwAPI[num].push(mw);

		return this;
	}
	useAPIafter(mw)
	{
		if(mw)
			this.mwAfterModelInit.push(mw);
		return this;
	}

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



	_constainsFieldRef(field)
	{
		for(let f in this.populate )
			if( field.indexOf(f) == 0 )
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
		console.log(field,populateField);
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
}


class Field
{
	constructor()
	{
		
	}
}



module.exports.get = function(model_name)
{
	return Models[model_name].mongoose_model;
}

module.exports.new = function( model_name )
{
	return new Model(model_name);
}

module.exports.all = function()
{
	return Models;
}