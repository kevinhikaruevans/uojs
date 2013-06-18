using System;
using System.Net.Sockets;

namespace UOJS
{
	/// <summary>
	/// Web socket client.
	/// </summary>
	public class WebSocketClient
	{
		/// <summary>
		/// The size of the max buffer.
		/// </summary>
		public static readonly int MaxBufferSize = 2048;
		
		private Socket m_WebSocket;
		private Socket m_UOClientSocket;
		private byte[] m_Buffer, m_UOBuffer;
		private bool m_SentHeaders;
		private WebSocketPacket m_CurrentPacket;
		private DateTime m_CreationTime;
		
		
		/// <summary>
		/// Gets the creation time.
		/// </summary>
		/// <value>The creation time.</value>
		public DateTime CreationTime {
			get { return m_CreationTime; }
		}
		
		/// <summary>
		/// Gets or sets the UO socket.
		/// </summary>
		/// <value>The UO socket.</value>
		public Socket UOSocket {
			get { return m_UOClientSocket; }
			set { m_UOClientSocket = value; }
		}
		/// <summary>
		/// Gets or sets the current packet.
		/// </summary>
		/// <value>The current packet.</value>
		public WebSocketPacket CurrentPacket {
			get { return m_CurrentPacket; }
			set { m_CurrentPacket = value; }
		}
		
		/// <summary>
		/// Gets or sets a value indicating whether the WebSocket's headers have been sent.
		/// </summary>
		/// <value><c>true</c> if sent headers; otherwise, <c>false</c>.</value>
		public bool SentHeaders {
			get { return m_SentHeaders; }
			set { m_SentHeaders = value; }
		}
		
		/// <summary>
		/// Gets the web socket.
		/// </summary>
		/// <value>The web socket.</value>
		public Socket WebSocket {
			get { return m_WebSocket; }
		}
		
		/// <summary>
		/// Gets or sets the UO write buffer.
		/// </summary>
		/// <value>The UO write buffer.</value>
		public byte[] UOWriteBuffer {
			get { return m_UOBuffer == null ? (m_UOBuffer = new byte[MaxBufferSize]) : m_UOBuffer; }
			set { m_UOBuffer = value; }
		}
		
		/// <summary>
		/// Gets or sets the WebSocket write buffer.
		/// </summary>
		/// <value>The write buffer.</value>
		public byte[] WriteBuffer {
			get { return m_Buffer == null ? (m_Buffer = new byte[MaxBufferSize]) : m_Buffer; }
			set { m_Buffer = value; }
		}
		
		/// <summary>
		/// Initializes a new WebSocketClient based on an underlying TCP socket.
		/// </summary>
		/// <param name="webSocket">The underlying TCP socket.</param>
		public WebSocketClient (Socket webSocket)
		{
			m_WebSocket = webSocket;
			m_CreationTime = DateTime.Now;
		}
		
		/// <summary>
		/// Closes the child sockets.
		/// </summary>
		public void Close ()
		{
			if (m_WebSocket != null && m_WebSocket.Connected) {
				UOJS.Log ("Client [{0}]: Closing", m_WebSocket.RemoteEndPoint);
				m_WebSocket.Close ();
			} else
				UOJS.Log ("Client [disposed]: Closed");
			if (m_UOClientSocket != null && m_UOClientSocket.Connected)
				m_UOClientSocket.Close ();
		}
	}
}

