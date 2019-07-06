var redis = require("./redis.js");
const exitHook = require('exit-hook');

class ChannelEmitter
{
	constructor(plugin,req)
	{
		this.plugin = plugin;
		this.doc_id = req.tent.id;
		this.type   = req.method;
	}

	publish( audience, message )
	{
		this.plugin.emit(audience,this.type,this.doc_id,message);
	}
}

class ChannelPlugin
{
	constructor(config)
	{
		this.plugin_name = "channel";
		this.required_plugins = ["socket"];

		this.publisher = redis.publisher(config);
		this.subscriber = redis.subscriber(config);
		this.operator   = redis.operator(config);

		this.CHANNEL_PREFIX = "tent-channel/";

		//user mapping
		this.mapping_function = config.mapping  || ((a)=>a.id) ;
		
		//this will be big
		this.socket_to_user_map = {};
		this.user_to_socket_map = {};

		this.active_users = 0;

	}

	initialize()
	{
		const model = this.model;
		//add events
		const socket = model.socket;

		//nodemon

		exitHook(()=>
		{
			this.cleanup();
		});

		socket.events.on('user_connected',async(socket)=>
		{
			const socket_id = socket.id;
			const user      = await this.mapper(socket); 
			
			this.increase_count();

			this.user_to_socket_map[user] = socket_id;
			this.socket_to_user_map[socket_id] = user;

			let sub = this.subscriber.subscribe(this.CHANNEL_PREFIX+user,(payload)=>
			{
				const name = model.name.toLowerCase();
				const type = payload.type.toLowerCase();
				const message = payload.message;

				socket.emit(name+"/"+type,message);
			});

			socket.on('disconnect',()=>
			{
				this.decrease_count();

				delete this.user_to_socket_map[user];
				delete this.socket_to_user_map[socket_id];

				sub.unsubscribe();
			});
		});

		model.pre((req,res,next)=>
		{
			req.tent.channel 	=  new ChannelEmitter(this,req);	
			next();
		});

	}

	emit(audience,type,id,message)
	{
		let payload = 
		{
			type: type,
			id  : id,
			message: message
		};

		//for all audience
		for(let uid of audience)
			this.publisher.publish( this.CHANNEL_PREFIX + uid, payload );
	}

	cleanup()
	{
		console.log("Cleaning up...");
		this.reset_count();
	}

	increase_count()
	{
		this.active_users += 1; 
		this.operator.increment(this.CHANNEL_PREFIX+"active_devices");
	}

	decrease_count()
	{
		this.active_users -= 1; 
		this.operator.decrement(this.CHANNEL_PREFIX+"active_devices");
	}

	reset_count()
	{
		this.operator.decrementBy(this.CHANNEL_PREFIX+"active_devices",this.active_users);
	}

	count_all_devices()
	{
		this.operator.read(this.CHANNEL_PREFIX+"active_devices").then((num)=>
			{
					console.log(num);
			});
	}


	to_user( socket )
	{
		return this.socket_to_user_map[socket]
	}
	to_socket( user )
	{
		return this.user_to_socket_map[user];
	}

	set_mapping(func)
	{
		this.mapping_function = func;
	}
	async mapper(...args)
	{
		if(isAsync(this.mapping_function))
			return await this.mapping_function(...args);
		else
			return this.mapping_function(...args);
	}
}

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


module.exports.plugin = function(options)
{
	return new ChannelPlugin(options);
}