var Crawler = require('../spyderino');

var c = new Crawler({
	entryPoint: 'http://www.amazon.com/Best-Sellers/zgbs/ref=zg_bs_unv_k_0_k_1',
	//entryPoint: 'http://www.amazon.com/Best-Sellers-Appliances/zgbs/appliances/ref%3Dzg_bs_nav_0/179-1919796-9765210',
	maxDepth: 10,
	maxConnections: 10,
	constrainToDomain: true,
	filters: [
		function(url, context) {
			return /\/Best-Sellers/.test(url);
		},
		function(url, context) {
			return /\/Best-Sellers/.test(context) && /www.amazon.com\/[^\/]+\/dp\//.test(url);
		}
	],
	/*beforeFilter: function($) {
		console.log($('#productTitle'));
		process.exit(0);
	},*/
	cropper: function($) {
		return $('#zg_col1')[0] || $('.a-container')[0];
	},
	itemizer: function($) {
		return $('.a-container');
	},
	itemProps: {
		title: {
			parser: function(context, $) {
				return $('#btAsinTitle').text();
			},
			required: true
		},
		price: {
			parser: function(context, $) {
				return $('b.priceLarge').text().trim();
			},
			required: true
		},
		reviewAverage: {
			parser: function(context, $){
				try {
					var t = $('div.jumpBar .asinReviewsSummary > a span.swSprite').text();
					return Number(/([0-9\.]*) out /.exec(t)[1]);
				} catch (e) {
					return null;
				}
			}
		},
		reviewCount: {
			parser: function(context, $){
				try {
					var t = $('.jumpBar .crAvgStars > a').text();
					return Number(/([0-9\.]*) customer /.exec(t)[1]);
				} catch (e) {
					return null;
				}
			}
		},
		image: {
			parser: function(context, $){
				return $('#main-image').attr('src');
			},
			required: true
		},
		url: {
			parser: function(context, $){
				return $("link[rel='canonical']").attr('href');
			},
			required: true
		},
		asin: {
			parser: function(context, $){
				var result = context.url.match(/www.amazon.com\/[^\/]+\/dp\/([^\/]+)\//);
				if (result && result.length > 0) return result[1];
				return null;
			},
			required: false
		}
	}
});

var crawler = c;

c.on('item', function(item) {
	console.log(item);
});

c.on('complete', function() {
	console.log('Complete');
});


c.start();
