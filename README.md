Overview
==========

uojs is a proof-of-concept piece for a port of Ultima Online for HTML5 web browsers. It utilizes both HTML5's WebSockets and Canvas. It is completely integrated into RunUO and uses reflection to access UltimaSDK.

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



