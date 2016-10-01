// ==UserScript==
// @name         KissMAL
// @namespace    juici.github.io
// @description  Connects KissAnime and MAL with links between them on anime pages.
// @version      1.1.1
// @author       Juici
// @downloadURL  https://github.com/Juici/KissMAL/raw/master/kissmal.user.js
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @include      /https?:\/\/myanimelist\.net\/anime\/.*/
// @include      /https?:\/\/myanimelist\.net\/anime\.php\?([^&]*&)?id=.*/
// @include      /https?:\/\/kissanime\.to\/Anime\/[^\/]+/?$/
// @connect      kissanime.to
// @connect      myanimelist.net
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

if (window.top != window.self)
    return;

(function ($) {
    const CACHE_ID = 'kissmal_cache';
    
    window.addEventListener('DOMContentLoaded', function() {
        // create a sandbox document to preview page without loading resources
        var sandboxPage = function(html) {
            var previewDoc = document.implementation.createHTMLDocument('preview');
            var el = previewDoc.createElement('div');
            el.innerHTML = html;
            return el;
        };
        
        if (location.hostname == 'myanimelist.net') {            
            // get the MAL anime id
            var regex = /^https?:\/\/myanimelist\.net\/anime(?:\/|\.php\?(?:[^&]*&)?(?:id=.*)?id=)(\d+).*$/i;
            var id = parseInt(regex.exec(location.href)[1], 10);
            
            // check id is valid if not stop
            if (id === null || isNaN(id)) {
                console.log('KissMAL has encountered a problem');
                return;
            }
            
            // get cache for links
            var cache = JSON.parse(localStorage.getItem(CACHE_ID)) || [];
            var links;
            
            $('h2:contains("Statistics")').before('<div id="kissanime-links"><h2><div class="floatRightHeader"><a href="javascript:void(0);" onclick="localStorage.setItem(\'' + CACHE_ID + '\', JSON.stringify((JSON.parse(localStorage.getItem(\'' + CACHE_ID + '\')) || []).filter(function(e) { return e.id !== ' + id + '; }))); console.log(\'Refreshing KissAnime link cache\'); location.href = location.href;">Refresh</a></div>KissAnime Links</h2><div id="searching">Searching...</div></div><br>');
            
            // remove expired entries
            var i = cache.length;
            var now = (new Date()).getTime();
            while (i--) {
                if (cache[i].expires < now)
                    cache.splice(i, 1);
                
                // get links for mal id
                if (cache[i].id === id)
                    links = cache[i];
            }
            
            // use cached result if exists
            if (typeof links !== 'undefined') {
                $('#searching').remove();
                for (let link of links.links) {
                    $('#kissanime-links').append('<a href="' + link.url + '" target="_blank">' + link.name + '</a><br>');
                }
                console.log('Retrieved KissAnime links from the cache');
                return;
            }

            // get the titles for the anime
            var find = function(a) {
                return $('.dark_text:contains("' + a + '")').parent().text().replace(a, '').trim().split(', ');
            };
            var titles = [$('#contentWrapper > div:first-child span').text()];
            titles.concat(find('English:')).concat(find('Synonyms:')).concat(find('Japanese:'));

            var titleIndex = 0;
            var requestLinks = function() {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: 'http://kissanime.to/Search/Anime?keyword=' + titles[titleIndex],
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    onload: function(response) {
                        // check the response
                        var hasResponse =  ((typeof response.response === 'undefined' || response.response === '') ? false : true);
                        if (!hasResponse) {
                            titleIndex++;
                            if (titleIndex < titles.length)
                                requestLinks();
                            else {
                                $('#searching').remove();
                                $('#kissanime-links').append('<div>Could not find any results.</div>');
                                console.log('Could not find any KissAnime links');
                            }
                            return;
                        }

                        // create a preview document to prevent loading images
                        var $page = $(sandboxPage(response.response));
                        $('#searching').remove();

                        // check cloudflare cookie
                        var cfCookie = ($page.find('.cf-browser-verification').length ? false : true);
                        if (!cfCookie) {
                            $('#kissanime-links').append('<div>Could not reach <a href="http://kissanime.to/">KissAnime.to</a>. This probably means the CloudFlare cookie expired or doesn\'t exist. Visit <a href="http://kissanime.to/">KissAnime.to</a> then try again.</div>');
                            console.log('Could not reach KissAnime, this probably mean the CloudFlare cookie has expired or doesn\'t exist');
                            return;
                        }

                        // create links object with a 1hr expiry
                        links = { id: id, links: [], expires: ((new Date()).getTime() + (1000 * 60 * 60)) };
                        
                        // find the anime listings
                        $page.find('table.listing td:first-child > a').each(function(index, a) {
                            var link = { name: a.textContent.trim(), url: 'http://kissanime.to' + a.href };
                            links.links.push(link);
                            $('#kissanime-links').append('<a href="' + link.url + '" target="_blank">' + link.name + '</a><br>');
                        });

                        // push links to the cache
                        cache.push(links);

                        // cache sort
                        cache.sort(function(a, b) { return a.id - b.id; });
                        
                        // save cache to local storage
                        localStorage.setItem(CACHE_ID, JSON.stringify(cache));
                        console.log('Added KissAnime links and saved to cache');
                    }
                });
            }
            requestLinks();
        } else if (location.hostname == 'kissanime.to') {
            var title = $('a.bigChar').text().replace(/\((Sub|Dub)\)/i, '').trim();
            var id = /^https?:\/\/kissanime\.to\/Anime\/(.+?)(?:-Dub|-Sub)?\/?$/i.exec(location.href)[1].toLowerCase();
            
            // add cache for MAL link
            var cache = JSON.parse(localStorage.getItem(CACHE_ID)) || [];
            var link = cache.find(function(e) { return e.id === id });
            
            if (typeof link !== 'undefined') {
                $('.info:contains("Views:")').parent().append('<a href="' + malUrl + '" target="_blank">MAL Page</a><br>');
                return;
            }
            
            GM_xmlhttpRequest({
                method: "GET",
                url: 'https://myanimelist.net/anime.php?q=' + title,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                onload: function(response) {
                    // check the response
                    var hasResponse =  ((typeof response.response === 'undefined' || response.response === '') ? false : true);
                    if (!hasResponse)
                        return;

                    // create a preview document to prevent loading images
                    var $page = $(sandboxPage(response.response));

                    // get the MAL page url
                    var url = $page.find('a > strong')[0].parentElement.href;
                    $('.info:contains("Views:")').parent().append('<a href="' + url + '" target="_blank">MAL Page</a><br>');

                    // cache the MAL link
                    cache.push({ id: id, link: url });
                    cache.sort(function(a, b) { return a.id - b.id; });
                    localStorage.setItem(CACHE_ID, JSON.stringify(cache));
                    console.log('Added MAL link and saved to cache');
                    
                }
            });
        }
    });
})(jQuery);
