var Spyderino = require('../spyderino');

var spyder = new Spyderino({
	entryPoint: 'https://github.com/aisaacs/spyderino',
	maxDepth: 1
});

spyder.on('page', function(page) {
	console.log(page.url);
});

spyder.on('complete', function() {
	console.log('All done!');
});

spyder.start();
