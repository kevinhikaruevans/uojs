Number.prototype.toHex = function() {
  var x = this.toString(16).toUpperCase();
  return (x.length == 1) ? ('0' + x) : x;
};
// Add to prototypes
String.prototype.pad = function(l, s, t){
    return s || (s = " "), (l -= this.length) > 0 ? (s = new Array(Math.ceil(l / s.length) + 1).join(s)).substr(0, t = !t ? l : t == 1 ? 0 : Math.ceil(l / 2)) + this + s.substr(0, l - t) : this;
};
String.prototype.format = function() {
  var formatted = this;
  for (var i = 0; i < arguments.length; i++) {
    var regexp = new RegExp('\\{'+i+'\\}', 'gi');
    formatted = formatted.replace(regexp, arguments[i]);
  }
  return formatted;
};
function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function setCookie(c_name,value,exdays)
{
    var exdate=new Date();
    exdate.setDate(exdate.getDate() + exdays);
    var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
    document.cookie=c_name + "=" + c_value;
}

// Declare Namespaces
var UO = {
  login:
  {
    username: 'test',
    password: 'test',
    slot:     0,
    server:
    {
      shard:   0,
      address: '127.0.0.1',
      port:    2593
    },
    forwarder:
    {
      // the caching reverse proxy address (same domain as web host)
      proxy:   document.domain + ':2580',

      // the direct address
      address: '127.0.0.1',
      port:    2580
    }
  },
  net:      {},
  game:     {},
  //graphics: {},
  ui:       {},
  system:   {},
  util:     {},
  /*Packet: function(s) {
    this.raw = s;
    this.length = s.length;
  },*/

  Packet: function(x) {
    this.data = new Uint8Array(x);
    this.index = 0;
    this.length = x;
  }

};

/*
UO.GameObject.prototype.isItem = function() {
  return this.serial >= 0x4000000; //TODO check this, yo
};

UO.GameObject.prototype.measure = function(x, y) {
  if(x instanceof UO.GameObject) {
    y = UO.GameObject.y;
    //z = UO.GameObject.z;
    x = UO.GameObject.x;
  }
  return Math.sqrt(x*x + y*y) | 0;
};
*/
UO.Packet.prototype.getNumberAt = function(start, size) {
  var number;
  for (var i = 0; i < size; i++)
    number |= ((this.data[start+i] & 0xFF) << 8*(size-i-1));
  return number;
};

UO.Packet.prototype.setIndex = function(newIndex) {
  this.index = newIndex;
};
UO.Packet.prototype.resize   = function(newSize) {
  if(this.data.length == newSize)
    return;
  newSize = Math.min(newSize, UO.Packet.MaxPacketSize);
  var buffer = new Uint8Array(newSize);
  this.length = newSize;
  var oldLength = Math.min(this.data.length, newSize);
  for(var i = 0; i < oldLength; i++)
    buffer[i] = this.data[i];

  delete this.data;
  this.data = buffer;
  this.index = Math.min(this.data.length-1, this.index);
};
UO.Packet.prototype.append   = function() {
  var i, j, o;

  for(i = 0; i < arguments.length; i++) {
    o = arguments[i];
    t = typeof(o);

    //console.log('arg ' + i + ', t:' + t + ',' + o);
//console.log(t);
    if(t == 'number')
      this.data[this.index++] = o;
    else if (t == 'string') {
      for(j = 0; j < o.length; j++)
        this.data[this.index++] = o.charCodeAt(j) & 0xFF;
    }
    else if(t == 'object') {
      for(j = 0; j < o.length; j++)
        this.data[this.index++] = o[j];
    }
  }
};
UO.Packet.MaxPacketSize       = 4096;
UO.Packet.createFromArguments = function() {
  var packet = new UO.Packet(arguments.length);
  packet.append.apply(packet, arguments);
  return packet;
};
UO.Packet.createFromArray    = function(arr) {
  var packet = new UO.Packet(arr.length);
  //packet.append(packet);
  packet.index = arr.length;
  packet.data = arr;
  return packet;
};
UO.Packet.createFromString   = function(str) {
  var packet = new UO.Packet(str.length);
  packet.append(str);
  return packet;
};
//UO.Packet.prototype.size     = function() { return this.data.length; };
UO.Packet.prototype.getString= function(start, length) {
  //var buffer = [];
  var buffer = '', i;
  for(i = 0; i < length; i++)
    buffer += UO.util.convert.toChar(this.data[start+i]);
  return buffer;
};
UO.Packet.prototype.getShort = function(start) { return this.getNumberAt(start, 2); };
UO.Packet.prototype.getInt   = function(start) { return this.getNumberAt(start, 4); };
UO.Packet.prototype.getByte  = function(start) { return this.getNumberAt(start, 1); };
UO.Packet.prototype.getId    = function() { return this.data[0]; };
UO.Packet.prototype.toString = function() { return '[Packet]'; };


UO.system = (function(){
  return {
    Address: 'http://{0}:{1}/'.format(UO.login.forwarder.address, UO.login.forwarder.port),
    Version: '0.0.2-alpha',
    Canvas: '#canvas',
    Timing:
    {
      refresh: 30,    // ~33hz
      ping:    45000  // 45 seconds
    },

    /**
     * Starts the socket, does cool things.
     */
    start: function() {
      UO.login.username = getCookie('username') || window.prompt('Username');
      UO.login.password = getCookie('password') || window.prompt('Password');
      setCookie('username', UO.login.username, 1);
      setCookie('password', UO.login.password, 1);
      UO.system.initializeLog();
      UO.net.createSocket();
      UO.ui.start();
      

    },

    /**
     * Checks for dependencies in the browser.
     * @return {Array} An array containing errors.
     */
    checkBrowser: function() {
      var e = [];
      if (!window.$)
        e.push('jQuery is not initialized');
      if(!window.WebSocket)
        e.push('WebSocket is not supported by your browser');
      if(!window.CanvasRenderingContext2D)
        e.push('Canvas2D is not supported by your browser');
      return e;
    },

    initializeLog: function() {
      var d = document.getElementById('log');
      var check = document.getElementById('autoscroll');
      d.onscroll = function(e) {
        check.checked = ((d.scrollTop + d.offsetHeight) == d.scrollHeight);
      };
    },

    /**
     * Prints to the output log
     * @param {String} format
     * @param {Object} arg0
     */
    write: function() {
      var i;
      var formatted = arguments[0];
      var date = new Date();
      var log = document.getElementById("log");
      for(i = 1; i < arguments.length; i++)
        formatted = formatted.replace(new RegExp('\\{'+(i-1)+'\\}', 'gi'), arguments[i]);
      log.innerHTML += ('[' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + '.' + date.getMilliseconds() + '] ') + formatted.replace('<', "&lt;").replace('>', "&gt;") + "<br />";
      if(document.getElementById('autoscroll').checked)
        log.scrollTop = log.scrollHeight;
      //.scrollTo(0,document.body.offsetHeight);
    },

    /**
     * Kills everything!
     * @param  {String} message An optional message to display
     */
    kill: function(message) {
      this.write('UO has been killed ({0})', message);
      UO.net.getSocket().close();
    }
  };
})();

UO.util.convert = {
  /**
   * Converts an object to an unsigned integer.
   */
  toInt: function(n) { return n | 0; },

  /**
   * Converts an integer to a character
   */
  toChar: String.fromCharCode
};


UO.net = (function() {
  var m_Socket, m_Decompression, m_PingStartTime = 0, m_LastLatency = 0, m_ServerHourDifference = 0;
  
  return {
    EOF: -256,
    HuffmanTable: [[2,1],[4,3],[0,5],[7,6],[9,8],[11,10],[13,12],[14,-256],[16,15],[18,17],[20,19],[22,21],[23,-1],[25,24],[27,26],[29,28],[31,30],[33,32],[35,34],[37,36],[39,38],[-64,40],[42,41],[44,43],[45,-6],[47,46],[49,48],[51,50],[52,-119],[53,-32],[-14,54],[-5,55],[57,56],[59,58],[-2,60],[62,61],[64,63],[66,65],[68,67],[70,69],[72,71],[73,-51],[75,74],[77,76],[-111,-101],[-97,-4],[79,78],[80,-110],[-116,81],[83,82],[-255,84],[86,85],[88,87],[90,89],[-10,-15],[92,91],[93,-21],[94,-117],[96,95],[98,97],[100,99],[101,-114],[102,-105],[103,-26],[105,104],[107,106],[109,108],[111,110],[-3,112],[-7,113],[-131,114],[-144,115],[117,116],[118,-20],[120,119],[122,121],[124,123],[126,125],[128,127],[-100,129],[-8,130],[132,131],[134,133],[135,-120],[-31,136],[138,137],[-234,-109],[140,139],[142,141],[144,143],[145,-112],[146,-19],[148,147],[-66,149],[-145,150],[-65,-13],[152,151],[154,153],[155,-30],[157,156],[158,-99],[160,159],[162,161],[163,-23],[164,-29],[165,-11],[-115,166],[168,167],[170,169],[171,-16],[172,-34],[-132,173],[-108,174],[-22,175],[-9,176],[-84,177],[-37,-17],[178,-28],[180,179],[182,181],[184,183],[186,185],[-104,187],[-78,188],[-61,189],[-178,-79],[-134,-59],[-25,190],[-18,-83],[-57,191],[192,-67],[193,-98],[-68,-12],[195,194],[-128,-55],[-50,-24],[196,-70],[-33,-94],[-129,197],[198,-74],[199,-82],[-87,-56],[200,-44],[201,-248],[-81,-163],[-123,-52],[-113,202],[-41,-48],[-40,-122],[-90,203],[204,-54],[-192,-86],[206,205],[-130,207],[208,-53],[-45,-133],[210,209],[-91,211],[213,212],[-88,-106],[215,214],[217,216],[-49,218],[220,219],[222,221],[224,223],[226,225],[-102,227],[228,-160],[229,-46],[230,-127],[231,-103],[233,232],[234,-60],[-76,235],[-121,236],[-73,237],[238,-149],[-107,239],[240,-35],[-27,-71],[241,-69],[-77,-89],[-118,-62],[-85,-75],[-58,-72],[-80,-63],[-42,242],[-157,-150],[-236,-139],[-243,-126],[-214,-142],[-206,-138],[-146,-240],[-147,-204],[-201,-152],[-207,-227],[-209,-154],[-254,-153],[-156,-176],[-210,-165],[-185,-172],[-170,-195],[-211,-232],[-239,-219],[-177,-200],[-212,-175],[-143,-244],[-171,-246],[-221,-203],[-181,-202],[-250,-173],[-164,-184],[-218,-193],[-220,-199],[-249,-190],[-217,-230],[-216,-169],[-197,-191],[243,-47],[245,244],[247,246],[-159,-148],[249,248],[-93,-92],[-225,-96],[-95,-151],[251,250],[252,-241],[-36,-161],[254,253],[-39,-135],[-124,-187],[-251,255],[-238,-162],[-38,-242],[-125,-43],[-253,-215],[-208,-140],[-235,-137],[-237,-158],[-205,-136],[-141,-155],[-229,-228],[-168,-213],[-194,-224],[-226,-196],[-233,-183],[-167,-231],[-189,-174],[-166,-252],[-222,-198],[-179,-188],[-182,-223],[-186,-180],[-247,-245]],
    PacketRegistry: {
      0x0B: ['Damage',                     7],
      0x11: ['Mob Status Compact',        -1],
      0x1A: ['World Item',                -1],
      0x1B: ['Login Confirm',             37],
      0x1C: ['Ascii Message',             -1],
      0x1D: ['Remove Entity',              5],
      0x20: ['Mobile Update',             19],
      0x21: ['Movement Rejection',         8],
      0x22: ['Move Ack',                   3],
      0x23: ['Drag Effect',               26],
      0x24: ['Open Container',             7],
      0x25: ['Container Content Update',  21],
      0x27: ['Lift Rejection',             2],
      0x2C: ['Resurect Menu',              2],
      0x2D: ['Mob Attributes',            17],
      0x2E: ['Worn Item',                 15],
      0x2F: ['Swing',                     10],
      0x3A: ['Skills List',               -1],
      0x3C: ['Container Content',         -1],
      0x4E: ['Personal Light Level',       6],
      0x4F: ['Overall Light Level',        2],
      0x53: ['Popup Message',              2],
      0x54: ['Play Sound Effect',         12],
      0x55: ['Login Complete',             1],
      0x5B: ['Time',                       4],
      0x65: ['Set Weather',                4],
      0x6C: ['Target Cursor',             19],
      0x6D: ['Play Music',                 3],
      0x6E: ['Character Animation',       14],
      0x70: ['Graphical Effect 1',        28],
      0x72: ['War Mode',                   5],
      0x73: ['Ping',                       2],
      0x74: ['Vendor Buy List',           -1],
      0x76: ['New Subserver',             16],
      0x77: ['Mobile Moving',             17],
      0x78: ['Mobile Incomming',          -1],
      0x7C: ['Display Menu',              -1],
      0x82: ['Login Rejection',            2],
      0x85: ['Del Char Response',          2],
      0x86: ['Char List Update',          -1],
      0x88: ['Open Paperdoll',            66],
      0x89: ['Corpse Clothing',           -1],
      0x8C: ['Server Relay',              11],
      0x97: ['Player Move',                2],
      0x98: ['Request Name Response',     -1],
      0x99: ['Target Cursor Mul Obj',     26],
      0x9E: ['Vendor Sell List',          -1],
      0xA1: ['Update Current Health',      9],
      0xA2: ['Update Current Mana',        9],
      0xA3: ['Update Current Stam',        9],
      0xA5: ['Open Browser',              -1],
      0xA6: ['Tip/Notice Window',         -1],
      0xA8: ['Game Server List',          -1],
      0xA9: ['Chars/Start Loc',           -1],
      0xAA: ['Change Combatant',           5],
      0xAE: ['Unicode Message',           -1],
      0xAF: ['Death Animation',           13],
      0xB0: ['Disp. Gump Fast',           -1],
      0xB7: ['Obj Help Response',         -1],
      0xB9: ['Supported Features',         5],
      0xBA: ['Quest Arrow',                6],
      0xBC: ['Seasonal Change',            3],
      0xBD: ['Version Request',            3], // server sends 3 bytes?
      0xBF: ['General Information',       -1],
      0xC0: ['Hued Effect',               36],
      0xC1: ['Message Localized',         -1],
      0xC6: ['Invalid Map Enable',         1],
      0xC7: ['Particle Effect',           49],
      0xCB: ['Global Queue Count',         7],
      0xCC: ['Message Local Aff.',        -1],
      0xD3: ['Extended 0x78',             -1],
      0xD6: ['Mega Cliloc',               -1],
      0xD8: ['Send Custom House',         -1],
      0xDC: ['SE Introduced Rev',          9],
      0xDD: ['Compressed Gump',           -1]
    },
    
    /**
     * Gets the raw WebSocket
     * @return {WebSocket} The WebSocket being used
     */
    getSocket: function() { return m_Socket; },
    
    /**
     * Creates, sets, and returns a new decompression structure.
     * @return {Object} Returns a structure to use for decompressing packets.
     */
    createDecompression: function() {
      return m_Decompression = {bit: 8, mask: 0, treepos: 0, value: 0, dest: new UO.Packet(3), estLength: -1};
    },

    /**
     * Creates a new WebSocket.
     */
    createSocket: function() {
      m_Socket = new WebSocket('ws://{0}:{1}/game'.format(UO.login.forwarder.address, UO.login.forwarder.port));
      m_Socket.binaryType = 'arraybuffer';
      m_Socket.onclose = this.onClose;
      m_Socket.onmessage = this.onReceive;
      m_Socket.onerror = this.onError;
      m_Socket.onopen = this.onOpen;
    },

    /**
     * Checks if the WebSocket is connected.
     * @return {Boolean} Returns true if the socket is connected.
     */
    isConnected: function() {
      return m_Socket && m_Socket.connected;
    },

    /**
     * Sends binary data through the WebSocket.
     * @param  {UO.Packet} packet A UO.Packet to send
     * @return {Boolean} Returns true on success
     */
    sendBin: function(packet) {
      if(!(packet instanceof UO.Packet))
        packet = UO.Packet.createFromString(packet);

      m_Socket.send(packet.data.buffer);
      return true;
    },

    /**
     * Pings the server
     * @return {Boolean} Returns true on success
     */
    sendPing: function() {
      if(!UO.net.isConnected())
        return false;
      UO.system.write('sending ping');
      //var packet = new UO.Packet(3);
      //packet.append(0x22, 0x00, 0x00);
      //UO.net.sendBin(packet);
      var packet = new UO.Packet(2);
      packet.append(0x73, 0x00);
      m_PingStartTime = new Date().getTime();
      UO.net.sendBin(packet);
    },
    
    /**
     * Measures the latency between the current time and the last ping.
     * @return {Number} Returns the total network latency to the game server.
     */
    measurePing: function() {
      return m_LastLatency = ((new Date().getTime()) - m_PingStartTime);
    },
    
    /**
     * Decompresses incomming data using the huffman tree
     * @param  {ArrayBuffer} source  A typed array or string of incomming data
     * @param  {Function} handler The handling callback function
     * @param  {Number} start   A zero-based index to start decompressing on the source
     */
    decompressData: function(source, handler, start) {
      var i = start || 0;
      var isString = typeof(source) == 'string';

      m_Decompression = (m_Decompression && (m_Decompression.dest.index !== 0)) ? m_Decompression : UO.net.createDecompression();

      while(i < source.length) {
        if(m_Decompression.bit >= 8) {
          m_Decompression.value = isString ? source.charCodeAt(i) : source[i];
          m_Decompression.bit   = 0;
          m_Decompression.mask  = 0x80;
          i++;
        }

        if(UO.net.HuffmanTable[m_Decompression.treepos] === undefined) {
          UO.system.write('warning: undefined treepos {0}', m_Decompression.treepos);
          // note: eofs will cause this to be undefined, not a big deal...
          m_Decompression = null;
          break;
        }
        else
          m_Decompression.treepos = UO.net.HuffmanTable[m_Decompression.treepos][(m_Decompression.value & m_Decompression.mask) ? 1 : 0];
        m_Decompression.mask >>= 1;
        m_Decompression.bit++;
      
        
        if(m_Decompression.treepos <= 0) {
          if(m_Decompression.treepos == UO.net.EOF || m_Decompression.estLength == m_Decompression.dest.index)
          {
            handler(m_Decompression.dest);

            m_Decompression.bit       = 8;
            m_Decompression.treepos   = 0;
            m_Decompression.dest      = new UO.Packet(3);
            m_Decompression.estLength = -1;
            continue;
          }
          
          if(i > source.length)
            break;

          // got first byte:
          if(m_Decompression.dest.index === 0) {
            // check if in registry:
            if(UO.net.PacketRegistry[-m_Decompression.treepos] !== undefined) {
              m_Decompression.estLength = UO.net.PacketRegistry[-m_Decompression.treepos][1];

              if(m_Decompression.estLength != -1) {
                m_Decompression.dest.resize(m_Decompression.estLength);
              }
                
            }
            else
              m_Decompression.estLength = -1;
          }
  
          if(m_Decompression.estLength == -1 && m_Decompression.dest.index == 3) {
            //console.log(m_Decompression);
            m_Decompression.estLength = m_Decompression.dest.getShort(1);
            m_Decompression.dest.resize(m_Decompression.estLength);
          }

          m_Decompression.dest.append(-m_Decompression.treepos);
          m_Decompression.treepos = 0;
        }
      }

      if(m_Decompression && m_Decompression.dest.index > 0) {
        if((m_Decompression.dest.index + 1) >= m_Decompression.estLength) {
          //console.log(m_Decompression);
          handler(m_Decompression.dest);
          m_Decompression = null;
        }
        else {
          UO.system.write('warning: got packet part');
          UO.net.sendPing();
        }
      }
    },
    
    /**
     * Receiving event callback function
     * @param  {Object} e WebSocket onMessage object
     */
    onReceive: function(e) {
      var typeBuffer = new Uint8Array(e.data, 0, 1);
      var type = String.fromCharCode(typeBuffer[0]);
      var data = new Uint8Array(e.data, 1);
      
      switch(type) {
        // "Game" Packet
        case 'G': {
          if(m_Socket.compressed)
            UO.net.decompressData(data, UO.net.preHandler, 0);
          else
            UO.net.preHandler(UO.Packet.createFromArray(data));
        }
        break;
        
        // "Log" packet
        case 'W': {
          data = String.fromCharCode.apply(String, data);
          data = data.split(' ');
          
          switch(data[0]) {
            case 'Version': {
              m_Socket.connected = true;
              UO.system.write('forwarder version: {0}', data);
              UO.net.sendBin('C {0} {1}'.format(UO.login.server.address, UO.login.server.port));
            }
            break;

            case 'ConSuccess': {
              if(!m_Socket.sentLogin) {
                UO.system.write('connection to game server has been established ({0}:{1})', UO.login.server.address, UO.login.server.port);
                UO.system.write('sending login information (with username "{0}")', UO.login.username);

                var seed = new UO.Packet(4);
                seed.append((Math.random() * 0x40) | 0, (Math.random() * 0xFF) | 0, (Math.random() * 0xFF) | 0, (Math.random() * 0xFF) | 0);
                UO.net.sendBin(seed);

                var login = new UO.Packet(62);
                login.append(0x80, UO.login.username.pad(30, '\0', 1), UO.login.password.pad(30, '\0', 1), 0x5D);
                UO.net.sendBin(login);

                m_Socket.sentLogin = true;
              }
              else {
                UO.system.write('logged in; sending second login (with username "{0}", key [{1}])', UO.login.username, m_Socket.key.join(', '));

                var secondSeed = new UO.Packet(4);
                secondSeed.append(m_Socket.key);
                UO.net.sendBin(secondSeed);

                var packet = new UO.Packet(65);
                packet.append(0x91, m_Socket.key[0], m_Socket.key[1], m_Socket.key[2], m_Socket.key[3], UO.login.username.pad(30, '\0', 1), UO.login.password.pad(30, '\0', 1));
                UO.net.sendBin(packet);

                m_Socket.sentLogin = false;

                setInterval(UO.net.sendPing, 45000);
              }
            }
            break;

            case 'ConFail': {
              UO.system.write('cannot connect to game server ({0}:{1})', UO.login.server.address, UO.login.server.port);
              UO.system.kill('no connection');
            }
            break;

            case 'Discon': {
              UO.system.write('game server disconnected ({0}:{1})', UO.login.server.address, UO.login.server.port);
              UO.system.kill('server disconnected');
            }
            break;

            default: {
              UO.system.write('received invalid data from forwarder (L)');
              UO.system.kill('bad L packet');
            }
            break;
          }
        }
        break;

        default: {
          UO.system.write('received invalid packet type from forwarder');
          UO.system.kill('bad packet');
        }
        break;
      }
    },
    
    onOpen: function(e) {
      UO.system.write('socket connected ({0}), requesting version', e.target ? e.target.url : 'n/a');
      m_Socket.connected = true;
      UO.net.sendBin('V {0}'.format(UO.system.version));
    },
    
    onError: function(e) {
      UO.system.write('socket error ({0})', e.target ? e.target.url : 'n/a');
      UO.net.onClose(e);
    },
    
    onClose: function(e) {
      if(m_Socket)
        m_Socket.connected = false;
      UO.system.write('socket closed');
    },
    
    /*
     * Calls up the handling function based on the data provided
     * @argument packet
     */
    preHandler: function(packet) {
      var id = packet.getId();

      if(!id)
        return;
      UO.system.write('received packet 0x{0} (size: {1}, {2}, {3})',
        id.toHex(),
        packet.length,
        (UO.net.handler[id] !== undefined) ? 'exists' : 'non-existant',
        (UO.net.PacketRegistry[id] !== undefined) ? UO.net.PacketRegistry[id][0] : 'n/a');

      if(UO.net.handler === undefined || UO.net.handler[id] === undefined)
        UO.system.write('unimplemented packet 0x{0} (size: {1})', id.toHex(), packet.length);
      else
        UO.net.handler[id](packet);
    },

    /**
     * Handles the game packets
     * @param {UO.Packet} The received packet
     */
    handler: {
      0x00: function(packet) {
        UO.system.write('got a null packet of length {0}', packet.length);
      },

      // Server List
      0xA8: function(packet) {
        UO.system.write("logged in; at serverlist");
        var count = packet.getShort(4);
        
        for(var i = 0; i < count; i++) {
          var pos = i*40 + 6,
            idx = packet.getShort(pos),
            name = packet.getString(pos+2, 32),
            ip = [packet.getByte(pos+39), packet.getByte(pos+38), packet.getByte(pos+37), packet.getByte(pos+36)];

          UO.system.write('server {0}: {1} [{2}]', i, name, ip.join('.'));
        }

        UO.net.sendBin(UO.Packet.createFromArguments(0xA0, 0, UO.login.server.shard));
      },

      // Login Failure
      0x82: function(packet) {
        var reason = packet.data[1];
        UO.system.write("login failed because of {0}", reason.toHex());
      },

      // Login Success
      0x8C: function(packet) {
        UO.system.write("server redirect");
        var address = packet.getInt(1),
          port = packet.getShort(5),
          key = packet.getInt(7);
        
        m_Socket.reconnecting = true;
        m_Socket.compressed = true;

        setTimeout(function() {
          UO.system.write('connecting');
          m_Socket.key = [(key >> 24) & 0xFF, (key >> 16) & 0xFF, (key >> 8) & 0xFF, key & 0xFF];
          //for encryption keys:
          //m_Socket.ck0 = packet.getShort(7);
          //m_Socket.ck1 = packet.getShort(9);
          UO.net.sendBin(UO.Packet.createFromString('R {0} {1}'.format(UO.login.server.address, UO.login.server.port)));
        }, 10);
      },
      // Enable locked client features.
      0xB9: function(packet) {
        //var flags = packet.getInt(1);
      },

      // Character/City List
      0xA9: function(packet) {
        var characterCount = Math.min(packet.getByte(3), 5); // 3/5/7 chars on most servers, but let's cap it at 5
        var cityCount = packet.getByte(4+60*characterCount);
        var i, pos, name;
        var chars = [];

        UO.system.write('chars (' + characterCount + ')');
        for(i = 0; i < characterCount; i++) {
          pos = 60*i+4;
          name = (chars[i] = packet.getString(pos, 30));

          UO.system.write('char {0}: {1}', i, name);
        }

        UO.system.write('cities (' + cityCount + ')');
        for(i = 0; i < cityCount; i++) {
          pos = (63*i) + (5+60*characterCount);
          name = packet.getString(pos, 30);

          UO.system.write('city {0}: {1}, {2}', packet.getByte(pos), name, packet.getString(pos+31, 31));
        }
        
        UO.system.write('choosing character (slot {0}, name: {1})', UO.login.slot, chars[UO.login.slot]);

        var login = new UO.Packet(73);
        login.append(0x5D, 0xED, 0xED, 0xED, 0xED, chars[UO.login.slot].pad(30, '\0', 1), new Array(5), 0x1F, new Array(7), 0x16, new Array(19), UO.login.slot, m_Socket.key);
        UO.net.sendBin(login);
      },

      // Version:
      0xBD: function(packet) {
        UO.system.write('got version request, replying...');
        var version = new UO.Packet(12);
        version.append(0xbd, 0x00, 0x0c, 0x36, 0x2e, 0x30, 0x2e, 0x31, 0x2e, 0x31, 0x30, 0x00);
        UO.net.sendBin(version);
        //UO.net.sendBin(UO.Packet.createFromArguments(0xbd, 0x00, 12, 0x36, 0x2e, 0x30, 0x2e, 0x31, 0x2e, 0x31, 0x30, 0x00));
      },

      // Login Confirm:
      0x1B: function(packet) {
        var player = {
          serial: packet.getInt(1),
          body: packet.getShort(9),
          x: packet.getShort(11),
          y: packet.getShort(13),
          z: packet.getShort(15),
          d: packet.getShort(17)
        };
        var mapWidth  = packet.getShort(27),
          mapHeight = packet.getShort(29);

        UO.system.write('(1B) player {0}: body: {1}, at ({2}, {3}, {4})', player.serial, player.body, player.x, player.y, player.z);
        UO.game.updateSelf({serial: player.serial});
        UO.game.addObject(player);

        UO.system.write('map size: {0} x {1}', mapWidth, mapHeight);
        var range = new UO.Packet(2);
        range.append(0xC8, UO.game.PlayerRange);
        UO.net.sendBin(range);
        //UO.net.sendBin(UO.Packet.createFromArray([0xC8, ]));
      },
      // Generic Command:
      0xBF: function(packet) {
        var subcommand = packet.getShort(3);

        switch(subcommand) {
          case 0x00: {
            // just so jslint shuts up about being a switch
          }
          break;

          case 0x08: {
            //UO.game.server.map = packet.getNumberAt(5, UO.number.byte).toHex();
            var map = packet.getByte(5);

            switch(map) {
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
          }
          break;

          default: {
            UO.system.write('generic command ({0}) unimplemented', subcommand.toHex());
          }
          break;
        }
      },

      // Seasonal Information
      0xBC: function(packet) {
        //TODO
      },

      // Draw Game Player
      0x20: function(packet) {
        var player = {
          serial: packet.getInt(1),
          body: packet.getShort(5),
          hue: packet.getShort(9),
          x: packet.getShort(11),
          y: packet.getShort(13),
          d: packet.getByte(17),
          z: packet.getByte(18)
        };
        UO.game.addObject(player);
        UO.system.write('(20) player {0} (b: {1}; h: {2}) at ({3}, {4}, {5})', player.serial.toHex(), player.body, player.hue, player.x, player.y, player.z);
      },

      // Speech/Ascii Message
      0x1C: function(packet) {
        // one of these is incorrect (3):
        var item    = packet.getInt(3),
            serial  = packet.getShort(7),
            type    = packet.getByte(9),
            from    = packet.getString(14, 30),
            message = packet.getString(44, packet.length-44);
        UO.system.write('speech [A]({0}): {1}', from, message);
      },

      // Chat
      0xAE: function(packet) {
        var message = {
          serial: packet.getInt(3),
          body: packet.getShort(7),
          type: packet.getByte(9),
          //from: ,
          text: packet.getString(18, 30) + ': ' + packet.getString(48, packet.length-48),
          time: new Date().getTime()
        };
        UO.game.addLabel(message);
        //UO.system.write('speech [C]({0}): {1}', from, message);
      },

      // Request War Mode
      0x72: function(packet) {
        var player = {war: packet.getByte(1) == 1};
        UO.game.updateSelf(player);
        UO.system.write('war mode: {0}', player.war);
      },

      // Ping reply [pong]
      0x73: function(packet) {
        UO.system.write('roundtrip latency: {0} ms', UO.net.measurePing());
      },

      // Mobile move
      0x77: function(packet) {
        var player = {
          serial: packet.getInt(1),
          body: packet.getShort(5),
          x: packet.getShort(7),
          y: packet.getShort(9),
          z: packet.getByte(11),
          d: packet.getByte(12),
          hue: packet.getShort(13)
        };
        UO.game.addObject(player);
        UO.system.write('(77) mobile 0x{0} (b: {1}, h: {2}, d: {3}) at ({4}, {5}, {6})', player.serial.toHex(), player.body, player.hue, player.d, player.x, player.y, player.z);
      },
      // Draw Object
      0x78: function(packet) {
        var player = {
          serial: packet.getInt(3),
          body: packet.getShort(7),
          x: packet.getShort(9),
          y: packet.getShort(11),
          z: packet.getByte(13),
          d: packet.getByte(14),
          hue: packet.getShort(15)
        };
        UO.game.addObject(player);

        var o = UO.game.getObject(player.serial);
        if(!o.name) {
          o.name = '';
          var req = new UO.Packet(5);
          req.append(0x09, packet.data[3], packet.data[4], packet.data[5], packet.data[6]);
          UO.net.sendBin(req);
        }
        if(!o.health) {
          var hreq = new UO.Packet(10);
          hreq.append(0x34, 0xED, 0xED, 0xED, 0xED, 0x04, packet.data[3], packet.data[4], packet.data[5], packet.data[6]);
          UO.net.sendBin(hreq);
        }
        UO.system.write('(78) mobile {0} (b: {1}, h: {2}, d: {3}) at ({4}, {5}, {6})', player.serial, player.body, player.hue, player.d, player.x, player.y, player.z);
      },
      // Mob Status Compact
      0x11: function(packet) {
        var player = {
          serial: packet.getInt(3),
          name: packet.getString(7, 30).replace(/[\s\0]/g, ''),
          health: packet.getShort(37),
          maxHealth: packet.getShort(39)
        };
        UO.game.addObject(player);
        UO.system.write('(11) mobile {0} (name: {1})', player.serial.toHex(), player.name);
      },

      // SE Introduced Rev.
      0xDC: function(packet) {
      },

      // Mobile Remove
      0x1D: function(packet) {
        var serial = packet.getInt(1);
        UO.game.removeObject(serial);
        UO.system.write('remove object {0}', serial.toHex());
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
        UO.game.loadMap();
      },
      // Server Time
      0x5B: function(packet) {
        var h = packet.getByte(1),
            m = packet.getByte(2),
            s = packet.getByte(3),
            current = new Date();

        m_ServerHourDifference = current.getHours() - h;
        UO.system.write('server time: {0}:{1}:{2} (hourly difference: {3})', h, m, s, m_ServerHourDifference);
      },
      // Weather
      0x65: function(packet) {
      
      },
      // Character Animation
      0x6E: function(packet) {
        var player = {
          serial: packet.getInt(1),
          animation: {
            action: packet.getShort(5),
            count: packet.getByte(8),
            repeat: packet.getShort(10),
            delay: packet.getByte(13)
          }
        };
        UO.game.addObject(player);
        UO.system.write('animation for mobile ({0})', player.serial);
      },
      // Items in container
      0x3C: function(packet) {
        var items = packet.getShort(3);
        //var items = packet.getNumberAt(3, UO.number.short);
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
        var clothing = {
          item: packet.getInt(1),
          model: packet.getShort(5),
          layer: packet.getByte(8),
          hue: packet.getShort(13)
        };

        var player = packet.getInt(0);

        //TODO
        UO.system.write('worn item (item: {0}, anim: {1}, player: {2})', clothing.item.toHex(), clothing.model, player);
      },
      // Object Info
      0x1A: function(packet) {
        var id = packet.getInt(3),
          g = packet.getShort(7),
          serial = id ^ 0x80000000, count = 0, i = 9;

        if(id & 0x80000000) {
          count = packet.getShort(i);
          i += 2;
        }
        
        // what exactly is this?
        if(count & 0x8000) {
          i++;
          UO.system.write('inc counter');
        }

        var x = (packet.getShort(i)) & 0x7FFF,
            y = packet.getShort(i + 2) & 0x3FFF, d = 0;

        i += 4;
        if(x & 0x8000) {
          d = packet.getByte(i);
          i++;
        }
        var z = packet.getByte(i++);

        //TODO: organize this and get hue
        var object = {serial: serial, itemid: g, count: count, x: x, y: y, z: z, d: d};
        UO.game.addObject(object);
        UO.system.write('Object {0} at ({1}, {2}, {3}) direction: {4}', serial.toHex(), x, y, z, d);
        //UO.system.write('object info (id {0}, g: {1})', id.toUnsigned().toHex(), g);
      },
      
      // Update Health
      0xA1: function(packet) {
        var player = {
          serial: packet.getInt(1),
          maxHealth: packet.getShort(5),
          health: packet.getShort(7)
        };

        if(player.health === 0)
          player.health = UO.game.getObject(player.serial).health + 1;
        var label = {
          serial: player.serial
        };
        UO.game.addObject(player);
        UO.game.addLabel(label);
        UO.system.write('update health for {0}, max: {1}, current: {2}', player.serial.toHex(), player.maxHealth, player.health);
      },
      // Move rejected
      0x21: function(packet) {
        var sequence = packet.getByte(1),
          x = packet.getShort(2),
          y = packet.getShort(4),
          d = packet.getByte(6),
          z = packet.getByte(7);
        UO.game.move.reject(sequence, x, y, z, d);
        
        UO.system.write('move rejected ({0}, {1}, {2}): {3}', x, y, z, s.toHex());
      },

      // Move ack
      0x22: function(packet) {
        // something
      },

      // Cliloc
      0xC1: function(packet) {
        var cliloc = {
          serial: packet.getInt(3),
          body: packet.getShort(7),
          message: packet.getInt(14),
          time: new Date().getTime()
        };
        var _args = packet.getString(48, packet.length - 48);
        var args = '', i = 0;
        for(i = 0; i < _args.length; i++) {
          if(_args.charCodeAt(i) !== 0)
            args += _args[i];
        }
        args = args.split('\t');
        for(i = 0; i < args.length; i++)
          args[i] = '&{0}={1}'.format(i, args[i]);

        $.getJSON('http://{0}/getcliloc?&i={1}{2}'.format(UO.login.forwarder.proxy, cliloc.message, args.join('')),
          function(data) {
            cliloc.text = data.text;
            UO.game.addLabel(cliloc);
          });

      }
    }
  };
})();


UO.game = (function(){
  var m_Self = {}, m_Objects = {}, m_ObjectsAtPoint = {}, m_Map = {}, m_StepSequence, m_LastDirection = -1, m_LastMapLoadPoint = {currentX: 0, currentY: 0, lastX: 0, lastY: 0}, m_Labels = {};

  return {
    // must be even
    PlayerRange: 30,
    Direction: {
      North:     0x00,
      Northeast: 0x01,
      East:      0x02,
      Southeast: 0x03,
      South:     0x04,
      Southwest: 0x05,
      West:      0x06,
      Northwest: 0x07
    },
    addLabel: function(label) {
      m_Labels[label.serial] = label;
    },
    removeLabel: function(serial) {
      delete m_Labels[serial];
    },
    getAllLabels: function() {
      return m_Labels;
    },
    getSelf: function() {
      return m_Objects[m_Self.serial];
    },

    /**
     * Updates the self object
     * @param  {Object} obj The object/associative array to update
     */
    updateSelf: function(obj) {
      //hmmmm. I'm not sure if we need this function actually
      for(var key in obj) {
        if(obj.hasOwnProperty(key))
          m_Self[key] = obj[key];
      }
    },

    /**
     * Adds an object to the renderble objects
     * @param {UO.GameObject} obj The object being added
     * @return {Boolean} Returns true on success
     */
    addObject: function(obj) {
      if(!obj || !obj.serial)
        return false;
      if(m_Objects.hasOwnProperty(obj.serial)) {
        for(var key in obj)
          if(obj.hasOwnProperty(key))
            m_Objects[obj.serial][key] = obj[key];
        return true;
      }
      else {
        if(!m_ObjectsAtPoint[obj.x])
          m_ObjectsAtPoint[obj.x] = {};
        if(!m_ObjectsAtPoint[obj.x][obj.y])
          m_ObjectsAtPoint[obj.x][obj.y] = [];
        m_ObjectsAtPoint[obj.x][obj.y].push(obj);
        m_Objects[obj.serial] = obj;
      }
      return true;
    },

    getObject: function(serial) {
      return m_Objects[serial];
    },
    /**
     * Removes an object from the renderable objects
     * @param  {UO.GameObject} obj The object to remove
     * @return {Boolean} Returns true on success
     */
    removeObject: function(serial) {
      if(m_Objects[serial])
        return delete m_Objects[serial];
      
      UO.system.write('warning: cannot delete object ({0})', serial);
      return false;
    },

    /**
     * Gets a list of all the objects
     * @return {Object} The motherfucking list
     */
    getAllObjects: function() {
      return m_Objects;
    },

    getObjectsAtPoint: function(x, y) {
      if(m_ObjectsAtPoint[x] && m_ObjectsAtPoint[x][y])
        return m_ObjectsAtPoint[x][y];
      return [];
      var r = [];
      for(var i in m_Objects) {
        if(m_Objects[i].x == x && m_Objects[i].y == y)
          r.push(m_Objects[i]);
      }
      return r;
    },
    /**
     * Moves the player's location on a theta value relative to the canvas' center.
     * @param  {Number} theta   The angle (whatever the fuck it's called)
     * @param  {Boolean} running Self-explanitory
     */
    moveFromTheta: function(theta, running) {
      this.move(UO.convert.toInt(theta/45)-2, running);
    },

    /**
     * Moves the player based on a cardinal direction.
     * @param  {UO.game.Direction} direction The enum direction to move
     * @param  {Boolean} running   Set to true if the player is running
     */
    move: function(direction, running) {
      //call findmovedeltas before
      var deltas = findMoveDeltas(direction);
      var dist = addDeltas(deltas);

      if(dist > 10) {
        //TODO make sure this is in sync with UO.game.PlayerRange or whatever
        this.loadMap();
      }
      UO.net.sendBin([0x02, (m_LastDirection = direction) | (running ? 0x80 : 0), m_StepSequence & 0xFF, 0, 0, 0, 0]);
      m_StepSequence = m_StepSequence++ % 0xFF; // this can be optimized
    },

    /**
     * Calculates the directional deltas each time the player moves.
     * @param  {UO.game.Direction} direction The cardinal direction the player is moving
     * @return {Object}           An associative array to hold the deltas
     */
    findMoveDeltas: function(direction) {
      if(m_LastDirection == -1)
        return null;
      var deltas = {x: 0, y: 0};

      switch(direction) {
        case 0x00: deltas.y--; break;
        case 0x01: deltas.x++; deltas.y--; break;
        case 0x02: deltas.x++; break;
        case 0x03: deltas.x++; deltas.y++; break;
        case 0x04: deltas.y++; break;
        case 0x05: deltas.y++; deltas.x--; break;
        case 0x06: deltas.x--; break;
        case 0x07: deltas.x--; deltas--; break;
      }
      return m_MoveDeltas;
    },

    /**
     * Adds the movement deltas and returns the distance traveled since the last load point.
     * @param {Object} deltas Deltas associative array
     * @returns {Number} The distance traveled since the last load point
     */
    addDeltas: function(deltas) {
      m_LastMapLoadPoint.currentX += deltas.x;
      m_LastMapLoadPoint.currentY += deltas.y;

      return Math.sqrt(m_LastDirection.lastX * m_LastDirection.lastX + m_LastDirection.lastY * m_LastDirection.lastY) | 0;
    },

    /**
     * Resets the move sequence value.
     */
    moveReset: function(sequence, x, y, z, d) {
      m_StepSequence = 0;
      //TODO set x, y, z, d into self
    },

    /**
     * Checks to see if the player's location has been initialized.
     * @return {Boolean} Returns true if the player has a valid location.
     */
    hasLocation: function() {
      return true;
      return m_Self.x !== undefined && m_Self.y !== undefined;
    },


    /**
     * Estimates if the map is loaded
     * @return {Boolean} Returns true if the map is generally loaded around the player.
     */
    isMapLoaded: function() {
      return false;
      if(!UO.game.hasLocation())
        return false;
      var self = UO.game.getSelf();
      //var halfRange = (UO.game.PlayerRange / 2) | 0;

      // I guess maybe we can loop through each spot but it seems unneeded
      return m_Map[self.x][self.y]; 
    },
    underRoof: function() {
      if(!m_Map)
        return false;
      var self = UO.game.getSelf();
      //console.log(self.x, self.y);
      //console.log()
      for(var i = 0; i < m_Map[self.x][self.y].length; i++)
        if(m_Map[self.x][self.y][i].z > self.z)
          return true;
      return false;
      //return (m_Map[self.x][self.y].z > self.z);
    },
    /**
     * Deletes old cached map locations
     * @return {[type]} [description]
     */
    removeOldMapLocations: function() {
      //TODO
    },

    getMap: function() {
      return m_Map;
    },

    /**
     * Loads the local map statics and land.
     * @return {Boolean} Returns true on success.
     */
    loadMap: function() {
      if(!UO.game.hasLocation())
        return false;
      //TODO: boundcheck
      if(UO.game.isMapLoaded())
        return true;
      var self = UO.game.getSelf();
      $.getJSON('http://{0}/getmapinfo?&x={1}&y={2}&r={3}&m=f'.format(UO.login.forwarder.proxy, (self.x - UO.game.PlayerRange/2), (self.y - UO.game.PlayerRange/2), UO.game.PlayerRange),
          function(data) {
            m_Map = data;
          });
    }
  };
})();

UO.ui = (function() {
  var m_Canvas, m_Context, m_CurrentFrame = 0, m_Center = {x: -1, y: -1}, m_MouseClick = null, m_AnimationData = {}, m_ImageCache = {}, m_AnimationCache = {};
  var m_RightClick = {x: null, y: null};
  var m_DrawOffset = {x: 300, y: 300};
  var m_RequestAnimationFrame;
  var m_FrameTime;
  var m_DrawTime = (new Date()).getTime();
  var m_FPSCounter = {initStartTime: 0, startTime: 0, startFrame: 0};
  var m_LastClick = null;
  var m_ChatMessage = '';
  return {
    SmoothTextures: true,
    FPSLimit: 10,
    Scale: 1,
    /**
     * Creates/starts the UI
     */
    start: function() {
      m_FPSCounter.initStartTime = (new Date()).getTime();
      UO.ui.initializeUI();
      UO.ui.draw();
    },

    /**
     * Draws the UI/game on to the canvas
     */
    draw: function() {
      m_DrawTime = (new Date()).getTime();
      
      if(UO.net.isConnected()) {
        UO.ui.drawIsometricMap();
        UO.ui.drawAllLabels();
       // UO.ui.drawHiddenObjects();
      }
      if(m_MouseClick) {
        var object = m_MouseClick.object;
        if(object && object.serial) {
          var doubleClick = false;
          if(m_LastClick && m_LastClick.object && m_LastClick.object.serial && m_LastClick.object.serial == object.serial) {
            if((new Date().getTime() - m_LastClick.time) < 500)
              doubleClick = true;
          }
          var dbl = new UO.Packet(5);
          dbl.append(doubleClick ? 0x06 : 0x09, (object.serial >> 24) & 0xFF, (object.serial >> 16) & 0xFF, (object.serial >> 8) & 0xFF, object.serial & 0xFF);
          //console.log(dbl);
          UO.net.sendBin(dbl);
        }
        m_LastClick = m_MouseClick;
        m_MouseClick = null;
      }

      if(m_ChatMessage.length) {
        m_Context.strokeText('Chat: ' + m_ChatMessage, 0, 50);
        m_Context.fillText('Chat: ' + m_ChatMessage, 0, 50);
      }
      window.setTimeout(function() {
        m_RequestAnimationFrame(UO.ui.draw);
      }, m_FrameTime);
    },

    drawHiddenObjects: function() {
      m_Context.globalAlpha = 0.3;
      var self = UO.game.getSelf();

      if(!self)
        return;
      var initX = self.x - UO.game.PlayerRange/2 + 1, initY = self.y - UO.game.PlayerRange/2 + 1,
          lastX = initX + UO.game.PlayerRange - 2, lastY = initY + UO.game.PlayerRange - 2;
      var initColor = m_MouseClick !== null ? m_Context.getImageData(m_MouseClick.x, m_MouseClick.y, 1, 1).data : null;


      for(var x = initX; x < lastX; x++) {
        for(var y = initY; y < lastY; y++) {
          UO.ui.drawObjectsAtPoint(x, y, initColor);
        }
      }
      m_Context.globalAlpha = 1.0;
    },
    drawAllLabels: function() {
      var labels = UO.game.getAllLabels();
      var self = UO.game.getSelf();
      if($.isEmptyObject(labels))
        return;
      for(var i in labels) {
        var label = labels[i];
        if(label.serial !== -1) {
          var from = UO.game.getObject(label.serial);

          var text = label.text || from.name;
          var dX = from.x - self.x, dY = from.y - self.y;
          var pX = dX * 22 - dY * 22,  pY = dY * 22 + dX * 22 - (from.z * 4);

          if(from.health && from.maxHealth) {
            text = '{0} ({1}%)'.format(text, (from.health/from.maxHealth * 100.0)|0);
          }
          m_Context.strokeText(text, m_DrawOffset.x + pX, m_DrawOffset.y + pY - 60);
          m_Context.fillText(text, m_DrawOffset.x + pX, m_DrawOffset.y + pY - 60);
        } else {
          m_Context.strokeText(label.text, 0, 50);
          m_Context.fillText(label.text, 0, 50);
        }

        if((m_DrawTime - label.time) > 2500) {
          UO.game.removeLabel(i);
        }
      }
    },

    calculateMatrix: function(xDiff, yDiff) {
      return [1, (xDiff-yDiff)/44, 0, (xDiff+yDiff)/44 + 1];
    },
    getAnimationFrames: function(id, action, direction, hue) {
      var uid = (id << 16) | action << 14 | direction << 2 | hue;
      var animid = uid & (~hue);
      if(!m_AnimationData[animid]) {
        m_AnimationData[animid] = 0;
        $.getJSON('http://{0}/getaniminfo?&i={1}&a={2}&d={3}'.format(UO.login.forwarder.proxy, id, action, direction),
          function(data) {
            m_AnimationData[animid] = data.widths;
          });
      }
      if(m_AnimationCache[uid])
        return m_AnimationCache[uid];
      m_AnimationCache[uid] = new Image();
      m_AnimationCache[uid].src = 'http://{0}/getanim?&i={1}&a={2}&d={3}&h={4}'.format(UO.login.forwarder.proxy, id || 1, action, direction, hue);
      console.log(m_AnimationCache[uid].src);
      m_AnimationCache[uid].onload = function(){this.loaded = true;};
      return m_AnimationCache[uid];
    },
    getObjectImage: function(id, hue, type, crop) {
      var uid = (id << 1) ^ (hue << 4) | (crop === undefined ? 0 : (crop == 'left' ? 2 : 4)) << 8 | (type == 'l' ? 1 : 0);
      if(m_ImageCache[uid])
        return m_ImageCache[uid];

      m_ImageCache[uid] = new Image();
      m_ImageCache[uid].src = 'http://{0}/getobj?&t={1}&h={2}&i={3}{4}'.format(UO.login.forwarder.proxy, type, hue, id, crop ? ('&c=' + crop) : '');
      console.log(m_ImageCache[uid].src);
      m_ImageCache[uid].onload = function(){this.loaded = true;};

      return m_ImageCache[uid];
    },
    drawObjectsAtPoint: function(x, y, initColor, c) {
      var objects = UO.game.getObjectsAtPoint(x, y);
      var self = UO.game.getSelf();
      //var initColor = m_MouseClick ? m_Context.getImageData(m_MouseClick.x, m_MouseClick.y, 1, 1).data : null;

      for(var i in objects) {
        var item = objects[i];
        var isItem = (item.serial & 0x40000000);
        var image = isItem ? UO.ui.getObjectImage(item.itemid, item.hue || 0, 's') : UO.ui.getAnimationFrames(item.body, 4, 2, item.hue);
        var h = image.height;
        var w = image.width; //isItem ? image.width : ((item.width/10)|0);
        //var dX =  item.x - self.x + UO.game.PlayerRange/2, dY = item.y - self.y + UO.game.PlayerRange/2;
        var dX = item.x - self.x;
        var dY = item.y - self.y;
        //console.log(dX + ' ' + dY);
        //var c = false;
        var pX = dX * 22 - dY * 22 + w/2;
        var pY = dY * 22 + dX * 22 - h + w/2 - (item.z * 4);
        //console.log(pX + ' ' + pY);

        if(isItem) {
          c = UO.ui.drawTile(pX, pY, image);
        } else {
          var uid = (item.body << 16) | (4) << 14 | 2 << 2;
          if(!m_AnimationData[uid])
            continue;

          var width = m_AnimationData[uid][0];
          c = UO.ui.drawAnimation(pX, pY, image, 0, width);
        }
        if(c && m_MouseClick)
          initColor = UO.ui.checkMouseClick(initColor, {serial: item.serial, mobile: !isItem, x: item.x, y: item.y, z: item.z});
      }
    },
    isSameArray: function(a, b) {
      for(var index = 0; index < a.length; index++)
        if(a[index] != b[index])
          return false;
      return true;
    },
    drawAnimation: function(x, y, image, offset, width) {
      if(!image.loaded)
        return false;
      if(width > image.width)
        width = image.width;

      var _x = (m_DrawOffset.x + x + width + width/2)|0;
      var _y = (m_DrawOffset.y + y)|0;
      m_Context.drawImage(image, offset, 0, width, image.height, _x, _y, width, image.height);
      //m_Context.strokeRect(_x, _y, width, image.height);
      return m_MouseClick && m_MouseClick.x >= _x && m_MouseClick.x >= _y && m_MouseClick.x <= (_x + width) && m_MouseClick.y <= (_y + image.height);
    },
    drawTile: function(x, y, image, matrix) {
      if(!image.loaded)
        return false;
      var offset;

      if(matrix) {
        offset = {x: m_DrawOffset.x+x, y: m_DrawOffset.y + y, maxX: (matrix[0] * 44 + matrix[1] * 44 + m_DrawOffset.x + x), maxY: (matrix[2] * 44 + matrix[3] * 44 + m_DrawOffset.y + y)};
        m_Context.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], m_DrawOffset.x + x, m_DrawOffset.y + y);
        m_Context.drawImage(image, 0, 0);
        return m_MouseClick && (m_MouseClick.x >= offset.x && m_MouseClick.x <= offset.maxX && m_MouseClick.y >= offset.y && m_MouseClick.y <= offset.maxY);
      }
      offset = {x: m_DrawOffset.x + x, y: m_DrawOffset.y + y, maxX: m_DrawOffset.x + x + image.width, maxY: m_DrawOffset.y + y + image.height};
      m_Context.drawImage(image, m_DrawOffset.x + x, m_DrawOffset.y + y);

      return m_MouseClick && (m_MouseClick.x >= offset.x && m_MouseClick.x <= offset.maxX && m_MouseClick.y >= offset.y && m_MouseClick.y <= offset.maxY);
    },

    checkMouseClick: function(initColor, object) {
      if(!initColor || !m_MouseClick)
        return initColor;
      var color = m_Context.getImageData(m_MouseClick.x, m_MouseClick.y, 1, 1).data;
      if(!UO.ui.isSameArray(color, initColor)) {
        m_MouseClick.object = object; //{x: (self.x + x - UO.game.PlayerRange/2), y: (self.y + y- UO.game.PlayerRange/2), z: center.z, id: center.id};
        return color;
      }
      else
        return initColor;
    },
    /**
     * Renders the map using an isometric projection.
     * @return {Number} Returns the count of tiles rendered
     */
    drawIsometricMap: function(renderMap) {
      var map = UO.game.getMap();
      var self = UO.game.getSelf();

      if (!map || !m_Context || !self)
        return 0;

      m_Context.clearRect(0, 0, 800, 800);

      var initColor = m_MouseClick !== null ? m_Context.getImageData(m_MouseClick.x, m_MouseClick.y, 1, 1).data : null;
      var initX = self.x - UO.game.PlayerRange/2 + 1, initY = self.y - UO.game.PlayerRange/2 + 1,
          lastX = initX + UO.game.PlayerRange - 2, lastY = initY + UO.game.PlayerRange - 2;

      if(!map[initX])
        return;
      var underRoof = UO.game.underRoof();

      for(var x = initX; x < lastX; x++) {
        for(var y = initY; y < lastY; y++) {
          // what the fuck am I doing
          if(!map[x] || !map[x+1] || !map[x-1] || !map[x][y] || !map[x+1][y+1] || !map[x+1][y-1])
            continue;

          var center = map[x][y];
          var innerCorner = (center.z == map[x][y+1].z) && (map[x+1][y].z == center.z) && (map[x+1][y+1].z != center.z) ? 1 : 0;
          var outerCorner = (center.z != map[x+1][y-1].z) && (map[x][y+1].z != center.z) && (map[x+1][y+1].z != center.z) ? 1 : 0;
          var xDiff = 4 * (center.z - map[x+1][y + (outerCorner | innerCorner)].z);
          var yDiff = 4 * (center.z - map[x][y+1].z);
          var _x = x - self.x;
          var _y = y - self.y;

          var pX = _x * 22 - _y * 22 + 22,
              pY = _y * 22 + _x * 22 - 22 - (center.z * 4) + yDiff/2 - xDiff * (outerCorner ? 1 : 0.5);

          var c = false;
          if(outerCorner || innerCorner) {
            var matrices = [UO.ui.calculateMatrix(0, xDiff), UO.ui.calculateMatrix(xDiff, 0)];
            var images = [UO.ui.getObjectImage(center.id, 0, 'l', 'left'), UO.ui.getObjectImage(center.id, 0, 'l', 'right')];
            c = UO.ui.drawTile(pX, pY + xDiff, images[1-outerCorner], matrices[0]) || c;
            c = UO.ui.drawTile(pX, pY, images[outerCorner], matrices[1]) || c;

          } else {
            var matrix = (xDiff || yDiff) ? UO.ui.calculateMatrix(xDiff, yDiff) : null;
            var image = UO.ui.getObjectImage(center.id, 0, 'l');
            c = UO.ui.drawTile(pX, pY, image, matrix) || c;

          }
          //var tmp;
          if(c && m_MouseClick)
            initColor = UO.ui.checkMouseClick(initColor, {land: true, x: (self.x + x - UO.game.PlayerRange/2), y: (self.y + y- UO.game.PlayerRange/2), z: center.z, id: center.id});

          // just use the ident for now instead of restore()
          m_Context.setTransform(1, 0, 0, 1, 0, 0);

          var length = map[x][y].length;

          for(var i = 0; i < length; i++) {
            var tile = UO.ui.getObjectImage(map[x][y].o[i]['ID'], map[x][y].o[i]['Hue'], 's');
            var h = tile.height;
            var w = tile.width;
            var z = map[x][y].o[i]['Z'];

            pX = _x * 22 - _y * 22 + w/2;
            pY = _y * 22 + _x * 22 - h + w/2 - (z * 4);

            if(underRoof && self.z < z) {
              continue;
            }
            c = UO.ui.drawTile(pX, pY, tile) || c;
            if(c && m_MouseClick)
              initColor = UO.ui.checkMouseClick(initColor, {x: (self.x + x - UO.game.PlayerRange/2), y: (self.y + y- UO.game.PlayerRange/2), z: z, id: map[x][y].o[i]['ID']});
          }
          UO.ui.drawObjectsAtPoint(x, y, initColor, c);
          // so this will need to be drawn before if the z is below the land z
        }
      }
      //m_MouseClick = null;
      //console.log('draw time: {0} ms'.format((new Date()).getTime() - start));
    },
    handleRightClick: function() {
      if(m_RightClick === null)
        return;
      console.log(m_RightClick);
      var tmp = new UO.Packet(7);
      tmp.append(0x02, 0x00, 0, 0, 0, 0, 0);
      UO.net.sendBin(tmp);
      var self = UO.game.getSelf();
      self.y--;
      m_RightClick.timer = setTimeout(UO.ui.handleRightClick, 100);
    },
    /**
     * Initializes the UI, gets the canvas and context, sets the mouse & key handlers
     */
    initializeUI: function() {
      m_Context = document.getElementById('canvas').getContext('2d');
      m_Canvas = $(UO.system.Canvas);
      m_Context.mozImageSmoothingEnabled = m_Context.webkitImageSmoothingEnabled = UO.ui.SmoothTextures;
      m_Context.font = 'bold 12pt sans-serif';
      m_Context.fillStyle = 'white';
      m_Context.strokeStyle = 'black';
      m_Context.lineWidth = 2;
      m_Center = {x: m_Canvas.width() / 2, y: m_Canvas.height() / 2};
      m_FrameTime = 1000/UO.ui.FPSLimit;
      m_Canvas.bind('contextmenu', function(e) { return false; });
      m_DrawOffset = {x: m_Center.x - 44, y: m_Center.y + 44};// 400 - 22 * UO.PlayerRange};

      $(document).keypress(function(e) {
        if(e.ctrlKey || e.altKey)
          return true;
        switch(e.which) {
          // bkspace
          case 0x08: {
            e.preventDefault();
            m_ChatMessage = m_ChatMessage.slice(0, -1);
          }
          break;

          // space
          case 32:
          case 20: {
            e.preventDefault();
            m_ChatMessage += ' ';
            return false;
          }
          break;

          // enter
          case 0x0D: {
            var n = [];
            for(var i = 0; i < m_ChatMessage.length; i++)
              n.push('\x00' + m_ChatMessage.charAt(i));
            m_ChatMessage = n.join('');
            var packet = new UO.Packet(14+m_ChatMessage.length);
            packet.append(0xAD, 0, 14+m_ChatMessage.length, 0, 0, 0x34, 0x00, 0x03, 'enu', 0x0, m_ChatMessage, 0x00, 0x00);
            UO.net.sendBin(packet);
            m_ChatMessage = '';
          }
          break;

          default: m_ChatMessage += String.fromCharCode(e.which); break;
        }
      });
      m_Canvas.mousemove(function(e) {
        var offset = $(this).offset();
        if(m_RightClick) {
          m_RightClick.x = e.pageX - offset.left;
          m_RightClick.y = e.pageY - offset.top;
        }
      });
      m_Canvas.mousedown(function(e) {
        var offset = $(this).offset();
        if(e.button != 2)
          m_MouseClick = {time: (new Date()).getTime(), x: e.pageX - offset.left, y: e.pageY - offset.top};
        else {
          m_RightClick = {x: e.pageX - offset.left, y: e.pageY - offset.top};
          UO.ui.handleRightClick();
          //m_RightClick.timer = setTimeout(UO.ui.handleRightClick, 100);
        }
        return false;
      });
      m_Canvas.mouseup(function(e) {
        if(m_RightClick) {
          clearTimeout(m_RightClick.timer);
          m_RightClick = null;
        }
        return false;
      });

      m_RequestAnimationFrame = (function() {
        return  window.requestAnimationFrame       ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame    ||
                window.oRequestAnimationFrame      ||
                window.msRequestAnimationFrame     ||
                function(callback) {
                  window.setTimeout(callback, 1000 / 60);
                };
      })();
    },


    getCenter: function() {
      return m_Center;
    },
    getCanvas: function() {
      return m_Canvas;
    },
    getContext: function() {
      return m_Context;
    }
  };
})();

