var fs = require('fs');
var _ = require('underscore');
var request = require('request');
var util = require('util');
var EE = require('events').EventEmitter;
var cheerio = require('cheerio');
var robots = require('robots');

var Spyderino = function(options){

	this.options = _.extend({
		entryPoint: null,
		maxConnections: 10,
		requestTimeout: 10000,
		visitedLog: null,
		headers: {},
		maxDepth: null,
		constrainToDomain: true,
		beforeFilter: null,
		userAgent: 'Spyderino/0.1',

		//An itemizer is a function that give a cheerio object
		//returns a set of cheerio objects representing the items
		//which will then be parsed for each field.
		//If no itemizer is present, the whole page is considered a single item
		itemizer: null,

		//Cropper constrains page operations to a specific container
		cropper: null
	}, options);

	this.filters = [];
	this.itemizers = [];
	this.itemProps = {};
	this.required = {};
	this.uniques = {};
	this.queued = [];
	this.base = null;
	this.stopped = false;

	if (this.options.itemProps) {
		for (var name in this.options.itemProps) {
			this.addField(name, this.options.itemProps[name]);
		}
	}

	if (this.options.filters) {
		this.options.filters.forEach(function(filter){
			this.filters.push(filter);
		}.bind(this));
	}
	this.activeRequests = 0;
};

util.inherits(Spyderino, EE);

_.extend( Spyderino.prototype, {

	start: function(){
		console.log('Starting Spyderino ( UA: ', this.options.userAgent, ')');
		this.uniques = {};
		this.queued = [];
		var parsedUrl = require('url').parse(this.options.entryPoint);
		this.base = parsedUrl.hostname;

		//get robots
		var parser = new robots.RobotsParser();
		parser.setUrl(parsedUrl.protocol + '//' + parsedUrl.hostname + '/robots.txt', function(parser, success) {
			if (success) {
				console.log('Using robots.txt');
				var userAgent = this.options.userAgent;
				this._robotsFilter = function(url) {
					return parser.canFetchSync(userAgent, url);
				};
			}

			this._getPage(this.options.entryPoint, 0);
			if (this.options.visitedLog)
				this.visitedLog = fs.createWriteStream(this.options.visitedLog);
		}.bind(this));
	},

	stop: function() {
		this.stopped = true;
	},

	restart: function() {
		this.stopped = false;
		this._requestComplete();
	},

	addField: function(field, parser){
		this.itemProps[field] = parser;
	},

	addFilter: function(filter){
		this.filters.push(filter);
	},

	status: function(){
		return {
			activeRequests: this.activeRequests,
			uniques: _.toArray(this.uniques).length - this.activeRequests,
			queued: this.queued.length
		};
	},

	_getPage: function(url, depth){
		if (this.stopped) return;
		this.activeRequests ++;
		this.options.headers['User-Agent'] = this.options.userAgent;
		var options = {
			url : url,
			headers: this.options.headers
		};
		request(options, function(err, resp, body) {

			if (err) {
				this.emit('error', err);
				return;
			}
			if (this.stopped) return;

			var finalUrl = resp.request.uri.href;

			if (this.visitedLog) this.visitedLog.write(finalUrl + '\n');

			var $ = cheerio.load(body);
			var page = $;

			this.emit('page', {url: finalUrl, body: body});

			this._beforeFilter($);

			if (this.options.cropper) {
				var el = this.options.cropper($).html();
				if (el) {
					$ = cheerio.load(el);
				}
			}

			if (this.options.maxDepth && depth < this.options.maxDepth) {
				//extract the links,
				var links = this._extractLinks($, finalUrl);
				links = this._filterLinks(links, finalUrl);
				this._addToQueue(links, depth + 1);
			}

			var items = [$];

			if (this.options.itemizer) {
				items = [];
				var allItems = this.options.itemizer($).each(function(i, el){
					items.push(cheerio.load($(el).html()));
				});
			}

			items.forEach(function(item) {

				var valid = true;

				var result = {};
				for (var field in this.itemProps){
					var parser = this.itemProps[field].parser;
					var fieldValue = parser({url: finalUrl, $: page}, item);
					if (fieldValue) {
						result[field] = fieldValue;
					} else {
						if (this.itemProps[field].required) {
							valid = false;
						}
					}
				}
				//emit the result
				if (valid && Object.keys(result).length > 0) {
					this.emit('item', result, $);
				}
			}.bind(this));

			//fill any empty connections
			this.activeRequests --;
			this._requestComplete();
		}.bind(this));
	},

	_beforeFilter: function($) {
		if (this.options.beforeFilter) {
			this.options.beforeFilter($);
		}
	},

	_extractLinks: function($, url){
		var links = _.toArray($('a'))
			.map(function(link) {
				return $(link).attr('href');
			})
			.filter(function(link) {
				return typeof link  !== 'undefined';
			})
			.map(function(link) {
				return this._normalizeUrl(link, url);
			}.bind(this));

		return links;
	},

	_filterLinks: function(links, url){

		links = links.filter(function(link){

			var keep = (this.filters.length === 0);
			this.filters.forEach(function(filter){
				keep = keep || filter.apply(this, [link, url]);
			}.bind(this));

			if (this.options.constrainToDomain) {
				keep = keep && this._baseFilter(link);
			}

			if (this._robotsFilter) {
				keep = keep && this._robotsFilter(url);
			}
			return keep;
		}.bind(this));
		return links;
	},

	_addToQueue: function(links, depth){
		links.forEach(function(link){
			var key = require('crypto').createHash('md5').update(link).digest('hex');
			if (!this.uniques[key]){
				this.uniques[key] = true;
				this.queued.push({url: link, depth: depth});
			}
		}.bind(this));
	},

	_baseFilter: function(url){

		if (!url) return false;
		var parsed = require('url').parse(url);

		if (parsed.host && (parsed.host !== this.base)) {
			return false;
		}

		return true;
	},

	_requestComplete: function(){

		if (this.stopped) return;

		while (this.activeRequests < this.options.maxConnections && this.queued.length > 0){
			var el = this.queued.shift();
			this._getPage(el.url, el.depth);
		}

		if (this.activeRequests === 0 && this.queued.length === 0){
			this.emit('complete');
		}
	},

	_normalizeUrl: function(url, parentUrl){

		var parser = require('node-url-utils');
		var parsed = parser.parse(url);

		if (!parsed) {
			console.error('Error parsing url', url);
			return null;
		}

		if (!parsed.host){
			var parsedParentUrl = parser.parse(parentUrl);

			parsed.protocol = parsedParentUrl.protocol;
			parsed.host     = parsedParentUrl.host;
			parsed.hostname = parsedParentUrl.hostname;
		}

		parsed.hash = null;

		return parser.normalize(parser.format(parsed));
	}
});

module.exports = Spyderino;
