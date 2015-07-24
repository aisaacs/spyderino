# spyderino


Crawling a website
------------------

Simple crawling: Just point spyderino to the root of the site you wish to crawl, and start it. 
For each page found, spyderino will emit a "page" event. 

See the "crawling.js" example. 

Filtering: If you pass one (or more) filter function(s) to spyderino, each url that is found will be passed through the functions before being queued for retreival. See the "filtering" example. 

Scraping pages
--------------

See the examples. 
