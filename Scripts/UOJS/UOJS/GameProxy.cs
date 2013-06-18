using System;
using UOJS;
using System.Net.Sockets;
using System.Net;
using System.Threading;
using System.Security.Cryptography;
using System.Text;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Drawing;
using System.IO;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Reflection;

namespace UOJS.Network
{
	/// <summary>
	/// A class containing the WebSocket proxy layer
	/// </summary>
	public class GameProxy
	{
		/// <summary>
		/// The port the proxy & server should listen on (NOT THE UO SOCKET PORT!).
		/// </summary>
		private static readonly int ListeningPort = 2580;
		
		/// <summary>
		/// The directory containing the HTML & JS files.
		/// </summary>
		private static readonly string WebDirectory = "WebClient";
		
		/// <summary>
		/// If you have a lot of memory, set this to true. If not, use your webserver or cdn to cache these in a reverse proxy.
		/// </summary>
		private static readonly bool CacheBitmaps = false; 
		
		private static readonly string UltimaDllLocation = "./Ultima.dll";
		
		private static readonly string MagicKey = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
		
		
		/// <summary>
		/// Initialize this instance.
		/// </summary>
		public static void Initialize ()
		{
			if (!File.Exists (UltimaDllLocation)) {
				UOJS.Log ("Error: Cannot find Ultima.dll");
				return;
			}
			if (WebDirectory.Length <= 0 || !InitializeFiles ()) {
				UOJS.Log ("Error: WebDirectory (\"{0}\") does not exist.", WebDirectory);
				return;
			}
			
			m_Ultima = Assembly.LoadFrom (UltimaDllLocation);
			m_SHA1 = SHA1.Create ();
			
			UOJS.Log ("Starting UOJS (version {0}, Ultima version {1}, port {2})", UOJS.Version, System.Diagnostics.FileVersionInfo.GetVersionInfo (m_Ultima.Location).FileVersion, ListeningPort);	
			GameProxy.BeginListening ();
		}
		
		private static Assembly m_Ultima;
		private static Socket m_ListeningSocket;
		private static bool m_Listening;
		private static Thread m_Thread;
		private static ManualResetEvent m_AcceptEvent;
		private static SHA1 m_SHA1;
		private static DateTime m_StartDate;
		private static Encoding m_Encoding = Encoding.UTF8;
		private static FileSystemWatcher m_FileSystemWatcher;
		private static Dictionary<string, string> m_RawFiles;
		
		public enum RequestType
		{
			GameRequest = 'G',
			WebRequest = 'W',
			None = 0
		}
		
		/// <summary>
		/// Begins listening on a new thread.
		/// </summary>
		public static void BeginListening ()
		{
			m_StartDate = DateTime.UtcNow;
			m_Widths = new Dictionary<int, byte[]> ();
			m_Listening = true;
			m_Thread = new Thread (Listen);
			m_Thread.Name = "GameProxyListener"; // for debugging
			m_Thread.Start ();
		}
		
		#region File Handling
		public static bool InitializeFiles ()
		{
			if (!Directory.Exists (WebDirectory))
				return false;
			m_RawFiles = new Dictionary<string, string> ();
			m_FileSystemWatcher = new FileSystemWatcher (WebDirectory);
			m_FileSystemWatcher.EnableRaisingEvents = true;
			m_FileSystemWatcher.Path = WebDirectory;
			m_FileSystemWatcher.Filter = "*.*";
			m_FileSystemWatcher.Created += HandleFileSystemChange;
			m_FileSystemWatcher.Changed += HandleFileSystemChange;
			m_FileSystemWatcher.Deleted += HandleFileSystemChange;
			
			foreach (string fileName in Directory.GetFiles(WebDirectory))
				LoadFile (fileName);
			return true;
		}
		
		protected static void LoadFile (string fileName)
		{
			if (fileName.StartsWith ("."))
				return;
			using (StreamReader reader = new StreamReader(fileName, m_Encoding)) {
				if (m_RawFiles.ContainsKey (fileName))
					m_RawFiles [fileName] = reader.ReadToEnd ();
				else
					m_RawFiles.Add (fileName, reader.ReadToEnd ());
				reader.Close ();
			}
		}
		protected static void HandleFileSystemChange (object sender, FileSystemEventArgs e)
		{
			LoadFile (e.FullPath);
		}
		#endregion
		
		/// <summary>
		/// Begins listening.
		/// </summary>
		protected static void Listen ()
		{
			m_ListeningSocket = new Socket (AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
			m_ListeningSocket.Bind (new IPEndPoint (IPAddress.Loopback, 2580));
			m_ListeningSocket.LingerState.Enabled = true;
			m_ListeningSocket.Listen (8);
			m_AcceptEvent = new ManualResetEvent (false);
			
			UOJS.Log ("Listening: {0}", m_ListeningSocket.LocalEndPoint);
			
			while (m_Listening) {
				m_AcceptEvent.Reset ();
				
				m_ListeningSocket.BeginAccept (new AsyncCallback (AcceptCallback), m_ListeningSocket);
				m_AcceptEvent.WaitOne ();
			}
			UOJS.Log ("Goodbye.");
		}
		
		public static void AcceptCallback (IAsyncResult ar)
		{
			m_AcceptEvent.Set ();
			
			Socket webSocket = m_ListeningSocket.EndAccept (ar);
			WebSocketClient client = new WebSocketClient (webSocket);
			
			UOJS.Log ("Client [{0}]: Connection Detected", client.WebSocket.RemoteEndPoint);
			webSocket.BeginReceive (client.WriteBuffer, 0, client.WriteBuffer.Length, SocketFlags.None, new AsyncCallback (ReadCallback), client);
		}
		
		/// <summary>
		/// Creates the HTTP headers.
		/// </summary>
		/// <returns>The type of header.</returns>
		/// <param name="header">The full headers read.</param>
		/// <param name="sendHeaders">The headers being sent.</param>
		/// <param name="shortUri">The shortened URI.</param>
		/// <param name="fullUri">The full URI.</param>
		public static RequestType CreateHeaders (string header, out string sendHeaders, out string shortUri, out string fullUri)
		{
			string[] headers = header.Split (new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
			string[] first = headers [0].Split (' ');
			string method = first [0];
			fullUri = first [1];
			shortUri = fullUri.Substring (0, fullUri.IndexOf ('?') == -1 ? fullUri.Length : fullUri.IndexOf ('?'));
			
			switch (shortUri) {
				default:
					{
						if (m_RawFiles.ContainsKey (shortUri.Substring (1))) {
							string mime = (shortUri.EndsWith ("html") ? "html" : (shortUri.EndsWith ("js") ? "javascript" : "plain"));
								
							sendHeaders = string.Format ("HTTP/1.1 200 OK{0}"
								+ "Content-Type: text/{2}{0}"
								+ "Connection: close{0}{0}{1}", "\r\n", m_RawFiles [shortUri.Substring (1)], mime);
						
						} else {
							sendHeaders = string.Format ("HTTP/1.1 200 OK{0}"
								+ "Content-Type: text/html{0}"
								+ "Connection: close{0}{0}<h1>Hello.</h1>This server is running UOJS, Version {1}. The server time is {2}. This is {3}", 
								"\r\n", 
								UOJS.Version, 
								DateTime.Now,
								shortUri);
							foreach (string k in m_RawFiles.Keys)
								sendHeaders += k + " ";
						}
						return RequestType.WebRequest;
					}
				
				case "favicon.png":
				case "favicon.ico":
					{
						sendHeaders = string.Format ("HTTP/1.1 404 Not Found {0}"
							+ "Content-Type: text/html{0}"
							+ "Connection: close{0}{0}", "\r\n");
						return RequestType.WebRequest;
					}
				case "/getcliloc":
				case "/getaniminfo":
				case "/getmapinfo":
				case "/td":
					{
						string orgin = null, host = null;
					
						foreach (string h in headers) {
							string[] parts = h.Split (new char[] { ' ' }, 2);
							switch (parts [0]) {
								case "Orgin:":
									{
										orgin = parts [1];
										break;
									}
								case "Host:":
									{
										host = parts [1];
										break;
									}
							}
						}
						Console.WriteLine (">>>>>>>>>>>>>>>>> origin {0} host {1}", orgin, host);
						sendHeaders = string.Format ("HTTP/1.1 200 OK{0}"
							+ "Content-Type: application/javascript{0}"
							+ "Access-Control-Allow-Origin: *{0}"
							+ "Connection: close{0}{0}", "\r\n");
				
						return RequestType.WebRequest;
					}
				
				case "/getgump":
				case "/getobj":
				case "/getanim":
					{
						sendHeaders = string.Format ("HTTP/1.1 200 OK{0}"
							+ "Content-Type: image/png{0}"
							+ "Cache-Control: public, max-age=1209600{0}"
							+ "Access-control-allow-origin: *{0}"
							+ "Access-control-allow-credentials: true{0}"
							+ "Expires: {1}{0}"
							+ "Last-Modified: {2}{0}"
							+ "Connection: close{0}{0}", "\r\n", (DateTime.Now + TimeSpan.FromDays (14)).ToString ("r"), m_StartDate.ToString ("r"));
						return RequestType.WebRequest;
					}
					
				case "/game":
					{
						if (m_SHA1 == null)
							m_SHA1 = SHA1.Create ();
						string auth = null, orgin = null, host = null;
				
						foreach (string h in headers) {
							string[] parts = h.Split (new char[] { ' ' }, 2);
							switch (parts [0]) {
								case "Sec-WebSocket-Key:":
									{
										auth = Convert.ToBase64String (m_SHA1.ComputeHash (Encoding.UTF8.GetBytes (parts [1] + MagicKey)));
										break;
									}
								case "Orgin:":
									{
										orgin = parts [1];
										break;
									}
								case "Host:":
									{
										host = parts [1];
										break;
									}
							}
						}
						sendHeaders = string.Format ("HTTP/1.1 101 Switching Protocols{0}"
							+ "Upgrade: WebSocket{0}"
							+ "Connection: Upgrade{0}"
							+ "Sec-WebSocket-Accept: {1}{0}"
							+ "WebSocket-Protocol: 13{0}"
							+ "Orgin: {2}{0}"
							+ "WebSocket-Location: ws://{3}/{4}{0}{0}", "\r\n", auth, orgin == null ? "http://127.0.0.1" : orgin, host, fullUri.Replace ("/", ""));
				
						return RequestType.GameRequest;
					}
			}
		}
		
		public static void ReadCallback (IAsyncResult ar)
		{
			WebSocketClient client = (WebSocketClient)ar.AsyncState;
			Socket webSocket = client.WebSocket;
			int read;
			try {
				read = webSocket.Connected ? webSocket.EndReceive (ar) : 0;
			} catch (Exception e) {
				read = 0;
				Console.WriteLine ("Socket [disposed]: {0}", e.Message);
			}
			if (read > 0) {
				if (!client.SentHeaders) {
					string sendHeaders, shortUri, fullUri;
					RequestType type = CreateHeaders (m_Encoding.GetString (client.WriteBuffer), 
						out sendHeaders, 
						out shortUri, 
						out fullUri);
					
					switch (type) {
						case RequestType.GameRequest:
							{
								client.WebSocket.BeginSend (ASCIIEncoding.ASCII.GetBytes (sendHeaders), 0, sendHeaders.Length, SocketFlags.None, new AsyncCallback (SendCallback), client);
								Console.WriteLine ("Client [{0}]: Handshake OK", client.WebSocket.RemoteEndPoint);
								break;
							}
						case RequestType.WebRequest:
							{
								Console.WriteLine ("WebReq [{0}]: Parsed", client.WebSocket.RemoteEndPoint);
								byte[] toSend = ParseWebRequest (client, shortUri, fullUri);
								byte[] headers = ASCIIEncoding.ASCII.GetBytes (sendHeaders);
								byte[] all = new byte[headers.Length + toSend.Length];
			
								Array.Copy (headers, all, headers.Length);
								Array.Copy (toSend, 0, all, headers.Length, toSend.Length);
						
								client.WebSocket.BeginSend (all, 0, all.Length, SocketFlags.None, new AsyncCallback (WebSendCallback), client);
								return;
							}
					}
					client.SentHeaders = true;
				} else if (client.CurrentPacket != null) {
					int length = client.CurrentPacket.Data.Length;
					
					if (client.CurrentPacket.Data.Length < (client.CurrentPacket.Read + read)) {
						//mismatch = true;
						Console.WriteLine ("packet length mismatch (should be {0}, but is {1})", client.CurrentPacket.Data.Length, (client.CurrentPacket.Read + read));
						
						Array.Resize<byte> (ref client.CurrentPacket.Data, client.CurrentPacket.Read + read);
						Array.Copy (client.WriteBuffer, 0, client.CurrentPacket.Data, client.CurrentPacket.Read, read);
						
					}
					for (int i = client.CurrentPacket.Read; i < client.CurrentPacket.Read + read; i++)
						client.CurrentPacket.Data [i] ^= client.CurrentPacket.Mask [i % 4];
					client.CurrentPacket.Read += read;
					
					if (client.CurrentPacket.Read >= client.CurrentPacket.Data.Length) {
						OnReceiveFromWebSocket (client, client.CurrentPacket.Data, length);
						client.CurrentPacket = null;
					}
				} else {
					byte zero = client.WriteBuffer [0];
					byte one = client.WriteBuffer [1];
					bool fin = (zero & 0x80) == 0x80;
					byte opCode = (byte)((zero & 0x8) | (zero & 0x4) | (zero & 0x2) | (zero & 0x1));
					
					switch (opCode) {
						case 0x08:
							{
								Console.WriteLine ("Client [{0}]: Closing Connection (browser sent 0x08)", client.WebSocket.RemoteEndPoint);
								client.Close ();
								return;
							}
					}
					
					bool mask = (one & 0x80) == 0x80;
					byte payload = (byte)((one & 0x40) | (one & 0x20) | (one & 0x10) | (one & 0x8) | (one & 0x4) | (one & 0x2) | (one & 0x1));
					int length = 0;
					int s = 0;
					
					switch (payload) {
						case 126:
							//16-bit
							length = (int)((client.WriteBuffer [2] << 8) | client.WriteBuffer [3]);
							s = 2;
							break;
						case 127:
							//32-bit???
							UOJS.Log ("Client [{0}]: Got a really big packet (over 16-bits size), so I'll just kill it...", client.WebSocket.RemoteEndPoint);
							client.Close ();
							return;
						
						default:
							//8-bit
							length = payload;
							break;
					}
					
					client.CurrentPacket = new WebSocketPacket ();
					if (mask) {
						// create the bit mask? 
						// I'm still unsure why the masked is being forced
						// in the websocket protocol. oh well.
						client.CurrentPacket.Mask = new byte[] {
							client.WriteBuffer [s + 2],
							client.WriteBuffer [s + 3],
							client.WriteBuffer [s + 4],
							client.WriteBuffer [s + 5]
						};
						s += 6;
					}
					
					client.CurrentPacket.Data = new byte[length];
					client.CurrentPacket.Read += read - s;
					
					
					Array.Copy (client.WriteBuffer, s, client.CurrentPacket.Data, 0, Math.Min (client.CurrentPacket.Read, client.CurrentPacket.Data.Length));
					if (mask)
						for (int i = 0; i < client.CurrentPacket.Data.Length; i++)
							client.CurrentPacket.Data [i] ^= client.CurrentPacket.Mask [i % 4];
					if (client.CurrentPacket.Read == client.CurrentPacket.Data.Length) {
						OnReceiveFromWebSocket (client, client.CurrentPacket.Data, client.CurrentPacket.Data.Length);
						client.CurrentPacket = null;
					}
				}
				if (webSocket != null && webSocket.Connected)
					webSocket.BeginReceive (client.WriteBuffer, 0, WebSocketClient.MaxBufferSize, SocketFlags.None, new AsyncCallback (ReadCallback), client);
			} else {
				UOJS.Log ("Client [disposed]: No data @ ReadCallback");
			}
		}
		
		
		public static void OnReceiveFromWebSocket (WebSocketClient client, byte[] data, int length)
		{
			try {
				switch ((char)data [0]) {
				// Reconnect
					case 'R':
						{
							if (client.UOSocket != null && client.UOSocket.Connected)
								client.UOSocket.Close ();
							goto case 'C';
						}
						
				// Connect
					case 'C':
						{
							string[] strData = Encoding.ASCII.GetString (data, 0, data.Length).Split (' ');
							for (int i = 0; i < strData.Length; i++)
								Console.Write (strData [i] + ",");
							client.UOSocket = new Socket (AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
							Console.WriteLine (string.Join (",", strData));
							client.UOSocket.BeginConnect (strData [1], int.Parse (strData [2]), new AsyncCallback (UOConnectCallback), client);
							break;
						}
						
				// Version
					case 'V':
						{
							GameProxy.Send (client, "Version {0}", UOJS.Version);
							break;
						}
						
						
					default:
						{
							client.UOSocket.BeginSend (data, 0, data.Length, SocketFlags.None, new AsyncCallback (UOSendCallback), client);
							break;
						}
				}
			} catch (Exception e) {
				UOJS.Log ("Client [d/c]: Threw {0}... closing!", e.GetType ());
				UOJS.Log (e.StackTrace);
				client.Close ();
			}
		}
		
		public static void UOSendCallback (IAsyncResult ar)
		{
			WebSocketClient client = (WebSocketClient)ar.AsyncState;
			
			if (client.UOSocket != null && client.UOSocket.Connected)
				client.UOSocket.EndSend (ar);
		}
		public static void UOReceiveCallback (IAsyncResult ar)
		{
			WebSocketClient client = (WebSocketClient)ar.AsyncState;
			int rec;
			try {
				rec = (client.UOSocket != null && client.UOSocket.Connected) ? client.UOSocket.EndReceive (ar) : 0;
			} catch (Exception e) {
				rec = 0;
			}
			if (rec > 0) {
				byte[] buffer = new byte[rec];
				Array.Copy (client.UOWriteBuffer, buffer, rec);
				
				/*if (client.Compressed) 
                    Huffman.Decompress(client, buffer);
                else*/
				
				//byte[] buff = new byte[rec];
				//Array.Copy(client.UOWriteBuffer, buff, rec);
				Send (client, buffer, RequestType.GameRequest, false);
				
				//Send(client, Convert.ToBase64String(buff));
				if (client.UOSocket != null && client.UOSocket.Connected)
					client.UOSocket.BeginReceive (client.UOWriteBuffer, 0, client.UOWriteBuffer.Length, SocketFlags.None, new AsyncCallback (UOReceiveCallback), client);
			} else
				if (client.UOSocket != null && client.UOSocket.Connected) {
				Console.WriteLine ("Client [{0}]: No data", client.WebSocket.RemoteEndPoint);
				Send (client, "Discon");
				client.Close ();
			}
			//else close?
		}
		public static void UOConnectCallback (IAsyncResult ar)
		{
			WebSocketClient client = (WebSocketClient)ar.AsyncState;
			try {
				client.UOSocket.EndConnect (ar);
				Send (client, "ConSuccess", client.UOSocket.RemoteEndPoint);
				client.UOSocket.BeginReceive (client.UOWriteBuffer, 0, client.UOWriteBuffer.Length, SocketFlags.None, new AsyncCallback (UOReceiveCallback), client);
			} catch (Exception e) {
				Send (client, "ConFail");
			}
			//Send(client, Encoding.ASCII.GetBytes("L Connected: " + client.UOSocket.RemoteEndPoint
		}
		
		public struct TileInfo
		{
			public bool IsLand;
			public int ID, Z, Hue;
			
			public TileInfo (bool land, int id, int z, int hue)
			{
				IsLand = land;
				ID = id;
				Z = z;
				Hue = hue;
			}
		}
		
		public static Dictionary<int, byte[]> m_Widths;
		
		//[DllImport("./Ultima.dll", EntryPoint="?GetTileDataInfo@UltimaApi@@QAEXH@Z",CallingConvention=CallingConvention.ThisCall)]
		//static extern Dictionary<string, string> GetTileDataInfo (int id);
		public static Dictionary<string, string> ParseVars (string uri)
		{
			Dictionary<string, string> vars = new Dictionary<string, string> ();
			MatchCollection col = Regex.Matches (uri, @"([A-Za-z0-9]+)=([A-Za-z0-9]+)");
			foreach (Match m in col)
				vars.Add (m.Groups [1].Value, m.Groups [2].Value);
				
			return vars;
		}
		

		public static byte[] ParseWebRequest (WebSocketClient client, string shortUri, string fullUri)
		{
			try {
				switch (shortUri) {
					case "/td":
						{
							Dictionary<string, string> query = ParseVars (fullUri);
							int id = int.Parse (query ["id"]);
							Dictionary<string, string> dict = new Dictionary<string, string> ();
							
							PropertyInfo info = m_Ultima.GetType ("Ultima.TileData").GetProperty ("ItemTable", BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy);
							Type itemData = m_Ultima.GetType ("Ultima.ItemData");
							object o = ((Array)info.GetValue (null, null)).GetValue (id);
							PropertyInfo[] pubInfo = itemData.GetProperties ();
							foreach (PropertyInfo p in pubInfo)
								dict.Add (p.Name, p.GetValue (o, null).ToString ());
							
							return m_Encoding.GetBytes (LitJson.JsonMapper.ToJson (dict));
						}
				
					case "/getmapinfo":
						{
							Dictionary<string, string> query = ParseVars (fullUri);
							int x = int.Parse (query ["x"]), y = int.Parse (query ["y"]), range = int.Parse (query ["r"]);
							char facet = query ["m"] [0];
							string map;
							
							switch (facet) {
								default:
								case 'f':
									map = "Felucca";
									break;
								case 't':
									map = "Trammel";
									break;
								case 'i':
									map = "Ilshenar";
									break;
								case 'm':
									map = "Malas";
									break;
								case 'o':
									map = "Tokuno";
									break; // whoops
							}
							
							Type Map = m_Ultima.GetType ("Ultima.Map");
							Type Tile = m_Ultima.GetType ("Ultima.Tile");
							Type HuedTile = m_Ultima.GetType ("Ultima.HuedTile");
							Type TileMatrix = m_Ultima.GetType ("Ultima.TileMatrix");														
							Dictionary<string, Dictionary<string, Dictionary<string, object>>> data 
								= new Dictionary<string, Dictionary<string, Dictionary<string, object>>> ();
							object currentMap = ((FieldInfo)Map.GetMember (map) [0]).GetValue (null);
							object tiles = Map.GetProperty ("Tiles").GetValue (currentMap, null);
						
							for (int i = 0; i < range; i++) {
								Dictionary<string, Dictionary<string, object>> row;
								data.Add ((i + x).ToString (), row = new Dictionary<string, Dictionary<string, object>> ());
								
								for (int j = 0; j < range; j++) {
									Dictionary<string, object> cell = new Dictionary<string, object> ();
									object landTile = TileMatrix.GetMethod ("GetLandTile").Invoke (tiles, new object[]{x + i, y + j});
									Array staticTiles = (Array)TileMatrix.GetMethod ("GetStaticTiles").Invoke (tiles, new object[]{x + i, y + j});
									int id = (int)Tile.GetProperty ("ID").GetValue (landTile, null);
									int z = (int)Tile.GetProperty ("Z").GetValue (landTile, null);
										
									cell.Add ("id", id);
									cell.Add ("z", z);	
									cell.Add ("length", staticTiles.Length);
									TileInfo[] stiles = new TileInfo[staticTiles.Length];
									for (int k = 0; k < stiles.Length; k++) {
										stiles [k].ID = (int)(HuedTile.GetProperty ("ID").GetValue (staticTiles.GetValue (k), null)) % 0x4000;
									
										stiles [k].Hue = (int)HuedTile.GetProperty ("Hue").GetValue (staticTiles.GetValue (k), null);
										stiles [k].Z = (int)HuedTile.GetProperty ("Z").GetValue (staticTiles.GetValue (k), null);
									}
									cell.Add ("o", stiles);
									row.Add ((j + y).ToString (), cell);
								}
							}
							
							return m_Encoding.GetBytes (LitJson.JsonMapper.ToJson (data));
						}
						
			
					case "/getgump":
						{
							Dictionary<string, string> query = ParseVars (fullUri);
							foreach (KeyValuePair<string, string> kvp in query)
								Console.WriteLine (kvp);
							int id = int.Parse (query ["id"]);
							Type Gumps = m_Ultima.GetType ("Ultima.Gumps");
					
							//int hueIdx = int.Parse (query ["h"]);
						
							//Hue hue = hueIdx == 0 ? null : Hues.List [(hueIdx & 0x3FFF) - 1];
					
							//Bitmap b = (Bitmap)(Gumps.GetGump (id).Clone ());

							Bitmap b = (Bitmap)Gumps.GetMethod ("GetGump", new []{typeof(Int32)}).Invoke (null, new object[]{id});
							//if (hue != null)
							//	hue.ApplyTo (b, true);
					
							MemoryStream ms = new MemoryStream ();
							b.Save (ms, System.Drawing.Imaging.ImageFormat.Png);
					
							return ms.GetBuffer ();
						}
			
					case "/getobj":
						{
							Dictionary<string, string> query = ParseVars (fullUri);
							char type = query ["t"] [0];
							int id = int.Parse (query ["i"]);
							int hueIdx = int.Parse (query ["h"]);
							
							string crop = query.ContainsKey ("c") ? query ["c"] : "";
							Type Art = m_Ultima.GetType ("Ultima.Art");
							Bitmap b = (Bitmap)(Art.GetMethod (type == 'l' ? "GetLand" : "GetStatic", new []{typeof(Int32)}).Invoke (null, new object[]{id}));
							//Bitmap b = (Bitmap)(type == 'l' ? Art.GetLand (id) : Art.GetStatic (id)); //don't hue the cached, clone it
							//if (b == null)
							//	b = Art.GetLand (0);
							b = (Bitmap)b.Clone ();
					
							//TODO: clone before hue (prevent modifying cache object)
							//Hue hue = hueIdx == 0 ? null : Hues.List [(hueIdx & 0x3FFF) - 1];
							//if (hue != null)
							//	hue.ApplyTo (b, type == 'l');
					
							switch (crop) {
							// why can't this be done on the client side by only drawing half after
							// the transformation? set the sX to the half or set the sW to the half
							// depending on the side??
								case "right":
									{
										for (int x = 0; x < b.Width/2; x++) {
											for (int y = 0; y < b.Height; y++) {
												b.SetPixel (x, y, Color.Transparent);
											}
										}
										break;
									}
								case "left":
									{
										for (int x = b.Width/2; x < b.Width; x++) {
											for (int y = 0; y < b.Height; y++) {
												b.SetPixel (x, y, Color.Transparent);
											}
										}
										break;
									}
							}
							MemoryStream ms = new MemoryStream ();
							b.Save (ms, System.Drawing.Imaging.ImageFormat.Png);
							return ms.GetBuffer ();
						}
			
					case "/getcliloc":
						{
							Dictionary<string, string> query = ParseVars (fullUri);
							int message = int.Parse (query ["i"]), i = 0;
							Type StringList = m_Ultima.GetType ("Ultima.StringList");
							System.Collections.Hashtable table = (System.Collections.Hashtable)StringList.GetProperty ("Table").GetValue (StringList.GetProperty ("EnglishStringList", BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy).GetValue (null, null), null);
						
							if (!table.ContainsKey (message))
								return m_Encoding.GetBytes ("{\"text\": null}");
						
							string entry = (string)table [message];
							string replace = Regex.Replace (entry, @"~[A-Za-z0-9_]+~", match => query ["" + (i++)]);
					
							return UTF8Encoding.UTF8.GetBytes ("{\"text\":\"" + replace.Replace ("\"", "\\\"") + "\"}");
						}
			
					case "/getaniminfo":
						{
							Dictionary<string, string> query = ParseVars (fullUri);
							int bodyId = int.Parse (query ["i"]);
							int action = int.Parse (query ["a"]);
							int dir = int.Parse (query ["d"]);
							int hash = (bodyId << 16) | (action << 8) | (dir);
							byte[] widths = null;
							if (m_Widths.ContainsKey (hash))
								widths = m_Widths [hash];
							else {
								Type Animations = m_Ultima.GetType ("Ultima.Animations");
								Type Frame = m_Ultima.GetType ("Ultima.Frame");
								Array frames = (Array)Animations.GetMethod ("GetAnimation").Invoke (null, new object[] {
								bodyId,
								action,
								dir,
								0,
								true
							});
								//Frame[] frames = Animations.GetAnimation (bodyId, action, dir, 0, true);
						
								if (frames == null)
									widths = new byte[0];
								else {
									widths = new byte[frames.Length];
									for (int i = 0; i < frames.Length; i++) {
										System.Drawing.Bitmap b = (System.Drawing.Bitmap)Frame.GetProperty ("Bitmap").GetValue (frames.GetValue (i), null);
										widths [i] = (byte)b.Width;
									}
								}
							}
					
							return ASCIIEncoding.ASCII.GetBytes ("{\"widths\": [" + string.Join (",", Array.ConvertAll (widths, x => x.ToString ())) + "]}");
						}
			
					case "/getanim":
						{
							//todo: check if wearable and adjust bitmap accordingly if human
							Dictionary<string, string> query = ParseVars (fullUri);
							int bodyId = int.Parse (query ["i"]);
							int action = int.Parse (query ["a"]);
							int dir = int.Parse (query ["d"]);
							int hueIdx = int.Parse (query ["h"]);
							Type Animations = m_Ultima.GetType ("Ultima.Animations");
							Type Frame = m_Ultima.GetType ("Ultima.Frame");
							Array frames = (Array)Animations.GetMethod ("GetAnimation").Invoke (null, new object[] {
							bodyId,
							action,
							dir,
							0,
							true
						});
							//Frame[] frames = Animations.GetAnimation (bodyId, action, dir, 0, true);
							//Hue hue = hueIdx == 0 ? null : Hues.List [(hueIdx & 0x3FFF) - 1];
							int hash = (bodyId << 16) | (action << 8) | (dir);
							if (frames == null)
								return new byte[] { };
					
							int maxWidth = 0, maxHeight = 0;
							for (int i = 0; i < frames.Length; i++) {
								System.Drawing.Bitmap b = (System.Drawing.Bitmap)Frame.GetProperty ("Bitmap").GetValue (frames.GetValue (i), null);
								if (b.Width > maxWidth)
									maxWidth = b.Width; // +Math.Abs(frame.Center.X);
								if (b.Height > maxHeight)
									maxHeight = b.Height; // +Math.Abs(frame.Center.Y);
							}
							// should we cache full animation bitmaps?
							Bitmap bitmap = new Bitmap (maxWidth * frames.Length, maxHeight);
							Graphics g = Graphics.FromImage (bitmap);
					
							byte[] widths = new byte[frames.Length];
							for (int i = 0; i < frames.Length; i++) {
								object frame = frames.GetValue (i);
								System.Drawing.Bitmap single = (System.Drawing.Bitmap)Frame.GetProperty ("Bitmap").GetValue (frames.GetValue (i), null);
							
								widths [i] = (byte)single.Width;
								g.DrawImageUnscaled (single, i * maxWidth, 0);
							}
							if (!m_Widths.ContainsKey (hash))
								m_Widths.Add (hash, widths);
							//if (hueIdx != 0)
							//	hue.ApplyTo (bitmap, TileData.AnimationData.ContainsKey (bodyId) && (TileData.AnimationData [bodyId].Flags & TileFlag.PartialHue) != 0);
							bitmap.SetPixel (0, 0, Color.FromArgb (0, 0, 0, frames.Length));
							MemoryStream ms = new MemoryStream ();
							bitmap.Save (ms, System.Drawing.Imaging.ImageFormat.Png);
							return ms.GetBuffer ();
						}
				}
			} catch (Exception e) {
				UOJS.Log ("Error {0}\r\n{1}", e.Message, e.StackTrace);
				return ASCIIEncoding.ASCII.GetBytes (string.Format ("An error has occurred: {0}\r\n{1}", e.Message, e.StackTrace));
				
			}
			return new byte[] { };
		}
		
		#region Sending
		public static void Send (WebSocketClient client, string format, params object[] o)
		{
			GameProxy.Send (client, m_Encoding.GetBytes (string.Format (format, o)), RequestType.WebRequest, false);
		}
		
		public static void Send (WebSocketClient client, byte[] data, RequestType type, bool mask = false)
		{
			// masking isn't needed?
			int headerLength = 2;
			byte payload = 0;
			byte[] maskKeys = null;
			byte[] tmp = new byte[data.Length + 1];
			tmp [0] = (byte)type;
			Array.Copy (data, 0, tmp, 1, data.Length);
			data = tmp;
			
			//data = Encoding.UTF8.GetBytes(((char)type) + Convert.ToBase64String(data));
			
			//data = Encoding.UTF8.GetBytes(Encoding.ASCII.GetString(data));
			//Console.WriteLine("Raw length={0}", data.Length);
			if (data.Length > short.MaxValue)
				UOJS.Log ("Client [{0}]: Sending Really Large Packet (not implemented)", client.WebSocket.RemoteEndPoint);
			if (data.Length >= 126) {
				headerLength += 2;
				payload = 126;
			} else
				payload = (byte)data.Length;
			if (mask) {
				headerLength += 4;
				Random r = new Random ();
				maskKeys = new byte[] { 1, 2, 3, 4 };
				r.NextBytes (maskKeys);
			}
			
			byte[] allData = new byte[headerLength + data.Length];
			allData [0] = 0x80 | 0x02;
			allData [1] = (byte)((mask ? 0x80 : 0) | payload & 0x40 | payload & 0x20 | payload & 0x10 | payload & 0x8 | payload & 0x4 | payload & 0x2 | payload & 0x1);
			
			if (payload == 126) {
				byte[] lengthBytes = BitConverter.GetBytes ((ushort)data.Length);
				allData [2] = lengthBytes [1]; // (byte)((data.Length >> 8) & 0xFF);
				allData [3] = lengthBytes [0]; // (byte)(data.Length & 0xFF);
			}
			
			Array.Copy (data, 0, allData, headerLength, data.Length);
			if (mask) {
				Array.Copy (maskKeys, 0, allData, 2, 4);
				for (int i = 0; i < data.Length; i++)
					allData [i + headerLength] ^= maskKeys [i % 4];
			}
			
			
			if (client.WebSocket != null && client.WebSocket.Connected) {
				client.WebSocket.BeginSend (allData, 0, allData.Length, SocketFlags.None, new AsyncCallback (SendCallback), client);
			}
		}
		public static void WebSendCallback (IAsyncResult ar)
		{
			WebSocketClient client = (WebSocketClient)ar.AsyncState;
			if (client.WebSocket != null && client.WebSocket.Connected) {
				UOJS.Log ("Client [{0}]: Sent {1} bytes", client.WebSocket.RemoteEndPoint, client.WebSocket != null && client.WebSocket.Connected ? client.WebSocket.EndSend (ar) : 0);
				client.Close ();
			}
		}
		public static void SendCallback (IAsyncResult ar)
		{
			WebSocketClient client = (WebSocketClient)ar.AsyncState;
			if (client.WebSocket != null && client.WebSocket.Connected) {
				try {
					UOJS.Log ("Client [{0}]: Sent {1} bytes", client.WebSocket.RemoteEndPoint, client.WebSocket != null && client.WebSocket.Connected ? client.WebSocket.EndSend (ar) : 0);
				} catch {
				
				}
			}
		}
#endregion
		
	}
}

