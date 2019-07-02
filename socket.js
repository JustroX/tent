var events = require('events');
var notify = new events.EventEmitter();
var io;

class Notification
{

}

exports.emit = ( event, ...args )=>
{
	notify.emit();
};

exports.init = ( _io, session )=>
{
	io = _io;
	io.use(function(socket,next)
	{
		session(socket.request,
				socket.request.res,
				next);
	});
	io.on('connection',(socket)=>
	{
		let user = socket.request.session.passport.user;

		socket.on('disconnect',()=>
		{

		});
	});
}
