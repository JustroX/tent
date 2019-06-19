// Query builder
// this is specifically for LIST request
/*
	Basically i'd like to use this command

	let q = ModelInstance.query();
	
*/

class Query
{
	constructor(mongoose_model,mongoose)
	{
		this.mongoose_model = mongoose_model;
		this.actions = [{
			$project: selectDefault(mongoose_model.schema.paths)
		}];
		this.pluralize = mongoose._pluralize;
		this.mongoose = mongoose;
	}


	find(filter)
	{
		if(!filter || Object.keys(filter)==0) return this;
		filter = this._prepare_fields(filter);
		let pipe =
		{
			$match: filter,
		};
		this.actions.push(pipe);
		return this;
	}

	sort(fields)
	{
		if(!fields || Object.keys(fields)==0) return this;
		let pipe=
		{
			$sort: fields 
		};
		this.actions.push(pipe);
		return this;
	}

	limit(num=10)
	{
		let pipe =
		{
			$limit : num
		};
		this.actions.push(pipe);
		return this;
	}

	skip(num=0)
	{
		let pipe =
		{
			$skip : num
		};
		this.actions.push(pipe);
		return this;
	}

	//missing other options for mongoose-like functions 
	// e.g. virtual populations 
	populate(obj)
	{
		let path   = obj.path;
		let select = obj.select;
		let match  = obj.match;

		this._populate(path,select,match);

		return this;
	}
	_populate(fields,select,match)
	{
		let field_arr = fields.split(".");
	
		let pipes = [];
		let group_pipes = [];

		let cur_path = "";

		for(let i=0; i<field_arr.length; i++)
		{
			let updatedPath = cur_path + ( i!=0 ? "." : "") +field_arr[i];
			if( this._is_array(updatedPath) )
			{
				let unwind_pipe=
				{
					$unwind:
					{
						path: updatedPath,
						preserveNullAndEmptyArrays: true
					}
				}

				let group_pipe =
				{
					$group:{ _id: "$_id" }
				}
				group_pipe.$group[updatedPath] = { $push: "$"+updatedPath };

				pipes.push(unwind_pipe);
				group_pipes.shift(group_pipe);

			}
			cur_path  = updatedPath;
		}

		let path_object = this._get_schema_field(cur_path);
		if(!path_object.options || !path_object.options.ref) return;
		
		if(pipes.length)
			this.actions.push(...pipes);

		this.populateSingle(cur_path,path_object,select);

		if(match)
			this.filter(match);
		
		if(group_pipes.length)
			this.actions.push(...group_pipes);

		return this;


	}

	populateSingle(field,fieldObj,select)
	{
		let ref = this.pluralize(fieldObj.options.ref);
		let pipe =
		{
			$lookup:
			{
				from: ref,
				localField:  field,
				foreignField: "_id",
				as: field
			}
		};
		this.actions.push(pipe);
		this.select(select);
	}

	select(fields)
	{
		let pipe =
		{
			$project: selectToObj(fields) 
		};
		this.actions.push(pipe);
		return this;
	}
	exec(cb)
	{
		this.mongoose_model.aggregate(this.actions,cb);
	}

	export()
	{

	}

	//util functions
	_is_array(field)
	{
		return this._get_schema_field(field).$isMongooseArray;
	}
	_is_objectId(field)
	{
		return this._get_schema_field(field).constructor.name == "ObjectId"
	}

	_get_schema_field(field)
	{
		let fields = field.split(".");
		let current = this.mongoose_model.schema.paths;

		let path = "";
		while(fields.length)
		{
			let newPath = fields.shift();
			path += (path!=""?".":"") + newPath;

			//try to import other model schema
			if(current[path] && current[path].$isMongooseArray && current[path].constructor.name == "SchemaArray")
			{
				if(fields.length==0)
				{
					current = current[path].caster;
					path = "";
				}
				else
				{
					console.log(path);
					let ref = current[path].caster.options.ref;
					current = this.mongoose.modelSchemas[ref].paths;
					path="";
				}
			}
			else
			if(current[path] && current[path].$isMongooseArray)
			{
				current = current[path].schema.paths;
				path="";
			}
			else
			{
				if(fields.length!=0 && current[path] && current[path].options.ref )
				{
					let ref = current[path].options.ref;
					current = this.mongoose.modelSchemas[ref].paths;
					path="";
				}
			}
			
		}

		if(path=="")
			return current;
		if(current[path])
			return current[path];
		return {};		
	}


	_is_populate_safe()
	{

	}

	_prepare_fields(fields)
	{
		for(let i in fields)
			if(this._is_objectId(i))
				fields[i] =this._convert_fields_to_objectId(fields[i])
		return fields;
	}

	_convert_fields_to_objectId(query)
	{
		const _this = this;
		function _convert_val_to_objectId(val)
		{
			try
			{
				val = _this.mongoose.Types.ObjectId(val);
			}
			catch(err){
				// console.log(err);
			}
			return val;

		}
		query = _convert_val_to_objectId(query);
		
		if(query.$in)
			for(let i in query.$in)
				query.$in[i] = _convert_val_to_objectId(query.$in[i]);
		if(query.$ne)
			query.$ne = _convert_val_to_objectId(query.$ne);
		return query;
	}
}

function selectDefault(paths)
{
	let query = {};
	for(let i in paths)
		query[i] = 1;
	return query;
}

function selectToObj(str)
{
	let paths = str.split(" ");
	let query = {};

	for(let x of paths)
	{
		if(x[0] == "-")
			query[x] = 1;
		else
			query[x.slice(1)] = 0;  
	}
	return query;
}

exports.new = function(model,pluralize)
{
	return new Query(model,pluralize);
}