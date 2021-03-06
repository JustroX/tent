var Schema  = require('./schema.js');
var safe = require('safe-regex');

const mw = module.exports;

const MODEL_ACTION_ENUM = 
{
	INITIALIZED : 0,
	FETCHED     : 1,
	LOADED  	: 2,
	NEW     	: 3,
	DELETE		: 4,
	SAVE		: 5
}
Object.freeze(MODEL_ACTION_ENUM)

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
	let ModelSchema = Schema.get(model);
	let ModelInstance = Schema.all()[model];
	let POPULATE = ModelSchema.config.populate;
	let DEEP 	 = ModelSchema.config.deep;
	let FILLED 	 = ModelSchema.config.filled;
	let PERMISSIONS = ModelSchema.config.permissions ;
	let a =  
	{
		init: function(req,res,next)
		{
			req.tent.model = {};
			req.tent.model.name = model;
			req.tent.model.populate = POPULATE;
			req.tent.model.deep     = DEEP;
			req.tent.model.filled   = FILLED;
			req.tent.model.permissions = PERMISSIONS;
			req.tent.model.ACTION = MODEL_ACTION_ENUM.INITIALIZED;
			req.tent.model.instance = ModelInstance;
			req.tent.model.mongoose = ModelSchema;
			next();
		},
		create : function(req,res,next)
		{
			req.tent.needle = new ModelSchema();
			req.tent.model.ACTION = MODEL_ACTION_ENUM.NEW;
			next();
		},
		load : function(req,res,next)
		{
			req.tent.model.ACTION = MODEL_ACTION_ENUM.LOADED;
			let doc_id = req.tent.id;

			if(!doc_id)
				return res.send({ code: 404, err: "No resource to run method." });

			let q = ModelSchema.find({_id: doc_id},req.tent.param.fields.join(' '));

			for(let i in req.tent.model.populate)
				q  = q.populate(req.tent.model.populate[i]);
			for(let i in req.tent.model.deep)
				q  = q.deepPopulate(req.tent.model.deep[i]);
			for(let i in req.tent.model.filled)
				q  = q.fill(i,req.tent.model.filled[i],req);

			q.exec(function(err,model)
			{
				if(err)
				{
					throw err;
				 	return res.send({ err: "Database Error" , code : 500 });
				}
				if(!model[0]) return res.send({ err: "Document not found.", code: 404});

				req.tent.needle = model[0];
				next();
			});
		},
		save: function(req,res,next)
		{
			req.tent.model.ACTION = MODEL_ACTION_ENUM.SAVE;
			req.tent.needle.save(function(err,new_model)
			{
				if(err)
				{
					throw err;
				 	return res.send({ err: "Database Error" , code : 500 });
				}
				req.tent.needle = new_model;
				next();
			});
		},
		modify: function(req,res,next)
		{
			if( typeof config == 'function' )
			{
				config(req, res, next);
			}
		},
		reverse_populate: async function(req,res,next)
		{
			let where = req.tent.param.where;

			async function populate(query,path)
			{
				let populatePath = query.__field;
				let refpath  = ModelInstance._trimSpareField( path , populatePath );

				let refname  = ModelInstance._getRef( populatePath );
				if(!refname)
					return res.send({ err: 'Database Error. Filter path definiton is wrong.' , code: 500 });
				

				let ForeignModel = Schema.get(refname);
				let selectvalue = ModelInstance._getPopulateProjection(populatePath);
				
				let filter = {};
				filter[refpath] = query.val;
				let docs = await ForeignModel.find(  filter , selectvalue ).exec();
				docs =docs.map((val)=>val._id);

				return docs;
			}

			for(let path in where)
			{
				let query = where[path];

				if(path =="$or")
				{					
					let q = [];
					for(let x of query.val)
					{	
						for(let i in x)
						{
							x.field = i; 
							x.val = x[i];
							delete x[i];
						}
						let populatePath = ModelInstance._constainsFieldRef(x.field);
						x.__field = populatePath;
						if(populatePath)
						{
							let docs = await populate(x,x.field);
							let m = {};
							m[ x.__field ] = { $in : docs };
							q.push(m);
						}
						else
						{
							let a = {};
							a[x.field] = x.val;
							q.push(a);
						}
						
					}
					req.tent.param.filter.$or = q;
				}
				else
				{
					let docs = [];
					docs = await populate(query,path);
					req.tent.param.filter[query.__field] = 
					{
						$in : docs
					}  
				}

			}
		},

		list : async function(req,res,next)
		{

			req.tent.model.ACTION = MODEL_ACTION_ENUM.FETCHED;
			//If reverse population is needed
			if(Object.keys(req.tent.param.where).length)
				await a.reverse_populate(req,res,next);

			let q = ModelSchema.find(
				req.tent.param.filter,
				req.tent.param.fields.join(' ')
			)
			.sort ( req.tent.param.sort)
			.limit( req.tent.param.limit)
			.skip ( req.tent.param.limit*req.tent.param.offset);
			
			for(let i in req.tent.model.populate)
				q = q.populate(req.tent.model.populate[i]);
			for(let i in req.tent.model.deep)
				q  = q.deepPopulate(req.tent.model.deep[i]);
			for(let i in req.tent.model.filled)
				q  = q.fill(i,req.tent.model.filled[i],req);

			if(req.tent.param.options)
			{
				let opt = {};
				ModelSchema.count(req.tent.param.filter,function(err,count)
				{					
					opt.collectionCount = count;
					req.tent.needle = opt;
					next();
				});
			}
			else
			q.exec(function(err,docs)
			{
				if(err)
				{
					throw err;
				 	return res.send({ err: "Database Error" , code: 500 });
				}
				
				function getfield(obj,field)
				{
					let cur = obj;
					let paths =  field.split(".");
					
					for(let i of paths)
					{
						if(!cur)
							return 0;
						cur = cur[i];
					}
					
					return cur;
				}

				//do strong sorting
				for(let i in req.tent.param.strong_sort )
					docs = docs.sort((a,b)=>
					{
						a = getfield(a,i);
						b = getfield(b,i);
						return 2*( (a>b)^( 1- ((1+req.tent.param.strong_sort[i])>>1) ) )-1 ;
					});

				req.tent.needle = docs;
				next();
			});
		},
		check : function(req,res,next)
		{
			if( typeof config == 'function' )
			{
				if(!config(req)) return res.send(bad);
				next();
			}
		},
		delete: function(req,res,next)
		{
			req.tent.model.ACTION = MODEL_ACTION_ENUM.DELETE;
			ModelSchema.deleteOne({ _id: req.tent.id },function(err)
			{
				if(err)
				{
					throw err;
				 	return res.send({ err : "Unknown Error", code: 500 });
				}
				req.tent.needle = { message: "success", code: "200" };
				next();
			});
		},

		assignBody : async function(req,res,next)
		{
			let q = util.sanitize(req, req.tent.model.permissions );
			for(let i in q)
			{
				let assign = function(){ req.tent.needle.set(i,q[i]);}
				if(!await ModelInstance._onEditField(i,q,req,res,assign)) return;// put events here
			}
			next();
		},

		done: function(req,res,next)
		{
			res.send(req.tent.needle);
		},


		parseParams : function(req,res,next)
		{
			req.tent.param = {};
			req.tent.param.fields = util.fields(req, req.tent.model.permissions );
			req.tent.param.sort   = util.sort  (req, req.tent.model.permissions , ModelInstance );
			req.tent.param.filter = util.filter(req, req.tent.model.permissions );

			//get post populated filter
			let where = {};
			for( let i in req.tent.param.filter )
			{
				let field = ModelInstance._constainsFieldRef(i); 
				if( (field && field!=i ) || i=="$or" )
				{
					where[i] = { val : req.tent.param.filter[i]};
					delete req.tent.param.filter[i];
					where[i].__field = field; 
				}
			}
			req.tent.param.where = where;

			//create a strong sort
			let strong_sort = {};
			for( let i in req.tent.param.sort )
			{
				let field = ModelInstance._constainsFieldRef(i);
				if( field )
				{
					strong_sort[i] = req.tent.param.sort[i];
					delete req.tent.param.sort[i];
				}
			}
			req.tent.param.strong_sort = strong_sort;
			
			req.tent.param.options = req.query.option;
			req.tent.param.limit   =  ( parseInt(req.query.limit)  || 10 );
			req.tent.param.offset  =  ( parseInt(req.query.offset) || 0  );

			next();
		},

		hideFields: function(req,res,next)
		{
			req.tent.needle = util.hide_fields(req.tent.needle,req.tent.model.permissions );
			next();
		},

		hideFieldsList: function(req,res,next)
		{
			if(Array.isArray(req.tent.needle))
				req.tent.needle = util.hide_fields_list(req.tent.needle,req.tent.model.permissions );
			next();
		},


		validateFields:  function(req,res,next)
		{
			let missing_fields = util.validate_fields(req,ModelSchema.config.required || []);
			if(missing_fields.length)
			{
				return res.send({ code: 400, err: "Invalid request." , missing_fields: missing_fields });
			}
			next();
		},

		emit: function(req,res,next)
		{
			let action = req.tent.model.ACTION;
			if(action == MODEL_ACTION_ENUM.SAVE )
				req.tent.model.instance.events.emit("save",req,res,next);
			else if (action == MODEL_ACTION_ENUM.DELETE)
				req.tent.model.instance.events.emit("delete",req,res,next);
			else
				next();
		}

	};

	return a;
}

//@DEPRECATE
mw.Universal = function(model,key)
{
	let ModelObj = Schema.all()[model];
	return ModelObj.mwAPI[key]
}

//@DEPRECATE
mw.UniversalAfter = function(model)
{
	let ModelObj = Schema.all()[model];
	return ModelObj.mwAfterModelInit;
}

//Updated middleware
mw.pre = function(model)
{
	let ModelObj = Schema.all()[model];
	return ModelObj.pre_mw;
}
mw.post = function(model)
{
	let ModelObj = Schema.all()[model];
	return ModelObj.post_mw;
}

//default API  functions

mw.api = { endpoint:{} };

mw.api.init = function(req,res,next)
{
	req.tent = req.tent || {};

	req.tent.id = req.params.id;
	req.tent.field_id = req.params.field_id;

	req.tent.body = req.body;

	next();
}

mw.api.post = function(model,...mc)
{

	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,1),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 mw_model.validateFields,
						 mw_model.create,
						 mw_model.assignBody,
						 mw_model.save,
						 ...mc,
						 mw_model.emit ,
						 mw_model.hideFields,
						 mw_model.done );
}

mw.api.put = function(model,...mc)
{
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,2),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						 mw_model.parseParams,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 mw_model.load,
						 mw_model.assignBody,
						 mw_model.save,
						 ...mc,
						 mw_model.emit ,
						 mw_model.hideFields,
						 mw_model.done );
}

mw.api.list = function(model,...mc)
{
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,0),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						 mw_model.parseParams,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 mw_model.list,
						 mw_model.hideFieldsList,
						 // ...mc,
						 mw_model.done	);
}

mw.api.get = function(model,...mc)
{
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,0),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						 mw_model.parseParams,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 mw_model.load,
						 ...mc,
						 mw_model.emit ,
						 mw_model.hideFields,
						 mw_model.done );
}

mw.api.delete = function(model,...mc)
{
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,3),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						 mw_model.parseParams,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 mw_model.load,
						 mw_model.delete,
						 ...mc,
						 mw_model.emit ,
						 mw_model.done );
}


mw.Endpoint = function(model,endpoint,config,bad)
{
	let ModelSchema =  Schema.get(model);
	let POPULATE = ModelSchema.config.endpoints[endpoint].populate;
	let DEEP 	 = ModelSchema.config.endpoints[endpoint].deep;
	let FILLED 	 = ModelSchema.config.endpoints[endpoint].filled;

	let a = 
	{
		p : mw.Model(model),
		create : function(req,res,next)
		{
			req.tent.endpoint  = {};
			next();
		},
		push : function(req,res,next)
		{
			let b = req.tent.endpoint;
			req.tent.needle[endpoint].push(b);
			next();
		},
		
		prepare : function(req,res,next)
		{
			let doc_id = req.tent.id;
			let q = ModelSchema.find({_id: doc_id});

			for(let i in POPULATE)
				q  = q.populate(endpoint+"."+i,POPULATE[i]);
			for(let i in DEEP)
				q  = q.deepPopulate(endpoint+"."+i,DEEP[i]);
			for(let i in FILLED)
				q  = q.fill(endpoint+"."+i,FILLED[i],req);

			q.exec(function(err,model)
			{
				if(err)
				{
					throw err;
				 	return res.send({ err: "Database Error" , code : 500 });
				}
				if(!model[0]) return res.send({ err: "Document not found.", code: 404});

				req.tent.needle = model[0];
				next();
			});
		},

		update: function(req,res,next)
		{
			let a;
			for(let  i in req.tent.needle.toObject()[endpoint])
			if(req.tent.needle.toObject()[endpoint][i]._id.equals(req.tent.field_id))
			{
				a = i; break;
			}
			for(let i in req.tent.endpoint)
			{
				req.tent.needle[endpoint][a][i] = req.tent.endpoint[i];
			}
			next();
		},

		load : function(req,res,next)
		{
			let a = {};
			for(let  i in req.tent.needle.toObject()[endpoint])
			{
				if(req.tent.needle.toObject()[endpoint][i]._id.equals(req.tent.field_id))
					a = req.tent.needle[endpoint][i];
			}
			req.tent.endpoint = a;
			next();
		},
		list : function(req,res,next)
		{
			req.tent.endpoint = req.tent.needle[endpoint];
			next();
		},
		check: function(req,res,next)
		{
			if( typeof config == 'function' )
			{
				if(!config(req)) return res.send(bad);
				next();
			}
		},
		delete: function(req,res,next)
		{	
			for(let  i in req.tent.needle.toObject()[endpoint])
				if(req.tent.needle.toObject()[endpoint][i]._id.equals(req.tent.field_id))
				{
					req.tent.needle[endpoint].splice(i,1);
					break;
				}
			req.tent.endpoint = { message: "success", code: "200" };
			next();
		},

		assignBody : function(req,res,next)
		{
			let q = util.sanitize(req,ModelSchema.config.endpoints[endpoint].permissions);
			for(let i in q)
				req.tent.endpoint[i] = q[i];
			next();
		},

		hideFields: function(req,res,next)
		{
			req.tent.endpoint = util.hide_fields(req.tent.endpoint,ModelSchema.config.endpoints[endpoint].permissions);
			next();
		},

		done: function(req,res,next)
		{
			res.send(req.tent.endpoint);
		},

		validateFields:  function(req,res,next)
		{
			let missing_fields = util.validate_fields(req,ModelSchema.config.endpoints[endpoint].required || []);
			if(missing_fields.length)
			{
				return res.send({ code: 400, err: "Invalid request." , missing_fields: missing_fields });
			}
			next();
		}

	};

	return a;
}

mw.api.endpoint.list = function(model,endpoint,...mc)
{
	let ep = mw.Endpoint(model,endpoint);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,2),
						
						 mw.api.init,
						...mw.pre(model),
						 ep.init,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 ep.prepare,
						 ep.list,
						 // ...mc,
						 ep.done);
}

mw.api.endpoint.get = function(model,endpoint,...mc)
{
	let ep = mw.Endpoint(model,endpoint);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,2),
						
						 mw.api.init,
						...mw.pre(model),
						 ep.init,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 ep.prepare,
						 ep.load,
						 ...mc,
						 ep.done);
	
}
mw.api.endpoint.post = function(model,endpoint,...mc)
{
	let ep = mw.Endpoint(model,endpoint);
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,2),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 ep.prepare,
						 ep.validateFields,
						 ep.create,
						 ep.assignBody,
						 ep.push,
						 mw_model.save,
						 ...mc,
						 ep.hideFields,
						 ep.done);

}
mw.api.endpoint.put = function(model,endpoint,...mc)
{
	let ep = mw.Endpoint(model,endpoint);
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,2),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 ep.prepare,
						 ep.load,
						 ep.assignBody,
						 ep.update,
						 mw_model.save,
						 ...mc,
						 ep.hideFields,
						 ep.done);
	
}

mw.api.endpoint.delete = function(model,endpoint,...mc)
{
	
	let ep = mw.Endpoint(model,endpoint);
	let mw_model = mw.Model(model);
	return mw.make(null,
						//@DEPRECATE 
						...mw.Universal(model,2),
						
						 mw.api.init,
						...mw.pre(model),
						 mw_model.init,
						
						//@DEPRECATE
						 ...mw.UniversalAfter(model),
						...mw.post(model),
						 ep.prepare,
						 ep.load,
						 ep.delete,
						 mw_model.save,
						 ...mc,
						 ep.done);
}


var util = 
{
	fields: function(req,permissions,endpoint)
	{
		let fields = [];
		if(req.query.fields)
		{
			let q_fields = req.query.fields.split(",");
			for(let i of q_fields)
			{
				if(permissions[i] && permissions[i]&1)
				{
					fields.push(i);
				}
			}
		}
		if(fields.length==0) 		
			for(let i in permissions)
			{
				if((permissions[i]&1)==0)
				{
					fields.push('-'+i);
				}
			}
		if(endpoint)
			for(let i in fields)
				fields[i] = endpoint +"."+fields[i];
		if(fields.length==0)
			fields.push('-__v');
		return fields;

	},

	sort : function(req,permissions,ModelInstance)
	{
		let sort = {};
		if(req.query.sort)
		{
			var q_fields = req.query.sort.split(",");
			for(let i of q_fields)
			{
				var str = (i[0]=='-')? i.substring(1) : i;
				if(permissions[str] || ( permissions[ModelInstance._constainsFieldRef(str)] ) )
				{
					sort[str] = 1 - 2*(i[0]=='-');
				}
			}
		}
		return sort;
	},

	filter : function(req,permissions)
	{
		let filters = [];	
		for(var i in req.query)
		{
			if(i=="search" || i=="or" || (permissions[i.split(".")[0]] &1) || (permissions[i] && permissions[i]&1))
			{
				let val = req.query[i].split("..");
				let item = { field: i };
				if(i=="search")
				{
					let subfields  = val[0].split(",");
					if(!item.or)
						item.or = [];
					for(let j in subfields)
					{
						let b = subfields[j].split(":");
						let a = {};

						if(!safe(b[1]))
							continue;

						a[b[0]] = { $regex: new RegExp(b[1]) , $options: 'i' };
						item.or.push(a);
					}
				}
				else
				if(i=="or")
				{
					let subfields  = val[0].split(",");
					if(!item.or)
						item.or = [];
					for(let j in subfields)
					{
						let b = subfields[j].split(":");
						let a = {};

						a[b[0]] = b[1];
						item.or.push(a);
					}
				}
				else
				if(val.length==1 && val[0].substring(0,3)=="dt_")
				{
					item.set = new Date(val[0].substring(3));
				}
				else
				if(val.length==1 && val[0].substring(0,3)=="bl_")
				{
					item.set = (val[0].substring(3)=="true");
				}
				else
				if(val.length==1 && val[0].substring(0,3)=="rx_")
				{
					if(!safe(val[0].substring(3)))
						continue;
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
				if(!query["$or"])
					query["$or"] = [];
				query["$or"].push(...i.or);
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
			if(i.set || i.set===false)
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
					query[i.field].$gte = parseFloat(i.gte) ;
				if(i.lte)
					query[i.field].$lte = parseFloat(i.lte) ;
			}
		}
		return query;
	},

	sanitize : function(req,permissions)
	{
		let body = req.body;
		let key = ( req.method == "POST" )? 2 : 4;
		let query = {};

		for(let i in body)
		{
			if(permissions[i]& key)
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

	hide_fields_list : function(list,permissions)
	{
		let a =[];
		for(let i in list)
			a.push(util.hide_fields(list[i],permissions))
		return a;
	},

	validate_fields : function(req,required)
	{
		let body = req.body;

		let missing = [];
		for(let i of required)
		{
			if( body[i] == null )
				missing.push(i);
			else
			if(body[i] == "$n_null")
				body[i] = null;
		}

		return missing;
	}
}