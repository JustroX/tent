const Model   = require('./schema.js');
const express = require('express')

module.exports.Model = Model;
module.exports.Route = require('./route.js');

var Builder = require("./builder.js");

const mw = module.exports.Route;

module.exports.init = function(app,done)
{
	let router =  express.Router();
	let models =  Model.all();
	for(let i in models)
	{
		let nrouter = express.Router();

		if(models[i].mw.length)
		nrouter.use( models[i].mw );
		
		//use methods
		for(let method of models[i].methods_route)
		{
			let pipes = Builder.new(method.type,i).init().preInit().model(i).parseParams().postInit();

			if(method.local)
				pipes.load();
			
			let path = (method.local ? "/:id/method/" : "/method/"  );
			nrouter[method.type]
			( 
				path + method.name  ,
			 	method.definition( pipes , Builder.new(method.type,i))
			);
		}

		if(!models[i].router)
		models[i].router = function(route)
		{
			route.get('/', 		 mw.api.list(i)   );
			route.post('/', 	 mw.api.post(i)   );
			route.get('/:id', 	 mw.api.get(i)    );
			route.put('/:id', 	 mw.api.put(i)    );
			route.delete('/:id', mw.api.delete(i) );

			//endpoints
			let endpoints = models[i].mongoose_model.config.endpoints;
			for(let e in endpoints)
			{
				route.get   ('/:id/' + e + '/'      	, mw.api.endpoint.list  (i,e) );
				route.post  ('/:id/' + e + '/'     		, mw.api.endpoint.post  (i,e) );
				route.get   ('/:id/' + e + '/:field_id' , mw.api.endpoint.get   (i,e) );
				route.put   ('/:id/' + e + '/:field_id' , mw.api.endpoint.put   (i,e) );
				route.delete('/:id/' + e + '/:field_id' , mw.api.endpoint.delete(i,e) );
			}
		}

		models[i].router(nrouter);

		if(models[i].routerExtend)
			models[i].routerExtend(nrouter);



		router.use('/'+i.toLowerCase(),nrouter);
	}

	app.use('/api',router);
	done();
}

