var Crawler = require('../spyderino');

var c = new Crawler({
	entryPoint: 'http://www.amazon.com/b/ref=s9_acss_bw_ct_Auto14St_ct11_a4?_encoding=UTF8&node=404825011&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-5&pf_rd_r=0A9HNM378YZTXE8ZYV6K&pf_rd_t=101&pf_rd_p=2098125842&pf_rd_i=15684181',
	maxDepth: 0,
	itemizer: function($) {
		return $('.s-item-container');
	},
	parsers: {
		title: function(response, $) {
			return $('.s-access-detail-page').text();
		},
		price: function(response, $) {
			return $('.s-price').text();
		},
		image: function(response, $) {
			return $('img.s-access-image').attr('src');
		}
	}
});

c.on('page', function(page) {
	console.log('Got url: ', page.url);
});

c.on('item', function(item) {
	console.log('Got Item: \n', item, '\n');
});

c.on('complete', function() {
	console.log('Complete');
});


c.start();
