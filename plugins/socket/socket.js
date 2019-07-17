var io 		= require("socket.io");
var events  = require("events");

class SocketPlugin
{
	constructor(options)
	{
		this.plugin_name = "socket";

		this.connection_middlewares = [];
		this.receive_middlewares 	= [];
		this.send_middlewares 	 	= [];
		this.events = new events.EventEmitter();

		if(!options.server)
			throw new Error("ERR: Plugin SOCKET - HTTP server is not set.");
		io = io( options.server );
	}

	initialize()
	{
		const model = this.model;
		model.pre((req,res,next)=>
		{
			//put values here
			req.tent.socket = 
			{
				emit: this.emit,
				listen: this.listen
			};
			next();
		});
	}

	//middlewares
	connection(mw)
	{
		this.connection_middlewares.push(mw);
	}
	receive(mw)
	{
		this.receive_middlewares.push(mw);
	}
	send(mw)
	{
		this.send_middlewares.push(mw);
	}

	//utilities
	_middlewares_flow(_mws,...args)
	{
		let mws = [..._mws];
		let end = args.pop();

		function next()
		{
			if(mws.length)
				run_one();
			else
				end();

		}

		function run_one()
		{
			let mw = mws.shift();
			mw(...args, next );
		}

		next();
	}

	//cores
	open()
	{
		io.use((socket,next)=>
		{
			let res={ send: (obj)=>{ return obj; } };
			this._middlewares_flow(
				this.connection_middlewares,
				socket.request,
				res,
				next
			);
		})
		.on('connection',(socket)=>
		{
			this.events.emit('user_connected',socket);
			socket.on('disconnect',()=>
			{
				this.events.emit('user_disconnected',socket);
			});
		});
	}

	listen( receivers , channel, handler )
	{
		for(let id of receivers)
			io.to(id).on(channel,handler);	
	}

	emit( receivers , channel, message )
	{
		for(let id of receivers)
			io.to(id).emit(channel,message);
	}
}

module.exports.plugin = function(options)
{
	return new SocketPlugin(options);
}

