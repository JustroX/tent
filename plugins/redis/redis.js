var redis = require("redis");
var events = require('events');

	
const CHANNEL_NAME = "tent-channel";

class RedisDB
{
	constructor(options)
	{
		this.client  = redis.createClient(options);
		this.client.on("error",(err)=>console.log(err));
	}
}

class Publisher extends RedisDB
{
	constructor(options)
	{
		super(options);
	}
	publish(channel,payload)
	{
		let obj = 
		{
			channel : channel,
			payload : payload
		}
		let str = JSON.stringify(obj);
		
		this.client.publish( CHANNEL_NAME , str );
	}
}

class Subscriber extends RedisDB
{
	constructor(options)
	{
		super(options);

		//this might be a bottleneck
		this.client.on("message",(channel,message)=>
		{
			let obj = JSON.parse(message);
			this.event.emit(
				obj.channel,
				obj.payload
			);
		});
		this.client.subscribe( CHANNEL_NAME );
		this.event = new events.EventEmitter();
	}
	subscribe(channel,listener)
	{
		this.event.on(channel,listener);

		let a = { unsubscribe: ()=>this.event.removeListener(channel,listener) }
		return a;
	}
}

class Cacher extends RedisDB
{
	constructor(options)
	{
		super(options);
		this.CACHE_PREFIX = "justrox-cache/";
		this.CACHE_EXPIRATION = 60*15; //15 minutes caching
	}
	
	read(key)
	{
		return new Promise((resolve,reject)=>
		{
			this.client.get(this.CACHE_PREFIX+key,(err,value)=>
			{
				if(err) return reject(err);

				//if undefined or null
				if(value !=0 && !value) resolve(null);
				
				resolve(JSON.parse(value));
			});
		});
	}

	write(key,value,expiration)
	{
		let val = JSON.stringify(value);
		this.client.set(
			this.CACHE_PREFIX+key,
			val,
			'EX',
			expiration || this.CACHE_EXPIRATION
		);
	}

	clean()
	{
		this.client.flushall();
	}
}

class Operator extends RedisDB
{
	constructor(options)
	{
		super(options);
		this.OPERATOR_PREFIX = "justrox-operator/";
		this.OPERATOR_EXPIRATION = 60*15; //15 minutes caching
	}
	
	read(key)
	{
		return new Promise((resolve,reject)=>
		{
			this.client.get(this.OPERATOR_PREFIX+key,(err,value)=>
			{
				if(err) return reject(err);

				//if undefined or null
				if(value !=0 && !value) resolve(null);
				
				resolve(JSON.parse(value));
			});
		});
	}

	write(key,value,expiration)
	{
		let val = JSON.stringify(value);
		this.client.set(
			this.OPERATOR_PREFIX+key,
			val,
			'EX',
			expiration || this.OPERATOR_EXPIRATION
		);
	}

	increment(key)
	{
		this.client.incr(this.OPERATOR_PREFIX+key);
	}

	decrement(key)
	{
		this.client.decr(this.OPERATOR_PREFIX+key);
	}
	
	incrementBy(key,value)
	{
		this.client.incrby(this.OPERATOR_PREFIX+key,value);
	}

	decrementBy(key,value)
	{
		this.client.decrby(this.OPERATOR_PREFIX+key,value);
	}

	clean()
	{
		this.client.flushall();
	}
}

module.exports.publisher = function(options)
{
	return new Publisher(options);
}

module.exports.subscriber = function(options)
{
	return new Subscriber(options);
}

module.exports.cacher = function(options)
{
	return new Cacher(options);
}


module.exports.operator = function(options)
{
	return new Operator(options);
}

