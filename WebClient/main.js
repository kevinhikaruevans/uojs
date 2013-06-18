var UO = UO || {};
UO.game = UO.game || {};


UO.game = {
    socket: null,
    server: {latency: 0, address: '', port: 2593, name: ''},
    objects: {},
    self: {},
    world: {},
    update: function() {
      UO.system.write('update');
    },
    onmessage: function(e) {
      var system = UO.system;
      
      //if(e.data.charAt(e.data.length-1) != ' ') 
//        write('warning!');
      var type = e.data.charAt(0);
      var data = atob(e.data.substring(1, e.data.length-1));
      
      switch(type) {
        // Log message
        case 'L': {
          //console.log('from forwarder');
          data = data.split(' '); // space delim
          //console.log('>' + data[0]);
          switch(data[0]) {
            case 'Version': {
              system.write('forwarder version: {0}', data[data.length-1]);  
              UO.game.socket.connected = true;
              UO.game.socket.sendbin('C 127.0.0.1 2593');
              break;
            }
            case 'ConSuccess': {
              if (!UO.game.socket.reconnecting) {
                system.write('connected');
                system.write('sending encryption seed');
                //TODO: base seed something random, maybe send from fwder
                var seed = [0x18, 0x71, 0xC5, 0xD5];
                UO.game.socket.sendbin(seed);
                system.write('logging in');
                //TODO: not const
                var init = '\x80' + UO.login.username.pad(30, '\0', 1) + UO.login.password.pad(30, '\0', 1) + '\x5d';
                /*var init = [0x80, 0x74, 0x69, 0x73, 0x73, 0x65, 0x6d, 0x61, 0x6e, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x62,
                0x30, 0x72, 0x6b, 0x62, 0x30, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5d];*/
                UO.game.socket.sendbin(init);
              } else {
                system.write('reconnecting...');
                UO.game.socket.reconnecting = false;
                UO.game.socket.sendbin(UO.game.socket.key);
                // TODO
                var init = String.fromCharCode.apply(String, [0x91, UO.game.socket.key[0], UO.game.socket.key[1], UO.game.socket.key[2], UO.game.socket.key[3]]);
                init += UO.login.username.pad(30, '\0', 1) + UO.login.password.pad(30, '\0', 1);
                /*
                UO.game.socket.sendbin( [0x91,
                UO.game.socket.key[0], UO.game.socket.key[1], UO.game.socket.key[2], UO.game.socket.key[3],
                0x74, 0x69, 0x73, 0x73, 0x65, 0x6d, 0x61, 0x6e, 
                0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //29
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //35
                0x62, 0x30, 0x72, 0x6b, 0x62, 0x30, 0x72, 0x6b, 
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);*/
                UO.game.socket.sendbin(init);
                system.write('ok');
              }
              break;
            }
            case 'ConFail': {
              system.write('cannot connect to game');
              UO.game.socket.close();
              break;
            }
          }
          break;
        }
        
        // Game message
        case 'G': {
          // handle dat packet yo
          if(UO.game.socket.compressed)
            UO.game.decompress.decompress(data, UO.game.handle);
          else
            UO.game.handle(data);					
          //console.log('from gameserver: ' + data.charCodeAt(0).toHex());
          
          break;
        }
        
        default: {
          // not L/G packet, so drop it?
          // maybe close it
          UO.system.write('fatal error: got invalid packet of length {0}', packet.length);
          UO.game.socket.close();
          break;
        }
      }
    },
    onopen: function() {
      UO.system.write('opened');
      UO.game.socket.sendbin('V');
    },
    onclose: function() {
      UO.game.socket.connected = false;
      UO.system.write('closed');
    },
    onerror: function() {
      UO.system.write('error');
    },
    start: function() {
      this.socket = new WebSocket('ws://127.0.0.1:2580/game');
      this.socket.onmessage = this.onmessage;
      this.socket.onclose = this.onclose;
      this.socket.onerror = this.onerror;
      this.socket.onopen = this.onopen;
      UO.system.write('started');
      //console.log(UO.game.beginUpdate);
      setInterval(function() { UO.game.beginUpdate(); }, UO.system.refreshInterval);
    },
    ping: (function() {
      // private:
      var startTime = 0;
      
      // public:
      return {
        start: function() {
          setInterval(UO.game.ping.send, UO.system.pingTime);
        },
        send: function() {
          if (!UO.game.socket.connected)
            return;
          UO.system.write('sending ping');
          startTime = Date.now();
          UO.game.socket.sendbin([0x73, 0x66]);
          // shouldn't runuo also reply with 0x66? :|
        },
        measure: function() {
          return UO.game.server.latency = Math.abs(Date.now() - startTime);
        }
      };
    })(),
    decompress: (function() {
      // private:
      //var self = this;
      var decompression = {};
      var system = UO.system;
      var convert = UO.convert;
      var number = UO.number;
      var packets = UO.packets;
      var game = UO.game;
      
      // public:
      return {
        reset: function() {
          return decompression = {bit: 8, mask: 0, treepos: 0, value: 0, dest: '', estLength: -1};
        },
        decompress: function(source, handler) {
          decompression = (decompression.dest == null || decompression.dest == '') ? this.reset() : decompression;
          var d = decompression;
          var i = 0;
          
          while(i < source.length) {
            if(d.bit >= 8) {
              d.value = source.charCodeAt(i);
              d.bit = 0;
              d.mask = 0x80;
              i++;
            }
            if(packets.huffman[d.treepos] == undefined)
              console.log('warning: missing treepos ({0})'.format(d.treepos));
            else if(d.value & d.mask)
              d.treepos = packets.huffman[d.treepos][1];
            else
              d.treepos = packets.huffman[d.treepos][0];
            d.mask >>= 1;
            d.bit++;
            if(d.treepos <= 0) {
              if(d.treepos == -256 || d.estLength == d.dest.length) {
                //p('{0}: est: {1} real: {2}', d.dest.charCodeAt(0).toHex(), d.estLength, d.dest.length);
                handler(d.dest);
                d.bit = 8;
                d.treepos = 0;
                d.dest = '';
                d.estLength = -1;
                continue;
              }
              if(i > source.length)
                break;
              
              if(d.dest.length == 0) {
                if(packets.registry[-d.treepos] != undefined) {
                  //write('packet ({0}): {1}', (-d.treepos).toHex(), PACKET_REGISTRY[-d.treepos]);
                  d.estLength = packets.registry[-d.treepos][1];
                  
                  /*if(d.estLength == -1 && PACKET_REGISTRY[-d.treepos][2] != undefined)
                    indefLengthPos = PACKET_REGISTRY[-d.treepos][2];
                  else
                    indefLengthPos = -1;*/
                }
                else
                  d.estLength = -1;
              }
              //if(d.estLength == -1 && indefLengthPos != -1 && d.dest.length == (indefLengthPos+2))
              if(d.estLength == -1 && d.dest.length == 3)
                d.estLength = d.dest.getNumberAt(1, number.short);
              
              d.dest += convert.toChar(-d.treepos);
              d.treepos = 0;	
            }	
          }
          if(d.dest.length > 0) {
            //write('{0}', d.dest.charCodeAt(0).toHex());
            //write('incomplete packet: length: {0}, should be: {1}', d.dest.length, d.estLength);
            //if(indefLengthPos != -1) {
              if(d.dest.length >= d.estLength) {
                handler(d.dest);
                d.dest = null;
              }
              else {
                /* Okay, there is a rather strange issue that is created when we get a packet part and it is not flushed completely
                   or something. I should look into this, but instead, I'm lazy.
                   So, I shall just ping the server so that it will get properly flushed.
                   
                   This might just be an issue where the estimated length is wrong or something.
                 */
                UO.system.write('got packet part len={0}, exp={1}, p={2}', d.dest.length, d.estLength, d.dest.charCodeAt(0).toHex());
                UO.game.ping.send();
              }
          }
        }
      };
    })(),
};




// Creates a general GameObject object
UO.game.GameObject = Object.build({
  serial: -1, // hmm?
  name: '[unnamed]',
  hue: 0,
  x: 0,
  y: 0,
  z: 0,
  update: function(o) {
    for(var p in o) {
      this[p] = o[p];
    }
  },
  toString: function() {
    return 'GameObject [serial: {0}]'.format(serial);
  }
});
UO.game.Item = UO.game.GameObject.build({
  itemid: 0,
  isLand: false,
  toString: function() {
    return 'Item [serial: {0}]'.format(serial);
  }
});
// Creates a mob
UO.game.Mobile = UO.game.GameObject.build({
  name: 'Generic Mobile',
  bodyValue: 0,
  action: 0,
  d: 0,
  toString: function() {
    return 'Mobile [serial: {0}, name: "{1}", hue: {2}]'.format(this.serial, this.name, this.hue);
  }
});

// If you're wondering: yes, this is the fastest and best way to handle
// the packets. It is way faster than using switch and faster than using 
// seperate classes. Note: the packet ids can be passed as non-hex ints.
UO.game.handler = {
  // Account login section, 0x81, A8, 82, 8C, etc.
  0xA8: function(packet) {
    UO.system.write("logged in, at serverlist");
    //console.log("login success... outputting servers...");
    var count = packet.getNumberAt(4, UO.number.short);
    
    for(var i = 0; i < count; i++) {
      // 2, 32, 1, 1, 4 = 40
      var pos = i*40 + 6;
      var idx = packet.getNumberAt(pos, UO.number.short);
      var name = packet.substring(pos+2, pos+34);
      var ip  = [packet.getNumberAt(pos+39, UO.number.byte), packet.getNumberAt(pos+38, UO.number.byte), packet.getNumberAt(pos+37, UO.number.byte), packet.getNumberAt(pos+36, UO.number.byte)];
      //var ip   = packet.getNumberAt(pos+36, UO.number.int);
      UO.system.write('server {0}: {1} [{2}]', i, name, ip.join('.')); 
      //console.log(idx + ": " + name + "(" + ip + ")");
    }
    //console.log("using server idx 0");
    // pick server
    UO.game.socket.sendbin( [0xA0, 0, 0] );
  },
  // Login Failure
  0x82: function(packet) {
    var reason = packet.getNumberAt(1, UO.number.byte); //TODO
    UO.system.write("login failed because of {0}", reason.toHex());
  },
  0x8C: function(packet) {
    UO.system.write("server redirect");
    var address = packet.getNumberAt(1, UO.number.int);
    var port    = packet.getNumberAt(5, UO.number.short);
    var key     = packet.getNumberAt(7, UO.number.int);
    
    //UO.game.postlogin = true;
    UO.game.socket.reconnecting = true;
    UO.game.socket.compressed = true;
    setTimeout( function() {
      UO.system.write('connecting');
      //UO.game.socket.close();
      //UO.game.socket = new WebSocket('ws://127.0.0.1:2580/game');//UO.game.socket = new WebSocket
      UO.game.socket.key = [(key >> 24) & 0xFF, (key >> 16) & 0xFF, (key >> 8) & 0xFF, key & 0xFF];
      UO.game.socket.ck0 = packet.getNumberAt(7, UO.number.short);
      UO.game.socket.ck1 = packet.getNumberAt(9, UO.number.short);
      UO.game.socket.sendbin('R 127.0.0.1 2593'); // reconn
      UO.game.ping.start();
    }, 2000);
    //window.setInterval(ping, PING_TIME);
  },
  // Enable locked client features.
  0xB9: function(packet) {
    var flags = packet.getNumberAt(1, UO.number.short);
    if(packet.length > 3) {
      // this packet gets clumped sometimes, no idea why :I
      var i;
      for(i = 4; i < packet.length; i++) {
        if(packet.charCodeAt(i) != 0)
          break;
      }
      //TODO
      handlePacket(packet.substring(i));
    }
  },
  // Character/City List
  0xA9: function(packet) {
    var num_char = Math.min(packet.getNumberAt(3, UO.number.byte), 5); // TECHNICALLY 7... might change later
    UO.system.write('chars (' + num_char + ')');
    for(var i = 0; i < num_char; i++ ) {
      var pos = 60*i+4;
      var name = packet.substring(pos, pos+30).trim();
      UO.system.write('char {0}: {1}', i, name);
    }
    var num_city = packet.getNumberAt(4+60*num_char, UO.number.byte);
    UO.system.write('cities (' + num_city + ')');
    for(var i = 0; i < num_city; i++) {
      var pos = (63*i) + (5+60*num_char);
      var idx = packet.getNumberAt(pos, UO.number.byte);
      var name = packet.substring(pos, pos+30);
      var tavern = packet.substring(pos+31, pos+31+30);
      UO.system.write('city {0}: {1}, {2}', idx, name, tavern);
      //var name = packet.substring(pos 30);
      //console.log(name);
    }
    
    // send prelogin!
    //TODO
    UO.game.socket.sendbin([0x5D, 0xED, 0xED, 0xED, 0xED, 0x54, 0x65, 0x73, 
    0x74, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
    0x00, 0x00, 0x00, 0x00, UO.login.charslot, UO.game.socket.key[0], UO.game.socket.key[1], UO.game.socket.key[2], UO.game.socket.key[3] ]);
    
  },
  // Version:
  0xBD: function(packet) {
    UO.system.write('got version request, replying...');
    UO.game.socket.sendbin([0xbd, 0x00, 0x0c, 0x36, 0x2e, 0x30, 0x2e, 0x31, 0x2e, 0x31, 0x30, 0x00]);
  },
  // Login Confirm:
  0x1B: function(packet) {
    var game = UO.game;
    
    var serial    = packet.getNumberAt(1,  UO.number.int),
        body      = packet.getNumberAt(9,  UO.number.short),
        x         = packet.getNumberAt(11, UO.number.short), 
        y         = packet.getNumberAt(13, UO.number.short), 
        z         = packet.getNumberAt(15, UO.number.short),
        d         = packet.getNumberAt(17, UO.number.byte),
        mapWidth  = packet.getNumberAt(27, UO.number.short),
        mapHeight = packet.getNumberAt(29, UO.number.short);
    
    UO.system.write('(1B) player {0}: body: {1}, at ({2}, {3}, {4})', serial, body, x, y, z);
    game.self.serial = serial;
    game.self.body = body;
    game.self.x = x;
    game.self.y = y;
    game.self.z = z;
    game.self.d = d;
    
    UO.system.write('map size: {0} x {1}', mapWidth, mapHeight);
    game.world.width = mapWidth;
    game.world.height = mapHeight;
    //socket.send([0xC8, 25]);
  },
  // Generic Command:
  0xBF: function(packet) {
    var subcommand = packet.getNumberAt(3, UO.number.short);
    switch(subcommand) {
      default: {
        UO.system.write('generic command ({0}) unimplemented', subcommand.toHex());
        break;
      }
      case 0x08: {
        UO.game.server.map = packet.getNumberAt(5, UO.number.byte).toHex();
        switch(UO.game.server.map) {
          default:
          case 0:
            UO.system.write('cursor: felucca/unhued');
            break;
          case 1:
            UO.system.write('cursor: trammel/gold');
            break;
          case 2:
            UO.system.write('cursor: misc');
            break;
        }
        break;
      }
    }
  },
  // Seasonal Information
  0xBC: function(packet) {
  },
  // Draw Game Player
  0x20: function(packet) {
    var game = UO.game;
    
    var serial = packet.getNumberAt(1,  UO.number.int),
        body   = packet.getNumberAt(5,  UO.number.short),
        hue    = packet.getNumberAt(9,  UO.number.short),
        x      = packet.getNumberAt(11, UO.number.short),
        y      = packet.getNumberAt(13, UO.number.short),
        d      = packet.getNumberAt(17, UO.number.byte),
        z      = packet.getNumberAt(18, UO.number.byte);
    
    game.self.serial = serial;
    game.self.body = body;
    game.self.hue = hue;
    game.self.x = x;
    game.self.y = y;
    game.self.z = z;
    game.self.d = d;
    
    UO.system.write('(20) player {0} (b: {1}; h: {2}) at ({3}, {4}, {5})', serial.toHex(), body, hue, x, y, z);
  },
  // Speech Message
  0x1C: function(packet) {
    // one of these is incorrect (3):
    var length  = packet.getNumberAt(1, UO.number.short),
        item    = packet.getNumberAt(3, UO.number.int),
        serial  = packet.getNumberAt(7, UO.number.short),
        type    = packet.getNumberAt(9, UO.number.byte),
        from    = packet.substring(14, 44),
        message = packet.substring(44);
    UO.system.write('speech ({0}): {1}', from, message);
  },
  // Chat
  0xAE: function(packet) {
    var serial  = packet.getNumberAt(3, UO.number.int),
        model   = packet.getNumberAt(7, UO.number.short),
        type    = packet.getNumberAt(9, UO.number.byte),
        from    = packet.substring(18, 48),
        message = packet.substring(48);
        
    UO.system.write('speech ({0}): {1}', from, message);
  },
  // Request War Mode
  0x72: function(packet) {
    var flag = packet.getNumberAt(1, UO.number.byte);
    UO.system.write('war mode: {0}', flag);
  },
  // Ping reply [pong]
  0x73: function(packet) {
    UO.system.write('roundtrip latency: {0} ms', UO.game.ping.measure());
  },
  // Mobile move
  0x77: function(packet) {
    var serial = packet.getNumberAt(1,  UO.number.int),
        body   = packet.getNumberAt(5,  UO.number.short),
        x      = packet.getNumberAt(7,  UO.number.short),
        y      = packet.getNumberAt(9,  UO.number.short),
        z      = packet.getNumberAt(11, UO.number.byte),
        d      = packet.getNumberAt(12, UO.number.byte),
        hue    = packet.getNumberAt(13, UO.number.short),
        status = packet.getNumberAt(15, UO.number.byte);
    UO.system.write('(77) mobile {0} (b: {1}, h: {2}, d: {3}) at ({4}, {5}, {6})', serial, body, hue, d, x, y, z);
  },
  // Draw Object
  0x78: function(packet) { 
    var game = UO.game;
    
    var p = {
      serial: packet.getNumberAt(3, UO.number.int),
      body: packet.getNumberAt(7, UO.number.short),
      x: packet.getNumberAt(9, UO.number.short),
      y: packet.getNumberAt(11, UO.number.short),
      z: packet.getNumberAt(13, UO.number.byte),
      d: packet.getNumberAt(14, UO.number.byte),
      hue: packet.getNumberAt(15, UO.number.short)
    };
    
    var obj;
    
    if(game.objects.contains(p.serial)) {
      UO.system.write('(78) update');
      obj = game.objects[p.serial];
      obj.update(p);
    } else {
      UO.system.write('(78) new');
      game.objects[p.serial] = game.Mobile.build(p);
    }
    
    //write('(78) mobile {0} (b: {1}, h: {2}, d: {3}) at ({4}, {5}, {6})', serial, body, hue, d, x, y, z);
  },
  // Mob Status Compact
  0x11: function(packet) {
    var game = UO.game;
    var p = { 
      serial: packet.getNumberAt(3, UO.number.int),
      name: packet.substring(7, 37).replace('\x00', ''),
      curhp: packet.getNumberAt(37, UO.number.short),
      maxhp: packet.getNumberAt(39, UO.number.short),
      ncflag: packet.getNumberAt(41, UO.number.byte)
      //TODO
    }
    var obj;
    if(game.objects.contains(p.serial)) {
      UO.system.write('(11) update');
      obj = game.objects[p.serial];
      obj.update(p);
    } else {
      UO.system.write('(11) new');
      game.objects[p.serial] = game.Mobile.build(p);
    }
    //UO.system.write('(11) mobile {0} (name: {1})', serial, name);
  },
  // SE Introduced Rev.
  0xDC: function(packet) {
    // huh
  },
  // Mobile Remove (huh? is this out of screen????)
  0x1D: function(packet) {
    var game = UO.game;
    
    var serial = packet.getNumberAt(1, UO.number.int);
    delete game.objects[serial]; //TODO
    UO.system.write('remove mobile {0}', serial.toHex());
  },
  // Set Global Lighting
  0x4F: function(packet) {
  },
  // Set self lighting
  0x4E: function(packet) {
  },
  // Login Complete (1 B)
  0x55: function(packet) {
    UO.system.write('login complete');
  },
  // Server Time
  0x5B: function(packet) {
    var h = packet.getNumberAt(1, UO.number.byte),
        m = packet.getNumberAt(2, UO.number.byte),
        s = packet.getNumberAt(3, UO.number.byte);
    UO.system.write('server time: {0}:{1}:{2}', h, m, s);
  },
  // Weather
  0x65: function(packet) {
  
  },
  // Character Animation
  0x6E: function(packet) {
    var serial = packet.getNumberAt(1, UO.number.int);
    var animation = {
      action: packet.getNumberAt(5, UO.number.short),
      count:  packet.getNumberAt(8, UO.number.byte),
      repeat: packet.getNumberAt(10, UO.number.short),
      delay:  packet.getNumberAt(13, UO.number.byte)
    };
    if(UO.game.objects.contains(serial)) 
      UO.game.objects[serial].animation = animation;
    else
      UO.system.write('got animation for unknown mobile ({0})', serial);
  },
  // Items in container
  0x3C: function(packet) {
    var items = packet.getNumberAt(3, UO.number.short);
    UO.system.write('container with {0} items', items);
  },
  // Play Sound Effect
  0x54: function(packet) {
    // sound is kinda iffy due to lag et cetera
    // it's def possible to do, as we can decode it and use html5 media, but
    // it seems like a waste of b/w to do so at this moment.
    // TODO: remember to look up that new audio codec dev by mozilla with super compression
  },
  // Worn Item
  0x2E: function(packet) {
    // fy faeeeeen
    // not entirely sure how to use this packet yo
    var item = packet.getNumberAt(1, UO.number.int),
       model = packet.getNumberAt(5, UO.number.short),
       layer = packet.getNumberAt(8, UO.number.byte),
      serial = packet.getNumberAt(9, UO.number.int),
         hue = packet.getNumberAt(13, UO.number.short);
    UO.system.write('a worn item I guess (item {0}, model {1}, serial: {2}', item.toHex(), model, serial);
  },
  // Object Info
  0x1A: function(packet) {
    var pos = 9;
    var id = packet.getNumberAt(3, UO.number.int),
         g = packet.getNumberAt(7, UO.number.short),
    serial = id ^ 0x80000000, count = 0;
    if(id & 0x80000000) {
      count = packet.getNumberAt(pos, UO.number.short);
      pos += 2;
      UO.system.write('beep');
    }
    
    // what exactly is this?
    if(count & 0x8000) {
      pos++;
      UO.system.write('inc counter');
    }
    var x = (packet.getNumberAt(pos, UO.number.short)) & 0x7FFF,
        y = packet.getNumberAt(pos + 2, UO.number.short) & 0x3FFF, d = 0, z = 0;
    pos += 4;
    if(x & 0x8000) {
      d = packet.getNumberAt(pos, UO.number.byte);
      pos++;
    }
    var z = packet.getNumberAt(pos++, UO.number.byte);
    var item = UO.game.Item.build({serial: serial, itemid: g, count: count, x: x, y: y, z: z, d: d});
    UO.game.objects[serial] = item;
    UO.system.write('Object {0} at ({1}, {2}, {3}) direction: {4}', serial.toHex(), x, y, z, d);
    //UO.system.write('object info (id {0}, g: {1})', id.toUnsigned().toHex(), g);
  },
  
  // Update Health
  0xA1: function(packet) {
    var serial = packet.getNumberAt(1, UO.number.int),
        maxHealth = packet.getNumberAt(5, UO.number.short),
        health = packet.getNumberAt(7, UO.number.short);
    UO.game.objects[serial].maxHealth = maxHealth;
    UO.game.objects[serial].health = health;
    UO.system.write('update health for {0}, max: {1}, current: {2}', serial.toHex(), maxHealth, health);
  },
  // Move rejected
  0x21: function(packet) {
    
    var s = packet.getNumberAt(1, UO.number.byte),
        x = packet.getNumberAt(2, UO.number.short),
        y = packet.getNumberAt(4, UO.number.short),
        d = packet.getNumberAt(6, UO.number.byte),
        z = packet.getNumberAt(7, UO.number.byte);
    UO.game.move.reject(s);
    UO.game.self.x = x;
    UO.game.self.y = y;
    UO.game.self.z = z;
    
    UO.system.write('move rejected ({0}, {1}, {2}): {3}', x, y, z, s.toHex());
    //UO.game.socket.sendbin([0x22, 0, 0]);
  },
  // Move ack
  0x22: function(packet) {
  
  }
};

// Handles the packet
UO.game.handle = function(packet) {
  var id = packet.charCodeAt(0);
  if(isNaN(id) || id == 0) {
    UO.system.write('warning: got malformed packet... dumping');
    packet.dump();
    //console.log(packet);
    //console.log('received malformed packet of length ' + packet.length);
    return;
  }
  //console.log("got packet [" + id.toHex() + "]");
  if(UO.game.handler[id] != undefined) {
    UO.game.handler[id](packet);
  } else {
    UO.system.write('unimplemented (' + id.toHex() + ')' );
    packet.dump();
  }
};
UO.game.direction = {
  north: 0x00,
  northeast: 0x01,
  east: 0x02,
  southeast: 0x03,
  south: 0x04,
  southwest: 0x05,
  west: 0x06,
  northwest: 0x07,
};

UO.game.move = (function() {
  var sequence = 0;
  var lastDirection = -1;
  return {
    go: function(direction, running) {
      // TODO: prevent fastwalk
      //TODO log locations & sequences incase of move rejection  OR lazy: resync when rejected
      //UO.system.write('seq={0}', sequence);
      if(direction == lastDirection || lastDirection == -1) {
        switch(direction) {
          case 0x00: UO.game.self.y--; break;
          case 0x01: UO.game.self.x++; UO.game.self.y--; break;
          case 0x02: UO.game.self.x++; break;
          case 0x03: UO.game.self.x++; UO.game.self.y++; break;
          case 0x04: UO.game.self.y++; break;
          case 0x05: UO.game.self.y++; UO.game.self.x--; break;
          case 0x06: UO.game.self.x--; break;
          case 0x07: UO.game.self.x--; UO.game.self.y--; break;
        }
      }
      lastDirection = direction;
      UO.game.socket.sendbin([0x02, direction | (running ? 0x80 : 0), sequence & 0xFF, 0, 0, 0, 0]);
      sequence = sequence%255+1;
    },
    reject: function(s) {
      // reset the sequence to zero? :U
      sequence = 0;
    }
  };
})();
UO.game.canvas = (function() {
  var gameWindow = null;
  var mouseTimer = null;
  var halfWidth = 0, halfHeight = 0;
  var message = '';
  return {
    getHalfWidth: function() { return halfWidth; },
    getHalfHeight: function() { return halfHeight; },
    getCanvas: function() { return gameWindow; },
    getContext: function() { return gameContext; },
    getImage: function(src, handler) {
      var img = new Image();
      img.src = src;
      
      if(handler != undefined) {
        img.onload = handler;
      }
      else
        return img;
    },
    checkMouse: function() {
      if(!UO.game.socket.connected)
        return;
      if(!gameWindow.moving)
        return;
      var dir, running;
      var theta = gameWindow.theta;
      
      if(theta < 23)
        dir = UO.game.direction.northeast;
      else if (theta < 67)
        dir = UO.game.direction.north;
      else if (theta < 122)
        dir = UO.game.direction.northwest;
      else if (theta < 167)
        dir = UO.game.direction.west;
      else if (theta < 212)
        dir = UO.game.direction.southwest;
      else if (theta < 257)
        dir = UO.game.direction.south;
      else if (theta < 302)
        dir = UO.game.direction.southeast;
      else if (theta < 347)
        dir = UO.game.direction.east;
      else
        dir = UO.game.direction.northeast;
        
      UO.game.move.go(dir, gameWindow.mag >= 90);
    },
    initializeKeyboard: function() {
      //gameWindow = $('#game');
      //gameWindow.focus();
      $(document).keypress( function(e) {
        //console.log(e.which);
        switch(e.which) {
          // bkspace
          case 0x08: {
            e.preventDefault();
            message = message.slice(0, -1);
            break;
          }
          // space
          case 20: {
            e.preventDefault();
            message += ' ';
            break;
          }
          // enter
          case 0x0D: {
            //var length = message.length + 13; //?
            //var length = message.length * 2;
            var n = [];
            
            for(var i = 0; i < message.length; i++) {
              //n.push('\x00');
              n.push('\x00' + message.charAt(i));
            }
            message = n.join('');
            
            var tmp = '\xAD\x00';
            
            var tmp1 = '\x00\x00\x34\x00\x03enu\x00' + message + '\x00';
            tmp += UO.convert.toChar(3 + tmp1.length) + tmp1;
            UO.game.socket.sendbin(tmp);
            
            message = '';
            
            break;
          }
          default: message += UO.convert.toChar(e.which); break;
          
        }
        var canvas = UO.game.canvas.getContext();
        canvas.clearRect(0, 500-UO.system.textHeight, 500, UO.system.textHeight);
        if(message.length > 0)
          canvas.fillText('Chat: ' + message, 0, 500-UO.system.textHeight/2, 500);
        //console.log(UO.convert.toChar(e.which));
      }).focus();
      
    },
    initializeMouse: function() {
      gameWindow = $('#game');
      gameContext = document.getElementById('game').getContext('2d');
      halfWidth = gameWindow.width() / 2;
      halfHeight = gameWindow.height() / 2;
      gameWindow.contextmenu(function(e) {
        e.preventDefault();
        return false;
      });
      gameWindow.mousedown(function(e) {
        if(e.button == 2) {
          gameWindow.moving = true;
          UO.game.canvas.checkMouse();
          mouseTimer = setInterval(UO.game.canvas.checkMouse, 400);
        }
      });
      $('body').mouseup(function(e) {
        if(e.button == 2) {
          clearInterval(UO.game.canvas.mouseTimer);
          gameWindow.moving = false; // just to be sure
        }
      });
      gameWindow.mousemove(function(e) {
        // this can be simplified:
        var parentOffset = $(this).parent().offset(); 
        var relX = e.pageX - parentOffset.left;
        var relY = e.pageY - parentOffset.top;
        
        var dX = (relX - halfWidth);
        var dY = (halfHeight - relY); 
        
        var theta = Math.atan(dY/dX);
        
        if(dX < 0 && dY >= 0)
          theta += Math.PI;
        else if (dX < 0 && dY < 0 )
          theta += Math.PI;
        else if (dX >= 0 && dY < 0)
          theta += 2 * Math.PI;
        theta *= (180/Math.PI);
        gameWindow.theta = theta;
        gameWindow.mag = 100 * Math.sqrt( dX * dX + dY * dY) / gameWindow.halfWidth;
      });
    }
  };
})();

/*
 !!TODO
 check if delta of move is different
 cache objects if different
 etc!
*/

UO.game.land = (function() {
  var last = { x: -1, y: -1 };
  var r = 10;
  var land = null;
  return {
    drawFromJson: function(data, x, y) {
      if(data == null)
        return;
      //console.log('land data: {0}'.format(data.length));
      for(var i = 0; i < r; i++) {
        for(var j = 0; j < r; j++) {
          UO.game.draw(0x40000000, {x: x + i - r/2, y: y + j - r/2, z: data[i][j].land.z, itemid: data[i][j].land.id}, true);
          for(var key in data[i][j]) { 
            if(!isNaN(key)) {
              UO.game.draw(0x40000000, {x: x + i - r/2, y: y + j - r/2, z: data[i][j][key].z, itemid: data[i][j][key].id}, false);
            }
          }
        }
      }
    },
    draw: function() {
      var x = UO.game.self.x, y = UO.game.self.y;
      if(!x && !y)
        return false;
      if (x == last.x && y == last.y) {
        UO.game.land.drawFromJson(land, x, y);
      }
      else {
        last = {'x': x, 'y': y};
        $.getJSON('http://127.0.0.1:2580/getmapinfo?&x=' + Math.floor(x - r/2) +  '&y=' + Math.floor(y - r/2) + '&r=' + r + '&m=f&jsoncallback=?', 
          function(data) {
            UO.game.land.drawFromJson(data, x, y);
            land = data;
          });
      }
      return true;
    }
  };
})();

UO.game.draw = function(serial, object, land) {
  // each tile is 44x44
  // z is an inc in the y-axis
  
  // LET'S DO THIS :|
  if(!land && serial < 0x40000000)
    return;
  
  var dX = (object.x - UO.game.self.x);
  var dY = (object.y - UO.game.self.y);
  var dZ = ((object.z || 0) - UO.game.self.z);
  
  //console.log(dZ);
  //under a roof?
  //if(Math.abs(dZ) >= 20)
  //  return;
    
  var img = UO.game.canvas.getImage('http://127.0.0.1:2580/getobj?&t=' + (land ? 'l' : 's') + '&i=' + object.itemid + '&h=' + (object.hue || 0));
  var w = img.width;
  var h = img.height;
   
  // find deltas between self and object
  //console.log('{0}: ({1}, {2})'.format(serial, dX, dY));

    
  var x = dX * 22 - dY * 22 + img.height / 2;
  var y = dY * 22 + dX * 22 - img.width / 2 - (dZ * 4);
  
  var c = UO.game.canvas.getContext();
  c.drawImage(img, UO.convert.toInt(UO.game.canvas.getHalfWidth() + x - w), UO.convert.toInt(UO.game.canvas.getHalfHeight() + y - h));
  //console.log('oX: {0}, oY: {1}'.format(oX_tile, oY_tile));
  
};
// Update an object
UO.game.update = function(serial, object) {
  // according to runuo, if the serial is >= 0x40000000, it is an object, any less and it's a mobile 
  //console.log('update> {0} ({1}, {2}, {3})'.format(parseInt(serial).toHex(), object.x, object.y, object.z));
  UO.game.draw(serial, object);
};

UO.game.beginUpdate = function() {
  if(!UO.game.socket.connected)
    return; //todo: stop interval
    
  // ONLY CLEAR THE DRAWING >:C
  UO.game.canvas.getContext().clearRect(0, 0, 500, 500-UO.system.textHeight);
  UO.game.land.draw();
  // POSSIBLY use Object.keys(gameObjects) and use var i = 0... k = keys[i];...
  var v;
  for(k in UO.game.objects) {
    if((v = UO.game.objects[k]).serial != undefined)
      UO.game.update(k, v);
  }
};