
class CacherPlugin
{
	constructor(config)
	{
		this.plugin_name  = "cacher";

		const cacherOptions = config.cacheOptions;
		this.cacher  = new redis.cacher( cacheOptions );
		//private values
		this.CACHER_PLUGIN_PREFIX = config.prefix 	  || "justrox-cacher-plugin/";
		this.EXPIRATION			  = config.expiration || 60*15; //15 minutes
	}

	initialize()
	{
		const model  = this.model;

		//Cacher available in routes
		model.pre((req,res,next)=>
		{
			req.tent.cacher = this.get;
			next();
		});
	}

	async get(key,fallback)
	{
		let val  = await this.read(key);
		
		//cache available
		if(val)
			return val;
		else
		{
			let newVal;

			if( isAsync(fallback) )
				newVal = await fallback();
			else
				newVal = fallback();

			this.write(key,newVal);

			return newVal;
		}
	}

	read(key)
	{
		return this.cacher.read(key);
	}

	write(key,obj)
	{
		this.cacher.write(
			this.CACHER_PLUGIN_PREFIX + key,
			obj,
			this.EXPIRATION
		);
	}

	setExpiration(num)
	{
		this.EXPIRATION = num;
	}
}


module.exports.plugin = function(config)
{
	return new CacherPlugin(config);
}

function isAsync (func) {
    const string = func.toString().trim();
    return !!(
        string.match(/^async /) ||
        string.match(/return _ref[^\.]*\.apply/)
    );
}