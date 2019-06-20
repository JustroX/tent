let mw = require('./route.js');

const REQUEST_STRING_INT = 
{
	"get"   : 0,
	"list"  : 0,
	"post"  : 1,
	"put"   : 2,
	"delete": 3 
}


class RouteBuilder
{
	constructor(type,model)
	{
		this.pipes =[];

		this.mw_model = null;
		this.model_str = model;
		this.type_str = type;
		this.request = REQUEST_STRING_INT[type];
	}

	init()
	{
		this.pipes.push(mw.api.init);
		return this;
	}


	preInit()
	{
		console.log(this.request);
		console.log(mw.Universal(this.model_str,this.request).length);
		this.pipes.push(...mw.Universal(this.model_str,this.request));
		return this;
	}

	postInit()
	{
		this.pipes.push(...mw.UniversalAfter(this.model_str,this.request));
		return this;
	}

	custom(cb)
	{
		this.pipes.push(cb);
		return this;
	}


	//model specific pipes
	model(model_str)
	{
		this.mw_model = mw.Model(model_str);
		this.model_str = model_str;
		this.pipes.push(this.mw_model.init);
		return this;
	}
	parseParams()
	{
		this.pipes.push(this.mw_model.parseParams);
		return this;
	}
	validateFields()
	{
		this.pipes.push(this.mw_model.validateFields);
		return this;
	}

	create()
	{
		this.pipes.push(this.mw_model.create);
		return this;
	}

	assignBody()
	{
		this.pipes.push(this.mw_model.assignBody);
		return this;
	}


	load()
	{
		this.pipes.push(this.mw_model.load);
		return this;
	}
	delete()
	{
		this.pipes.push(this.mw_model.delete)
		return this;
	}

	list()
	{
		this.pipes.push(this.mw_model.list)
		return this;	
	}
	save()
	{
		this.pipes.push(this.mw_model.save);
		return this;
	}

	hideFields()
	{
		this.pipes.push(this.mw_model.hideFields);
		return this;
	}
	hideFieldsList()
	{
		this.pipes.push(this.mw_model.hideFieldsList);
		return this;
	}

	done()
	{
		this.pipes.push(this.mw_model.done);
		return this;
	}

	close()
	{
		if( this.type_str == "get" )
		{
			this.hideFields();
			this.done();
		}
		else if (this.type_str =="put")
		{
			this.save();
			this.hideFields();
			this.done();
		}
		else
		{
			this.delete();
			this.done();
		}
		return this;
	}

	build()
	{
		return mw.make(null,...this.pipes);
	}

}


exports.new = function(type,model_str)
{
	return new RouteBuilder(type,model_str);
}