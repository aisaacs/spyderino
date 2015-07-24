var Spyderino = require('../spyderino');

var spyder = new Spyderino({
	entryPoint: 'https://github.com/aisaacs/spyderino',
	maxDepth: 1,
	cropper: function($) {
		return $('table.files tbody');
	},
	filters: [
		function(url) {
			return url.indexOf('commit') === -1;
		}
	],
	itemProps: {
		'fileName': {
			parser: function(data, $) {
				return $('.final-path').text().trim();
			},
			requried: true
		},
		'size': {
			parser: function(data, $) {
				return $('.file-info').text().trim().split('\n').pop().trim();
			},
			required: true
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
