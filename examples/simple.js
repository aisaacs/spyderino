var Crawler = require('../spyderino');

var c = new Crawler({
	entryPoint: 'http://www.amazon.com',
	maxDepth: 1
});

c.on('page', function(page) {
	console.log('Got url: ', page.url);
});

c.on('complete', function() {
	console.log('Complete');
});

c.start();
