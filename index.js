const Model   = require('./schema.js');
const express = require('express')

module.exports.Model = Model;
module.exports.Route = require('./route.js');

const mw = module.exports.Route;

module.exports.init = function(app,done)
{
	let router =  express.Router();
	let models =  Model.all();
	for(let i in models)
	{
		let nrouter = express.Router();

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
		router.use('/'+i.toLowerCase(),nrouter);
	}

	app.use('/api',router);
	done();
}

