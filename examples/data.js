var Spyderino = require('../spyderino');

var spyder = new Spyderino({
	entryPoint: 'https://github.com/aisaacs/spyderino',
	maxDepth: 0,
	cropper: function($) {
		return $('table.files tbody');
	},
	itemizer: function($) {
		return $('tr');
	},
	itemProps: {
		'fileName': {
			parser: function(data, $) {
				return $('td.content').text().trim();
			},
			requried: true
		}
	}
});

spyder.on('page', function(page) {
	console.log(page.url);
});

spyder.on('item', function(item) {
	console.log(item);
});

spyder.on('complete', function() {
	console.log('All done!');
});

spyder.start();
