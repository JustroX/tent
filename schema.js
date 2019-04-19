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

		if(Models[name]) throw new Error("ERR: SCHEMA "+name+" is already defined");

		Models[name] = this;
	}

	define(raw)
	{
		this.schema      = raw.schema;
		this.permissions = raw.permissions;
		this.required    = raw.required;
		this.populate    = raw.populate;
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
			this.mongoose_schema.virtual(i).get(this.virtual[i].get).set(this.virtual[i].set);

		this.mongoose_model = mongoose.model(this.name, this.mongoose_schema);
		this.mongoose_model.config = 
		{
			permissions: this.permissions,
			populate   : this.populate,
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

	use(mw)
	{
		if(mw)
		this.mw.push(mw);

		return this;
	}

	useAPI(mw,num)
	{
		if(mw)
		this.mwAPI[num].push(mw);

		return this;
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