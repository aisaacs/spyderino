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
		headers: {}
	}, options);

	this.filters = [];
	this.parsers = {};
	this.uniques = {};
	this.queued = [];
	this.base = null;
	this.stopped = false;

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
		this._getPage(this.options.entryPoint);
		if (this.options.visitedLog)
			this.visitedLog = fs.createWriteStream(this.options.visitedLog);
	},

	stop: function() {
		this.stopped = true;
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

	_getPage: function(url){
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

			//extract the links,
			var links = this._extractLinks($);
			//filter the links
			links = this._filterLinks(links);
			//queue them
			this._addToQueue(links);

			//parse the doc
			var result = {};
			for (var field in this.parsers){
				var parser = this.parsers[field];
				result[field] = parser({url: url}, $);
			}
			//emit the result
			this.emit('item', result);

			if (this.stopped) return;
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

	_addToQueue: function(links){
		links.forEach(function(link){

			var nl = this._normalizeUrl(link);

			var key = require('crypto').createHash('md5').update(nl).digest('hex');
			if (!this.uniques[key]){
				this.uniques[key] = true;
				this.queued.push(nl);
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
			var url = this.queued.shift();
			this._getPage(url);
		}

		if (this.activeRequests === 0 && this.queued.length === 0){
			this.emit('complete');
			console.log('Completed');
		}
	},

	_normalizeUrl: function(url){

		var parser = require('node-url-utils');
		var parsed = parser.parse(url);

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
