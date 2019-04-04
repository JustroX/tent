var Schema  = require('./schema.js');

const mw = module.exports;


//utilities
mw.util = {};

mw.make = function(name,...args) //middlewares
{
	let a = function(req,res,next)
	{
		function exec(i)
		{
			function _next()
			{
				if(i < args.length)
					exec(i+1);
				else
					next();
			}
			args[i](req,res,_next);
		};

		exec(0)
	};
	if(name) mw.util[name]  = a;
	return a;
}

mw.set = function(val,cb)
{
	return function(req,res,next)
	{
		req.tent = req.tent || {};
		req.tent[val] = cb(req.tent);
	}
}
mw.look = function(val)
{
	return function(req,res,next)
	{
		req.tent.needle = req.tent[val];
		next();
	}
}
mw.Model = function(model,config,bad)
{
	let ModelSchema = Schema.get(model[0] || model);
	let ModelEndpoint  = model[1];  
	let a =  
	{
		create : function(req,res,next)
		{
			req.tent.needle = new ModelSchema();
			next();
		},
		load : function(req,res,next)
		{
			ModelSchema.findById( ( req.tent.id && config && req.tent[config]) || req.tent.needle,function(err,model)
			{
				if(err) return res.send({ err: "Database Error" , code : 500 });
				req.tent.needle = model;
				next();
			});
		},
		save: function(req,res,next)
		{
			req.tent.needle.save(function(err,new_model)
			{
				if(err) return res.send({ err: "Database Error" , code : 500 });
				req.tent.needle = new_model;
				next();
			});
		},
		modify: function(req,res,next)
		{
			if( typeof config == 'function' )
			{
				config(req, res, next);
				next();
			}
		},
		list : function(req,res,next)
		{
			ModelSchema.find({}, function(err, docs)
			{
				if(err) return res.send({ err: "Database Error" , code : 500 });
				req.tent.needle  = docs;
				next();
			});
		},
		check : function(req,res,next)
		{
			if( typeof config == 'function' )
			{
				if(!config()) return res.send(bad);
				next();
			}
		},
		delete: function(req,res,next)
		{
			ModelSchema.deleteOne({ _id: (( req.tent.id && config && req.tent[config]) || req.tent.needle) },function(err)
			{
				if(err) return res.send({ err : "Unknown Error" });
				req.tent.needle = { message: "success", code: "200" };
				next();
			});
		},

		assignBody : function(req,res,next)
		{
			let q = util.sanitize(req,ModelSchema.permissions);
			for(let i in q)
				req.tent.needle.set(i,q[i]);
			next();
		},

		done: function(req,res,next)
		{
			res.send(req.tent.needle);
		},


		parseParams : function()
		{
			return function(req,res,next)
			{
				req.tent.param = {};
				req.tent.param.fields = util.fields(req,ModelSchema.permissions,ModelEndpoint);
				req.tent.param.sort   = util.sort  (req,ModelSchema.permissions);
				req.tent.param.filter = util.filter(req,ModelSchema.permissions);
				next();
			}
		},


		validateFields: function()
		{
			return function(req,res,next)
			{
				if(!util.validate_fields(req,ModelSchema.permissions))
					res.send({ code: 400, err: "Invalid request." });
			}
		}



	};

	return a;
}


//default API  functions

mw.api = {};

mw.api.init = function(req,res,next)
{
	req.tent = req.tent || {};

	req.tent.id = req.params.id;
	req.tent.endpoint = req.params.field_id;

	req.tent.body = req.body;
}

mw.api.post = function(model,...mw)
{
	return mw.make(null, mw.api.init,
						 mw.Model(model).create,
						 mw.Model(model).assignBody,
						 mw.Model(model).save,
						 ...mw,
						 mw.Model(model).done );
}

mw.api.put = function(model,...mw)
{
	return mw.make(null, mw.api.init,
						 mw.Model(model).load,
						 mw.Model(model).assignBody,
						 mw.Model(model).save,
						 ...mw,
						 mw.Model(model).done ;
}

mw.api.list = function(model,...mw)
{
	return mw.make(null, mw.api.init,
						 mw.Model(model).list,
						 ...mw,
						 mw.Model(model).done	);
}

mw.api.get = function(model,...mw)
{
	return mw.make(null, mw.api.init,
						 mw.Model(model).load,
						 ...mw,
						 mw.Model(model).done );
}

mw.api.delete = function(model,...mw)
{
	return mw.make(null, mw.api.init,
						 mw.Model(model).load,
						 mw.Model(model).delete,
						 ...mw,
						 mw.Model(model).done );
}




var util = 
{
	fields: function(req,permissions,endpoint)
	{
		let fields = [];
		if(req.query.fields)
		{
			var q_fields = req.query.fields.split(",");
			for(let i of q_fields)
			{
				if(permissions[i] && permissions[i]&1)
				{
					fields.push(i);
				}
			}
		}
		if(endpoint)
			for(let i in fields)
				fields[i] = endpoint +"."+fields[i];
		if(fields.length==0) 
			fields = ['-__v','-private.local.password'];
		return fields;

	},

	sort : function(req,permissions)
	{
		let sort = {};
		if(req.query.sort)
		{
			var q_fields = req.query.sort.split(",");
			for(let i of q_fields)
			{
				var str = (i[0]=='-')? i.substring(1) : i;
				if(permissions[str])
				{
					sort[str] = 1 - 2*(i[0]=='-');
				}
			}
		}
		return sort;
	}

	filter : function(req,permissions)
	{
		let filters = [];	
		for(var i in req.query)
		{
			if(i=="search" || (permissions[i.split(".")[0]] &1) || (permissions[i] && permissions[i]&1))
			{
				let val = req.query[i].split("..");
				let item = { field: i };
				if(i=="search")
				{
					let subfields  = val[0].split(",");
					item.or = [];
					for(let j in subfields)
					{
						let b = subfields[j].split(":");
						let a = {};
						a[b[0]] = { $regex: new RegExp(b[1]) , $options: 'i' };
						item.or.push(a);
					}
				}
				else
				if(val.length==1 && val[0].substring(0,3)=="rx_")
				{
					item.regex = val[0].substring(3);
				}
				else
				if(val.length==1 && val[0].substring(0,3)=="ne_")
				{
					item.ne = val[0].substring(3);
				}
				else
				if(val.length==1)
					item.set = val[0];
				else
				{
					if(val[0] != '-')
						item.gte = val[0]
					if(val[1] != '-')
						item.lte = val[1]
				}
				filters.push(item);
			}
		};
		let query = {};
		for(var i of filters)
		{
			if(i.or)
			{
				query["$or"] = i.or;
			}
			else
			if(i.regex)
			{
				query[i.field] = { $regex: new RegExp(i.regex) , $options: 'i' };
			}
			else
			if(i.ne)
			{
				query[i.field] = { $ne: i.ne };
			}
			else
			if(i.set)
			{
				if(i.set=="$n_null")
					query[i.field] = null ;
				else
					query[i.field] = i.set;
			}
			else
			{
				query[i.field] = {};
				if(i.gte)
					query[i.field].$gte = i.gte ;
				if(i.lte)
					query[i.field].$lte = i.lte ;
			}
		}
		return query;
	},

	sanitize : function(req,permissions)
	{
		let body = req.body;

		let query = {};

		for(let i in body)
		{
			if(permissions[i]&4)
			{
				query[i] = body[i];
			}
		}

		return query;
	},


	hide_fields : function(obj,permissions)
	{
		let a = {};
		for(let i in obj)
		{
			if(permissions[i]&1)
			{
				a[i] = obj[i];
			}
		}
		return a;
	},

	validate_fields : function(req,permissions)
	{
		let body = req.body;

		let complete = true;
		for(let i in permissions)
		{
			if(permissions[i]&2)
			{
				complete &= body[i] != null
				if(body[i] == "$n_null")
					body[i] = null;
			}
		}

		return complete
	}
}