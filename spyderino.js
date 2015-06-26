var fs = require('fs');
var _ = require('underscore');
var request = require('request');
var util = require('util');
var EE = require('events').EventEmitter;
var cheerio = require('cheerio');

var Spyderino = function(options){

	this.options = _.extend({
		entryPoint: null,
		maxConnections: 10,
		requestTimeout: 10000,
		visitedLog: null,
		headers: {},
		maxDepth: null,

		//An itemizer is a function that give a cheerio object
		//returns a set of cheerio objects representing the items
		//which will then be parsed for each field.
		//If no itemizer is present, the whole page is considered a single item
		itemizer: null
	}, options);

	this.filters = [];
	this.itemizers = [];
	this.parsers = {};
	this.uniques = {};
	this.queued = [];
	this.base = null;
	this.stopped = false;

	if (this.options.parsers) {
		for (var name in this.options.parsers) {
			this.parseField(name, this.options.parsers[name]);
		}
	}

	this.filters.push(this._baseFilter);
	this.activeRequests = 0;
};

util.inherits(Spyderino, EE);

_.extend( Spyderino.prototype, {

	start: function(){
		this.uniques = {};
		this.queued = [];
		var parsedUrl = require('url').parse(this.options.entryPoint);
		this.base = parsedUrl.hostname;
		this._getPage(this.options.entryPoint, 0);
		if (this.options.visitedLog)
			this.visitedLog = fs.createWriteStream(this.options.visitedLog);
	},

	stop: function() {
		this.stopped = true;
	},

	restart: function() {
		this.stopped = false;
		this._requestComplete();
	},


	parseField: function(field, parser){
		this.parsers[field] = parser;
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

			if (this.visitedLog) this.visitedLog.write(url + '\n');

			var $ = cheerio.load(body);

			this.emit('page', {url: url, body: body});

			this._beforeFilter($);

			if (depth < this.options.maxDepth) {
				//extract the links,
				var links = this._extractLinks($);
				links = this._filterLinks(links);
				this._addToQueue(links);
			}

			var items = [];

			if (this.options.itemizer) {
				var allItems = this.options.itemizer($).each(function(i, el){
					items.push(el);
				});
			} else {
				items = [$];
			}

			items.forEach(function(item) {
				item = cheerio.load(item);
				var result = {};
				for (var field in this.parsers){
					var parser = this.parsers[field];
					result[field] = parser({url: url}, item);
				}
				//emit the result
				this.emit('item', result);
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

	_extractLinks: function($){
		var links = _.toArray($('a')).map( function(link) { return $(link).attr('href'); });

		return links;
	},

	_filterLinks: function(links){

		links = links.filter(function(link){
			var keep = true;
			this.filters.forEach(function(filter){
				var result = filter.apply(this, [link]);
				if (!result) keep = false;
			}.bind(this));

			return keep;
		}.bind(this));
		return links;
	},

	_addToQueue: function(links, depth){
		links.forEach(function(link){

			var nl = this._normalizeUrl(link);
			if (nl) {
				var key = require('crypto').createHash('md5').update(nl).digest('hex');
				if (!this.uniques[key]){
					this.uniques[key] = true;
					this.queued.push({url: nl, depth: depth});
				}
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

	_normalizeUrl: function(url){

		var parser = require('node-url-utils');
		var parsed = parser.parse(url);

		if (!parsed) {
			console.error('Error parsing url', url);
			return null;
		}

		if (!parsed.host){
			parsed.protocol = 'http';
			parsed.host = this.base;
			parsed.hostname = this.base;
		}

		parsed.hash = null;

		return parser.normalize(parser.format(parsed));
	}
});

module.exports = Spyderino;
