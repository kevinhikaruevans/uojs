Notice
==========

Hey!

I've restarted this project and made it 62% less shitty! Check it out here: https://github.com/kevinhikaruevans/uojs2

Overview
==========

uojs is a proof-of-concept piece for a port of Ultima Online for HTML5 web browsers. This project was created for myself to learn more about the cool features of Javascript. It utilizes both HTML5's WebSockets and Canvas. It is completely integrated into RunUO and uses reflection to access UltimaSDK.

Installation
==========

It is completely plug & play.

The file layout should be something like:
- / - Root directory (containing RunUO.exe)
  - /WebClient
     - jquery.min.js
     - index.html
     - uo.js
  - /Scripts
     - /UOJS
         - /LitJson
            - ...
         - GameProxy.cs
         - UOJS.cs
         - WebSocketClient.cs
         - WebSocketPacket.cs
  - Ultima.dll

Dependencies
==========

uojs depends on the following:
- jQuery 1.8+
- LitJSON 0.7.0+
- UltimaSDK

Compatibility
==========

This project should run on all RunUO versions (hopefully). It is tested on Mono 2.10.8.1 on Debian.

The web browsers used _must_ support both WebSockets and the Canvas element. Luckily, all newer web browsers support this.

Usage
==========

The default port is 2580.
Accessing the client should be easy. You can access it by opening a web browser on `http://localhost:2580/WebClient/index.html`

There should be a caching proxy or even a CDN for the files/art that cache based on the URI. Doing so will prevent heavy load on the server. Nginx, Lighttpd, Apache will all do this fairly easily.
Everything must either be cached or not cached. You cannot only cache certain files and not cache others (it will not run if it is). The only URI that cannot be cached is /game, since it is the WebSocket stream.

Screenshots
==========

* [Chat works... I guess](http://i.imgur.com/Bxm89KY.png) (3/05/13)
* [Partial mobile implementation](http://i.imgur.com/hRRE42k.jpg) under Firefox 19 (2/21/13)
* [Another screenshot](http://i.imgur.com/jLBPmRE.png) making use of the new [semi-broken] renderer (newer! 2/19/13)
* [A screenshot](http://i.imgur.com/VClu5.png) (using the old map renderer)
